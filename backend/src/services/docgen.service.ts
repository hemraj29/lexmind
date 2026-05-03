import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  TabStopPosition,
  TabStopType,
  BorderStyle,
} from "docx";
import { createChildLogger } from "../utils/logger.js";
import type { ExtractedFIR } from "../types/fir.types.js";
import type { LegalMemo } from "../types/legal.types.js";
import type { CaseWithDocuments } from "../types/case.types.js";
import type { GenerationType } from "../types/generation.types.js";

const log = createChildLogger("docgen");

export interface BailDraftSections {
  courtName: string;
  caseTitle: string;
  introduction: string;
  briefFacts: string;
  groundsForBail: string[];
  legalArguments: string;
  prayer: string;
  date: string;
  advocateName?: string;
}

class DocGenService {
  async generate(
    draft: BailDraftSections,
    fir: ExtractedFIR,
    memo: LegalMemo
  ): Promise<Buffer> {
    log.info({ firNumber: fir.firNumber }, "Generating .docx");

    const sectionsText = memo.applicableSections
      .map((s) => `${s.act} Section ${s.sectionNumber}`)
      .join(", ");

    const doc = new Document({
      creator: "LexiMini - Buildio Legal",
      description: `Bail Application for FIR No. ${fir.firNumber}`,
      sections: [
        {
          properties: {
            page: {
              margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
            },
          },
          children: [
            // Court header
            this.centeredHeading(draft.courtName, HeadingLevel.HEADING_1),
            this.emptyLine(),

            // Case title
            this.centeredHeading("BAIL APPLICATION", HeadingLevel.HEADING_2),
            this.emptyLine(),

            // FIR details line
            this.paragraph(
              `Under Section 483 of BNSS | FIR No: ${fir.firNumber} | P.S: ${fir.policeStation} | District: ${fir.district}`,
              { bold: true, size: 22 }
            ),
            this.paragraph(`Sections: ${sectionsText}`, { bold: true, size: 22 }),
            this.emptyLine(),
            this.horizontalRule(),
            this.emptyLine(),

            // Case title
            this.centeredParagraph(draft.caseTitle, { bold: true, size: 24 }),
            this.emptyLine(),

            // 1. INTRODUCTION
            this.sectionHeading("1. INTRODUCTION"),
            ...this.splitIntoParagraphs(draft.introduction),
            this.emptyLine(),

            // 2. BRIEF FACTS
            this.sectionHeading("2. BRIEF FACTS OF THE CASE"),
            ...this.splitIntoParagraphs(draft.briefFacts),
            this.emptyLine(),

            // 3. GROUNDS FOR BAIL
            this.sectionHeading("3. GROUNDS FOR BAIL"),
            ...draft.groundsForBail.map(
              (ground, i) =>
                new Paragraph({
                  spacing: { after: 120 },
                  indent: { left: 360 },
                  children: [
                    new TextRun({ text: `${this.romanNumeral(i + 1)}. `, bold: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: ground, size: 22, font: "Times New Roman" }),
                  ],
                })
            ),
            this.emptyLine(),

            // 4. LEGAL ARGUMENTS
            this.sectionHeading("4. LEGAL ARGUMENTS"),
            ...this.splitIntoParagraphs(draft.legalArguments),
            this.emptyLine(),

            // 5. PRAYER
            this.sectionHeading("5. PRAYER"),
            ...this.splitIntoParagraphs(draft.prayer),
            this.emptyLine(),
            this.emptyLine(),

            // Signature block
            this.horizontalRule(),
            this.emptyLine(),
            this.paragraph(`Date: ${draft.date}`, { size: 22 }),
            this.paragraph(`Place: ${fir.district}`, { size: 22 }),
            this.emptyLine(),
            this.rightAligned(draft.advocateName || "Advocate for the Applicant/Accused", {
              bold: true,
              size: 22,
            }),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    log.info({ size: buffer.length }, ".docx generated");
    return buffer;
  }

  private centeredHeading(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel]): Paragraph {
    return new Paragraph({
      heading: level,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, size: 28, font: "Times New Roman" })],
    });
  }

  private centeredParagraph(text: string, opts: { bold?: boolean; size?: number } = {}): Paragraph {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text,
          bold: opts.bold ?? false,
          size: opts.size ?? 22,
          font: "Times New Roman",
        }),
      ],
    });
  }

  private sectionHeading(text: string): Paragraph {
    return new Paragraph({
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text, bold: true, size: 24, font: "Times New Roman", underline: {} })],
    });
  }

  private paragraph(text: string, opts: { bold?: boolean; size?: number } = {}): Paragraph {
    return new Paragraph({
      spacing: { after: 80 },
      alignment: AlignmentType.JUSTIFIED,
      children: [
        new TextRun({
          text,
          bold: opts.bold ?? false,
          size: opts.size ?? 22,
          font: "Times New Roman",
        }),
      ],
    });
  }

  private rightAligned(text: string, opts: { bold?: boolean; size?: number } = {}): Paragraph {
    return new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text,
          bold: opts.bold ?? false,
          size: opts.size ?? 22,
          font: "Times New Roman",
        }),
      ],
    });
  }

  private splitIntoParagraphs(text: string): Paragraph[] {
    return text.split("\n").filter(Boolean).map((line) => this.paragraph(line.trim()));
  }

  private emptyLine(): Paragraph {
    return new Paragraph({ spacing: { after: 120 }, children: [] });
  }

  private horizontalRule(): Paragraph {
    return new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" } },
      children: [],
    });
  }

  private romanNumeral(num: number): string {
    const numerals = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
    return numerals[num - 1] || String(num);
  }

  // ─── GENERIC DOCUMENT GENERATOR (for all doc types) ───

  async generateFromSections(
    type: GenerationType,
    sections: Record<string, unknown>,
    caseData: CaseWithDocuments,
    memo: LegalMemo
  ): Promise<Buffer> {
    const s = sections as any;
    const title = this.getGenTitle(type);
    const sectionsText = memo.applicableSections
      .map((sec) => `${sec.act} Section ${sec.sectionNumber}`)
      .join(", ");

    const children: Paragraph[] = [
      this.centeredHeading(s.courtName || "", HeadingLevel.HEADING_1),
      this.emptyLine(),
      this.centeredHeading(title, HeadingLevel.HEADING_2),
      this.emptyLine(),
      this.paragraph(`Sections: ${sectionsText}`, { bold: true, size: 22 }),
      this.emptyLine(),
      this.horizontalRule(),
      this.emptyLine(),
      this.centeredParagraph(s.caseTitle || "", { bold: true, size: 24 }),
      this.emptyLine(),
    ];

    // Add sections dynamically based on what exists
    const orderedFields = [
      { key: "introduction", label: "1. INTRODUCTION" },
      { key: "apprehensionGrounds", label: "APPREHENSION OF ARREST" },
      { key: "impugnedOrder", label: "IMPUGNED ORDER / FIR" },
      { key: "impugnedJudgment", label: "IMPUGNED JUDGMENT" },
      { key: "chronology", label: "CHRONOLOGY" },
      { key: "statutoryProvision", label: "STATUTORY PROVISION" },
      { key: "briefFacts", label: "BRIEF FACTS OF THE CASE" },
      { key: "chargesheetAnalysis", label: "CHARGESHEET ANALYSIS" },
    ];

    let sectionNum = 1;
    for (const { key, label } of orderedFields) {
      if (s[key]) {
        children.push(this.sectionHeading(`${sectionNum}. ${label}`));
        children.push(...this.splitIntoParagraphs(s[key]));
        children.push(this.emptyLine());
        sectionNum++;
      }
    }

    // Grounds (array field — varies by doc type)
    const groundsField = s.groundsForBail || s.groundsForQuashing || s.groundsForDischarge || s.groundsOfAppeal;
    if (groundsField && Array.isArray(groundsField)) {
      const groundsLabel = s.groundsForBail ? "GROUNDS FOR BAIL"
        : s.groundsForQuashing ? "GROUNDS FOR QUASHING"
        : s.groundsForDischarge ? "GROUNDS FOR DISCHARGE"
        : "GROUNDS OF APPEAL";

      children.push(this.sectionHeading(`${sectionNum}. ${groundsLabel}`));
      for (let i = 0; i < groundsField.length; i++) {
        children.push(
          new Paragraph({
            spacing: { after: 120 },
            indent: { left: 360 },
            children: [
              new TextRun({ text: `${this.romanNumeral(i + 1)}. `, bold: true, size: 22, font: "Times New Roman" }),
              new TextRun({ text: groundsField[i], size: 22, font: "Times New Roman" }),
            ],
          })
        );
      }
      children.push(this.emptyLine());
      sectionNum++;
    }

    // Conditions offered (anticipatory bail)
    if (s.conditionsOffered && Array.isArray(s.conditionsOffered)) {
      children.push(this.sectionHeading(`${sectionNum}. CONDITIONS OFFERED`));
      for (let i = 0; i < s.conditionsOffered.length; i++) {
        children.push(this.paragraph(`${i + 1}. ${s.conditionsOffered[i]}`));
      }
      children.push(this.emptyLine());
      sectionNum++;
    }

    if (s.legalArguments) {
      children.push(this.sectionHeading(`${sectionNum}. LEGAL ARGUMENTS`));
      children.push(...this.splitIntoParagraphs(s.legalArguments));
      children.push(this.emptyLine());
      sectionNum++;
    }

    if (s.prayer) {
      children.push(this.sectionHeading(`${sectionNum}. PRAYER`));
      children.push(...this.splitIntoParagraphs(s.prayer));
      children.push(this.emptyLine());
    }

    // Signature block
    children.push(this.horizontalRule());
    children.push(this.emptyLine());
    children.push(this.paragraph(`Date: ${s.date || new Date().toISOString().split("T")[0]}`, { size: 22 }));
    children.push(this.paragraph(`Place: ${caseData.district || ""}`, { size: 22 }));
    children.push(this.emptyLine());
    children.push(this.rightAligned(s.advocateName || "Advocate for the Applicant/Accused", { bold: true, size: 22 }));

    const doc = new Document({
      creator: "LexiMini - Buildio Legal",
      description: `${title} for case ${caseData.title}`,
      sections: [{
        properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
        children,
      }],
    });

    return Packer.toBuffer(doc);
  }

  private getGenTitle(type: GenerationType): string {
    const titles: Record<string, string> = {
      regular_bail: "BAIL APPLICATION",
      anticipatory_bail: "ANTICIPATORY BAIL APPLICATION UNDER SECTION 482 BNSS",
      default_bail: "DEFAULT BAIL APPLICATION UNDER SECTION 187 BNSS",
      quashing_petition: "QUASHING PETITION UNDER SECTION 528 BNSS",
      discharge_application: "DISCHARGE APPLICATION UNDER SECTION 250 BNSS",
      criminal_appeal: "CRIMINAL APPEAL",
    };
    return titles[type] || "LEGAL DOCUMENT";
  }
}

export const docgenService = new DocGenService();
