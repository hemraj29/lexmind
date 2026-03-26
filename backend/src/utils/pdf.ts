import pdfParse from "pdf-parse";
import { createChildLogger } from "./logger.js";

const log = createChildLogger("pdf");

export interface PDFExtraction {
  text: string;
  pageCount: number;
  pages: Buffer[]; // raw page buffers for vision API
}

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    log.info({ pages: data.numpages }, "PDF text extracted");
    return data.text;
  } catch (err) {
    log.error({ err }, "Failed to extract text from PDF");
    throw new Error("PDF text extraction failed");
  }
}

export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function isPDFMimeType(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

export function bufferToBase64(buffer: Buffer, mimeType: string): string {
  const base64 = buffer.toString("base64");
  return `data:${mimeType};base64,${base64}`;
}
