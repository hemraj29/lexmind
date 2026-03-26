import { drafterAgent } from "../../agents/drafter.agent.js";
import { updatePipelineRun } from "../../services/database.service.js";
import type { WorkflowStep, WorkflowContext } from "../../core/workflow-types.js";
import type { ResearchOutput } from "./research.step.js";
import type { ExtractedFIR } from "../../types/fir.types.js";
import type { LegalMemo } from "../../types/legal.types.js";

export interface DraftOutput {
  fir: ExtractedFIR;
  memo: LegalMemo;
  draftMarkdown: string;
  docxBuffer: Buffer;
}

export const draftStep: WorkflowStep<ResearchOutput, DraftOutput> = {
  name: "draft",
  retries: 1,
  timeout: 180_000,

  async execute(input: ResearchOutput, ctx: WorkflowContext): Promise<DraftOutput> {
    ctx.emit({
      type: "step:progress",
      step: "draft",
      message: "Generating bail application draft...",
      timestamp: Date.now(),
    });

    const result = await drafterAgent.draft(input.fir, input.memo);

    // Persist markdown to DB
    const dbRunId = ctx.metadata.dbRunId as string;
    if (dbRunId) {
      await updatePipelineRun(dbRunId, {
        draftMarkdown: result.markdown,
        currentStep: "draft",
      });
    }

    return {
      fir: input.fir,
      memo: input.memo,
      draftMarkdown: result.markdown,
      docxBuffer: result.docxBuffer,
    };
  },

  validate(output: DraftOutput): boolean | string {
    if (!output.draftMarkdown || output.draftMarkdown.length < 200) {
      return "Generated draft is too short — likely failed";
    }
    if (!output.docxBuffer || output.docxBuffer.length === 0) {
      return "DOCX generation failed — empty buffer";
    }
    return true;
  },
};
