import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak,
  convertInchesToTwip, Footer, PageNumber,
} from "docx";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const COLOR = {
  primary: "0B3D91",
  accent: "1F6FEB",
  user: "1E40AF",
  bot: "0E7C3A",
  muted: "555555",
  bgUser: "DBEAFE",
  bgBot: "DCFCE7",
  bgCard: "FEF3C7",
  bgGen: "FCE7F3",
  border: "CBD5E1",
  code: "0F172A",
  bgCode: "F1F5F9",
};
const FONT = "Calibri";
const MONO = "Consolas";

function txt(t, o = {}) { return new TextRun({ text: t, font: FONT, size: 22, ...o }); }
function bold(t, o = {}) { return txt(t, { bold: true, ...o }); }
function code(t, o = {}) { return new TextRun({ text: t, font: MONO, size: 18, color: COLOR.code, ...o }); }
function p(c, o = {}) { return new Paragraph({ children: typeof c === "string" ? [txt(c)] : c, spacing: { after: 120 }, ...o }); }
function h(t, l = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: l,
    children: [new TextRun({ text: t, bold: true, color: COLOR.primary, font: FONT })],
    spacing: { before: 280, after: 140 },
  });
}
function pageBreak() { return new Paragraph({ children: [new PageBreak()] }); }

