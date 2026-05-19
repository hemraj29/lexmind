import type { DrafterPlugin, DrafterInput, DrafterOutput } from "../../../core/plugin.types.js";
import { drafterAgent } from "../../../agents/drafter.agent.js";
import type { ExtractedFIR } from "../../../types/fir.types.js";

/**
 * Regular Bail under Section 480 BNSS.
 * Reuses the original drafterAgent that's been battle-tested for bail apps.
 */
export const regularBailDrafter: DrafterPlugin = {
  id: "criminal.regular_bail",
  domainCode: "criminal",
  documentTypeCode: "regular_bail",

  async draft(input: DrafterInput): Promise<DrafterOutput> {
    const { caseData, memo } = input;

    const firDoc = caseData.documents.find((d: any) => d.docType === "fir");
    const firData = (firDoc?.extractedData as any)?.data || firDoc?.extractedData;

    if (!firData) {
      throw new Error("Regular Bail requires an FIR. Upload the FIR document first.");
    }

    const fir: ExtractedFIR = {
      firNumber: firData.firNumber || "",
      date: firData.date || "",
      policeStation: firData.policeStation || "",
      district: caseData.district || firData.district || "",
      state: caseData.state || firData.state || "",
      accused: firData.accused || [],
      victim: firData.victim || { name: "" },
      ioName: firData.ioName || "",
      sectionsRaw: firData.sectionsRaw || caseData.sectionsRaw || [],
      briefFacts: firData.briefFacts || "",
      rawText: firData.rawText || "",
      confidence: firData.confidence || 0.7,
    };

    const result = await drafterAgent.draft(fir, memo);

    return {
      markdown: result.markdown,
      sections: result.sections as unknown as Record<string, unknown>,
      docxBuffer: result.docxBuffer,
    };
  },
};
