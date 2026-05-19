/**
 * Plugin contracts. Implementing these makes a domain/drafter discoverable.
 *
 * ARCHITECTURE PRINCIPLE: Core never changes. Plugins extend.
 * To add a new domain or drafter, drop a file in domains/<name>/ — registries auto-discover it.
 */

// ─── DOMAIN PLUGIN ─────────────────────────────────────────

export interface DomainPlugin {
  code: string;                     // "criminal", "civil", "tax"
  name: string;                     // "Criminal Law"
  description: string;
  iconName: string;
  colorHex: string;
  sortOrder: number;

  defaultActCodes: string[];        // ["BNS", "BNSS", "BSA"] — acts most commonly referenced

  documentTypes: DocumentTypeConfig[];

  routingHints: {
    keywords: string[];
    actReferences: string[];
    queryPatterns: RegExp[];
  };

  prerequisiteCheckers?: Record<string, PrerequisiteChecker>;
}

export interface DocumentTypeConfig {
  code: string;                     // "regular_bail"
  name: string;                     // "Regular Bail Application"
  description: string;
  category: "draft" | "analyze" | "research" | "extract";
  iconName: string;
  colorHex: string;
  command?: string;                 // "@bail"
  requiredSourceTypes: string[];    // ["fir"]
  primarySectionCodes: string[];    // ["BNSS-480"]
  drafterId: string;                // "criminal.regular_bail" (resolves to a DrafterPlugin)
  templateConfig?: Record<string, unknown>;
  sortOrder?: number;
}

export type PrerequisiteChecker = (caseData: { documents: { docType: string }[] }) => {
  ready: boolean;
  missing: string[];
};

// ─── DRAFTER PLUGIN ────────────────────────────────────────

export interface DrafterPlugin {
  id: string;                       // "criminal.regular_bail"
  domainCode: string;               // "criminal"
  documentTypeCode: string;         // "regular_bail"

  draft(input: DrafterInput): Promise<DrafterOutput>;
}

export interface DrafterInput {
  caseData: any;                    // CaseWithDocuments
  memo: any;                        // LegalMemo
  citations?: any[];                // CitationCandidate[]
  templateConfig?: Record<string, unknown>;
}

export interface DrafterOutput {
  markdown: string;
  sections: Record<string, unknown>;
  docxBuffer: Buffer;
  citationIds?: string[];
}

// ─── ACT PLUGIN ────────────────────────────────────────────

export interface ActPlugin {
  code: string;                     // "BNS"
  name: string;                     // "Bharatiya Nyaya Sanhita, 2023"
  shortName: string;                // "BNS"
  year: number;
  domainCode: string;               // "criminal"
  isCentralAct: boolean;
  stateCode?: string;
  description?: string;
  sourcePdfPath?: string;
  sourceUrl?: string;
  searchPriority?: number;
}

// ─── EXTRACTION PLUGIN ─────────────────────────────────────

export interface ExtractionPlugin {
  id: string;                       // "criminal.fir"
  documentTypeCode: string;         // matches a CaseDocumentType ("fir", "chargesheet", etc.)
  domainCode: string;

  extract(input: ExtractionInput): Promise<ExtractionOutput>;
}

export interface ExtractionInput {
  buffer: Buffer;
  mimeType: string;
}

export interface ExtractionOutput {
  docType: string;
  data: unknown;
  rawText: string;
  confidence: number;
}
