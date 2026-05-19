import type { CitationProvider, CitationCandidate, ProviderSearchOptions } from "../provider.types.js";
import { env } from "../../../config/env.js";
import { createChildLogger } from "../../../utils/logger.js";

const log = createChildLogger("citation:indian-kanoon");

/**
 * Indian Kanoon provider — fetches case law from indiankanoon.org's API.
 *
 * Free tier: rate-limited (~60 req/min). Premium: higher limits.
 *
 * The user only needs to set INDIAN_KANOON_API_KEY in .env to enable this provider.
 */
class IndianKanoonProvider implements CitationProvider {
  name = "indian-kanoon";
  type = "external" as const;
  private API_BASE = "https://api.indiankanoon.org";

  get enabled(): boolean {
    return !!process.env.INDIAN_KANOON_API_KEY;
  }

  async search(query: string, opts: ProviderSearchOptions): Promise<CitationCandidate[]> {
    if (!this.enabled) return [];

    const refinedQuery = this.refineQuery(query, opts.domains);

    try {
      const params = new URLSearchParams({
        formInput: refinedQuery,
        pagenum: "0",
      });

      const res = await fetch(`${this.API_BASE}/search/?${params}`, {
        method: "POST",
        headers: { Authorization: `Token ${process.env.INDIAN_KANOON_API_KEY}` },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        log.warn({ status: res.status }, "IK search failed");
        return [];
      }

      const data: any = await res.json();
      const docs = (data.docs || []).slice(0, opts.topK || 5);

      return docs.map((doc: any) => ({
        providerId: this.name,
        externalId: String(doc.tid),
        sourceType: "precedent" as const,
        title: this.cleanText(doc.title || ""),
        reference: doc.citation || doc.docsource || "Indian Kanoon",
        court: doc.docsource,
        year: doc.publishdate ? new Date(doc.publishdate).getFullYear() : undefined,
        excerpt: this.cleanText(doc.headline || doc.fragment || ""),
        sourceUrl: `https://indiankanoon.org/doc/${doc.tid}/`,
        relevanceScore: typeof doc.score === "number" ? doc.score : 0.5,
      }));
    } catch (err: any) {
      log.error({ err: err.message }, "IK search threw");
      return [];
    }
  }

  async fetchFullText(externalId: string): Promise<string> {
    if (!this.enabled) return "";
    try {
      const res = await fetch(`${this.API_BASE}/doc/${externalId}/`, {
        method: "POST",
        headers: { Authorization: `Token ${process.env.INDIAN_KANOON_API_KEY}` },
        signal: AbortSignal.timeout(10000),
      });
      const data: any = await res.json();
      return this.cleanText(data.doc || "");
    } catch {
      return "";
    }
  }

  private cleanText(html: string): string {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  private refineQuery(query: string, domains?: string[]): string {
    const domainBoosts: Record<string, string> = {
      criminal: "section bail criminal",
      civil: "civil suit",
      tax: "income tax appeal",
      family: "marriage divorce maintenance",
      corporate: "company section IBC",
      labour: "workman industrial dispute",
      property: "property title deed",
      ip: "trademark patent copyright",
    };

    if (!domains || domains.length === 0) return query;
    const boosts = domains.map((d) => domainBoosts[d] || "").filter(Boolean).join(" ");
    return boosts ? `${query} ${boosts}` : query;
  }
}

export const indianKanoonProvider = new IndianKanoonProvider();
