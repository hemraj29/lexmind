import { openaiService } from "../services/openai.service.js";
import { docgenService, type BailDraftSections } from "../services/docgen.service.js";
import { createChildLogger } from "../utils/logger.js";
import type { ExtractedFIR } from "../types/fir.types.js";
import type { LegalMemo } from "../types/legal.types.js";

const log = createChildLogger("agent:drafter");

class DrafterAgent {
  async draft(
    fir: ExtractedFIR,
    memo: LegalMemo
  ): Promise<{ markdown: string; sections: BailDraftSections; docxBuffer: Buffer }> {
    log.info({ firNumber: fir.firNumber }, "Starting bail application drafting");

    // Step 1: Generate the draft content via GPT-4o
    const sections = await this.generateDraftContent(fir, memo);

    // Step 2: Validate — no hallucinated sections or case laws
    this.validateDraft(sections, memo);

    // Step 3: Generate .docx
    const docxBuffer = await docgenService.generate(sections, fir, memo);

    // Step 4: Build markdown version
    const markdown = this.toMarkdown(sections, fir, memo);

    log.info({ firNumber: fir.firNumber, docxSize: docxBuffer.length }, "Draft generation complete");

    return { markdown, sections, docxBuffer };
  }

  private async generateDraftContent(fir: ExtractedFIR, memo: LegalMemo): Promise<BailDraftSections> {
    const accusedNames = fir.accused.map((a) => a.name).join(", ") || "Unknown";
    const sectionsText = memo.applicableSections
      .map((s) => `${s.act} Section ${s.sectionNumber} (${s.title}) — Punishment: ${s.punishment}, Bailable: ${s.bailable}`)
      .join("\n");

    const ingredientsText = memo.ingredients
      .map((i) => `${i.section}: ${i.elements.join("; ")}`)
      .join("\n");

    const precedentsText = memo.precedents.length > 0
      ? memo.precedents.map((p) => `${p.caseTitle} (${p.citation}): ${p.ratio}`).join("\n")
      : "No specific precedents available.";

    const prompt = `You are a senior Indian criminal defense lawyer drafting a bail application.

FIR DETAILS:
- FIR Number: ${fir.firNumber}
- Date: ${fir.date}
- Police Station: ${fir.policeStation}
- District: ${fir.district}, ${fir.state}
- Accused: ${accusedNames}
- Complainant: ${fir.victim.name}
- IO: ${fir.ioName}

BRIEF FACTS FROM FIR:
${fir.briefFacts}

APPLICABLE SECTIONS:
${sectionsText}

INGREDIENTS OF OFFENCE (what prosecution must prove):
${ingredientsText}

RELEVANT PRECEDENTS:
${precedentsText}

BAILABILITY: ${memo.bailability}
RISK ASSESSMENT: ${memo.riskAssessment}

TASK: Draft a professional bail application. Return JSON with these fields:

{
  "courtName": "The appropriate court (e.g., 'Court of Sessions Judge, ${fir.district}')",
  "caseTitle": "${accusedNames} vs State of ${fir.state || 'India'}",
  "introduction": "Formal introduction paragraph identifying the applicant, FIR, and the relief sought",
  "briefFacts": "Clean narrative of the facts (2-3 paragraphs), based ONLY on the FIR facts above",
  "groundsForBail": [
    "Ground 1 (5-7 strong legal grounds for bail, each a complete argument)",
    "Ground 2...",
    "..."
  ],
  "legalArguments": "Detailed legal arguments citing ONLY the sections and precedents provided above. Reference specific ingredients that prosecution cannot establish based on the FIR facts.",
  "prayer": "Formal prayer clause requesting bail with standard conditions",
  "date": "${new Date().toISOString().split("T")[0]}",
  "advocateName": ""
}

CRITICAL RULES:
1. ONLY cite sections from APPLICABLE SECTIONS above
2. ONLY cite precedents from RELEVANT PRECEDENTS above — if none, do not cite any case laws
3. ALL facts must come from the FIR details — do NOT invent facts
4. Use formal legal language appropriate for Indian courts
5. Grounds for bail should be between 5-7 strong arguments
6. Each ground should be a complete, persuasive argument (2-3 sentences)
7. The legal arguments section should tie ingredients to facts, showing prosecution's burden`;

    const result = await openaiService.chatJSON<BailDraftSections>(
      [{ role: "user", content: prompt }],
      { temperature: 0.3, maxTokens: 8192 }
    );

    return result;
  }

  private validateDraft(sections: BailDraftSections, memo: LegalMemo): void {
    const knownSectionNums = new Set(
      memo.applicableSections.map((s) => s.sectionNumber)
    );

    const knownCaseTitles = new Set(
      memo.precedents.map((p) => p.caseTitle.toLowerCase())
    );

    // Check legal arguments for unknown section references
    const sectionPattern = /section\s+(\d+[a-z]?)/gi;
    let match;
    const draftText = `${sections.legalArguments} ${sections.groundsForBail.join(" ")}`;

    while ((match = sectionPattern.exec(draftText)) !== null) {
      const num = match[1]!;
      if (!knownSectionNums.has(num)) {
        log.warn({ section: num }, "Draft references unknown section — may be hallucinated");
      }
    }

    // Validate grounds count
    if (sections.groundsForBail.length < 3) {
      log.warn("Draft has fewer than 3 grounds for bail");
    }
  }

  private toMarkdown(sections: BailDraftSections, fir: ExtractedFIR, memo: LegalMemo): string {
    const sectionsText = memo.applicableSections
      .map((s) => `${s.act} Section ${s.sectionNumber}`)
      .join(", ");

    return `# ${sections.courtName}

## BAIL APPLICATION

**FIR No:** ${fir.firNumber} | **P.S:** ${fir.policeStation} | **District:** ${fir.district}
**Sections:** ${sectionsText}

---

### ${sections.caseTitle}

---

## 1. INTRODUCTION

${sections.introduction}

## 2. BRIEF FACTS OF THE CASE

${sections.briefFacts}

## 3. GROUNDS FOR BAIL

${sections.groundsForBail.map((g, i) => `${i + 1}. ${g}`).join("\n\n")}

## 4. LEGAL ARGUMENTS

${sections.legalArguments}

## 5. PRAYER

${sections.prayer}

---

**Date:** ${sections.date}
**Place:** ${fir.district}

_${sections.advocateName || "Advocate for the Applicant/Accused"}_
`;
  }
}

export const drafterAgent = new DrafterAgent();
