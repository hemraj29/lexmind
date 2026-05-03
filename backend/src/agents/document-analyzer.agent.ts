import { openaiService } from "../services/openai.service.js";
import { extractorAgent } from "./extractor.agent.js";
import { createChildLogger } from "../utils/logger.js";
import { extractTextFromPDF, isImageMimeType, isPDFMimeType } from "../utils/pdf.js";
import type { CaseDocType, ExtractedDocumentData } from "../types/document.types.js";

const log = createChildLogger("agent:document-analyzer");

const CLASSIFY_PROMPT = `You are an Indian legal document classifier. Given a legal document image/text, identify what type of document it is.

Return ONLY one of these exact values as a JSON object:
- "fir" — First Information Report (police complaint)
- "chargesheet" — Police chargesheet / final report
- "court_order" — Any court order (bail, remand, charge framing, etc.)
- "witness_statement" — Witness deposition / statement under Section 161/164
- "evidence" — Evidence report, forensic report, seizure memo
- "previous_petition" — Previously filed petition (bail application, etc.)
- "other" — Cannot determine

Respond: { "docType": "..." }`;

const EXTRACTION_PROMPTS: Record<string, string> = {
  chargesheet: `You are an expert Indian legal document analyst. Extract ALL fields from this CHARGESHEET into JSON:
{
  "caseNumber": "", "chargesheetNumber": "", "date": "YYYY-MM-DD", "court": "", "policeStation": "",
  "district": "", "accused": [{ "name": "", "fatherName": "", "address": "" }],
  "victim": { "name": "" }, "ioName": "", "sectionsCharged": ["BNS 303", ...],
  "witnessCount": 0, "witnessList": [{ "name": "", "role": "" }],
  "evidenceSummary": "", "prosecutionCase": "Full narrative...",
  "rawText": "full text", "confidence": 0.9
}
RULES: Extract ONLY what exists. Use "" for missing fields. Include Act prefix in sections (BNS/IPC/BNSS).`,

  court_order: `You are an expert Indian legal document analyst. Extract ALL fields from this COURT ORDER into JSON:
{
  "orderType": "bail_rejection|bail_grant|remand|charge_framing|interim|other",
  "caseNumber": "", "date": "YYYY-MM-DD", "court": "", "judge": "",
  "applicant": "", "respondent": "", "orderSummary": "Brief summary...",
  "reasoning": "Judge's full reasoning...", "directions": ["Direction 1", ...],
  "nextDate": "YYYY-MM-DD or null", "rawText": "full text", "confidence": 0.9
}
RULES: Extract ONLY what exists. The reasoning field is critical — capture the judge's logic completely.`,

  witness_statement: `You are an expert Indian legal document analyst. Extract ALL fields from this WITNESS STATEMENT into JSON:
{
  "witnessName": "", "witnessNumber": null, "relation": "relation to case",
  "statementDate": "YYYY-MM-DD", "recordedBy": "",
  "keyStatements": ["Statement 1...", "Statement 2..."],
  "contradictions": ["Any contradiction with other evidence..."],
  "rawText": "full text", "confidence": 0.9
}
RULES: keyStatements should capture the most important claims. Flag contradictions if obvious.`,

  evidence: `You are an expert Indian legal document analyst. Extract ALL fields from this EVIDENCE DOCUMENT into JSON:
{
  "evidenceType": "documentary|electronic|forensic|physical|seizure_memo",
  "description": "", "collectedBy": "", "collectionDate": "YYYY-MM-DD",
  "chainOfCustody": "", "relevance": "Why this matters to the case",
  "rawText": "full text", "confidence": 0.9
}`,

  previous_petition: `You are an expert Indian legal document analyst. Extract ALL fields from this PETITION into JSON:
{
  "petitionType": "bail_application|anticipatory_bail|quashing|discharge|appeal|other",
  "filedBy": "", "filedDate": "YYYY-MM-DD", "court": "", "caseNumber": "",
  "outcome": "granted|rejected|pending|withdrawn|null",
  "arguments": ["Argument 1...", "Argument 2..."],
  "rawText": "full text", "confidence": 0.9
}`,
};

