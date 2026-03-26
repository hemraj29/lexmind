import { extractorAgent } from "../../agents/extractor.agent.js";
import { updatePipelineRun } from "../../services/database.service.js";
import type { WorkflowStep, WorkflowContext } from "../../core/workflow-types.js";
import type { UploadOutput } from "./upload.step.js";
import type { ExtractedFIR } from "../../types/fir.types.js";

export interface ExtractOutput {
  fir: ExtractedFIR;
  warnings: string[];
}

export const extractStep: WorkflowStep<UploadOutput, ExtractOutput> = {
  name: "extract",
  retries: 1,
  timeout: 120_000, // 2 min max for OCR

  async execute(input: UploadOutput, ctx: WorkflowContext): Promise<ExtractOutput> {
    ctx.emit({
      type: "step:progress",
      step: "extract",
      message: "Sending FIR to GPT-4o Vision for extraction...",
      timestamp: Date.now(),
    });

    const result = await extractorAgent.extract(input.fileBuffer, input.mimeType);

    // Persist to DB
    const dbRunId = ctx.metadata.dbRunId as string;
    if (dbRunId) {
      await updatePipelineRun(dbRunId, {
        extractedFIR: result.fir as any,
        currentStep: "extract",
      });
    }

    return {
      fir: result.fir,
      warnings: result.warnings,
    };
  },

  validate(output: ExtractOutput): boolean | string {
    if (!output.fir.firNumber && !output.fir.briefFacts) {
      return "Extraction produced no usable data — FIR number and facts are both missing";
    }
    if (output.fir.confidence < 0.3) {
      return "Extraction confidence too low (<30%) — document may be unreadable";
    }
    return true;
  },

  async onError(error: Error, ctx: WorkflowContext): Promise<ExtractOutput | null> {
    // Can't recover from extraction failure
    return null;
  },
};
