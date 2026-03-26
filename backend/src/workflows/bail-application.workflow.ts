import { WorkflowEngine } from "../core/workflow-engine.js";
import { uploadStep, type UploadInput } from "./steps/upload.step.js";
import { extractStep } from "./steps/extract.step.js";
import { researchStep } from "./steps/research.step.js";
import { draftStep } from "./steps/draft.step.js";
import { saveOutputStep, type SaveOutputResult } from "./steps/save-output.step.js";
import { updatePipelineRun } from "../services/database.service.js";
import { createChildLogger } from "../utils/logger.js";
import type { WorkflowOptions, WorkflowEvent } from "../core/workflow-types.js";

const log = createChildLogger("bail-workflow");

export function createBailApplicationWorkflow(): WorkflowEngine<SaveOutputResult> {
  return new WorkflowEngine<SaveOutputResult>()
    .addStep(uploadStep)
    .addStep(extractStep)
    .addStep(researchStep)
    .addStep(draftStep)
    .addStep(saveOutputStep);
}

export async function runBailPipeline(
  input: UploadInput,
  options: WorkflowOptions = {}
): Promise<{
  id: string;
  output: SaveOutputResult;
  steps: { step: string; status: string; durationMs: number; error?: string }[];
  totalDurationMs: number;
}> {
  const workflow = createBailApplicationWorkflow();

  const wrappedOnEvent = (event: WorkflowEvent) => {
    log.debug({ event: event.type, step: event.step, message: event.message }, "Workflow event");
    options.onEvent?.(event);
  };

  try {
    const result = await workflow.run(input, {
      ...options,
      onEvent: wrappedOnEvent,
    });

    return result;
  } catch (err) {
    // Mark the run as failed in DB
    const error = err instanceof Error ? err : new Error(String(err));

    if (options.metadata?.dbRunId) {
      await updatePipelineRun(options.metadata.dbRunId as string, {
        status: "FAILED",
        error: error.message,
      }).catch(() => {});
    }

    throw error;
  }
}
