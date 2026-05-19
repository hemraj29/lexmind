import type { DrafterPlugin, DrafterInput, DrafterOutput } from "../../../core/plugin.types.js";
import { buildCaseContext, generateFromPrompt } from "./_shared.js";

export const anticipatoryBailDrafter: DrafterPlugin = {
  id: "criminal.anticipatory_bail",
  domainCode: "criminal",
  documentTypeCode: "anticipatory_bail",

  async draft(input: DrafterInput): Promise<DrafterOutput> {
    const { caseData, memo } = input;
    const district = caseData.district || "[District]";
    const state = caseData.state || "India";
    const clientName = caseData.clientName || "Applicant";

    const prompt = `You are a senior Indian criminal defense lawyer drafting an ANTICIPATORY BAIL APPLICATION under Section 482 BNSS.

${buildCaseContext(caseData, memo)}

Generate JSON:
{
  "courtName": "Court of Sessions Judge, ${district}",
  "documentTitle": "ANTICIPATORY BAIL APPLICATION UNDER SECTION 482 BNSS",
  "caseTitle": "${clientName} vs State of ${state}",
  "introduction": "Formal introduction identifying applicant and relief sought under Sec 482 BNSS",
  "apprehensionGrounds": "Why the applicant apprehends arrest — specific facts and circumstances",
  "briefFacts": "Clean narrative from case documents",
  "groundsForBail": ["5-7 grounds why anticipatory bail should be granted"],
  "legalArguments": "Legal arguments citing sections and precedents PROVIDED ABOVE ONLY",
  "conditionsOffered": ["Conditions applicant is willing to comply with"],
  "prayer": "Formal prayer for anticipatory bail with standard conditions",
  "date": "${new Date().toISOString().split("T")[0]}",
  "advocateName": ""
}

RULES: ONLY cite sections/precedents from the data above. Do NOT invent facts or case law.`;

    return generateFromPrompt(prompt, "anticipatory_bail", caseData, memo);
  },
};