class DocumentAnalyzerAgent {
  async classifyDocument(buffer: Buffer, mimeType: string): Promise<CaseDocType> {
    log.info({ mimeType }, "Classifying document type");

    try {
      if (isImageMimeType(mimeType)) {
        const base64 = buffer.toString("base64");
        const result = await openaiService.visionJSON<{ docType: string }>(
          [{ base64, mimeType }],
          CLASSIFY_PROMPT,
          { temperature: 0 }
        );
        return (result.docType as CaseDocType) || "other";
      }

      if (isPDFMimeType(mimeType)) {
        const text = await extractTextFromPDF(buffer);
        if (text && text.trim().length > 50) {
          const result = await openaiService.chatJSON<{ docType: string }>(
            [{ role: "user", content: `${CLASSIFY_PROMPT}\n\nDocument text:\n${text.slice(0, 3000)}` }],
            { temperature: 0 }
          );
          return (result.docType as CaseDocType) || "other";
        }
        // Scanned PDF — use vision
        const base64 = buffer.toString("base64");
        const result = await openaiService.visionJSON<{ docType: string }>(
          [{ base64, mimeType: "application/pdf" }],
          CLASSIFY_PROMPT,
          { temperature: 0 }
        );
        return (result.docType as CaseDocType) || "other";
      }

      return "other";
    } catch (err) {
      log.error({ err }, "Classification failed, defaulting to 'other'");
      return "other";
    }
  }

  async extract(
    buffer: Buffer,
    mimeType: string,
    docType?: CaseDocType
  ): Promise<{ docType: CaseDocType; data: ExtractedDocumentData; rawText: string; confidence: number }> {
    // Step 1: Classify if not provided
    const type = docType || (await this.classifyDocument(buffer, mimeType));
    log.info({ docType: type }, "Extracting document data");

    // Step 2: Delegate to type-specific extractor
    if (type === "fir") {
      const result = await extractorAgent.extract(buffer, mimeType);
      return {
        docType: "fir",
        data: { type: "fir", data: result.fir },
        rawText: result.fir.rawText,
        confidence: result.fir.confidence,
      };
    }

    const prompt = EXTRACTION_PROMPTS[type];
    if (!prompt) {
      // Generic extraction for unknown types
      const text = await this.extractRawText(buffer, mimeType);
      return {
        docType: type,
        data: { type: type as any, data: { rawText: text, confidence: 0.5 } as any },
        rawText: text,
        confidence: 0.5,
      };
    }

    // Step 3: Run type-specific extraction
    const extracted = await this.runExtraction(buffer, mimeType, prompt);

    return {
      docType: type,
      data: { type: type as any, data: extracted } as ExtractedDocumentData,
      rawText: extracted.rawText || "",
      confidence: extracted.confidence || 0.7,
    };
  }

  private async runExtraction(buffer: Buffer, mimeType: string, prompt: string): Promise<any> {
    if (isImageMimeType(mimeType)) {
      const base64 = buffer.toString("base64");
      return openaiService.visionJSON(
        [{ base64, mimeType }],
        prompt,
        { temperature: 0.1, maxTokens: 4096 }
      );
    }

    if (isPDFMimeType(mimeType)) {
      const text = await extractTextFromPDF(buffer);
      if (text && text.trim().length > 100) {
        return openaiService.chatJSON(
          [{ role: "user", content: `${prompt}\n\nDocument text:\n${text}` }],
          { temperature: 0.1, maxTokens: 4096 }
        );
      }
      // Scanned PDF
      const base64 = buffer.toString("base64");
      return openaiService.visionJSON(
        [{ base64, mimeType: "application/pdf" }],
        prompt,
        { temperature: 0.1, maxTokens: 4096 }
      );
    }

    throw new Error(`Unsupported mime type: ${mimeType}`);
  }

  private async extractRawText(buffer: Buffer, mimeType: string): Promise<string> {
    if (isPDFMimeType(mimeType)) {
      return extractTextFromPDF(buffer);
    }
    if (isImageMimeType(mimeType)) {
      const base64 = buffer.toString("base64");
      return openaiService.vision(
        [{ base64, mimeType }],
        "Extract ALL text from this document. Return the full text content."
      );
    }
    return "";
  }
}

export const documentAnalyzerAgent = new DocumentAnalyzerAgent();
