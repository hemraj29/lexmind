import { openaiService } from "./openai.service.js";
import { vectorSearchStatutes, prisma } from "./database.service.js";
import { bm25Service } from "./bm25.service.js";
import { rerankerService } from "./reranker.service.js";
import { createChildLogger } from "../utils/logger.js";
import { DEFAULT_TOP_K, RERANK_TOP_K } from "../config/constants.js";
import type { StatuteSection, SearchResult, HybridSearchOptions, ActType } from "../types/legal.types.js";

const log = createChildLogger("hybrid-search");

const SECTION_PATTERN = /(?:section|sec\.?|s\.?)\s*(\d+[a-z]?)/gi;
const ACT_SECTION_PATTERN = /(?:bns|bnss|bsa|ipc|crpc)\s*(?:section|sec\.?)?\s*(\d+[a-z]?)/gi;

class HybridSearchService {
  async search(options: HybridSearchOptions): Promise<SearchResult[]> {
    const { query, topK = RERANK_TOP_K, actFilter, includeRerank = true } = options;

    log.info({ query, topK, actFilter }, "Hybrid search started");

    // Step 1: Check for exact section references in Postgres
    const exactMatches = await this.findExactSectionRefs(query);
    if (exactMatches.length > 0) {
      log.info({ exactMatchCount: exactMatches.length }, "Found exact section references");
    }

    // Step 2: Run pgvector + BM25 in parallel
    const [vectorResults, bm25Results] = await Promise.all([
      this.pgVectorSearch(query, DEFAULT_TOP_K, actFilter as ActType | undefined),
      this.bm25Search(query, DEFAULT_TOP_K),
    ]);

    // Step 3: Merge with Reciprocal Rank Fusion
    const merged = this.reciprocalRankFusion(vectorResults, bm25Results, exactMatches);

    // Step 4: Rerank if enabled
    if (includeRerank && merged.length > topK) {
      const reranked = await rerankerService.rerank(
        query,
        merged.map((r) => ({ section: r.section, originalScore: r.score })),
        topK
      );

      return reranked.map((r) => ({
        section: r.section,
        score: r.relevanceScore,
        source: "vector" as const,
      }));
    }

    return merged.slice(0, topK);
  }

  private async pgVectorSearch(
    query: string,
    topK: number,
    actFilter?: ActType
  ): Promise<SearchResult[]> {
    try {
      const embedding = await openaiService.embed(query);
      const matches = await vectorSearchStatutes(embedding, topK, actFilter);

      return matches.map((m) => ({
        section: {
          id: m.id,
          act: m.act as StatuteSection["act"],
          sectionNumber: m.sectionNumber,
          title: m.title,
          description: m.description,
          offenceType: m.offenceType as StatuteSection["offenceType"],
          bailable: m.bailable,
          punishment: m.punishment,
          ingredients: m.ingredients,
        },
        score: 1 - m.distance, // Convert distance to similarity
        source: "vector" as const,
      }));
    } catch (err) {
      log.error({ err }, "pgvector search failed");
      return [];
    }
  }

  private bm25Search(query: string, topK: number): SearchResult[] {
    try {
      const results = bm25Service.search(query, topK);
      const maxScore = results[0]?.score || 1;
      return results.map((r) => ({
        section: r.section,
        score: r.score / maxScore,
        source: "bm25" as const,
      }));
    } catch (err) {
      log.error({ err }, "BM25 search failed");
      return [];
    }
  }

  private async findExactSectionRefs(query: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    for (const pattern of [ACT_SECTION_PATTERN, SECTION_PATTERN]) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(query)) !== null) {
        const sectionNum = match[1]!;
        if (seen.has(sectionNum)) continue;
        seen.add(sectionNum);

        // Query Postgres directly for exact match
        const found = await prisma.statuteSection.findFirst({
          where: { sectionNumber: sectionNum },
        });

        if (found) {
          results.push({
            section: {
              id: found.id,
              act: found.act as StatuteSection["act"],
              sectionNumber: found.sectionNumber,
              title: found.title,
              description: found.description,
              offenceType: found.offenceType === "COGNIZABLE" ? "cognizable" : "non-cognizable",
              bailable: found.bailable,
              punishment: found.punishment,
              ingredients: found.ingredients,
            },
            score: 1.0,
            source: "exact" as const,
          });
        }
      }
    }

    return results;
  }

  private reciprocalRankFusion(
    vectorResults: SearchResult[],
    bm25Results: SearchResult[],
    exactResults: SearchResult[],
    k: number = 60
  ): SearchResult[] {
    const scoreMap = new Map<string, { section: StatuteSection; score: number; source: SearchResult["source"] }>();

    // Exact matches get highest boost
    exactResults.forEach((r, rank) => {
      const rrfScore = 2.0 / (k + rank + 1);
      scoreMap.set(r.section.id, { section: r.section, score: rrfScore, source: "exact" });
    });

    // Vector results
    vectorResults.forEach((r, rank) => {
      const rrfScore = 1.0 / (k + rank + 1);
      const existing = scoreMap.get(r.section.id);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scoreMap.set(r.section.id, { section: r.section, score: rrfScore, source: "vector" });
      }
    });

    // BM25 results
    bm25Results.forEach((r, rank) => {
      const rrfScore = 1.0 / (k + rank + 1);
      const existing = scoreMap.get(r.section.id);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scoreMap.set(r.section.id, { section: r.section, score: rrfScore, source: "bm25" });
      }
    });

    return Array.from(scoreMap.values()).sort((a, b) => b.score - a.score);
  }
}

export const hybridSearchService = new HybridSearchService();
