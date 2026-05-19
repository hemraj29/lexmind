import type { DrafterPlugin, DrafterInput, DrafterOutput } from "../../../core/plugin.types.js";
import { buildCivilContext, generateCivilDoc } from "./_shared.js";

export const temporaryInjunctionDrafter: DrafterPlugin = {
  id: "civil.temporary_injunction",
  domainCode: "civil",
  documentTypeCode: "temporary_injunction",

  async draft(input: DrafterInput): Promise<DrafterOutput> {
    const { caseData, memo } = input;
    const partyName = caseData.clientName || "Plaintiff";

    const prompt = `You are an experienced Indian civil lawyer drafting an APPLICATION FOR TEMPORARY INJUNCTION under Order 39 Rules 1 & 2 CPC.

${buildCivilContext(caseData, memo)}

Generate JSON:
{
  "courtName": "<Same court as plaint>",
  "documentTitle": "APPLICATION UNDER ORDER 39 RULES 1 & 2 CPC FOR TEMPORARY INJUNCTION",
  "caseTitle": "${partyName} vs Defendant(s)",
  "introduction": "Identifying the suit and the urgency",
  "primaFacie": "Establishing prima facie case (one of the three tests)",
  "balanceOfConvenience": "Balance of convenience tilts in applicant's favour",
  "irreparableInjury": "Specific irreparable injury that monetary damages cannot remedy",
  "factsSupportingApplication": "Detailed factual support",
  "reliefSought": ["Specific injunction relief prayed for"],
  "prayer": "Formal prayer including ad-interim ex-parte relief",
  "verification": "Standard verification clause",
  "date": "${new Date().toISOString().split("T")[0]}",
  "advocateName": ""
}

RULES: All three tests of injunction (prima facie, balance of convenience, irreparable injury) MUST be addressed. Use only cited provisions.`;

    return generateCivilDoc(prompt, "temporary_injunction", caseData, memo);
  },
};
