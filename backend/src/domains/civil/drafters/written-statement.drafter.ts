import type { DrafterPlugin, DrafterInput, DrafterOutput } from "../../../core/plugin.types.js";
import { buildCivilContext, generateCivilDoc } from "./_shared.js";

export const writtenStatementDrafter: DrafterPlugin = {
  id: "civil.written_statement",
  domainCode: "civil",
  documentTypeCode: "written_statement",

  async draft(input: DrafterInput): Promise<DrafterOutput> {
    const { caseData, memo } = input;
    const partyName = caseData.clientName || "Defendant";

    const prompt = `You are an experienced Indian civil litigation lawyer drafting a WRITTEN STATEMENT under Order VIII CPC.

${buildCivilContext(caseData, memo)}

Generate JSON:
{
  "courtName": "<Same court as plaint>",
  "documentTitle": "WRITTEN STATEMENT UNDER ORDER VIII CPC",
  "caseTitle": "Plaintiff vs ${partyName}",
  "preliminaryObjections": ["Maintainability, jurisdiction, limitation, mis-joinder, etc."],
  "paraWiseReply": "Para-wise denial / admission of plaint contents (essential under Order VIII Rule 3-5)",
  "additionalFacts": "Facts the defendant needs to bring on record",
  "counterClaim": "Counter-claim if applicable, otherwise empty string",
  "legalGrounds": "Legal grounds for dismissal of plaint",
  "reliefSought": ["Reliefs the defendant prays for — primarily dismissal of suit"],
  "verification": "Standard verification clause under Order VI Rule 15 CPC",
  "date": "${new Date().toISOString().split("T")[0]}",
  "advocateName": ""
}

RULES: Para-wise reply MUST address every numbered paragraph of the plaint. Cite only provided provisions.`;

    return generateCivilDoc(prompt, "written_statement", caseData, memo);
  },
};
