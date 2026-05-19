import type { DrafterPlugin, DrafterInput, DrafterOutput } from "../../../core/plugin.types.js";
import { buildCaseContext, generateFromPrompt } from "./_shared.js";

export const defaultBailDrafter: DrafterPlugin = {
  id: "criminal.default_bail",
  domainCode: "criminal",
  documentTypeCode: "default_bail",

  async draft(input: DrafterInput): Promise<DrafterOutput> {
    const { caseData, memo } = input;
    const district = caseData.district || "[District]";
    const state = caseData.state || "India";
    const clientName = caseData.clientName || "Applicant";

    const prompt = `You are a senior Indian criminal defense lawyer drafting a DEFAULT BAIL APPLICATION under Section 187 BNSS (statutory bail).

${buildCaseContext(caseData, memo)}

Generate JSON:
{
  "courtName": "Court of Sessions Judge, ${district}",
  "documentTitle": "DEFAULT BAIL APPLICATION UNDER SECTION 187 BNSS",
  "caseTitle": "${clientName} vs State of ${state}",
  "introduction": "Citing Section 187 BNSS and the indefeasible right to default bail",
  "chronology": "Timeline showing: arrest date → 60/90 day period → chargesheet not filed within time",
  "statutoryProvision": "Analysis of Section 187 BNSS — why default bail is a statutory right",
  "briefFacts": "Clean narrative establishing the timeline",
  "groundsForBail": ["5-7 grounds establishing entitlement to default bail"],
  "legalArguments": "Legal arguments with section and precedent citations",
  "prayer": "Prayer for default bail as a matter of right",
  "date": "${new Date().toISOString().split("T")[0]}",
  "advocateName": ""
}`;

    return generateFromPrompt(prompt, "default_bail", caseData, memo);
  },
};
