import type { DrafterPlugin, DrafterInput, DrafterOutput } from "../../../core/plugin.types.js";
import { buildCaseContext, generateFromPrompt } from "./_shared.js";

export const quashingDrafter: DrafterPlugin = {
  id: "criminal.quashing_petition",
  domainCode: "criminal",
  documentTypeCode: "quashing_petition",

  async draft(input: DrafterInput): Promise<DrafterOutput> {
    const { caseData, memo } = input;
    const state = (caseData.state || "INDIA").toUpperCase();
    const clientName = caseData.clientName || "Petitioner";
    const stateNice = caseData.state || "India";

    const prompt = `You are a senior Indian criminal defense lawyer drafting a QUASHING PETITION under Section 528 BNSS to be filed in the HIGH COURT.

${buildCaseContext(caseData, memo)}

Generate JSON:
{
  "courtName": "IN THE HIGH COURT OF ${state}",
  "documentTitle": "QUASHING PETITION UNDER SECTION 528 BNSS",
  "caseTitle": "${clientName} vs State of ${stateNice}",
  "introduction": "Identifying the FIR/order being challenged and the relief sought under Sec 528 BNSS",
  "impugnedOrder": "Description of the FIR/order/proceedings being challenged and why they are illegal/improper",
  "briefFacts": "Narrative establishing why the proceedings should be quashed",
  "groundsForQuashing": ["5-7 specific grounds for quashing — legal abuse, no offence made out, civil dispute, etc."],
  "legalArguments": "Legal arguments under Section 528 BNSS with precedent citations",
  "prayer": "Prayer to quash the FIR/proceedings/order",
  "date": "${new Date().toISOString().split("T")[0]}",
  "advocateName": ""
}`;

    return generateFromPrompt(prompt, "quashing_petition", caseData, memo);
  },
};
