import { openaiService } from "../../../services/openai.service.js";
import { docgenService } from "../../../services/docgen.service.js";
import type { CaseWithDocuments } from "../../../types/case.types.js";
import type { LegalMemo } from "../../../types/legal.types.js";
import type { GenerationType } from "../../../types/generation.types.js";

export function buildCaseContext(caseData: CaseWithDocuments, memo: LegalMemo): string {
  const parts: string[] = [];
  parts.push(`CASE: ${caseData.title}`);
  if (caseData.clientName) parts.push(`CLIENT: ${caseData.clientName}`);
  if (caseData.caseNumber) parts.push(`CASE NUMBER: ${caseData.caseNumber}`);

  for (const doc of caseData.documents) {
    parts.push(`\n[${doc.docType.toUpperCase()}]:`);
    parts.push(JSON.stringify(doc.extractedData, null, 2).slice(0, 2000));
  }

  parts.push("\nAPPLICABLE SECTIONS:");
  for (const s of memo.applicableSections) {
    parts.push(
      `${s.act} Section ${s.sectionNumber} (${s.title}) — Punishment: ${s.punishment}, Bailable: ${s.bailable}`
    );
  }

  if (memo.precedents.length > 0) {
    parts.push("\nPRECEDENTS:");
    for (const p of memo.precedents) {
      parts.push(`${p.caseTitle} (${p.citation}): ${p.ratio}`);
    }
  }

  return parts.join("\n");
}

export async function generateFromPrompt(
  prompt: string,
  type: GenerationType,
  caseData: CaseWithDocuments,
  memo: LegalMemo
): Promise<{ markdown: string; sections: Record<string, unknown>; docxBuffer: Buffer }> {
  const sections = await openaiService.chatJSON<Record<string, unknown>>(
    [{ role: "user", content: prompt }],
    { temperature: 0.3, maxTokens: 8192 }
  );

  const markdown = sectionsToMarkdown(sections);
  const docxBuffer = await docgenService.generateFromSections(type, sections, caseData, memo);

  return { markdown, sections, docxBuffer };
}

export function sectionsToMarkdown(sections: Record<string, unknown>): string {
  const s = sections as any;
  let md = `# ${s.courtName || ""}\n\n## ${s.documentTitle || ""}\n\n**${s.caseTitle || ""}**\n\n---\n\n`;

  const ordered = [
    { key: "introduction", label: "INTRODUCTION" },
    { key: "apprehensionGrounds", label: "APPREHENSION OF ARREST" },
    { key: "impugnedOrder", label: "IMPUGNED ORDER / FIR" },
    { key: "impugnedJudgment", label: "IMPUGNED JUDGMENT" },
    { key: "chronology", label: "CHRONOLOGY" },
    { key: "statutoryProvision", label: "STATUTORY PROVISION" },
    { key: "briefFacts", label: "BRIEF FACTS" },
    { key: "chargesheetAnalysis", label: "CHARGESHEET ANALYSIS" },
  ];

  let i = 1;
  for (const { key, label } of ordered) {
    if (s[key]) {
      md += `## ${i}. ${label}\n\n${s[key]}\n\n`;
      i++;
    }
  }

  const groundsKey = s.groundsForBail || s.groundsForQuashing || s.groundsForDischarge || s.groundsOfAppeal;
  if (groundsKey && Array.isArray(groundsKey)) {
    const label = s.groundsForBail
      ? "GROUNDS FOR BAIL"
      : s.groundsForQuashing
      ? "GROUNDS FOR QUASHING"
      : s.groundsForDischarge
      ? "GROUNDS FOR DISCHARGE"
      : "GROUNDS OF APPEAL";
    md += `## ${i}. ${label}\n\n`;
    groundsKey.forEach((g: string, idx: number) => {
      md += `${idx + 1}. ${g}\n\n`;
    });
    i++;
  }

  if (s.legalArguments) {
    md += `## ${i}. LEGAL ARGUMENTS\n\n${s.legalArguments}\n\n`;
    i++;
  }

  if (s.conditionsOffered && Array.isArray(s.conditionsOffered)) {
    md += `## ${i}. CONDITIONS OFFERED\n\n`;
    (s.conditionsOffered as string[]).forEach((c: string, idx: number) => {
      md += `${idx + 1}. ${c}\n`;
    });
    md += "\n";
    i++;
  }

  if (s.prayer) md += `## ${i}. PRAYER\n\n${s.prayer}\n\n`;

  md += `---\n\n**Date:** ${s.date || ""}\n\n_${s.advocateName || "Advocate for the Applicant"}_\n`;

  return md;
}
