import { storageService } from "../../services/storage.service.js";
import {
  updatePipelineRun,
  createGeneratedDocument,
} from "../../services/database.service.js";
import type { WorkflowStep, WorkflowContext } from "../../core/workflow-types.js";
import type { DraftOutput } from "./draft.step.js";
import type { ExtractedFIR } from "../../types/fir.types.js";
import type { LegalMemo } from "../../types/legal.types.js";

export interface SaveOutputResult {
  fir: ExtractedFIR;
  memo: LegalMemo;
  draftMarkdown: string;
  docxPath: string;
  docxFileName: string;
}

export const saveOutputStep: WorkflowStep<DraftOutput, SaveOutputResult> = {
  name: "save-output",

  async execute(input: DraftOutput, ctx: WorkflowContext): Promise<SaveOutputResult> {
    ctx.emit({
      type: "step:progress",
      step: "save-output",
      message: "Saving generated documents...",
      timestamp: Date.now(),
    });

    // Save .docx to disk
    const { path: docxPath, fileName: docxFileName } = await storageService.saveOutput(
      input.docxBuffer,
      ctx.id,
      "docx"
    );

    // Update pipeline run in DB
    const dbRunId = ctx.metadata.dbRunId as string;
    if (dbRunId) {
      await updatePipelineRun(dbRunId, {
        status: "COMPLETED",
        docxPath,
        currentStep: "save-output",
      });

      // Record the generated document
      await createGeneratedDocument({
        pipelineRunId: dbRunId,
        docType: "BAIL_APPLICATION",
        filePath: docxPath,
        fileSize: input.docxBuffer.length,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
    }

    return {
      fir: input.fir,
      memo: input.memo,
      draftMarkdown: input.draftMarkdown,
      docxPath,
      docxFileName,
    };
  },
};
