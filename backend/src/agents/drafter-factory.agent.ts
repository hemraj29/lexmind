import { openaiService } from "../services/openai.service.js";
import { docgenService } from "../services/docgen.service.js";
import { drafterAgent } from "./drafter.agent.js";
import { createChildLogger } from "../utils/logger.js";
import type { CaseWithDocuments } from "../types/case.types.js";
import type { LegalMemo } from "../types/legal.types.js";
import type { ExtractedFIR } from "../types/fir.types.js";
import type { GenerationType } from "../types/generation.types.js";

const log = createChildLogger("agent:drafter-factory");

export interface DraftResult {
  markdown: string;
  sections: Record<string, unknown>;
  docxBuffer: Buffer;
}

class DrafterFactory {
  async draft(
    type: GenerationType,
    caseData: CaseWithDocuments,
    memo: LegalMemo
  ): Promise<DraftResult> {
    log.info({ type, caseId: caseData.id }, "Drafting document");

    switch (type) {
      case "regular_bail":
        return this.draftRegularBail(caseData, memo);
      case "anticipatory_bail":
        return this.draftFromTemplate(type, caseData, memo, this.anticipatoryBailPrompt(caseData, memo));
      case "default_bail":
        return this.draftFromTemplate(type, caseData, memo, this.defaultBailPrompt(caseData, memo));
      case "quashing_petition":
        return this.draftFromTemplate(type, caseData, memo, this.quashingPrompt(caseData, memo));
      case "discharge_application":
        return this.draftFromTemplate(type, caseData, memo, this.dischargePrompt(caseData, memo));
      case "criminal_appeal":
        return this.draftFromTemplate(type, caseData, memo, this.appealPrompt(caseData, memo));
      default:
        throw new Error(`Unknown generation type: ${type}`);
    }
  }

  private async draftRegularBail(caseData: CaseWithDocuments, memo: LegalMemo): Promise<DraftResult> {
    // Reuse existing bail drafter — extract FIR data from case documents
    const firDoc = caseData.documents.find((d) => d.docType === "fir");
    const firData = (firDoc?.extractedData as any)?.data || firDoc?.extractedData;

    if (!firData) {
      throw new Error("No FIR data found in case. Upload an FIR first.");
    }

    const fir: ExtractedFIR = {
      firNumber: firData.firNumber || "",
      date: firData.date || "",
      policeStation: firData.policeStation || "",
      district: caseData.district || firData.district || "",
      state: caseData.state || firData.state || "",
      accused: firData.accused || [],
      victim: firData.victim || { name: "" },
      ioName: firData.ioName || "",
      sectionsRaw: firData.sectionsRaw || caseData.sectionsRaw || [],
      briefFacts: firData.briefFacts || "",
      rawText: firData.rawText || "",
      confidence: firData.confidence || 0.7,
    };

    const result = await drafterAgent.draft(fir, memo);
    return {
      markdown: result.markdown,
      sections: result.sections as unknown as Record<string, unknown>,
      docxBuffer: result.docxBuffer,
    };
  }

  private async draftFromTemplate(
    type: GenerationType,
    caseData: CaseWithDocuments,
    memo: LegalMemo,
    prompt: string
  ): Promise<DraftResult> {
    const sections = await openaiService.chatJSON<Record<string, unknown>>(
      [{ role: "user", content: prompt }],
      { temperature: 0.3, maxTokens: 8192 }
    );

    const markdown = this.sectionsToMarkdown(type, sections, caseData, memo);
    const docxBuffer = await docgenService.generateFromSections(type, sections, caseData, memo);

    return { markdown, sections, docxBuffer };
  }

  private buildCaseContext(caseData: CaseWithDocuments, memo: LegalMemo): string {
    const parts: string[] = [];
    const clientName = caseData.clientName || "the Accused";
    const district = caseData.district || "";
    const state = caseData.state || "";

    parts.push(`CASE: ${caseData.title}`);
    parts.push(`CLIENT: ${clientName}`);
    if (caseData.caseNumber) parts.push(`CASE NUMBER: ${caseData.caseNumber}`);

    for (const doc of caseData.documents) {
      parts.push(`\n[${doc.docType.toUpperCase()}]:`);
      parts.push(JSON.stringify(doc.extractedData, null, 2).slice(0, 2000));
    }

    parts.push("\nAPPLICABLE SECTIONS:");
    for (const s of memo.applicableSections) {
      parts.push(`${s.act} Section ${s.sectionNumber} (${s.title}) — Punishment: ${s.punishment}, Bailable: ${s.bailable}`);
    }

    if (memo.precedents.length > 0) {
      parts.push("\nPRECEDENTS:");
      for (const p of memo.precedents) {
        parts.push(`${p.caseTitle} (${p.citation}): ${p.ratio}`);
      }
    }

    return parts.join("\n");
  }

