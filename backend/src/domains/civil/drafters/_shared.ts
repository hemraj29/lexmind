import { openaiService } from "../../../services/openai.service.js";
import { docgenService } from "../../../services/docgen.service.js";
import type { CaseWithDocuments } from "../../../types/case.types.js";
import type { LegalMemo } from "../../../types/legal.types.js";

export function buildCivilContext(caseData: CaseWithDocuments, memo: LegalMemo): string {
  const parts: string[] = [];
  parts.push(`CASE: ${caseData.title}`);
  if (caseData.clientName) parts.push(`PARTY: ${caseData.clientName}`);

  for (const doc of caseData.documents) {
    parts.push(`\n[${doc.docType.toUpperCase()}]:`);
    parts.push(JSON.stringify(doc.extractedData, null, 2).slice(0, 2000));
  }

  if (memo.applicableSections.length > 0) {
    parts.push("\nAPPLICABLE PROVISIONS:");
    for (const s of memo.applicableSections) {
      parts.push(`${s.act} Section ${s.sectionNumber} (${s.title})`);
    }
  }

  return parts.join("\n");
}

export async function generateCivilDoc(
  prompt: string,
  type: any,
  caseData: CaseWithDocuments,
  memo: LegalMemo
) {
  const sections = await openaiService.chatJSON<Record<string, unknown>>(
    [{ role: "user", content: prompt }],
    { temperature: 0.3, maxTokens: 8192 }
  );

  // For civil drafts, we still leverage docgen's generic .docx generator.
  // We pass any GenerationType — the docgen falls back gracefully for unknown types.
  const docxBuffer = await docgenService.generateFromSections(type, sections, caseData, memo);

  const s = sections as any;
  let markdown = `# ${s.courtName || ""}\n\n## ${s.documentTitle || ""}\n\n**${s.caseTitle || ""}**\n\n---\n\n`;
  for (const [key, val] of Object.entries(s)) {
    if (typeof val === "string" && val.length > 0 && !["courtName", "documentTitle", "caseTitle", "date"].includes(key)) {
      markdown += `### ${key.replace(/([A-Z])/g, " $1").trim().toUpperCase()}\n\n${val}\n\n`;
    }
    if (Array.isArray(val) && val.length > 0) {
      markdown += `### ${key.toUpperCase()}\n\n`;
      val.forEach((item, i) => (markdown += `${i + 1}. ${item}\n`));
      markdown += "\n";
    }
  }

  return { markdown, sections, docxBuffer };
}
