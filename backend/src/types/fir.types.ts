export interface PersonInfo {
  name: string;
  fatherName?: string;
  address?: string;
  age?: number;
}

export interface ExtractedFIR {
  firNumber: string;
  date: string;
  policeStation: string;
  district: string;
  state: string;
  accused: PersonInfo[];
  victim: PersonInfo;
  ioName: string;
  sectionsRaw: string[];
  briefFacts: string;
  rawText: string;
  confidence: number;
}

export interface FIRExtractionResult {
  fir: ExtractedFIR;
  warnings: string[];
  processingTimeMs: number;
}
