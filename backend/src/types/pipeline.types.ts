import type { ExtractedFIR } from "./fir.types.js";
import type { LegalMemo } from "./legal.types.js";

export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface StepResult<T = unknown> {
  step: string;
  status: StepStatus;
  output: T;
  durationMs: number;
  error?: string;
}

export interface WorkflowContext {
  id: string;
  startedAt: Date;
  steps: StepResult[];
  metadata: Record<string, unknown>;
  emit: (event: string, data: unknown) => void;
}

export interface WorkflowStep<TInput = unknown, TOutput = unknown> {
  name: string;
  execute: (input: TInput, ctx: WorkflowContext) => Promise<TOutput>;
  validate?: (output: TOutput) => boolean;
  onError?: (error: Error, ctx: WorkflowContext) => Promise<TOutput | null>;
  retries?: number;
}

export interface PipelineInput {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
}

export interface PipelineResult {
  id: string;
  fir: ExtractedFIR;
  memo: LegalMemo;
  draftMarkdown: string;
  docxBuffer: Buffer;
  steps: StepResult[];
  totalDurationMs: number;
}

export interface PipelineEvent {
  type: "step:start" | "step:complete" | "step:error" | "pipeline:complete" | "pipeline:error";
  step?: string;
  data?: unknown;
  timestamp: number;
}
