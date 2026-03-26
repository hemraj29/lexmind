import { researcherAgent } from "../../agents/researcher.agent.js";
import { updatePipelineRun } from "../../services/database.service.js";
import type { WorkflowStep, WorkflowContext } from "../../core/workflow-types.js";
import type { ExtractOutput } from "./extract.step.js";
import type { ExtractedFIR } from "../../types/fir.types.js";
import type { LegalMemo } from "../../types/legal.types.js";

export interface ResearchOutput {
  fir: ExtractedFIR;
  memo: LegalMemo;
}

export const researchStep: WorkflowStep<ExtractOutput, ResearchOutput> = {
  name: "research",
  retries: 1,
  timeout: 180_000, // 3 min for research

  async execute(input: ExtractOutput, ctx: WorkflowContext): Promise<ResearchOutput> {
    ctx.emit({
      type: "step:progress",
      step: "research",
      message: "Searching statutory database and case precedents...",
      timestamp: Date.now(),
    });

    const memo = await researcherAgent.research(input.fir);

    // Persist to DB
    const dbRunId = ctx.metadata.dbRunId as string;
    if (dbRunId) {
      await updatePipelineRun(dbRunId, {
        legalMemo: memo as any,
        currentStep: "research",
      });
    }

    return {
      fir: input.fir,
      memo,
    };
  },

  validate(output: ResearchOutput): boolean | string {
    if (output.memo.applicableSections.length === 0) {
      return "No applicable legal sections found — cannot proceed with drafting";
    }
    return true;
  },
};
