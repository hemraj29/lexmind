import type { DrafterPlugin, DrafterInput, DrafterOutput } from "../../../core/plugin.types.js";
import { buildCaseContext, generateFromPrompt } from "./_shared.js";

export const dischargeDrafter: DrafterPlugin = {
  id: "criminal.discharge_application",
  domainCode: "criminal",
  documentTypeCode: "discharge_application",

  async draft(input: DrafterInput): Promise<DrafterOutput> {
    const { caseData, memo } = input;
    const district = caseData.district || "[District]";
    const state = caseData.state || "India";
    const clientName = caseData.clientName || "Applicant";

    const prompt = `You are a senior Indian criminal defense lawyer drafting a DISCHARGE APPLICATION under Section 250 BNSS.

${buildCaseContext(caseData, memo)}

Generate JSON:
{
  "courtName": "Court of Sessions Judge, ${district}",
  "documentTitle": "DISCHARGE APPLICATION UNDER SECTION 250 BNSS",
  "caseTitle": "${clientName} vs State of ${state}",
  "introduction": "Seeking discharge under Section 250 BNSS",
  "briefFacts": "Narrative from case documents",
  "chargesheetAnalysis": "Detailed analysis of why the chargesheet does NOT make out the ingredients of the offence charged. Reference specific ingredients vs evidence.",
  "groundsForDischarge": ["5-7 grounds why charges should not be framed"],
  "legalArguments": "Legal arguments showing insufficient grounds to proceed",
  "prayer": "Prayer for discharge from all charges",
  "date": "${new Date().toISOString().split("T")[0]}",
  "advocateName": ""
}`;

    return generateFromPrompt(prompt, "discharge_application", caseData, memo);
  },
};
