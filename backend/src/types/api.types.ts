import type { ExtractedFIR } from "./fir.types.js";
import type { LegalMemo } from "./legal.types.js";
import type { StepResult } from "./pipeline.types.js";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface PipelineRunResponse {
  runId: string;
  status: "started";
  streamUrl: string;
}

export interface PipelineResultResponse {
  runId: string;
  fir: ExtractedFIR;
  memo: LegalMemo;
  draftMarkdown: string;
  downloadUrl: string;
  steps: StepResult[];
  totalDurationMs: number;
}

export interface ExtractRequest {
  fileBuffer: Buffer;
  mimeType: string;
}

export interface ResearchRequest {
  fir: ExtractedFIR;
}

export interface DraftRequest {
  fir: ExtractedFIR;
  memo: LegalMemo;
}

export interface SectionSearchQuery {
  q: string;
  act?: string;
  limit?: number;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  uptime: number;
  services: {
    openai: boolean;
    pinecone: boolean;
  };
}
