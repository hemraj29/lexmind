import { openaiService } from "./openai.service.js";
import { createChildLogger } from "../utils/logger.js";
import type { StatuteSection } from "../types/legal.types.js";
import { RERANK_TOP_K } from "../config/constants.js";

const log = createChildLogger("reranker");

export interface RerankCandidate {
  section: StatuteSection;
  originalScore: number;
}

export interface RerankResult {
  section: StatuteSection;
  relevanceScore: number;
  reasoning: string;
}

class RerankerService {
  async rerank(
    query: string,
    candidates: RerankCandidate[],
    topK: number = RERANK_TOP_K
  ): Promise<RerankResult[]> {
    if (candidates.length === 0) return [];
    if (candidates.length <= topK) {
      return candidates.map((c) => ({
        section: c.section,
        relevanceScore: c.originalScore,
        reasoning: "Insufficient candidates for reranking",
      }));
    }

    const candidateDescriptions = candidates.map(
      (c, i) =>
        `[${i}] ${c.section.act} Section ${c.section.sectionNumber} - ${c.section.title}: ${c.section.description.slice(0, 200)}`
    );

    const prompt = `You are a legal relevance scorer for Indian law. Given a legal query and candidate statutory sections, score each candidate's relevance from 0-10.

QUERY: "${query}"

CANDIDATES:
${candidateDescriptions.join("\n")}

Return a JSON object with a "rankings" array. Each item must have:
- "index": the candidate index number
- "score": relevance score 0-10 (10 = perfectly relevant)
- "reasoning": one sentence explaining why

Only include candidates with score >= 3. Sort by score descending.`;

    try {
      const result = await openaiService.chatJSON<{
        rankings: { index: number; score: number; reasoning: string }[];
      }>([{ role: "user", content: prompt }], { temperature: 0 });

      const reranked: RerankResult[] = result.rankings
        .filter((r) => r.index >= 0 && r.index < candidates.length)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map((r) => ({
          section: candidates[r.index]!.section,
          relevanceScore: r.score / 10,
          reasoning: r.reasoning,
        }));

      log.info({ inputCount: candidates.length, outputCount: reranked.length }, "Reranking complete");
      return reranked;
    } catch (err) {
      log.error({ err }, "Reranking failed, falling back to original scores");
      return candidates
        .sort((a, b) => b.originalScore - a.originalScore)
        .slice(0, topK)
        .map((c) => ({
          section: c.section,
          relevanceScore: c.originalScore,
          reasoning: "Fallback: reranking failed",
        }));
    }
  }
}

export const rerankerService = new RerankerService();
