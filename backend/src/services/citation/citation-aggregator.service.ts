import type { CitationProvider, CitationCandidate, ProviderSearchOptions } from "./provider.types.js";
import { internalProvider } from "./providers/internal.provider.js";
import { caseDocumentProvider } from "./providers/case-documents.provider.js";
import { indianKanoonProvider } from "./providers/indian-kanoon.provider.js";
import { openaiService } from "../openai.service.js";
import { createChildLogger } from "../../utils/logger.js";

const log = createChildLogger("citation-aggregator");

/**
 * Aggregates citation candidates from all enabled providers in parallel.
 * Applies Reciprocal Rank Fusion + cross-encoder rerank to surface the best ones.
 */
class CitationAggregator {
  private providers: CitationProvider[] = [];

  constructor() {
    // Order matters only for tie-breaking. All run in parallel.
    this.register(internalProvider);
    this.register(caseDocumentProvider);
    this.register(indianKanoonProvider);
  }

  register(provider: CitationProvider): void {
    this.providers.push(provider);
    log.info({ provider: provider.name, type: provider.type, enabled: provider.enabled }, "Provider registered");
  }

  async gather(query: string, options: ProviderSearchOptions = {}): Promise<CitationCandidate[]> {
    const enabled = this.providers.filter((p) => p.enabled);
    if (enabled.length === 0) return [];

    log.info({ query: query.slice(0, 80), providers: enabled.map((p) => p.name) }, "Gathering citations");

    // Run all enabled providers in parallel with a hard timeout per provider
    const results = await Promise.allSettled(
      enabled.map((p) =>
        Promise.race([
          p.search(query, options),
          new Promise<CitationCandidate[]>((_, reject) =>
            setTimeout(() => reject(new Error(`${p.name} timeout`)), 8000)
          ),
        ]).catch((err) => {
          log.warn({ provider: p.name, err: err.message }, "Provider failed");
          return [] as CitationCandidate[];
        })
      )
    );

    const all: CitationCandidate[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") all.push(...r.value);
    }

    if (all.length === 0) return [];

    // Reciprocal Rank Fusion across providers
    const fused = this.reciprocalRankFusion(all);

    // Optional rerank if we have many candidates (worth the LLM cost)
    if (fused.length > 8) {
      try {
        return await this.rerank(query, fused.slice(0, 20), options.topK || 8);
      } catch (err) {
        log.warn({ err }, "Rerank failed, returning RRF order");
      }
    }

    return fused.slice(0, options.topK || 8);
  }

  private reciprocalRankFusion(candidates: CitationCandidate[], k = 60): CitationCandidate[] {
    // Group by provider
    const byProvider = new Map<string, CitationCandidate[]>();
    for (const c of candidates) {
      if (!byProvider.has(c.providerId)) byProvider.set(c.providerId, []);
      byProvider.get(c.providerId)!.push(c);
    }

    // RRF score per canonical entity
    const scoreMap = new Map<string, { cand: CitationCandidate; score: number }>();
    for (const [, list] of byProvider) {
      list.sort((a, b) => b.relevanceScore - a.relevanceScore);
      list.forEach((c, rank) => {
        const key = this.canonicalKey(c);
        const rrf = 1.0 / (k + rank + 1);
        const existing = scoreMap.get(key);
        if (existing) {
          existing.score += rrf;
        } else {
          scoreMap.set(key, { cand: c, score: rrf });
        }
      });
    }

    return Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .map((x) => x.cand);
  }

  private canonicalKey(c: CitationCandidate): string {
    if (c.sourceType === "precedent" && c.reference) {
      return `precedent:${c.reference.replace(/\s+/g, "").toLowerCase()}`;
    }
    if (c.sourceType === "section") {
      return `section:${c.reference.replace(/\s+/g, "").toLowerCase()}`;
    }
    return `${c.providerId}:${c.externalId}`;
  }

  private async rerank(
    query: string,
    candidates: CitationCandidate[],
    topK: number
  ): Promise<CitationCandidate[]> {
    const items = candidates.map((c, i) => `[${i}] ${c.reference}: ${c.excerpt.slice(0, 200)}`);

    const prompt = `Rank these legal sources by relevance to the query.

QUERY: "${query}"

SOURCES:
${items.join("\n")}

Return JSON: { "rankings": [{ "index": 0, "score": 9 }, ...] } — score 0-10, only include score >= 5.`;

    const result = await openaiService.chatJSON<{ rankings: { index: number; score: number }[] }>(
      [{ role: "user", content: prompt }],
      { temperature: 0, maxTokens: 800 }
    );

    return result.rankings
      .filter((r) => r.index >= 0 && r.index < candidates.length)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((r) => candidates[r.index]!);
  }
}

export const citationAggregator = new CitationAggregator();
