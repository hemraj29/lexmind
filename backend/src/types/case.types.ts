import type { ExtractedDocumentData, CaseDocType } from "./document.types.js";
import type { StatuteSection, CasePrecedent, LegalMemo } from "./legal.types.js";

export interface CaseWithDocuments {
  id: string;
  title: string;
  clientName: string;
  caseNumber?: string;
  court?: string;
  district?: string;
  state?: string;
  sectionsRaw: string[];
  documents: CaseDocumentData[];
}

export interface CaseDocumentData {
  id: string;
  docType: CaseDocType;
  fileName: string;
  extractedData: unknown;
  rawText?: string;
  confidence?: number;
}

export interface CreateCaseInput {
  title?: string;
  clientName?: string;
  court?: string;
  district?: string;
  state?: string;
}

export interface ChatMessageInput {
  content: string;
  file?: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  };
}

// @commands the user can type in chat
export const CHAT_COMMANDS: Record<string, { type: string; label: string; description: string }> = {
  "@bail": { type: "regular_bail", label: "Regular Bail", description: "Generate Regular Bail Application" },
  "@anticipatory": { type: "anticipatory_bail", label: "Anticipatory Bail", description: "Generate Anticipatory Bail Application" },
  "@default_bail": { type: "default_bail", label: "Default Bail", description: "Generate Default Bail Application (Sec 187 BNSS)" },
  "@quashing": { type: "quashing_petition", label: "Quashing Petition", description: "Generate Quashing Petition (Sec 528 BNSS)" },
  "@discharge": { type: "discharge_application", label: "Discharge Application", description: "Generate Discharge Application" },
  "@appeal": { type: "criminal_appeal", label: "Criminal Appeal", description: "Generate Criminal Appeal" },
  "@analyze": { type: "analyze", label: "Case Analysis", description: "Run full case analysis (strengths/weaknesses/strategy)" },
  "@summary": { type: "summary", label: "Case Summary", description: "Generate case summary" },
  "@cross_exam": { type: "cross_exam", label: "Cross-Examination", description: "Generate cross-examination questions" },
  "@missing": { type: "missing", label: "Missing Info", description: "What information is still missing" },
  "@sections": { type: "sections", label: "Sections", description: "List all applicable sections" },
  "@precedents": { type: "precedents", label: "Precedents", description: "Show relevant case precedents" },
};

export function parseCommand(content: string): { command: string; type: string } | null {
  const trimmed = content.trim().toLowerCase();
  for (const [cmd, meta] of Object.entries(CHAT_COMMANDS)) {
    if (trimmed === cmd || trimmed.startsWith(cmd + " ")) {
      return { command: cmd, type: meta.type };
    }
  }
  return null;
}
