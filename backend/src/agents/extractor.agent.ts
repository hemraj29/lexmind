import { openaiService } from "../services/openai.service.js";
import { createChildLogger } from "../utils/logger.js";
import { extractTextFromPDF, isImageMimeType, isPDFMimeType } from "../utils/pdf.js";
import type { ExtractedFIR, FIRExtractionResult } from "../types/fir.types.js";

const log = createChildLogger("agent:extractor");

const EXTRACTION_PROMPT = `You are an expert Indian legal document analyst. You are given a scanned FIR (First Information Report) from an Indian police station.

TASK: Extract ALL the following fields from this FIR document into a structured JSON format.

REQUIRED FIELDS:
- firNumber: The FIR registration number (e.g., "FIR No. 123/2024")
- date: Date of FIR registration (format: YYYY-MM-DD)
- policeStation: Name of the police station
- district: District name
- state: State name
- accused: Array of accused persons, each with:
  - name: Full name
  - fatherName: Father's name (if available)
  - address: Address (if available)
  - age: Age (if available)
- victim: Object with name, fatherName, address (the complainant)
- ioName: Name of the Investigating Officer
- sectionsRaw: Array of all legal sections mentioned (e.g., ["IPC 420", "IPC 467", "BNS 318"])
- briefFacts: A clean, structured summary of the facts of the case (2-5 paragraphs)
- rawText: The full OCR text you can read from the document
- confidence: Your confidence in the extraction accuracy (0.0 to 1.0)

RULES:
1. Extract ONLY what is explicitly stated in the document
2. If a field is not found, use empty string "" or empty array []
3. For sectionsRaw, include the Act name prefix (IPC, BNS, BNSS, CrPC, etc.)
4. For briefFacts, clean up the language but preserve ALL factual details
5. If the document is in Hindi, translate the extracted fields to English
6. Set confidence based on document clarity and how many fields you could extract
7. Do NOT invent or assume any information

Respond ONLY with valid JSON matching the schema above.`;

class ExtractorAgent {
  async extract(fileBuffer: Buffer, mimeType: string): Promise<FIRExtractionResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    log.info({ mimeType, size: fileBuffer.length }, "Starting FIR extraction");

    let result: ExtractedFIR;

    if (isImageMimeType(mimeType)) {
      result = await this.extractFromImage(fileBuffer, mimeType);
    } else if (isPDFMimeType(mimeType)) {
      result = await this.extractFromPDF(fileBuffer);
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }

    // Validation warnings
    if (!result.firNumber) warnings.push("FIR number could not be extracted");
    if (result.sectionsRaw.length === 0) warnings.push("No legal sections found in FIR");
    if (result.accused.length === 0) warnings.push("No accused persons identified");
    if (!result.briefFacts) warnings.push("Brief facts could not be extracted");
    if (result.confidence < 0.5) warnings.push("Low confidence extraction — manual review recommended");

    log.info(
      {
        firNumber: result.firNumber,
        sectionsCount: result.sectionsRaw.length,
        accusedCount: result.accused.length,
        confidence: result.confidence,
        warnings,
      },
      "FIR extraction complete"
    );

    return {
      fir: result,
      warnings,
      processingTimeMs: Date.now() - startTime,
    };
  }

  private async extractFromImage(buffer: Buffer, mimeType: string): Promise<ExtractedFIR> {
    const base64 = buffer.toString("base64");

    const raw = await openaiService.visionJSON<ExtractedFIR>(
      [{ base64, mimeType }],
      EXTRACTION_PROMPT,
      { temperature: 0.1, maxTokens: 4096 }
    );

    return this.normalizeResult(raw);
  }

  private async extractFromPDF(buffer: Buffer): Promise<ExtractedFIR> {
    // First try text extraction for digital PDFs
    const text = await extractTextFromPDF(buffer);

    if (text && text.trim().length > 100) {
      log.info("PDF has extractable text, using text-based extraction");
      return this.extractFromText(text);
    }

    // Fall back to vision-based extraction for scanned PDFs
    log.info("PDF appears to be scanned, using vision-based extraction");
    const base64 = buffer.toString("base64");
    return openaiService.visionJSON<ExtractedFIR>(
      [{ base64, mimeType: "application/pdf" }],
      EXTRACTION_PROMPT,
      { temperature: 0.1, maxTokens: 4096 }
    );
  }

  private async extractFromText(text: string): Promise<ExtractedFIR> {
    const prompt = `${EXTRACTION_PROMPT}

Here is the text content of the FIR document:

---
${text}
---

Extract all fields into the specified JSON format.`;

    const result = await openaiService.chatJSON<ExtractedFIR>(
      [{ role: "user", content: prompt }],
      { temperature: 0.1, maxTokens: 4096 }
    );

    return this.normalizeResult({ ...result, rawText: text });
  }

  private normalizeResult(raw: ExtractedFIR): ExtractedFIR {
    return {
      firNumber: raw.firNumber || "",
      date: raw.date || "",
      policeStation: raw.policeStation || "",
      district: raw.district || "",
      state: raw.state || "",
      accused: Array.isArray(raw.accused) ? raw.accused : [],
      victim: raw.victim || { name: "" },
      ioName: raw.ioName || "",
      sectionsRaw: Array.isArray(raw.sectionsRaw) ? raw.sectionsRaw : [],
      briefFacts: raw.briefFacts || "",
      rawText: raw.rawText || "",
      confidence: typeof raw.confidence === "number" ? Math.min(1, Math.max(0, raw.confidence)) : 0.5,
    };
  }
}

export const extractorAgent = new ExtractorAgent();
