export type ActType = "BNS" | "BNSS" | "BSA";
export type OffenceType = "cognizable" | "non-cognizable";
export type BailabilityStatus = "bailable" | "non-bailable" | "mixed";

export interface StatuteSection {
  id: string;
  act: ActType;
  sectionNumber: string;
  title: string;
  description: string;
  offenceType: OffenceType;
  bailable: boolean;
  punishment: string;
  ingredients: string[];
}

export interface IPCToBNSMapping {
  ipcSection: string;
  ipcTitle: string;
  bnsSection: string;
  bnsTitle: string;
  notes?: string;
}

export interface CasePrecedent {
  caseTitle: string;
  citation: string;
  relevance: string;
  ratio: string;
}

export interface LegalMemo {
  applicableSections: StatuteSection[];
  mappedSections: IPCToBNSMapping[];
  ingredients: { section: string; elements: string[] }[];
  precedents: CasePrecedent[];
  bailability: BailabilityStatus;
  riskAssessment: string;
}

export interface SearchResult {
  section: StatuteSection;
  score: number;
  source: "vector" | "bm25" | "exact";
}

export interface HybridSearchOptions {
  query: string;
  topK?: number;
  actFilter?: ActType;
  includeRerank?: boolean;
}
