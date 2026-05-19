import type { CitationProvider, CitationCandidate, ProviderSearchOptions } from "../provider.types.js";
import { createChildLogger } from "../../../utils/logger.js";

const log = createChildLogger("citation:case-docs");

/**
 * Case Documents provider — searches the lawyer's own uploaded files (FIR, chargesheet, etc.)
 * for passages relevant to the query.
 *
 * Currently uses simple text frequency. Can be upgraded to embeddings later.
 */
class CaseDocumentProvider implements CitationProvider {
  name = "case-documents";
  type = "internal" as const;
  enabled = true;

  async search(query: string, opts: ProviderSearchOptions): Promise<CitationCandidate[]> {
    if (!opts.caseContext?.documents?.length) return [];

    const candidates: CitationCandidate[] = [];
    const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 3);

    for (const doc of opts.caseContext.documents) {
      const text = doc.rawText || "";
      if (!text) continue;

      const lower = text.toLowerCase();
      // Find passages where query terms cluster together
      const passages = this.findRelevantPassages(text, lower, queryTerms);

      for (const passage of passages.slice(0, 3)) {
        candidates.push({
          providerId: this.name,
          externalId: doc.id,
          sourceType: "document" as const,
          title: doc.fileName,
          reference: `${doc.docType.toUpperCase()} — ${doc.fileName}`,
          excerpt: passage.text,
          pageNumber: passage.estimatedPage,
          sourceUrl: `/api/case-documents/${doc.id}/view#page=${passage.estimatedPage || 1}`,
          relevanceScore: passage.score,
          metadata: { docType: doc.docType },
        });
      }
    }

    return candidates;
  }

  private findRelevantPassages(
    text: string,
    lower: string,
    queryTerms: string[]
  ): { text: string; score: number; estimatedPage: number }[] {
    const passages: { text: string; score: number; estimatedPage: number }[] = [];
    const PASSAGE_LEN = 500;

    if (queryTerms.length === 0) return passages;

    let cursor = 0;
    while (cursor < text.length) {
      const slice = text.slice(cursor, cursor + PASSAGE_LEN);
      const sliceLower = lower.slice(cursor, cursor + PASSAGE_LEN);

      let score = 0;
      for (const term of queryTerms) {
        const matches = sliceLower.split(term).length - 1;
        score += matches;
      }

      if (score > 0) {
        passages.push({
          text: slice.replace(/\s+/g, " ").trim(),
          score: score / queryTerms.length,
          estimatedPage: Math.floor(cursor / 3000) + 1, // ~3K chars per page
        });
      }

      cursor += PASSAGE_LEN;
    }

    return passages.sort((a, b) => b.score - a.score);
  }
}

export const caseDocumentProvider = new CaseDocumentProvider();
