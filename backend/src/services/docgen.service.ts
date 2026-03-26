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
}

export const docgenService = new DocGenService();
