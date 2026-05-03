import type { PersonInfo, ExtractedFIR } from "./fir.types.js";

// Discriminated union — the shape of extractedData depends on doc type
export type ExtractedDocumentData =
  | { type: "fir"; data: ExtractedFIR }
  | { type: "chargesheet"; data: ExtractedChargesheet }
  | { type: "court_order"; data: ExtractedCourtOrder }
  | { type: "witness_statement"; data: ExtractedWitnessStatement }
  | { type: "evidence"; data: ExtractedEvidence }
  | { type: "previous_petition"; data: ExtractedPetition };

export interface ExtractedChargesheet {
  caseNumber: string;
  chargesheetNumber: string;
  date: string;
  court: string;
  policeStation: string;
  district: string;
  accused: PersonInfo[];
  victim: PersonInfo;
  ioName: string;
  sectionsCharged: string[];
  witnessCount: number;
  witnessList: { name: string; role: string }[];
  evidenceSummary: string;
  prosecutionCase: string;
  rawText: string;
  confidence: number;
}

export interface ExtractedCourtOrder {
  orderType: "bail_rejection" | "bail_grant" | "remand" | "charge_framing" | "interim" | "other";
  caseNumber: string;
  date: string;
  court: string;
  judge: string;
  applicant: string;
  respondent: string;
  orderSummary: string;
  reasoning: string;
  directions: string[];
  nextDate?: string;
  rawText: string;
  confidence: number;
}

export interface ExtractedWitnessStatement {
  witnessName: string;
  witnessNumber?: number;
  relation: string;
  statementDate: string;
  recordedBy: string;
  keyStatements: string[];
  contradictions?: string[];
  rawText: string;
  confidence: number;
}

export interface ExtractedEvidence {
  evidenceType: string;
  description: string;
  collectedBy: string;
  collectionDate: string;
  chainOfCustody?: string;
  relevance: string;
  rawText: string;
  confidence: number;
}

export interface ExtractedPetition {
  petitionType: string;
  filedBy: string;
  filedDate: string;
  court: string;
  caseNumber: string;
  outcome?: string;
  arguments: string[];
  rawText: string;
  confidence: number;
}

export type CaseDocType = "fir" | "chargesheet" | "court_order" | "witness_statement" | "evidence" | "previous_petition" | "other";
