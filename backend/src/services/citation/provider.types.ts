/**
 * Citation provider contract.
 * Each external/internal source of legal citations implements this.
 */

export type CitationSourceType = "section" | "precedent" | "document" | "web";

export interface CitationProvider {
  name: string;
  type: "internal" | "external";
  enabled: boolean;

  search(query: string, options: ProviderSearchOptions): Promise<CitationCandidate[]>;
  fetchFullText?(externalId: string): Promise<string>;
}

export interface ProviderSearchOptions {
  topK?: number;
  domains?: string[];
  caseContext?: {
    documents?: { id: string; docType: string; rawText?: string; fileName: string }[];
    sectionsRaw?: string[];
  };
  filters?: {
    court?: string;
    yearFrom?: number;
    yearTo?: number;
    sections?: string[];
    bailRelevant?: boolean;
  };
}

export interface CitationCandidate {
  providerId: string;
  externalId: string;
  sourceType: CitationSourceType;

  title: string;
  reference: string;
  court?: string;
  year?: number;

  excerpt: string;
  pageNumber?: number;
  paragraphRef?: string;
  passageStart?: number;
  passageEnd?: number;

  sourceUrl: string;
  relevanceScore: number;

  metadata?: Record<string, unknown>;
}
