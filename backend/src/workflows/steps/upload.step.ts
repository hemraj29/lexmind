import { storageService } from "../../services/storage.service.js";
import { createPipelineRun } from "../../services/database.service.js";
import { SUPPORTED_MIME_TYPES } from "../../config/constants.js";
import type { WorkflowStep, WorkflowContext } from "../../core/workflow-types.js";

export interface UploadInput {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
}

export interface UploadOutput {
  runId: string;
  filePath: string;
  fileBuffer: Buffer;
  mimeType: string;
}

export const uploadStep: WorkflowStep<UploadInput, UploadOutput> = {
  name: "upload",

  async execute(input: UploadInput, ctx: WorkflowContext): Promise<UploadOutput> {
    // Validate mime type
    if (!SUPPORTED_MIME_TYPES.includes(input.mimeType as any)) {
      throw new Error(`Unsupported file type: ${input.mimeType}. Supported: ${SUPPORTED_MIME_TYPES.join(", ")}`);
    }

    // Save file to disk
    const { path, id } = await storageService.saveUpload(input.fileBuffer, input.fileName);

    // Create pipeline run in database
    const run = await createPipelineRun({
      fileName: input.fileName,
      mimeType: input.mimeType,
      uploadPath: path,
    });

    // Store the DB run id in context
    ctx.metadata.dbRunId = run.id;

    return {
      runId: ctx.id,
      filePath: path,
      fileBuffer: input.fileBuffer,
      mimeType: input.mimeType,
    };
  },

  validate(output: UploadOutput): boolean {
    return !!output.filePath && !!output.fileBuffer;
  },
};
