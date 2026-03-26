import { v4 as uuid } from "uuid";
import { createChildLogger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
import type {
  WorkflowStep,
  WorkflowContext,
  WorkflowEvent,
  WorkflowEventHandler,
  WorkflowOptions,
  StepResult,
} from "./workflow-types.js";

const log = createChildLogger("workflow-engine");

export class WorkflowEngine<TFinalOutput = unknown> {
  private steps: WorkflowStep<any, any>[] = [];

  addStep<TInput, TOutput>(step: WorkflowStep<TInput, TOutput>): this {
    this.steps.push(step);
    return this;
  }

  async run(initialInput: unknown, options: WorkflowOptions = {}): Promise<{
    id: string;
    output: TFinalOutput;
    steps: StepResult[];
    totalDurationMs: number;
  }> {
    const runId = options.id || uuid();
    const onEvent = options.onEvent || (() => {});

    const ctx: WorkflowContext = {
      id: runId,
      startedAt: new Date(),
      steps: [],
      metadata: options.metadata || {},
      emit: (event: WorkflowEvent) => onEvent(event),
      getStepOutput: <T>(stepName: string): T | undefined => {
        const step = ctx.steps.find((s) => s.step === stepName);
        return step?.output as T | undefined;
      },
    };

    const pipelineStart = Date.now();

    ctx.emit({
      type: "pipeline:start",
      data: { runId, stepCount: this.steps.length },
      timestamp: Date.now(),
    });

    log.info({ runId, stepCount: this.steps.length }, "Pipeline started");

    let currentInput = initialInput;

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i]!;
      const stepStart = Date.now();

      ctx.emit({
        type: "step:start",
        step: step.name,
        message: `Starting ${step.name} (${i + 1}/${this.steps.length})`,
        timestamp: Date.now(),
      });

      log.info({ runId, step: step.name, index: i }, "Step started");

      try {
        // Execute with retry support
        const output = await this.executeStep(step, currentInput, ctx);

        // Validate output if validator is provided
        if (step.validate) {
          const validationResult = step.validate(output);
          if (validationResult !== true) {
            const errorMsg = typeof validationResult === "string" ? validationResult : `Validation failed for ${step.name}`;
            throw new Error(errorMsg);
          }
        }

        const durationMs = Date.now() - stepStart;
        const stepResult: StepResult = {
          step: step.name,
          status: "success",
          output,
          durationMs,
        };
        ctx.steps.push(stepResult);

        ctx.emit({
          type: "step:complete",
          step: step.name,
          data: { durationMs },
          message: `${step.name} completed in ${durationMs}ms`,
          timestamp: Date.now(),
        });

        log.info({ runId, step: step.name, durationMs }, "Step completed");

        currentInput = output;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const durationMs = Date.now() - stepStart;

        // Try error recovery
        if (step.onError) {
          log.warn({ runId, step: step.name, error: error.message }, "Step failed, attempting recovery");

          try {
            const recovered = await step.onError(error, ctx);
            if (recovered !== null) {
              ctx.steps.push({
                step: step.name,
                status: "success",
                output: recovered,
                durationMs: Date.now() - stepStart,
              });
              currentInput = recovered;
              continue;
            }
          } catch (recoveryError) {
            log.error({ runId, step: step.name }, "Recovery also failed");
          }
        }

        ctx.steps.push({
          step: step.name,
          status: "failed",
          output: null,
          durationMs,
          error: error.message,
        });

        ctx.emit({
          type: "step:error",
          step: step.name,
          data: { error: error.message },
          message: `${step.name} failed: ${error.message}`,
          timestamp: Date.now(),
        });

        ctx.emit({
          type: "pipeline:error",
          data: { failedStep: step.name, error: error.message },
          message: `Pipeline failed at ${step.name}`,
          timestamp: Date.now(),
        });

        log.error({ runId, step: step.name, error: error.message, durationMs }, "Step failed — pipeline aborted");

        throw new Error(`Pipeline failed at step "${step.name}": ${error.message}`);
      }
    }

    const totalDurationMs = Date.now() - pipelineStart;

    ctx.emit({
      type: "pipeline:complete",
      data: { totalDurationMs },
      message: `Pipeline completed in ${totalDurationMs}ms`,
      timestamp: Date.now(),
    });

    log.info({ runId, totalDurationMs }, "Pipeline completed");

    return {
      id: runId,
      output: currentInput as TFinalOutput,
      steps: ctx.steps,
      totalDurationMs,
    };
  }

  private async executeStep<TInput, TOutput>(
    step: WorkflowStep<TInput, TOutput>,
    input: TInput,
    ctx: WorkflowContext
  ): Promise<TOutput> {
    const retries = step.retries ?? 0;

    if (retries > 0) {
      return withRetry(() => this.executeWithTimeout(step, input, ctx), {
        maxRetries: retries,
      });
    }

    return this.executeWithTimeout(step, input, ctx);
  }

  private async executeWithTimeout<TInput, TOutput>(
    step: WorkflowStep<TInput, TOutput>,
    input: TInput,
    ctx: WorkflowContext
  ): Promise<TOutput> {
    if (!step.timeout) {
      return step.execute(input, ctx);
    }

    return Promise.race([
      step.execute(input, ctx),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Step "${step.name}" timed out after ${step.timeout}ms`)), step.timeout)
      ),
    ]);
  }

  get stepNames(): string[] {
    return this.steps.map((s) => s.name);
  }

  get stepCount(): number {
    return this.steps.length;
  }
}
