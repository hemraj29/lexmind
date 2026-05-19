import type { DrafterPlugin, DrafterInput, DrafterOutput } from "../../../core/plugin.types.js";
import { buildCaseContext, generateFromPrompt } from "./_shared.js";

export const appealDrafter: DrafterPlugin = {
  id: "criminal.criminal_appeal",
  domainCode: "criminal",
  documentTypeCode: "criminal_appeal",

  async draft(input: DrafterInput): Promise<DrafterOutput> {
    const { caseData, memo } = input;
    const state = (caseData.state || "INDIA").toUpperCase();
    const clientName = caseData.clientName || "Appellant";
    const stateNice = caseData.state || "India";

    const prompt = `You are a senior Indian criminal defense lawyer drafting a CRIMINAL APPEAL.

${buildCaseContext(caseData, memo)}

Generate JSON:
{
  "courtName": "IN THE HIGH COURT OF ${state}",
  "documentTitle": "CRIMINAL APPEAL",
  "caseTitle": "${clientName} vs State of ${stateNice}",
  "introduction": "Identifying the impugned judgment and conviction being challenged",
  "impugnedJudgment": "Details of the trial court judgment — date, court, judge, conviction, sentence",
  "briefFacts": "Narrative from the defense perspective",
  "groundsOfAppeal": ["7-10 grounds of appeal — errors of law, misappreciation of evidence, procedural irregularities"],
  "legalArguments": "Legal arguments showing why conviction is unsustainable",
  "prayer": "Prayer to set aside conviction and acquit, or in the alternative suspend sentence and grant bail",
  "date": "${new Date().toISOString().split("T")[0]}",
  "advocateName": ""
}`;

    return generateFromPrompt(prompt, "criminal_appeal", caseData, memo);
  },
};
