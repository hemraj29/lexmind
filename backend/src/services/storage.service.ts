import { mkdir, writeFile, readFile, unlink, access } from "fs/promises";
import { join, dirname } from "path";
import { v4 as uuid } from "uuid";
import { env } from "../config/env.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("storage");

class StorageService {
  private uploadDir: string;
  private outputDir: string;

  constructor() {
    this.uploadDir = env.UPLOAD_DIR;
    this.outputDir = env.OUTPUT_DIR;
  }

  async init(): Promise<void> {
    await mkdir(this.uploadDir, { recursive: true });
    await mkdir(this.outputDir, { recursive: true });
    log.info({ uploadDir: this.uploadDir, outputDir: this.outputDir }, "Storage directories ready");
  }

  async saveUpload(buffer: Buffer, originalName: string): Promise<{ path: string; id: string }> {
    const id = uuid();
    const ext = originalName.split(".").pop() || "bin";
    const fileName = `${id}.${ext}`;
    const filePath = join(this.uploadDir, fileName);

    await writeFile(filePath, buffer);
    log.info({ id, fileName }, "Upload saved");

    return { path: filePath, id };
  }

  async saveOutput(buffer: Buffer, runId: string, ext: string = "docx"): Promise<{ path: string; fileName: string }> {
    const fileName = `bail-application-${runId}.${ext}`;
    const filePath = join(this.outputDir, fileName);

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    log.info({ runId, fileName }, "Output saved");

    return { path: filePath, fileName };
  }

  async readFile(filePath: string): Promise<Buffer> {
    return readFile(filePath);
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
      log.debug({ filePath }, "File deleted");
    } catch {
      log.warn({ filePath }, "File not found for deletion");
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  getOutputPath(runId: string, ext: string = "docx"): string {
    return join(this.outputDir, `bail-application-${runId}.${ext}`);
  }
}

export const storageService = new StorageService();