  private anticipatoryBailPrompt(caseData: CaseWithDocuments, memo: LegalMemo): string {
    return `You are a senior Indian criminal defense lawyer drafting an ANTICIPATORY BAIL APPLICATION under Section 482 BNSS.

${this.buildCaseContext(caseData, memo)}

Generate JSON:
{
  "courtName": "Court of Sessions Judge, ${caseData.district || '[District]'}",
  "caseTitle": "${caseData.clientName || 'Applicant'} vs State of ${caseData.state || 'India'}",
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
  }

  private defaultBailPrompt(caseData: CaseWithDocuments, memo: LegalMemo): string {
    return `You are a senior Indian criminal defense lawyer drafting a DEFAULT BAIL APPLICATION under Section 187 BNSS (statutory bail).

${this.buildCaseContext(caseData, memo)}

Generate JSON:
{
  "courtName": "Court of Sessions Judge, ${caseData.district || '[District]'}",
  "caseTitle": "${caseData.clientName || 'Applicant'} vs State of ${caseData.state || 'India'}",
  "introduction": "Introduction citing Section 187 BNSS and the indefeasible right to default bail",
  "chronology": "Timeline showing: arrest date → 60/90 day period → chargesheet not filed within time",
  "statutoryProvision": "Analysis of Section 187 BNSS — why default bail is a statutory right",
  "briefFacts": "Clean narrative establishing the timeline",
  "groundsForBail": ["5-7 grounds establishing entitlement to default bail"],
  "legalArguments": "Legal arguments with section and precedent citations",
  "prayer": "Prayer for default bail as a matter of right",
  "date": "${new Date().toISOString().split("T")[0]}",
  "advocateName": ""
}`;
  }

  private quashingPrompt(caseData: CaseWithDocuments, memo: LegalMemo): string {
    return `You are a senior Indian criminal defense lawyer drafting a QUASHING PETITION under Section 528 BNSS to be filed in the HIGH COURT.

${this.buildCaseContext(caseData, memo)}

Generate JSON:
{
  "courtName": "IN THE HIGH COURT OF ${(caseData.state || 'INDIA').toUpperCase()}",
  "caseTitle": "${caseData.clientName || 'Petitioner'} vs State of ${caseData.state || 'India'}",
  "introduction": "Introduction identifying the FIR/order being challenged and the relief sought under Sec 528 BNSS",
  "impugnedOrder": "Description of the FIR/order/proceedings being challenged and why they are illegal/improper",
  "briefFacts": "Narrative establishing why the proceedings should be quashed",
  "groundsForQuashing": ["5-7 specific grounds for quashing — legal abuse, no offence made out, civil dispute, etc."],
  "legalArguments": "Legal arguments under Section 528 BNSS with precedent citations",
  "prayer": "Prayer to quash the FIR/proceedings/order",
  "date": "${new Date().toISOString().split("T")[0]}",
  "advocateName": ""
}`;
  }

  private dischargePrompt(caseData: CaseWithDocuments, memo: LegalMemo): string {
    return `You are a senior Indian criminal defense lawyer drafting a DISCHARGE APPLICATION under Section 250 BNSS.

${this.buildCaseContext(caseData, memo)}

Generate JSON:
{
  "courtName": "Court of Sessions Judge, ${caseData.district || '[District]'}",
  "caseTitle": "${caseData.clientName || 'Applicant'} vs State of ${caseData.state || 'India'}",
  "introduction": "Introduction seeking discharge under Section 250 BNSS",
  "briefFacts": "Narrative from case documents",
  "chargesheetAnalysis": "Detailed analysis of why the chargesheet does NOT make out the ingredients of the offence charged. Reference specific ingredients vs evidence.",
  "groundsForDischarge": ["5-7 grounds why charges should not be framed"],
  "legalArguments": "Legal arguments showing insufficient grounds to proceed",
  "prayer": "Prayer for discharge from all charges",
  "date": "${new Date().toISOString().split("T")[0]}",
  "advocateName": ""
}`;
  }

  private appealPrompt(caseData: CaseWithDocuments, memo: LegalMemo): string {
    return `You are a senior Indian criminal defense lawyer drafting a CRIMINAL APPEAL.

${this.buildCaseContext(caseData, memo)}

Generate JSON:
{
  "courtName": "IN THE HIGH COURT OF ${(caseData.state || 'INDIA').toUpperCase()}",
  "caseTitle": "${caseData.clientName || 'Appellant'} vs State of ${caseData.state || 'India'}",
  "introduction": "Introduction identifying the impugned judgment and conviction being challenged",
  "impugnedJudgment": "Details of the trial court judgment — date, court, judge, conviction, sentence",
  "briefFacts": "Narrative from the defense perspective",
  "groundsOfAppeal": ["7-10 grounds of appeal — errors of law, misappreciation of evidence, procedural irregularities"],
  "legalArguments": "Legal arguments showing why conviction is unsustainable",
  "prayer": "Prayer to set aside conviction and acquit, or in the alternative suspend sentence and grant bail",
  "date": "${new Date().toISOString().split("T")[0]}",
  "advocateName": ""
}`;
  }

  private sectionsToMarkdown(
    type: GenerationType,
    sections: Record<string, unknown>,
    caseData: CaseWithDocuments,
    memo: LegalMemo
  ): string {
    const s = sections as any;
    const title = this.getDocTitle(type);

    let md = `# ${s.courtName || ""}\n\n## ${title}\n\n`;
    md += `**${s.caseTitle || ""}**\n\n---\n\n`;

    if (s.introduction) md += `## 1. INTRODUCTION\n\n${s.introduction}\n\n`;
    if (s.apprehensionGrounds) md += `## APPREHENSION OF ARREST\n\n${s.apprehensionGrounds}\n\n`;
    if (s.impugnedOrder) md += `## IMPUGNED ORDER/FIR\n\n${s.impugnedOrder}\n\n`;
    if (s.impugnedJudgment) md += `## IMPUGNED JUDGMENT\n\n${s.impugnedJudgment}\n\n`;
    if (s.chronology) md += `## CHRONOLOGY\n\n${s.chronology}\n\n`;
    if (s.statutoryProvision) md += `## STATUTORY PROVISION\n\n${s.statutoryProvision}\n\n`;
    if (s.briefFacts) md += `## BRIEF FACTS\n\n${s.briefFacts}\n\n`;
    if (s.chargesheetAnalysis) md += `## CHARGESHEET ANALYSIS\n\n${s.chargesheetAnalysis}\n\n`;

    const groundsKey = s.groundsForBail || s.groundsForQuashing || s.groundsForDischarge || s.groundsOfAppeal;
    if (groundsKey) {
      const label = s.groundsForBail ? "GROUNDS FOR BAIL" : s.groundsForQuashing ? "GROUNDS FOR QUASHING" : s.groundsForDischarge ? "GROUNDS FOR DISCHARGE" : "GROUNDS OF APPEAL";
      md += `## ${label}\n\n`;
      (groundsKey as string[]).forEach((g: string, i: number) => {
        md += `${i + 1}. ${g}\n\n`;
      });
    }

    if (s.legalArguments) md += `## LEGAL ARGUMENTS\n\n${s.legalArguments}\n\n`;
    if (s.conditionsOffered) {
      md += `## CONDITIONS OFFERED\n\n`;
      (s.conditionsOffered as string[]).forEach((c: string, i: number) => {
        md += `${i + 1}. ${c}\n`;
      });
      md += "\n";
    }
    if (s.prayer) md += `## PRAYER\n\n${s.prayer}\n\n`;
    md += `---\n\n**Date:** ${s.date || ""}\n**Place:** ${caseData.district || ""}\n\n_${s.advocateName || "Advocate for the Applicant"}_\n`;

    return md;
  }

  private getDocTitle(type: GenerationType): string {
    const titles: Record<string, string> = {
      regular_bail: "BAIL APPLICATION",
      anticipatory_bail: "ANTICIPATORY BAIL APPLICATION",
      default_bail: "DEFAULT BAIL APPLICATION",
      quashing_petition: "QUASHING PETITION UNDER SECTION 528 BNSS",
      discharge_application: "DISCHARGE APPLICATION UNDER SECTION 250 BNSS",
      criminal_appeal: "CRIMINAL APPEAL",
    };
    return titles[type] || "LEGAL DOCUMENT";
  }
}

export const drafterFactory = new DrafterFactory();
