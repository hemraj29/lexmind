import type { DrafterPlugin, DrafterInput, DrafterOutput } from "../../../core/plugin.types.js";
import { buildCivilContext, generateCivilDoc } from "./_shared.js";

export const plaintDrafter: DrafterPlugin = {
  id: "civil.plaint",
  domainCode: "civil",
  documentTypeCode: "plaint",

  async draft(input: DrafterInput): Promise<DrafterOutput> {
    const { caseData, memo } = input;
    const district = caseData.district || "[District]";
    const partyName = caseData.clientName || "Plaintiff";

    const prompt = `You are an experienced Indian civil litigation lawyer drafting a PLAINT under Order VII of the Code of Civil Procedure, 1908.

${buildCivilContext(caseData, memo)}

Generate JSON:
{
  "courtName": "Court of Civil Judge, ${district}",
  "documentTitle": "PLAINT UNDER ORDER VII RULE 1 CPC",
  "caseTitle": "${partyName} vs Defendant(s)",
  "introduction": "Plaint titles and party identification",
  "factsOfCase": "Detailed factual narrative supporting the cause of action (5-8 paragraphs)",
  "causeOfAction": "Specific cause of action with date and place",
  "limitationStatement": "Statement showing the suit is within limitation period",
  "valuation": "Valuation of the suit for jurisdictional and court fees purposes",
  "jurisdiction": "Statement establishing court's territorial jurisdiction",
  "reliefSought": ["Specific reliefs prayed for — primary and alternative"],
  "verification": "Standard verification clause under Order VI Rule 15 CPC",
  "date": "${new Date().toISOString().split("T")[0]}",
  "advocateName": ""
}

RULES:
- Cite ONLY provisions provided in APPLICABLE PROVISIONS above.
- Facts must come from case documents; do not invent.
- Include statement of limitation, valuation, and jurisdiction (mandatory).`;

    return generateCivilDoc(prompt, "plaint", caseData, memo);
  },
};
