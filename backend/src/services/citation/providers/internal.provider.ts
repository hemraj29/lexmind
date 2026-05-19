import type { CitationProvider, CitationCandidate, ProviderSearchOptions } from "../provider.types.js";
import { hybridSearchService } from "../../hybrid-search.service.js";
import { createChildLogger } from "../../../utils/logger.js";

const log = createChildLogger("citation:internal");

/**
 * Internal provider — searches the local pgvector + BM25 index.
 * This is the "always on" provider, even when external APIs fail.
 */
class InternalProvider implements CitationProvider {
  name = "leximini-internal";
  type = "internal" as const;
  enabled = true;

  async search(query: string, opts: ProviderSearchOptions): Promise<CitationCandidate[]> {
    try {
      const results = await hybridSearchService.search({
        query,
        topK: opts.topK || 10,
        includeRerank: true,
      });

      return results.map((r) => ({
        providerId: this.name,
        externalId: r.section.id,
        sourceType: "section" as const,
        title: `${r.section.act} Section ${r.section.sectionNumber} — ${r.section.title}`,
        reference: `${r.section.act}, Section ${r.section.sectionNumber}`,
        excerpt: (r.section.description || "").slice(0, 300),
        sourceUrl: `/api/sections/${r.section.id}/source`,
        relevanceScore: r.score,
        metadata: { bailable: r.section.bailable, punishment: r.section.punishment },
      }));
    } catch (err: any) {
      log.error({ err: err.message }, "Internal search failed");
      return [];
    }
  }
}

export const internalProvider = new InternalProvider();