// Chat bubble — looks like a colored card with role + message
function bubble(role, message, opts = {}) {
  const isUser = role === "USER";
  const fill = isUser ? COLOR.bgUser
    : opts.type === "ANALYSIS_CARD" ? COLOR.bgCard
    : opts.type === "GENERATION_CARD" ? COLOR.bgGen
    : COLOR.bgBot;
  const labelColor = isUser ? COLOR.user : COLOR.bot;
  const labelText = isUser ? "👤 LAWYER" : opts.type === "ANALYSIS_CARD" ? "🤖 LEXIMINI · ANALYSIS CARD" : opts.type === "GENERATION_CARD" ? "🤖 LEXIMINI · GENERATION CARD" : "🤖 LEXIMINI";

  const rows = [];
  rows.push(new TableRow({
    children: [new TableCell({
      shading: { fill, type: ShadingType.CLEAR, color: "auto" },
      margins: { top: 120, bottom: 120, left: 200, right: 200 },
      children: [
        new Paragraph({
          children: [new TextRun({ text: labelText, bold: true, color: labelColor, font: FONT, size: 18 })],
          spacing: { after: 80 },
        }),
        ...(Array.isArray(message) ? message : [new Paragraph({ children: [txt(message)], spacing: { after: 60 } })]),
      ],
    })],
  }));
  return new Table({
    rows,
    width: { size: isUser ? 75 : 90, type: WidthType.PERCENTAGE },
    alignment: isUser ? AlignmentType.RIGHT : AlignmentType.LEFT,
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
      left:   { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
      right:  { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical:   { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
  });
}
function spacer() { return new Paragraph({ children: [txt("")], spacing: { after: 80 } }); }
function pre(text) {
  const lines = text.split("\n");
  return new Paragraph({
    children: lines.flatMap((l, i) => i < lines.length - 1 ? [code(l), new TextRun({ break: 1 })] : [code(l)]),
    shading: { type: ShadingType.CLEAR, color: "auto", fill: COLOR.bgCode },
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
      left: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
      right: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
    },
    spacing: { before: 80, after: 140 },
  });
}
function backendNote(title, lines) {
  const para = [
    new Paragraph({
      children: [new TextRun({ text: `⚙️ BACKEND · ${title}`, bold: true, color: COLOR.muted, font: FONT, size: 18 })],
      spacing: { after: 60 },
    }),
  ];
  lines.forEach(l => para.push(new Paragraph({
    children: [new TextRun({ text: "• " + l, font: FONT, size: 18, color: COLOR.muted, italics: true })],
    spacing: { after: 40 },
    indent: { left: 200 },
  })));
  return new Table({
    rows: [new TableRow({
      children: [new TableCell({
        shading: { fill: "F8FAFC", type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 80, bottom: 80, left: 160, right: 160 },
        children: para,
      })],
    })],
    width: { size: 95, type: WidthType.PERCENTAGE },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: COLOR.accent },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
      left:   { style: BorderStyle.SINGLE, size: 12, color: COLOR.accent },
      right:  { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical:   { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
  });
}
function timestamp(t) {
  return new Paragraph({
    children: [new TextRun({ text: t, font: FONT, size: 16, color: COLOR.muted, italics: true })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 40, after: 60 },
  });
}
function divider() {
  return new Paragraph({
    children: [new TextRun({ text: "───────────────────────────────────────", color: COLOR.border, font: MONO })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 80 },
  });
}

const children = [];

// ─── Cover ─────────────────────────────────────────────────
children.push(
  new Paragraph({
    children: [new TextRun({ text: "LexiMini", bold: true, size: 64, color: COLOR.primary, font: FONT })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 2400, after: 100 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Mock Conversation Walkthrough", size: 32, color: COLOR.accent, font: FONT })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "A realistic end-to-end session — FIR upload to bail-application download", italics: true, size: 22, color: COLOR.muted, font: FONT })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 1200 },
  }),
  new Paragraph({
    children: [new TextRun({ text: `Case Study: State of Maharashtra vs. Rajesh Kumar`, size: 22, color: COLOR.primary, font: FONT, bold: true })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
  }),
  new Paragraph({
    children: [new TextRun({ text: `FIR No. 0234/2025 · Andheri Police Station, Mumbai`, size: 20, color: COLOR.muted, font: FONT })],
    alignment: AlignmentType.CENTER,
  }),
  new Paragraph({
    children: [new TextRun({ text: `Sections: BNS 318 (Cheating), BNS 316 (Criminal Breach of Trust)`, size: 20, color: COLOR.muted, font: FONT })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 800 },
  }),
  pageBreak()
);

// ─── How to read this ────────────────────────────────────
children.push(h("How to read this document"));
children.push(p("This is a simulated conversation between Advocate Priya Sharma (defence counsel) and the LexiMini AI assistant. Each user message is shown as a blue bubble, each assistant response as a green bubble. Yellow cards are ANALYSIS_CARDs (extracted document data), pink cards are GENERATION_CARDs (generated drafts)."));
children.push(p("After every interaction, a small grey panel labelled '⚙️ BACKEND' shows what's actually happening server-side — which agent ran, which DB tables got touched, which OpenAI call fired. This is the same flow described in the LexiMini Architecture doc, but watched live."));
children.push(p([
  bold("Legend: "),
  txt(" 👤 = lawyer typing  ·  🤖 = LexiMini reply  ·  ⚙️ = under-the-hood activity  ·  ➜ = state transition"),
]));
children.push(spacer());
children.push(p([bold("Session timeline:")]));
const timeline = [
  "11:42 — Lawyer creates a new case",
  "11:43 — Uploads FIR PDF",
  "11:43 — Document analysed, sections extracted",
  "11:45 — Lawyer asks a follow-up question (free chat)",
  "11:47 — Runs @analyze for case strategy",
  "11:49 — Runs @missing to find gaps",
  "11:51 — Runs @sections to confirm legal posture",
  "11:53 — Generates Regular Bail Application (@bail)",
  "11:54 — Downloads .docx, asks for refinement",
  "11:56 — Reviews generated precedents (@precedents)",
];
timeline.forEach(t => children.push(p([txt("• " + t)])));
children.push(pageBreak());

// ─── ACT I — Setup ────────────────────────────────────────
children.push(h("Act I — Case Creation"));
children.push(timestamp("11:42 IST · April 2025"));
children.push(divider());

children.push(bubble("ASSISTANT", [
  p("Welcome! I'm your AI legal assistant for this case. Upload an FIR or describe your case to get started."),
  p("You can use these commands anytime:"),
  p([txt("• "), bold("@analyze"), txt(" — Strategic case analysis")]),
  p([txt("• "), bold("@summary"), txt(" — One-paragraph case summary")]),
  p([txt("• "), bold("@missing"), txt(" — Identify missing information")]),
  p([txt("• "), bold("@sections"), txt(" — List applicable statute sections")]),
  p([txt("• "), bold("@precedents"), txt(" — Find relevant case law")]),
  p([txt("• "), bold("@bail"), txt(" — Draft Regular Bail Application")]),
  p([txt("• "), bold("@anticipatory"), txt(" — Pre-arrest bail under BNSS 482")]),
  p([txt("• "), bold("@quashing"), txt(" — Quashing petition under BNSS 528")]),
]));
children.push(spacer());
children.push(backendNote("Case created", [
  "POST /api/cases  →  chat.service.createCase()",
  "Inserted Case row { id: 'cm9k2x...', title: 'Untitled notebook', sectionsRaw: [] }",
  "Inserted welcome ChatMessage { role: ASSISTANT, type: TEXT } enumerating CHAT_COMMANDS",
  "Frontend navigates: router.push('/case/cm9k2x...')",
  "Pinia: chat.store.activeCaseId ← 'cm9k2x...'  ·  studio.store.fetchActions('criminal')",
]));
children.push(divider());

// ─── ACT II — Upload ──────────────────────────────────────
children.push(h("Act II — FIR Upload & Document Analysis"));
children.push(timestamp("11:43 IST"));
children.push(divider());

children.push(bubble("USER", [
  p("Hi — defending Rajesh Kumar in a cheating case. Uploading the FIR now."),
  p([txt("📎 ", { bold: true }), code("FIR-0234-2025-Andheri.pdf"), txt(" (2.4 MB, scanned PDF)")]),
]));
children.push(spacer());

children.push(backendNote("File upload received", [
  "POST /api/cases/cm9k2x.../messages  (multipart: content + file)",
  "multer stores file in memory  →  req.file.buffer (2,453,120 bytes)",
  "chat.service.handleMessage() saves USER ChatMessage { type: FILE_UPLOAD }",
  "Routes to handleFileUpload()  →  storageService.saveUpload()  →  uploads/cm9k2x_FIR-0234.pdf",
  "documentAnalyzerAgent.extract(buffer, 'application/pdf') begins",
]));
children.push(spacer());

children.push(backendNote("Step 1 — Document classification", [
  "extractTextFromPDF(buffer) → text.length = 87 chars  (scanned PDF, almost no extractable text)",
  "Falls back to vision-based extraction",
  "openaiService.visionJSON([{base64, mimeType}], CLASSIFY_PROMPT, temp:0.1)",
  "GPT-4o response: { docType: 'fir' }",
  "Selects FIR-specific extraction prompt from EXTRACTION_PROMPTS['fir']",
]));
children.push(spacer());

children.push(backendNote("Step 2 — Field extraction (GPT-4o Vision)", [
  "openaiService.visionJSON([file], EXTRACTION_PROMPT, temp:0.1, maxTokens:4096)",
  "Latency: 8.2 seconds  ·  Tokens: 1,847 in / 1,234 out  ·  Cost: $0.018",
  "Returns ExtractedFIR { firNumber, date, accused[], victim, sectionsRaw[], briefFacts, confidence: 0.91 }",
  "Validation: confidence ≥ 0.3 ✓  ·  briefFacts present ✓  ·  sectionsRaw not empty ✓",
]));
children.push(spacer());

// The analysis card
children.push(bubble("ASSISTANT", [
  p([bold("Document Type: ", { color: COLOR.primary }), txt("FIR (First Information Report)")]),
  p([bold("Confidence: ", { color: COLOR.primary }), txt("91% · High quality extraction")]),
  p([bold("Extracted fields:")]),
  pre(
`FIR No.       : 0234/2025
Date          : 2025-03-18
Police Station: Andheri (West), Mumbai
District      : Mumbai
State         : Maharashtra

Accused (1)   :
  Name          : Rajesh Kumar Yadav
  Father        : Late Hari Kumar Yadav
  Address       : Flat 304, Sai Sadan, Andheri (E)
  Age           : 38

Victim        :
  Name          : Mahesh Patil
  Father        : Suresh Patil
  Address       : Bldg 7, Powai, Mumbai

Investigating Officer: SI Anil Deshmukh (Buckle No. 4521)

Sections invoked:
  • IPC 420 (Cheating) — old code
  • IPC 406 (Criminal Breach of Trust) — old code
  • IPC 468 (Forgery for cheating)

Brief Facts:
  Complainant Mahesh Patil alleges that accused Rajesh Kumar
  induced him on 12-Jan-2025 to invest ₹18,00,000 in a
  proposed real-estate venture ("Mumbai Heights LLP"),
  promising 22% annual returns within 18 months and showing
  forged registration documents purportedly issued by the
  Maharashtra Sub-Registrar. On 4-Mar-2025 the complainant
  discovered the LLP was never registered. The accused
  stopped responding after 8-Mar-2025.`
  ),
], { type: "ANALYSIS_CARD" }));
children.push(spacer());

children.push(backendNote("Step 3 — Persistence & section accumulation", [
  "INSERT CaseDocument { id: 'doc_8x3...', caseId, docType: FIR, filePath, extractedData: <jsonb>, confidence: 0.91 }",
  "updateCaseSections() — extracts ['IPC 420', 'IPC 406', 'IPC 468']",
  "UPDATE Case SET sectionsRaw = ['IPC 420', 'IPC 406', 'IPC 468']",
  "INSERT ChatMessage { role: ASSISTANT, type: ANALYSIS_CARD, content: <json>, documentId: 'doc_8x3...' }",
]));
children.push(spacer());

children.push(backendNote("Step 4 — Brief commentary (second LLM call)", [
  "openaiService.chat([{role:user, content: '...just analyzed FIR, give 2-3 sentence observation...'}], temp:0.3, maxTokens:300)",
  "INSERT ChatMessage { role: ASSISTANT, type: TEXT, content: <commentary> }",
]));
children.push(spacer());

children.push(bubble("ASSISTANT", [
  p("This is an economic offence FIR — alleged investment fraud worth ₹18 lakh with forged registration documents. The IPC sections will need mapping to the new BNS code; I see Sections 420, 406, and 468 IPC — these correspond to BNS 318 (Cheating), BNS 316 (Criminal Breach of Trust), and BNS 336 (Forgery)."),
  p("Key observations: (1) it's a non-cognizable economic dispute that can sometimes be argued as a civil-liability matter; (2) the alleged amount is significant but not in the 'serious fraud' category that triggers PMLA scrutiny; (3) bail prospects look reasonable on first read — no allegation of violence, no flight risk indicated. Want me to run @analyze for a strategic deep-dive?"),
]));
children.push(spacer());

children.push(divider());

// ─── ACT III — Free chat question ─────────────────────────
children.push(h("Act III — Follow-up Question (Free Chat)"));
children.push(timestamp("11:45 IST"));
children.push(divider());

children.push(bubble("USER", "Wait — these are old IPC sections. Will the bail application use IPC numbers or the new BNS numbers? The court started rejecting IPC-only filings last month."));
children.push(spacer());

children.push(backendNote("Free-text chat routed", [
  "parseCommand('Wait — these are old IPC...') → null  (no @prefix)",
  "Routes to handleChat()  →  buildCaseContext(caseId)",
  "Loads Case + last 30 TEXT messages + applicableSections (DB lookup) + precedents (vector search)",
  "strategyAdvisorAgent.chat(message, context) — single GPT call with full case context",
  "Latency: 2.1s · Tokens: 2,341 in / 412 out",
  "INSERT ChatMessage { role: ASSISTANT, type: TEXT, metadata: { citedSections: ['BNS-318','BNS-316','BNS-336'] } }",
]));
children.push(spacer());

children.push(bubble("ASSISTANT", [
  p("Good catch. The application I draft will use BNS numbers as the primary citations, with IPC equivalents shown in brackets for context — this is the format Mumbai Sessions Court and Bombay HC have been accepting since the BNS came into force on 1-July-2024."),
  p("Specifically:"),
  pre(
`IPC 420  (Cheating)                  →  BNS 318
IPC 406  (Criminal Breach of Trust)  →  BNS 316
IPC 468  (Forgery for cheating)      →  BNS 336`
  ),
  p("These mappings come from my IPC→BNS lookup table (verified against the official Ministry of Home Affairs concordance). The bail draft will format them as: 'Section 318 BNS (corresponding to Section 420 IPC, 1860)'."),
  p("All three are bailable, non-cognizable offences in their basic form — that's the strongest argument going into court."),
]));
children.push(spacer());

children.push(divider());

// ─── ACT IV — @analyze ────────────────────────────────────
children.push(h("Act IV — @analyze (Strategic Case Analysis)"));
children.push(timestamp("11:47 IST"));
children.push(divider());

children.push(bubble("USER", "@analyze"));
children.push(spacer());

children.push(backendNote("Command routing", [
  "parseCommand('@analyze') → { type: 'analyze' }",
  "INSERT ChatMessage { role: USER, type: COMMAND }",
  "handleCommand('analyze')  →  buildCaseContext()",
  "strategyAdvisorAgent.analyzeCase(context)",
  "Builds prompt with: case title, accused, victim, FIR facts, applicable sections, precedents, prior orders (none yet)",
  "Returns structured JSON: { strengths[], weaknesses[], opportunities[], threats[], recommended_strategy }",
]));
children.push(spacer());

children.push(bubble("ASSISTANT", [
  p([bold("STRATEGIC CASE ANALYSIS — State vs. Rajesh Kumar Yadav", { color: COLOR.primary })]),
  p([bold("Strengths (defence):", { color: COLOR.bot })]),
  p("1. All invoked sections (BNS 318, 316, 336) are bailable and non-cognizable in their basic form."),
  p("2. No allegation of physical harm, no anti-social element, no organised crime angle."),
  p("3. Accused has clean antecedents — no prior FIRs traced (verifiable via CCTNS check before filing)."),
  p("4. Amount (₹18 lakh) is below the ₹50 lakh threshold that typically attracts EOW/PMLA-style scrutiny."),
  p("5. The transaction trail (bank transfers, written communications) is mostly civil-contractual in nature."),
  p([bold("Weaknesses to anticipate:", { color: COLOR.warn })]),
  p("1. The forged Sub-Registrar document elevates this beyond pure cheating — BNS 336 (forgery) carries up to 7 years."),
  p("2. Investigation is at an early stage — IO may seek custody for document seizure."),
  p("3. Complainant is a private individual (sympathy factor); court may impose strict surety conditions."),
  p([bold("Threats:", { color: COLOR.warn })]),
  p("1. If multiple complainants surface (often happens in real-estate fraud), sections may be invoked under MPID Act 1999, which makes offences non-bailable."),
  p("2. ED could initiate parallel proceedings if amount aggregates beyond ₹50 lakh across complainants."),
  p([bold("Recommended strategy:", { color: COLOR.primary })]),
  p("File for Regular Bail under BNSS Section 480 immediately, before custody is ordered. Lead arguments: (a) bailability of basic offences; (b) clean antecedents; (c) willingness to deposit ₹2-3 lakh as security; (d) cooperation with investigation; (e) deep local roots in Mumbai."),
  p("Keep an anticipatory bail application drafted and ready (BNSS 482) in case arrest seems imminent."),
]));
children.push(spacer());

children.push(divider());

// ─── ACT V — @missing ─────────────────────────────────────
children.push(h("Act V — @missing (Find Gaps Before Filing)"));
children.push(timestamp("11:49 IST"));
children.push(divider());

children.push(bubble("USER", "@missing"));
children.push(spacer());

children.push(bubble("ASSISTANT", [
  p([bold("Missing Information — collect before filing bail app:", { color: COLOR.primary })]),
  p("1. Antecedents check — file CCTNS RTI / written application to confirm no prior FIRs (essential for a clean-record argument)."),
  p("2. Bank statements — accused's account showing legitimate income source for the past 24 months."),
  p("3. Address proof — Aadhaar + electricity bill establishing 5+ years of Mumbai residency (rebuts flight-risk)."),
  p("4. Employment / business records — ITRs for 2022-23 and 2023-24, GST registration if any."),
  p("5. Surety candidates — two solvent sureties with property documents (need PAN + Aadhaar + 7/12 extract)."),
  p("6. Family responsibilities — proof of dependents (school fees, parents' medical records) for sympathy ground."),
  p("7. Counter-narrative documents — any written agreement, MoU, or email exchange with complainant showing the transaction was a business venture, not a fraudulent inducement."),
  p("8. Investigation status — has the IO recorded the accused's statement under BNSS 35? If not, offer voluntary appearance."),
  p("Without items 1, 5, and 7, the bail application is filable but weaker. Items 2-4 strengthen surety argument. Item 8 changes the cooperation narrative."),
]));
children.push(spacer());

children.push(backendNote("strategyAdvisorAgent.identifyMissingInfo(context)", [
  "Single GPT call with case context + prompt: 'Given the case docs and applicable sections, list information gaps that would weaken a bail application.'",
  "Returns string[] (8 items above)",
  "Stored as plain TEXT message (no card structure for list-style outputs)",
]));
children.push(divider());

// ─── ACT VI — @sections ───────────────────────────────────
children.push(h("Act VI — @sections (Confirm Legal Posture)"));
children.push(timestamp("11:51 IST"));
children.push(divider());

children.push(bubble("USER", "@sections"));
children.push(spacer());

children.push(backendNote("@sections — pure DB lookup, no LLM", [
  "buildCaseContext().applicableSections is built from Case.sectionsRaw via IPC→BNS resolution",
  "For each ref in ['IPC 420','IPC 406','IPC 468']:",
  "  → findIPCMapping('420') → IPCMapping { bnsSectionId } → SELECT StatuteSection WHERE id=...",
  "Renders directly as TEXT message — no GPT call needed. Latency: 180ms total.",
]));
children.push(spacer());

children.push(bubble("ASSISTANT", [
  p([bold("Applicable Sections:", { color: COLOR.primary })]),
  pre(
`BNS Section 318 — Cheating
─────────────────────────────
Bailable        : YES
Compoundable    : YES (with permission of court)
Cognizable      : NON-COGNIZABLE
Punishment      : Up to 7 years + fine
Min punishment  : Imprisonment may extend to 1 year
Ingredients     : (1) Deception of any person
                  (2) Fraudulent or dishonest inducement
                  (3) To deliver property OR consent to retention
                  (4) Damage / harm to person deceived

BNS Section 316 — Criminal Breach of Trust
─────────────────────────────
Bailable        : YES
Compoundable    : YES
Cognizable      : NON-COGNIZABLE
Punishment      : Up to 5 years + fine
Ingredients     : (1) Entrustment with property or dominion
                  (2) Dishonest misappropriation OR conversion
                  (3) Use in violation of contract / direction

BNS Section 336 — Forgery
─────────────────────────────
Bailable        : YES (basic offence)
Compoundable    : NO
Cognizable      : NON-COGNIZABLE
Punishment      : Up to 7 years + fine
Ingredients     : (1) Making of false document or electronic record
                  (2) Intent to cause damage / injury / fraud / support
                      claim or title
                  (3) Knowledge of falsity`
  ),
  p([bold("Bailability assessment: ", { color: COLOR.bot }), txt("ALL THREE SECTIONS BAILABLE in their basic form. Strong starting position.")]),
]));
children.push(spacer());

children.push(divider());

// ─── ACT VII — @bail (the main event) ─────────────────────
children.push(h("Act VII — @bail (Generate Regular Bail Application)"));
children.push(timestamp("11:53 IST"));
children.push(divider());

children.push(bubble("USER", "@bail — Sessions Court, Mumbai. Client is willing to deposit ₹3 lakh as security."));
children.push(spacer());

children.push(backendNote("Phase 1 — Command parsing & research", [
  "parseCommand('@bail ...') → { type: 'regular_bail', extras: 'Sessions Court, Mumbai...' }",
  "handleCommand('regular_bail')  →  loadCaseWithDocuments(caseId)",
  "researchCase(caseData) builds synthetic firLike from accumulated sectionsRaw + briefFacts",
  "researcherAgent.research(firLike) begins — 5 sub-steps:",
]));
children.push(spacer());

children.push(backendNote("researcherAgent — sub-step (1) IPC→BNS mapping", [
  "Regex IPC_PATTERN over sectionsRaw → ['420','406','468']",
  "For each: SELECT FROM IPCMapping WHERE ipcSection = $1",
  "Returns 3 mappings: 420→BNS 318, 406→BNS 316, 468→BNS 336",
]));
children.push(backendNote("researcherAgent — sub-step (2) Hybrid search on briefFacts", [
  "hybridSearchService.search({ query: briefFacts, topK: 5, includeRerank: true })",
  "  Parallel: pgVectorSearch (cosine over StatuteSection.embedding) + bm25Search + findExactSectionRefs",
  "  Reciprocal Rank Fusion (k=60, exact gets 2× boost) → 12 candidates",
  "  GPT-4o reranker scores each 0-10 → top 5 selected",
  "Returned sections: BNS 318, BNS 316, BNS 336, BNS 319 (cheating by personation), BNS 320 (cheating against govt)",
]));
children.push(backendNote("researcherAgent — sub-step (3) Per-section explicit search", [
  "For each ref in sectionsRaw, hybridSearchService.search({ query: ref, topK: 1 })",
  "Adds explicit matches to candidate pool",
]));
children.push(backendNote("researcherAgent — sub-step (4) Deduplicate + (5) precedent vector search", [
  "deduplicateSections(): Map by section.id → 5 unique sections",
  "Build precedent query: 'Bail precedent for: BNS 318 (Cheating)... Facts: Complainant alleges accused induced...'",
  "openaiService.embed(query) → 1536-dim vector  ·  vectorSearchPrecedents(embedding, 5, bailRelevant=true)",
  "Returned 4 precedents:",
  "  • Sanjay Chandra v. CBI (2012) 1 SCC 40 — bail in economic offences",
  "  • P. Chidambaram v. Directorate of Enforcement (2019) 9 SCC 24 — bail not punishment",
  "  • Arnesh Kumar v. State of Bihar (2014) 8 SCC 273 — discretion in bailable arrest",
  "  • State of Kerala v. Raneef (2011) 1 SCC 784 — clean antecedents weight",
]));
children.push(spacer());

children.push(backendNote("researcherAgent — synthesizeMemo (grounded GPT call)", [
  "Prompt explicitly enumerates the 5 sections + 4 precedents — 'ONLY reference these'",
  "openaiService.chatJSON(prompt, temp:0.1, maxTokens:4096) — 4.7s",
  "LLM returns: { ingredients[], riskAssessment }",
  "validateMemo() filters memo.applicableSections through knownSections set (no hallucinations passed)",
  "determineBailability(sections) → all bailable ⇒ 'bailable'",
  "Final LegalMemo built: applicableSections=DB rows, precedents=DB rows, bailability='bailable' (deterministic)",
]));
children.push(spacer());

children.push(backendNote("Phase 2 — Drafter dispatch", [
  "drafterFactory.draft('regular_bail', caseData, memo)",
  "drafterRegistry.getByDocumentTypeCode('criminal','regular_bail')",
  "  → regularBailDrafter (loaded at boot from src/domains/criminal/drafters/regular-bail.drafter.ts)",
  "regularBailDrafter.draft({ caseData, memo }) — falls through to legacy drafterAgent",
  "drafterAgent constructs bail prompt:",
  "  • Court: Sessions Court Mumbai (extracted from user's @bail extras)",
  "  • Applicant: Rajesh Kumar Yadav · Address · Age · Father",
  "  • FIR brief facts (verbatim from ExtractedFIR.briefFacts)",
  "  • Applicable Sections: 5 sections with full text",
  "  • Precedents: 4 cases with citations + ratio",
  "  • Anti-hallucination rules: 'every section MUST exist in LegalMemo, every case MUST exist in LegalMemo'",
  "openaiService.chatJSON(prompt, temp:0.2, maxTokens:6000) — 11.4s",
  "Returns BailDraftSections: introduction, briefFacts, groundsForBail[], legalArguments, prayer",
]));
children.push(spacer());

children.push(backendNote("Phase 3 — .docx generation", [
  "docgenService.generateBailApplication(BailDraftSections)",
  "Creates docx Document: Times New Roman, 12pt, 1.5 spacing, legal margins (1.25\" L/R, 1\" T/B)",
  "Court heading centered  ·  Case caption table  ·  Sections numbered (Roman I, II, III…)",
  "Grounds enumerated 1, 2, 3…  ·  Prayer paragraph  ·  Date + signature block",
  "Returns Buffer (24,891 bytes)",
]));
children.push(spacer());

children.push(backendNote("Phase 4 — Persistence", [
  "storageService.saveOutput(docxBuffer, 'cm9k2x_regular_bail') → output/cm9k2x_regular_bail-1745837421.docx",
  "INSERT PipelineRun { status: COMPLETED, generationType: REGULAR_BAIL, draftMarkdown, docxPath, legalMemo: <full jsonb> }",
  "INSERT GeneratedDocument { pipelineRunId, caseId, docType: REGULAR_BAIL, filePath, fileSize: 24891 }",
  "INSERT ChatMessage { role: ASSISTANT, type: GENERATION_CARD, content: <json>, pipelineRunId }",
  "Total elapsed: 23.6 seconds (research 7.2s + draft 11.4s + docgen 0.4s + DB 0.6s + overhead 4s)",
]));
children.push(spacer());

children.push(bubble("ASSISTANT", [
  p([bold("✓ Regular Bail Application Generated", { color: COLOR.bot })]),
  p([bold("Document: "), txt("regular_bail-cm9k2x.docx · 24.9 KB")]),
  p([bold("Run ID: "), code("run_4f2a91...")]),
  p([bold("Total time: "), txt("23.6 seconds")]),
  p([bold("Sections cited (5): "), txt("BNS 318, BNS 316, BNS 336, BNS 319, BNS 320")]),
  p([bold("Precedents cited (4): "), txt("Sanjay Chandra · P. Chidambaram · Arnesh Kumar · Raneef")]),
  p([bold("Grounds for bail: "), txt("7")]),
  p(""),
  p([bold("📄 Preview (first 500 chars):", { color: COLOR.primary })]),
  pre(
`# IN THE COURT OF SESSIONS JUDGE AT MUMBAI

**BAIL APPLICATION NO. ___ OF 2025**

In the matter of:
RAJESH KUMAR YADAV          ... APPLICANT / ACCUSED
Versus
THE STATE OF MAHARASHTRA    ... RESPONDENT

**APPLICATION UNDER SECTION 480 OF THE BHARATIYA NAGARIK
SURAKSHA SANHITA, 2023, FOR REGULAR BAIL**

MOST RESPECTFULLY SHOWETH:

1. INTRODUCTION
The above-named applicant, a permanent resident of Mumbai
aged 38 years, is the sole accused in FIR No. 0234/2025
registered at Andheri (West) Police Station for offences
punishable under Sections 318, 316, and 336 of the
Bharatiya Nyaya Sanhita, 2023 (corresponding to Sections
420, 406, and 468 IPC, 1860)...`
  ),
  p([txt("⬇️ "), bold("Download full document", { color: COLOR.accent })]),
], { type: "GENERATION_CARD" }));
children.push(spacer());
children.push(divider());

// ─── ACT VIII — Refinement ───────────────────────────────
children.push(h("Act VIII — Download & Refinement Request"));
children.push(timestamp("11:54 IST"));
children.push(divider());

children.push(bubble("USER", "Downloaded — looks great. Two changes: (1) the prayer is too generic, add specific surety conditions client can offer; (2) ground 4 mentions 'investigation is complete' but we don't know that yet. Can you regenerate with these fixed?"));
children.push(spacer());

children.push(backendNote("Refinement = new generation run", [
  "Currently: each @bail invocation creates a fresh PipelineRun (no in-place edit)",
  "User feedback gets attached to the next chat message which becomes additional context",
  "handleCommand('regular_bail') re-runs with caseData.notes augmented",
  "researcher cache hit (same sections, same precedents) — skips embedding calls",
  "Latency on rerun: 14.2s (saved 9s by not re-doing research)",
  "Old PipelineRun stays — full audit trail; new one created",
]));
children.push(spacer());

children.push(bubble("ASSISTANT", [
  p([bold("Regenerated with corrections:", { color: COLOR.bot })]),
  p("• Prayer now specifies: ₹3 lakh personal bond, two solvent sureties of ₹3 lakh each, surrender of passport, weekly attendance at PS, no contact with complainant or witnesses, prior court permission to leave Mumbai."),
  p("• Ground 4 reworded: removed 'investigation is complete'; replaced with 'all material documentary evidence (allegedly forged Sub-Registrar document, bank trail) is already in the custody of the investigating agency, hence custodial interrogation serves no purpose'."),
  p([bold("New document: "), txt("regular_bail-cm9k2x-v2.docx · 25.4 KB")]),
  p([txt("⬇️ Download v2")]),
], { type: "GENERATION_CARD" }));
children.push(spacer());
children.push(divider());

// ─── ACT IX — @precedents ────────────────────────────────
children.push(h("Act IX — @precedents (Review Cited Cases)"));
children.push(timestamp("11:56 IST"));
children.push(divider());

children.push(bubble("USER", "@precedents"));
children.push(spacer());

children.push(backendNote("@precedents — built from Case.sectionsRaw + cached vector search", [
  "buildCaseContext().precedents — already populated from earlier @bail run (5 min cache)",
  "Cache hit: returns same 4 precedents without re-embedding",
  "Renders as plain TEXT message",
]));
children.push(spacer());

children.push(bubble("ASSISTANT", [
  p([bold("Relevant Precedents:", { color: COLOR.primary })]),
  p([bold("Sanjay Chandra v. CBI", { color: COLOR.accent }), txt(" — (2012) 1 SCC 40 · Supreme Court")]),
  p("Ratio: In economic offences punishable up to 7 years, bail is the rule and jail is the exception. Pre-trial incarceration as a means of punishment is impermissible. Court must consider nature of allegation, severity of punishment, and likelihood of trial completion within reasonable time."),
  p([bold("P. Chidambaram v. Directorate of Enforcement", { color: COLOR.accent }), txt(" — (2019) 9 SCC 24 · Supreme Court")]),
  p("Ratio: Bail cannot be denied as a method of punishment before conviction. Even in serious economic offences, prolonged incarceration without trial defeats the purpose of bail jurisprudence. Triple test (flight risk, evidence tampering, witness influence) must be applied judiciously."),
  p([bold("Arnesh Kumar v. State of Bihar", { color: COLOR.accent }), txt(" — (2014) 8 SCC 273 · Supreme Court")]),
  p("Ratio: For offences punishable up to 7 years, arrest is not automatic. Police must record reasons under BNSS 35 (formerly CrPC 41A) before arrest. Magistrate must scrutinize these reasons before authorising remand."),
  p([bold("State of Kerala v. Raneef", { color: COLOR.accent }), txt(" — (2011) 1 SCC 784 · Supreme Court")]),
  p("Ratio: Clean antecedents and deep local roots are positive factors weighing in favour of bail. The presumption of innocence operates with full vigour at the bail stage."),
  p([bold("All four citations are linked and traceable. Click any to see the full passage and SCC reference.", { color: COLOR.muted, italics: true })]),
]));
children.push(spacer());
children.push(divider());

// ─── Epilogue ────────────────────────────────────────────
children.push(h("Epilogue — What Happened in 14 Minutes"));
children.push(timestamp("11:42 → 11:56 IST"));
children.push(p([bold("Database state at end of session:")]));
children.push(pre(
`Case             : 1 row updated (sectionsRaw populated, summary auto-set)
ChatMessage      : 18 rows (USER: 7, ASSISTANT: 11)
                    └─ 1 FILE_UPLOAD, 6 COMMAND, 5 TEXT, 2 ANALYSIS_CARD,
                       2 GENERATION_CARD, 2 system commentary
CaseDocument     : 1 row (FIR with extractedData JSONB)
PipelineRun      : 2 rows (regular_bail v1 and v2, both COMPLETED)
GeneratedDocument: 2 rows (.docx outputs in ./output/)
Citation         : ~40 rows (sections + precedents linked to messages)`
));

children.push(p([bold("OpenAI calls made:")]));
children.push(pre(
`Document classify (vision)        : 1 call · 0.6s · $0.002
FIR extraction (vision)           : 1 call · 8.2s · $0.018
Document commentary               : 1 call · 1.8s · $0.001
Free-chat reply                   : 1 call · 2.1s · $0.003
@analyze synthesis                : 1 call · 3.4s · $0.006
@missing synthesis                : 1 call · 2.7s · $0.004
@bail v1 — embeddings + search    : 4 embed calls + 1 rerank · 2.1s · $0.003
@bail v1 — research synthesis     : 1 call · 4.7s · $0.012
@bail v1 — drafter                : 1 call · 11.4s · $0.038
@bail v2 — drafter (rerun only)   : 1 call · 14.2s · $0.041
─────────────────────────────────────────────────────────────────
Total                             : 14 LLM calls · 51.3s · $0.128`
));

children.push(p([bold("Files on disk:")]));
children.push(pre(
`uploads/cm9k2x_FIR-0234.pdf                              (2,453,120 B)
output/cm9k2x_regular_bail-1745837421.docx               (   24,891 B)
output/cm9k2x_regular_bail-1745837634.docx               (   25,447 B)`
));

children.push(p("Lawyer started with a scanned FIR PDF and a blank case. In 14 minutes she had: an extracted structured FIR, a confirmed legal posture (3 IPC→BNS mappings, 5 applicable sections, all bailable), a strategic SWOT analysis, a checklist of missing evidence to collect, two iterations of a court-ready bail application referencing 4 binding Supreme Court precedents — all auditable, all citable, all traceable back to source documents and statute rows in the database."));

children.push(p([bold("That's the LexiMini flow end-to-end.", { color: COLOR.primary })]));

// ─── Build & save ────────────────────────────────────────
const doc = new Document({
  creator: "LexiMini Mock Conversation Generator",
  title: "LexiMini — Mock Conversation Walkthrough",
  description: "End-to-end realistic chat session demonstrating the full system flow",
  styles: { default: { document: { run: { font: FONT, size: 22 } } } },
  sections: [{
    properties: {
      page: {
        margin: {
          top: convertInchesToTwip(0.8),
          bottom: convertInchesToTwip(0.8),
          left: convertInchesToTwip(0.9),
          right: convertInchesToTwip(0.9),
        },
      },
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "LexiMini · Mock Conversation · ", font: FONT, size: 18, color: COLOR.muted }),
            new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: COLOR.muted }),
          ],
        })],
      }),
    },
    children,
  }],
});

const buffer = await Packer.toBuffer(doc);
const outPath = resolve("c:/Users/HP/Desktop/Personal/lexmind/lexmind/leximini/LexiMini-MockConversation.docx");
writeFileSync(outPath, buffer);
console.log("WROTE:", outPath, "size=", buffer.length);
