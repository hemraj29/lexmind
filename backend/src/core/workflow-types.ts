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
  emit: (event: WorkflowEvent) => void;
  getStepOutput: <T>(stepName: string) => T | undefined;
}

export interface WorkflowStep<TInput = unknown, TOutput = unknown> {
  name: string;
  execute: (input: TInput, ctx: WorkflowContext) => Promise<TOutput>;
  validate?: (output: TOutput) => boolean | string;
  onError?: (error: Error, ctx: WorkflowContext) => Promise<TOutput | null>;
  retries?: number;
  timeout?: number;
}

export interface WorkflowEvent {
  type:
    | "pipeline:start"
    | "step:start"
    | "step:progress"
    | "step:complete"
    | "step:error"
    | "pipeline:complete"
    | "pipeline:error";
  step?: string;
  data?: unknown;
  message?: string;
  timestamp: number;
}

export type WorkflowEventHandler = (event: WorkflowEvent) => void;

export interface WorkflowOptions {
  id?: string;
  metadata?: Record<string, unknown>;
  onEvent?: WorkflowEventHandler;
}
