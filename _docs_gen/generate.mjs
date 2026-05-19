import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak,
  TableOfContents, LevelFormat, convertInchesToTwip, Footer, PageNumber,
} from "docx";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── Style helpers ───────────────────────────────────────────────────

const COLOR = {
  primary: "0B3D91",
  accent: "1F6FEB",
  muted: "555555",
  ok: "0E7C3A",
  warn: "B45309",
  bg: "F1F5F9",
  border: "CBD5E1",
  code: "0F172A",
};

const FONT = "Calibri";
const MONO = "Consolas";

function txt(text, opts = {}) {
  return new TextRun({ text, font: FONT, size: 22, ...opts });
}
function bold(text, opts = {}) { return txt(text, { bold: true, ...opts }); }
function code(text, opts = {}) { return new TextRun({ text, font: MONO, size: 18, color: COLOR.code, ...opts }); }

function p(children, opts = {}) {
  if (typeof children === "string") children = [txt(children)];
  return new Paragraph({ children, spacing: { after: 120 }, ...opts });
}
function h(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    children: [new TextRun({ text, bold: true, color: COLOR.primary, font: FONT })],
    spacing: { before: 280, after: 140 },
  });
}
function bullet(text, level = 0) {
  return new Paragraph({
    children: typeof text === "string" ? [txt(text)] : text,
    bullet: { level },
    spacing: { after: 60 },
  });
}
function num(text, level = 0) {
  return new Paragraph({
    children: typeof text === "string" ? [txt(text)] : text,
    numbering: { reference: "ord", level },
    spacing: { after: 60 },
  });
}
function quote(text) {
  return new Paragraph({
    children: [txt(text, { italics: true, color: COLOR.muted })],
    indent: { left: convertInchesToTwip(0.3) },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: COLOR.accent, space: 8 } },
    spacing: { before: 100, after: 140 },
  });
}
function pre(text) {
  return new Paragraph({
    children: text.split("\n").flatMap((line, i) => {
      const runs = [code(line)];
      if (i < text.split("\n").length - 1) runs.push(new TextRun({ break: 1 }));
      return runs;
    }),
    shading: { type: ShadingType.CLEAR, color: "auto", fill: COLOR.bg },
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
      left: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
      right: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
    },
    spacing: { before: 100, after: 160 },
  });
}
function cell(text, opts = {}) {
  return new TableCell({
    children: [new Paragraph({ children: typeof text === "string" ? [txt(text)] : text })],
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    shading: opts.header ? { fill: COLOR.primary, type: ShadingType.CLEAR, color: "auto" } : undefined,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
  });
}
function headerCell(text, width) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF", font: FONT, size: 22 })] })],
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    shading: { fill: COLOR.primary, type: ShadingType.CLEAR, color: "auto" },
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
  });
}
function table(rows, widths) {
  const rs = rows.map((r, idx) =>
    new TableRow({
      children: r.map((c, i) =>
        idx === 0
          ? headerCell(c, widths?.[i])
          : cell(c, { width: widths?.[i] })
      ),
    })
  );
  return new Table({
    rows: rs,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
      left:   { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
      right:  { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: COLOR.border },
      insideVertical:   { style: BorderStyle.SINGLE, size: 2, color: COLOR.border },
    },
  });
}
function spacer() { return new Paragraph({ children: [txt("")], spacing: { after: 80 } }); }
function pageBreak() { return new Paragraph({ children: [new PageBreak()] }); }

// ─── Document content ────────────────────────────────────────────────

const children = [];

// Cover
children.push(
  new Paragraph({
    children: [new TextRun({ text: "LexiMini", bold: true, size: 72, color: COLOR.primary, font: FONT })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 2400, after: 100 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "System Architecture & End-to-End Flow", size: 36, color: COLOR.accent, font: FONT })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "AI-Powered Indian Legal Drafting Engine", italics: true, size: 26, color: COLOR.muted, font: FONT })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 1200 },
  }),
  new Paragraph({
    children: [new TextRun({ text: `Generated: ${new Date().toISOString().split("T")[0]}`, size: 22, color: COLOR.muted, font: FONT })],
    alignment: AlignmentType.CENTER,
  }),
  new Paragraph({
    children: [new TextRun({ text: "Documentation reflects current source code (verified, not aspirational)", size: 20, italics: true, color: COLOR.muted, font: FONT })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
  }),
  pageBreak()
);

// Table of Contents (manual, since TOC field needs Word to refresh)
children.push(h("Table of Contents"));
const toc = [
  "1. Executive Summary",
  "2. System Overview & High-Level Architecture",
  "3. Core Concepts & Design Principles",
  "4. The Two Execution Paths",
  "5. End-to-End User Flow (Step-by-Step)",
  "6. The Plugin Architecture",
  "7. Agent Layer Deep-Dive",
  "8. Hybrid RAG Search Engine",
  "9. Citation & Anti-Hallucination System",
  "10. Data Model (PostgreSQL + pgvector)",
  "11. API Surface",
  "12. Frontend Architecture",
  "13. Workflow Engine",
  "14. Tech Stack",
  "15. Sequence Diagrams",
  "16. Deployment & Scaling Notes",
  "17. Strengths, Soft Spots, Roadmap",
];
toc.forEach(t => children.push(p([txt(t, { color: COLOR.accent })])));
children.push(pageBreak());

// 1. Executive Summary
children.push(h("1. Executive Summary"));
children.push(p("LexiMini is an AI-powered legal drafting engine for the Indian legal system. It accepts case documents (FIRs, chargesheets, court orders, witness statements, evidence) and produces court-ready drafts (regular bail, anticipatory bail, default bail, quashing petitions, discharge applications, criminal appeals; civil plaints, written statements, injunctions)."));
children.push(p([
  bold("Why it works: "),
  txt("the system combines Large-Language-Model reasoning (OpenAI GPT-4o + vision) with a strictly grounded retrieval layer (PostgreSQL + pgvector + custom BM25 + reciprocal-rank fusion + GPT cross-encoder reranking). Every legal claim in the final draft must trace back to a row in the database — sections, precedents, IPC→BNS mappings, or uploaded documents. This is enforced in four layers: data grounding, prompt grounding, post-hoc validation, and deterministic overrides."),
]));
children.push(p([
  bold("Why it scales: "),
  txt("a plugin architecture. Domains (criminal, civil, …), drafters (regular_bail, plaint, …), acts (BNS, BNSS, CPC, …), and citation providers (internal KB, Indian Kanoon, case documents) are auto-discovered from the filesystem at boot. Adding a new document type is a config change, not a code change. The frontend renders its UI from data populated by this discovery, so plugins surface automatically as commands and Studio buttons."),
]));

children.push(h("Key Capabilities", HeadingLevel.HEADING_2));
[
  "Document understanding — GPT-4o Vision + pdf-parse classifies and extracts structured data from FIRs, chargesheets, court orders, witness statements, evidence reports.",
  "Legal research — hybrid RAG over BNS / BNSS / BSA + special acts (NDPS, POCSO, PMLA, UAPA, Arms, IT Act) and a precedent corpus, with IPC→BNS mapping for legacy references.",
  "Document generation — produces .docx files with court-correct formatting (Times New Roman, legal margins, numbered grounds, signature blocks).",
  "Chat-as-history — every action (upload, command, generation) is persisted as a ChatMessage so the case thread is fully replayable and auditable.",
  "Citation traceability — every assistant claim is linked to a Citation row pointing at a section, precedent, document page, or web source with previewable excerpts.",
].forEach(t => children.push(bullet(t)));

children.push(pageBreak());

// 2. System Overview
children.push(h("2. System Overview & High-Level Architecture"));
children.push(p("LexiMini is a three-tier system: a Vue 3 SPA frontend, an Express.js + TypeScript backend, and a PostgreSQL database with the pgvector extension. External services: OpenAI for LLM and embeddings, Indian Kanoon for citation lookups, local filesystem for uploaded and generated documents."));

children.push(h("High-Level Diagram", HeadingLevel.HEADING_2));
children.push(pre(
`┌─────────────────── FRONTEND (Vue 3 + Vite + Pinia) ──────────────────┐
│  ChatView (primary)         SectionsView      Legacy Pipeline UI     │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌────────────┐             │
│  │ChatHeader│ │ ChatArea │ │SourcesPanel│ │StudioPanel │             │
│  │ Sidebar  │ │ messages │ │  uploads   │ │ @commands  │             │
│  └──────────┘ └──────────┘ └────────────┘ └────────────┘             │
│  Stores: cases · chat · sources · studio · citation · pipeline       │
└────────────────────────────────┬──────────────────────────────────────┘
                                 │  HTTP (multipart) + SSE
┌────────────────────────────────▼──────────────────────────────────────┐
│              BACKEND (Express + TypeScript ESM)                        │
│  Middleware: helmet · CORS · rate-limit · multer · zod · pino         │
│                                                                        │
│  ROUTES                                                                │
│   /api/cases      /api/studio-actions   /api/commands                  │
│   /api/citations  /api/pipeline (legacy) /api/sections /api/health    │
│                                                                        │
│  PLUGIN CORE (auto-discovered from filesystem at boot)                 │
│   domainRegistry · drafterRegistry · actRegistry                       │
│   bootstrapPlugins() syncs to LegalDomain / RegisteredDocumentType /   │
│                       StudioAction / ChatCommand tables                │
│                                                                        │
│  AGENT LAYER (LLM-facing, all use openaiService)                       │
│   documentAnalyzer · extractor · researcher · drafterFactory           │
│   strategyAdvisor · domainRouter                                       │
│                                                                        │
│  SERVICE LAYER                                                         │
│   chat.service ← central message router                                │
│   hybrid-search ← pgvector + BM25 + RRF + GPT rerank                  │
│   citation/ ← aggregator over internal + indian-kanoon + case-docs     │
│   openai · docgen · storage · database · bm25                          │
│                                                                        │
│  WORKFLOW ENGINE (legacy linear pipeline)                              │
│   Upload → Extract → Research → Draft → SaveOutput                     │
└────────────────────────────────┬──────────────────────────────────────┘
                                 │
┌────────────────────────────────▼──────────────────────────────────────┐
│            PostgreSQL + pgvector (1536-dim embeddings)                 │
│  Cases · ChatMessages · CaseDocuments · PipelineRuns                   │
│  Acts · Chapters · StatuteSections · Precedents · IPCMappings          │
│  LegalDomain · RegisteredDocumentType · StudioAction · ChatCommand     │
│  Citations · CitationCache · GeneratedDocuments · SectionRelations     │
└────────────────────────────────────────────────────────────────────────┘`
));

children.push(pageBreak());

// 3. Design Principles
children.push(h("3. Core Concepts & Design Principles"));

children.push(h("3.1 Plugin-First Extensibility", HeadingLevel.HEADING_2));
children.push(p("Core never changes. Plugins extend. To add a new domain (tax, family) or document type (SLP, MOA), drop a TypeScript file in the appropriate folder. The registries auto-discover it at boot, sync metadata to the database, and the frontend picks it up via /api/studio-actions and /api/commands."));

children.push(h("3.2 Chat-as-History", HeadingLevel.HEADING_2));
children.push(p("Every interaction (upload, @command, free-form chat, generated document) is stored as a ChatMessage row. The case thread is the source of truth — fully auditable, fully replayable, and the same data drives the UI you see today and any future review/agent loops."));

children.push(h("3.3 Anti-Hallucination by Construction", HeadingLevel.HEADING_2));
children.push(p("The LLM is never trusted as the source of legal facts. Four layers of grounding:"));
[
  "Data grounding — sections and precedents only ever come from Postgres rows. The LLM receives them in the prompt, but the final memo's applicableSections array is always built from DB data, not LLM output.",
  "Prompt grounding — synthesis prompts explicitly enumerate the only sections/precedents allowed: 'ONLY reference sections from SECTIONS INVOLVED above'.",
  "Post-hoc validation — researcherAgent.validateMemo filters the LLM's output back through a knownSections set; any hallucinated ID is dropped.",
  "Deterministic override — bailability is computed from section.bailable booleans, not parsed from LLM strings.",
].forEach(t => children.push(bullet(t)));

children.push(h("3.4 Hybrid Retrieval", HeadingLevel.HEADING_2));
children.push(p("Pure vector search is wrong for legal text — exact statute references matter more than semantic similarity. LexiMini runs three retrievers in parallel (regex exact-match, pgvector cosine, in-memory BM25), fuses their rankings with Reciprocal Rank Fusion (RRF), and reranks the top candidates with a GPT cross-encoder."));

children.push(h("3.5 Two Execution Paths Coexist", HeadingLevel.HEADING_2));
children.push(p("Path A (modern): the chat path — request/response, plugin-driven, the primary UX. Path B (legacy): the linear WorkflowEngine pipeline — single-shot FIR→bail-app with SSE for live progress, kept for backward compatibility and demonstrations."));

children.push(pageBreak());

// 4. Two Execution Paths
children.push(h("4. The Two Execution Paths"));

children.push(h("4.1 Path A — Notebook / Chat (Primary)", HeadingLevel.HEADING_2));
children.push(p("Entry: POST /api/cases/:id/messages → chat.service.handleMessage()"));
children.push(pre(
`POST /api/cases/:id/messages   (multipart: content + optional file)
        │
        ▼
   parseCommand(content)
        │
        ├── file present  → handleFileUpload()
        │                     ├─ documentAnalyzerAgent.extract(buffer, mime)
        │                     │     ├─ classify docType (fir/chargesheet/order…)
        │                     │     └─ run docType-specific extraction prompt
        │                     ├─ persist CaseDocument + extractedData (JSONB)
        │                     ├─ updateCaseSections() — accumulate sectionsRaw
        │                     ├─ post ANALYSIS_CARD message
        │                     └─ post brief commentary message
        │
        ├── @command      → handleCommand()
        │                     ├─ @analyze | @summary | @missing |
        │                     │  @cross_exam | @sections | @precedents
        │                     │       → strategyAdvisorAgent
        │                     │
        │                     └─ @bail | @anticipatory | @plaint | …
        │                           ├─ researchCase() → researcherAgent → memo
        │                           ├─ drafterFactory.draft(type, case, memo)
        │                           │     → DrafterPlugin (domain-specific)
        │                           ├─ storage.saveOutput(.docx)
        │                           ├─ create PipelineRun + GeneratedDocument
        │                           └─ post GENERATION_CARD
        │
        └── plain text     → handleChat()
                              └─ strategyAdvisorAgent.chat(msg, ctx)`
));

children.push(h("4.2 Path B — Linear Pipeline (Legacy)", HeadingLevel.HEADING_2));
children.push(p("Entry: POST /api/pipeline/run → runBailPipeline() driven by WorkflowEngine. Single-shot FIR→bail-application flow with Server-Sent Events streaming live step progress."));
children.push(pre(
`POST /api/pipeline/run (file)         → returns { runId, streamUrl }
GET  /api/pipeline/:id/stream         → SSE: pipeline:start, step:start,
                                         step:complete, step:error,
                                         pipeline:complete
GET  /api/pipeline/:id/result         → completed memo + draft
GET  /api/pipeline/:id/download       → .docx file

Engine: WorkflowEngine.run() → step.execute → step.validate → step.onError
Steps:  upload → extract → research → draft → save-output
Per-step features: retries (exponential backoff), timeout, validation,
                   error recovery callbacks, SSE event emission.`
));

children.push(pageBreak());

// 5. E2E Flow
children.push(h("5. End-to-End User Flow (Step-by-Step)"));
children.push(p("This is the canonical happy path: a lawyer creates a case, uploads an FIR, then generates a regular bail application. All steps reflect actual code paths."));

const steps = [
  ["Step 1 — Open the app", "Frontend boots ChatView at '/'. Pinia stores 'cases' and 'studio' fetch GET /api/cases and GET /api/studio-actions?domain=criminal in parallel. The Studio panel renders one tile per RegisteredDocumentType (Regular Bail, Anticipatory Bail, Plaint, …) — these were synced from src/domains/* at server boot."],
  ["Step 2 — Create a case", "User clicks 'New Case'. Frontend POSTs to /api/cases. chat.service.createCase inserts a Case row with default title and an empty sectionsRaw[]. A welcome ChatMessage (role=ASSISTANT, type=TEXT) is auto-created listing all available @commands. Frontend navigates to /case/:id."],
  ["Step 3 — Upload an FIR", "User drag-drops a PDF or image. Frontend builds FormData with content + file and POSTs to /api/cases/:id/messages. multer attaches req.file. chat.service.handleMessage stores a USER ChatMessage (type=FILE_UPLOAD) and routes to handleFileUpload."],
  ["Step 4 — Document analysis (Agent: documentAnalyzer)", "storageService writes the file to ./uploads/. documentAnalyzerAgent.extract(buffer, mime): (a) classifies docType by sending the document to GPT-4o (Vision for images, pdf-parse + chat for digital PDFs, Vision for scanned PDFs) with the CLASSIFY_PROMPT; (b) runs a docType-specific extraction prompt (different prompt for FIR / chargesheet / court_order / witness_statement / evidence). Returns { docType, data, rawText, confidence }."],
  ["Step 5 — Persist & accumulate", "A CaseDocument row is created with extractedData as JSONB. updateCaseSections merges any sectionsRaw / sectionsCharged from the extracted data into Case.sectionsRaw — this is the case's running list of legal sections that drives later research."],
  ["Step 6 — Render results", "Backend posts an ANALYSIS_CARD ChatMessage (content = JSON of extracted fields) plus a brief commentary message. Frontend renders the card with editable extracted fields and the commentary as a normal bubble."],
  ["Step 7 — User clicks 'Regular Bail' (or types @bail)", "Frontend calls chatStore.sendMessage('@bail'). chat.service.handleMessage parses it as a COMMAND and routes to handleCommand('regular_bail')."],
  ["Step 8 — Research (Agent: researcher)", "researchCase builds a synthetic FIR-like object from the case's accumulated sectionsRaw and concatenated briefFacts. researcherAgent.research() runs five sub-steps: (1) regex-detect IPC sections in sectionsRaw and look up IPCMapping → BNS equivalents; (2) hybrid search on briefFacts for semantically relevant statute sections; (3) hybrid search on each explicit section reference; (4) deduplicate by section.id; (5) embed (sections + facts) and pgvector-search Precedent rows where bail_relevant=true."],
  ["Step 9 — LLM synthesis (grounded)", "researcherAgent.synthesizeMemo builds a prompt listing only the sections and precedents found in steps 1-5, then calls openaiService.chatJSON to extract { ingredients[], riskAssessment }. Critically, the returned LegalMemo's applicableSections, mappedSections, and precedents arrays are populated from DB data — only ingredients and riskAssessment text come from the LLM. Bailability is computed deterministically from section.bailable booleans."],
  ["Step 10 — Validate", "validateMemo filters memo.applicableSections through the knownSections id set, dropping any LLM hallucination."],
  ["Step 11 — Drafter dispatch (Factory)", "drafterFactory.draft('regular_bail', caseData, memo) queries drafterRegistry.getByDocumentTypeCode('criminal','regular_bail') → returns the regularBailDrafter plugin from src/domains/criminal/drafters/regular-bail.drafter.ts."],
  ["Step 12 — Generate (Agent: drafter)", "regularBailDrafter.draft() calls the original drafterAgent (battle-tested for bail apps). drafterAgent constructs a prompt with case context, applicable sections, precedents, and explicit anti-hallucination rules ('every section cited MUST exist in LegalMemo; every case cited MUST exist in LegalMemo; all facts MUST come from ExtractedFIR'). GPT-4o returns structured JSON sections (introduction, briefFacts, groundsForBail, legalArguments, prayer)."],
  ["Step 13 — Render to .docx", "docgenService converts the structured sections to a docx Document using the docx npm package — Times New Roman, legal margins, court heading, roman-numbered grounds, signature block. Returns a Buffer."],
  ["Step 14 — Persist outputs", "storageService.saveOutput writes <caseId>-regular_bail.docx to ./output/. A PipelineRun row is created with status=COMPLETED, draftMarkdown, docxPath, legalMemo (JSONB), extractedData. A GeneratedDocument row links it to the case."],
  ["Step 15 — Notify the user", "A GENERATION_CARD ChatMessage is posted with the runId, downloadUrl (/api/cases/:id/generations/:runId/download), and a markdown preview snippet. Frontend's chat.store.sendMessage reloads the message list and GenerationCard.vue renders the download button."],
  ["Step 16 — Download", "User clicks Download. Frontend hits /api/cases/:id/generations/:runId/download. Backend looks up the PipelineRun, verifies the file exists on disk via storageService.exists, and streams it via res.download with a court-friendly filename."],
];
steps.forEach(([title, body]) => {
  children.push(h(title, HeadingLevel.HEADING_3));
  children.push(p(body));
});

children.push(pageBreak());

// 6. Plugin Architecture
children.push(h("6. The Plugin Architecture"));
children.push(p("This is the load-bearing idea of the codebase. Adding a new domain or document type is a config change, not a code change."));

children.push(h("6.1 What gets discovered", HeadingLevel.HEADING_2));
children.push(table(
  [
    ["Registry", "Filesystem source", "Plugin contract", "Purpose"],
    ["domainRegistry", "src/domains/<name>/domain.config.ts", "DomainPlugin", "Defines a legal domain + its document types + routing hints"],
    ["drafterRegistry", "src/domains/<name>/drafters/*.drafter.ts", "DrafterPlugin", "One drafter per document type — owns its prompt + .docx generation"],
    ["actRegistry", "src/acts/<domain>/*.act.json", "ActPlugin", "Statute metadata for ingestion (BNS, CPC, …)"],
  ],
  [18, 32, 18, 32]
));

children.push(h("6.2 Boot sequence", HeadingLevel.HEADING_2));
children.push(p("On server start, src/index.ts calls bootstrapPlugins() before opening the HTTP listener:"));
children.push(pre(
`1. domainRegistry.loadAll()
   → readdirSync('src/domains'), skip '_template'
   → import each domain.config.ts via dynamic import + pathToFileURL
   → findDomainExport: find any export with shape { code, documentTypes, routingHints }
   → store in Map<code, DomainPlugin>

2. drafterRegistry.loadAll()
   → walk each domain folder's drafters/ subfolder
   → import each *.drafter.ts
   → store in Map<id, DrafterPlugin> by plugin.id

3. actRegistry.loadAll()
   → load all *.act.json files

4. syncToDatabase()
   For each domain plugin:
     → upsert LegalDomain row
     For each documentType in plugin.documentTypes:
       → upsert RegisteredDocumentType row
       → upsert StudioAction (mirrors the doc type for the UI grid)
       → if command (e.g. "@bail"): upsert ChatCommand row`
));

children.push(h("6.3 The DomainPlugin contract", HeadingLevel.HEADING_2));
children.push(pre(
`interface DomainPlugin {
  code: string;                  // "criminal", "civil", "tax"
  name: string;                  // "Criminal Law"
  description: string;
  iconName: string;
  colorHex: string;
  sortOrder: number;
  defaultActCodes: string[];     // ["BNS","BNSS","BSA","NDPS",…]

  documentTypes: DocumentTypeConfig[];

  routingHints: {                // used by domainRouter to classify queries
    keywords: string[];
    actReferences: string[];
    queryPatterns: RegExp[];
  };

  prerequisiteCheckers?: Record<string, PrerequisiteChecker>;
}

interface DocumentTypeConfig {
  code: string;                  // "regular_bail"
  name: string;                  // "Regular Bail"
  description: string;
  category: "draft"|"analyze"|"research"|"extract";
  iconName: string;
  colorHex: string;
  command?: string;              // "@bail"
  requiredSourceTypes: string[]; // ["fir"]
  primarySectionCodes: string[]; // ["BNSS-480","BNSS-483"]
  drafterId: string;             // "criminal.regular_bail"
  templateConfig?: object;
  sortOrder?: number;
}`
));

children.push(h("6.4 The DrafterPlugin contract", HeadingLevel.HEADING_2));
children.push(pre(
`interface DrafterPlugin {
  id: string;                    // "criminal.regular_bail"
  domainCode: string;            // "criminal"
  documentTypeCode: string;      // "regular_bail"
  draft(input: DrafterInput): Promise<DrafterOutput>;
}

interface DrafterInput {
  caseData: CaseWithDocuments;
  memo: LegalMemo;
  citations?: CitationCandidate[];
  templateConfig?: object;
}

interface DrafterOutput {
  markdown: string;              // for chat preview
  sections: Record<string, unknown>;  // structured fields
  docxBuffer: Buffer;            // ready-to-download .docx
  citationIds?: string[];        // links into Citation table
}`
));

children.push(h("6.5 What's implemented today", HeadingLevel.HEADING_2));
children.push(table(
  [
    ["Domain", "Document types", "Default acts"],
    ["criminal", "regular_bail, anticipatory_bail, default_bail, quashing_petition, discharge_application, criminal_appeal", "BNS, BNSS, BSA, NDPS, POCSO, PMLA, UAPA, ARMS"],
    ["civil", "plaint, written_statement, temporary_injunction", "CPC, Contract Act 1872, Specific Relief 1963, Limitation 1963, TPA 1882"],
  ],
  [15, 55, 30]
));

children.push(h("6.6 Adding a new document type — example", HeadingLevel.HEADING_2));
children.push(p("Suppose you want to add 'Cheque Bounce Complaint' under a new domain 'commercial':"));
children.push(pre(
`1. Create src/domains/commercial/domain.config.ts:
     export const commercialDomain: DomainPlugin = {
       code: "commercial",
       name: "Commercial Disputes",
       documentTypes: [{
         code: "cheque_bounce",
         command: "@cheque",
         drafterId: "commercial.cheque_bounce",
         primarySectionCodes: ["NI-138"],
         requiredSourceTypes: ["dishonor_memo"],
         …
       }],
       routingHints: { keywords:["cheque","section 138","dishonor"], … },
     };

2. Create src/domains/commercial/drafters/cheque-bounce.drafter.ts:
     export const chequeBounceDrafter: DrafterPlugin = {
       id: "commercial.cheque_bounce",
       domainCode: "commercial",
       documentTypeCode: "cheque_bounce",
       async draft(input) { /* prompt + chatJSON + docgen */ },
     };

3. Optionally drop src/acts/commercial/ni-act.act.json with NI Act metadata.

4. Restart server. The domain auto-syncs to LegalDomain, the document type
   to RegisteredDocumentType + StudioAction + ChatCommand. The frontend
   /api/studio-actions response now includes a "Cheque Bounce" tile and
   "@cheque" appears in the command palette. Zero core code touched.`
));

children.push(pageBreak());

// 7. Agent Layer
children.push(h("7. Agent Layer Deep-Dive"));
children.push(p("All agents are plain TypeScript classes that talk to openaiService. They are stateless; they receive context and return structured data."));

const agents = [
  ["documentAnalyzerAgent", "src/agents/document-analyzer.agent.ts", "Universal document classifier + extractor. Detects docType (fir/chargesheet/court_order/witness_statement/evidence/previous_petition/other) then runs a docType-specific JSON extraction prompt. Uses GPT-4o Vision for images, pdf-parse + chat for digital PDFs, Vision fallback for scanned PDFs."],
  ["extractorAgent", "src/agents/extractor.agent.ts", "FIR-specialized extractor (legacy pipeline). Extracts firNumber, date, policeStation, accused[], victim, ioName, sectionsRaw[], briefFacts. Validates confidence and emits warnings on low-quality extractions."],
  ["researcherAgent", "src/agents/researcher.agent.ts", "Hybrid RAG legal research. Maps IPC→BNS, runs hybrid search for applicable sections, vector-searches precedents, synthesizes a LegalMemo via grounded GPT prompt, then validates output against known section IDs. Computes bailability deterministically."],
  ["drafterAgent / DrafterPlugins", "src/agents/drafter.agent.ts + src/domains/*/drafters/", "Generates the final document. Bail flow uses the original drafterAgent; other doc types are domain-specific DrafterPlugins. Each builds a prompt from caseData + memo, calls openaiService.chatJSON, converts structured sections to markdown + .docx."],
  ["drafterFactory", "src/agents/drafter-factory.agent.ts", "Registry-driven dispatcher. Given (documentTypeCode, domainCode), looks up the right DrafterPlugin and calls .draft(). No switch statements anywhere."],
  ["strategyAdvisorAgent", "src/agents/strategy-advisor.agent.ts", "Free-form chat + utility commands (@analyze, @summary, @missing, @cross_exam). Receives full case context and replies with grounded narrative; metadata can include cited section IDs and precedent IDs."],
  ["domainRouterAgent", "src/agents/domain-router.agent.ts", "Classifies an incoming query into a domain using rule-based hints first (keywords / regex / act references), falling back to LLM if rules don't match. Used to route ambiguous queries to the right drafter pool."],
];
agents.forEach(([n, path, desc]) => {
  children.push(h(n, HeadingLevel.HEADING_3));
  children.push(p([bold("Source: "), code(path)]));
  children.push(p(desc));
});

children.push(pageBreak());

// 8. Hybrid RAG
children.push(h("8. Hybrid RAG Search Engine"));
children.push(p("Pure semantic search is wrong for legal text. Lawyers search by exact section number ('Section 480 BNSS') as often as by concept ('cognizable offence involving fraud'). LexiMini runs three retrievers in parallel and fuses their rankings."));
children.push(pre(
`Query: "accused stole vehicle under threat of violence"
              │
   ┌──────────┴──────────┬──────────────────┐
   ▼                     ▼                  ▼
EXACT MATCH         pgVECTOR             BM25
(regex)            (cosine)            (TF-IDF)
"Section 480 BNSS"  embed query →     in-memory
→ direct DB        cosine over        index
lookup, score 1.0  statute_sections   over title
                   → top 10           + description
                                      → top 10
   └──────────┬──────────┴──────────────────┘
              ▼
   RECIPROCAL RANK FUSION
   rrf(rank) = 1 / (k + rank)
   exact gets 2× boost
   merge by section.id, dedupe
              │
              ▼
   GPT-4o RERANKER (cross-encoder)
   "score each candidate 0-10 for relevance to query"
   sort by score, take top K
              │
              ▼
   SearchResult[] = { section, score, source: "exact"|"vector"|"bm25" }`
));

children.push(h("8.1 Why this combination", HeadingLevel.HEADING_2));
[
  "Exact-match catches 'Section 187 BNSS' style references that vector search would underweight.",
  "pgvector catches semantic matches ('cheating' ↔ 'fraud') and works well for fact-based queries.",
  "BM25 handles keyword-heavy queries and gives strong baselines without an LLM call.",
  "RRF is robust to score-scale differences across retrievers (cosine vs TF-IDF have wildly different ranges).",
  "GPT rerank applies once on a small candidate set — accurate and the LLM cost is bounded.",
].forEach(t => children.push(bullet(t)));

children.push(h("8.2 Reuse at the citation layer", HeadingLevel.HEADING_2));
children.push(p("citation-aggregator uses the same RRF + rerank pattern across multiple citation providers (internal KB, case documents, Indian Kanoon). Each provider runs in parallel with an 8-second hard timeout; failures degrade gracefully (Promise.allSettled). Results are RRF-fused per canonical entity (e.g. precedent citation), and reranked if more than 8 candidates are present."));

children.push(pageBreak());

// 9. Citations & Anti-Hallucination
children.push(h("9. Citation & Anti-Hallucination System"));
children.push(p("Every legal claim in the output must trace to a database row. The Citation table is the audit trail."));

children.push(h("9.1 The Citation table", HeadingLevel.HEADING_2));
children.push(pre(
`Citation {
  id, messageId?, pipelineRunId?
  sourceType: SECTION | PRECEDENT | DOCUMENT | WEB

  // SECTION:    sectionId → StatuteSection, pageNumber, paragraphRef
  // PRECEDENT:  precedentId → Precedent, sccReference, passageStart/End
  // DOCUMENT:   documentId → CaseDocument, documentPage
  // WEB:        webUrl, webTitle

  excerptText: String        // exact text quoted from source
  fullSourceUrl: String?     // deep link
}`
));

children.push(h("9.2 Aggregation pipeline", HeadingLevel.HEADING_2));
children.push(pre(
`citationAggregator.gather(query)
  → Promise.allSettled([
       internalProvider.search(query),       // statute KB + precedents
       caseDocumentProvider.search(query),   // user-uploaded sources
       indianKanoonProvider.search(query),   // external case law API
     ], 8s timeout per provider)
  → reciprocalRankFusion (canonical key per provider)
  → if >8 candidates: GPT cross-encoder rerank (top 20 → top K)
  → return CitationCandidate[]`
));

children.push(h("9.3 Caching", HeadingLevel.HEADING_2));
children.push(p("External provider results (Indian Kanoon especially) are cached in CitationCache by SHA-hashed query, keyed by providerId, with TTL. Cuts cost and latency on repeat queries."));

children.push(h("9.4 Frontend traceability", HeadingLevel.HEADING_2));
children.push(p("CitationPreview.vue calls GET /api/citations/:id/preview which returns excerptText, page, paragraph, source title, sourceUrl, and (if internal section) a deep link to the statute PDF at the right page (#page=N). Click any inline citation in a generated draft and a side-panel pops with the exact source text."));

children.push(pageBreak());

// 10. Data Model
children.push(h("10. Data Model (PostgreSQL + pgvector)"));
children.push(p("Three logical clusters of tables. All defined in prisma/schema.prisma."));

children.push(h("10.1 Case workspace cluster", HeadingLevel.HEADING_2));
children.push(table(
  [
    ["Table", "Key fields", "Purpose"],
    ["Case", "id, title, clientName, court, district, sectionsRaw[], status", "Top-level case container"],
    ["ChatMessage", "caseId, role (USER/ASSISTANT/SYSTEM), type (TEXT/FILE_UPLOAD/COMMAND/ANALYSIS_CARD/GENERATION_CARD), content, documentId?, pipelineRunId?, metadata", "Every interaction. The thread IS the history"],
    ["CaseDocument", "caseId, docType (FIR/CHARGESHEET/COURT_ORDER/…), filePath, extractedData JSONB, rawText, confidence, enabled", "Uploaded source documents"],
    ["PipelineRun", "caseId?, status, fileName, extractedData JSONB, legalMemo JSONB, draftMarkdown, docxPath, steps[] JSONB", "One generation run"],
    ["GeneratedDocument", "pipelineRunId, caseId?, docType, filePath, fileSize, mimeType", "Final .docx outputs"],
  ],
  [16, 38, 46]
));

children.push(h("10.2 Legal knowledge base cluster", HeadingLevel.HEADING_2));
children.push(table(
  [
    ["Table", "Key fields", "Purpose"],
    ["Act", "code (BNS/BNSS/BSA/…), fullName, year", "Top of statute hierarchy"],
    ["Chapter", "actId, number, title", "Statute chapters"],
    ["StatuteSection", "actType, sectionNumber, title, description, bailable, punishment, ingredients[], embedding vector(1536)", "Individual statute sections — the retrievable unit"],
    ["Precedent", "caseTitle, citation, court, year, ratio, summary, bailRelevant, embedding vector(1536)", "Indian case law"],
    ["IPCMapping", "ipcSection, bnsSection, bnsSectionId, changeType (RENAMED/MODIFIED/MERGED/SPLIT/NEW/REPEALED)", "Maps legacy IPC → new BNS"],
    ["PrecedentSection", "precedentId, sectionId, relevance", "Many-to-many join: which sections each precedent interprets"],
    ["SectionRelation", "fromSectionId, toSectionId, relationType (punishes/exception_to/variant_of/…), confidence", "Knowledge graph between sections"],
  ],
  [18, 40, 42]
));

children.push(h("10.3 Plugin runtime cluster", HeadingLevel.HEADING_2));
children.push(p("Synced from filesystem at server boot. Drives the dynamic UI."));
children.push(table(
  [
    ["Table", "Sourced from", "Used by"],
    ["LegalDomain", "domain.config.ts → DomainPlugin", "Domain selector, routing"],
    ["RegisteredDocumentType", "DomainPlugin.documentTypes", "Document type catalog"],
    ["StudioAction", "Mirror of RegisteredDocumentType", "Frontend Studio panel grid"],
    ["ChatCommand", "DocumentTypeConfig.command", "Command palette / autocomplete"],
  ],
  [22, 38, 40]
));

children.push(h("10.4 Citation cluster", HeadingLevel.HEADING_2));
children.push(table(
  [
    ["Table", "Purpose"],
    ["Citation", "Per-claim source link (section/precedent/document/web) with excerpt"],
    ["CitationCache", "External provider response cache by queryHash + TTL"],
  ],
  [25, 75]
));

children.push(pageBreak());

// 11. API Surface
children.push(h("11. API Surface"));
const api = [
  ["Method", "Endpoint", "Purpose"],
  ["GET", "/api/health", "DB + OpenAI status check"],
  ["", "", ""],
  ["POST", "/api/cases", "Create new case + welcome message"],
  ["GET", "/api/cases", "List active cases"],
  ["GET", "/api/cases/:id", "Get case with documents and counts"],
  ["DELETE", "/api/cases/:id", "Archive case (soft delete)"],
  ["GET", "/api/cases/:id/messages", "Chat history (paginated by 'before')"],
  ["POST", "/api/cases/:id/messages", "Send message (multipart: content + optional file)"],
  ["GET", "/api/cases/:id/documents", "Uploaded sources for case"],
  ["GET", "/api/cases/:id/documents/:docId", "Single source"],
  ["GET", "/api/cases/:id/generations", "Generated documents for case"],
  ["GET", "/api/cases/:id/generations/:runId/result", "Generation result + memo"],
  ["GET", "/api/cases/:id/generations/:runId/download", ".docx download"],
  ["GET", "/api/cases/:id/commands", "Available chat commands"],
  ["", "", ""],
  ["GET", "/api/cases/:id/sources/*", "Per-case source management (sourcesRoutes)"],
  ["GET", "/api/studio-actions", "Studio panel actions (filterable by domain)"],
  ["GET", "/api/commands", "Global command catalog"],
  ["GET", "/api/citations/:id/preview", "Citation preview with excerpt + deep link"],
  ["", "", ""],
  ["POST", "/api/pipeline/run", "Legacy: start FIR→bail pipeline (returns runId, streamUrl)"],
  ["GET", "/api/pipeline/:id/stream", "Legacy: SSE event stream"],
  ["GET", "/api/pipeline/:id/result", "Legacy: completed result"],
  ["GET", "/api/pipeline/:id/download", "Legacy: .docx download"],
  ["GET", "/api/pipeline", "Legacy: list past runs"],
  ["", "", ""],
  ["GET", "/api/sections/search", "Search statute sections (?q=&act=&limit=)"],
  ["GET", "/api/sections/:act/:number", "Section lookup (e.g. /bns/101)"],
  ["GET", "/api/sections/ipc/:section", "IPC → BNS mapping"],
  ["GET", "/api/sections/stats", "KB counts"],
  ["", "", ""],
  ["GET (static)", "/output/*", "Serve generated .docx files"],
];
children.push(table(api, [12, 42, 46]));

children.push(pageBreak());

// 12. Frontend
children.push(h("12. Frontend Architecture"));
children.push(p("Vue 3 + Vite + Tailwind + Pinia + Vue Router. The primary view is ChatView; legacy pipeline screens are kept under /legacy and /pipeline/:id."));

children.push(h("12.1 Routes", HeadingLevel.HEADING_2));
children.push(table(
  [
    ["Path", "Component", "Notes"],
    ["/", "ChatView", "New-case landing"],
    ["/case/:id", "ChatView", "Notebook for a specific case"],
    ["/sections", "SectionsView", "Browse statute KB"],
    ["/legacy", "HomeView", "Legacy upload UI"],
    ["/pipeline/:id", "PipelineView", "Legacy SSE pipeline progress"],
    ["/draft/:id", "DraftView", "Legacy draft preview + download"],
    ["/history", "HistoryView", "Legacy run history"],
  ],
  [22, 22, 56]
));

children.push(h("12.2 Pinia stores", HeadingLevel.HEADING_2));
children.push(table(
  [
    ["Store", "Owns", "Talks to"],
    ["cases", "Case list, create/select", "GET/POST /api/cases"],
    ["chat", "activeCaseId, messages, optimistic send", "GET/POST /api/cases/:id/messages"],
    ["sources", "Uploaded sources per case, enable/disable", "/api/cases/:id/sources/*"],
    ["studio", "Studio actions catalog", "GET /api/studio-actions"],
    ["citation", "Inline citation hover state + preview cache", "GET /api/citations/:id/preview"],
    ["pipeline", "Legacy pipeline run state + SSE", "/api/pipeline/*"],
  ],
  [16, 44, 40]
));

children.push(h("12.3 ChatView composition", HeadingLevel.HEADING_2));
children.push(pre(
`ChatView
├── AppHeader (case switcher, new-case button)
├── ChatHeader (title, status)
├── 3-column body
│   ├── ChatSidebar (case list)
│   ├── ChatArea (MessageBubble · AnalysisCard · GenerationCard · CommandChips)
│   ├── SourcesPanel (per-case uploads, toggle enabled)
│   └── StudioPanel (data-driven: GET /api/studio-actions?domain=criminal)
├── ChatInput (text + file drop + @autocomplete)
└── CitationPreview (overlay panel, opens on inline citation click)`
));

children.push(h("12.4 Optimistic chat send", HeadingLevel.HEADING_2));
children.push(p("chat.store.sendMessage pushes the user message + a 'Thinking...' placeholder before POSTing FormData. On response, removes the placeholder and reloads the canonical message list to capture any server-side changes (multiple ASSISTANT messages, citations, pipeline run records)."));

children.push(pageBreak());

// 13. Workflow Engine
children.push(h("13. Workflow Engine"));
children.push(p("Generic step runner used by the legacy linear pipeline. Each step is typed (input → output), has retry/timeout/validate/onError hooks, and emits SSE events through a context emitter."));
children.push(pre(
`WorkflowEngine.run(initialInput, { id, onEvent, metadata })
  → emit pipeline:start
  for each step in this.steps:
    → emit step:start
    → executeWithRetry(step, input, ctx) [withRetry + timeout]
    → if step.validate: validate output
    → on success: emit step:complete, push StepResult, currentInput = output
    → on error:
        if step.onError: try recovery callback
        else: emit step:error + pipeline:error, throw
  → emit pipeline:complete
  → return { id, output, steps[], totalDurationMs }

Step contract:
  WorkflowStep<TInput,TOutput> = {
    name: string
    execute: (input, ctx) => Promise<TOutput>
    validate?: (output) => true | string
    onError?: (err, ctx) => Promise<TOutput | null>
    retries?: number
    timeout?: number
  }

Context (ctx) provides:
  - emit(event)        — broadcasts to the SSE clients
  - getStepOutput<T>(name) — cross-step access`
));

children.push(h("13.1 Bail pipeline steps", HeadingLevel.HEADING_2));
children.push(table(
  [
    ["#", "Step", "Input → Output"],
    ["1", "uploadStep", "{ fileBuffer, fileName, mimeType } → { filePath, runId }"],
    ["2", "extractStep", "filePath → ExtractedFIR (via extractorAgent)"],
    ["3", "researchStep", "ExtractedFIR → LegalMemo (via researcherAgent)"],
    ["4", "draftStep", "{ FIR + memo } → { markdown, docxBuffer } (via drafterAgent)"],
    ["5", "saveOutputStep", "{ markdown, docxBuffer } → SaveOutputResult { docxPath, fileName }"],
  ],
  [6, 24, 70]
));

children.push(pageBreak());

// 14. Tech Stack
children.push(h("14. Tech Stack"));
children.push(table(
  [
    ["Layer", "Technology", "Rationale"],
    ["Language", "TypeScript (strict ESM)", "Type safety end-to-end"],
    ["Backend", "Express.js", "Mature, large ecosystem"],
    ["Frontend", "Vue 3 + Vite + Tailwind + Pinia", "Reactive, fast HMR, clean DX"],
    ["Database", "PostgreSQL 16+ with pgvector", "One DB for relational + vector"],
    ["ORM", "Prisma 6", "Type-safe queries, migrations"],
    ["LLM", "OpenAI GPT-4o", "Vision + chat + JSON mode"],
    ["Embeddings", "text-embedding-3-small (1536d)", "Fast, accurate, cheap"],
    ["Keyword search", "Custom in-memory BM25", "Exact statutory match"],
    ["Reranker", "GPT-4o cross-encoder", "Relevance scoring 0-10"],
    ["Doc generation", "docx npm package", "Native .docx, no LibreOffice"],
    ["PDF parse", "pdf-parse", "Digital PDF text extract"],
    ["Validation", "Zod", "API + LLM JSON validation"],
    ["Logging", "Pino + pino-pretty", "Structured JSON logs"],
    ["Realtime", "Server-Sent Events", "Pipeline progress streaming"],
    ["Security", "helmet, CORS, express-rate-limit", "Standard hardening"],
    ["Uploads", "multer (memory storage)", "Multipart handling"],
    ["IDs", "cuid (Prisma) + uuid", "Sortable, collision-safe"],
  ],
  [16, 36, 48]
));

children.push(pageBreak());

// 15. Sequence Diagrams
children.push(h("15. Sequence Diagrams"));

children.push(h("15.1 Upload → Analysis", HeadingLevel.HEADING_2));
children.push(pre(
`User       Frontend            Backend                OpenAI    Postgres
 │   drop     │                    │                      │          │
 │──────────▶│  POST .../messages  │                      │          │
 │            │ (multipart)        │                      │          │
 │            │───────────────────▶│                      │          │
 │            │                    │ save USER msg        │          │
 │            │                    │─────────────────────────────────▶│
 │            │                    │ storage.saveUpload   │          │
 │            │                    │ documentAnalyzer:    │          │
 │            │                    │   classify           │          │
 │            │                    │─────────────────────▶│          │
 │            │                    │   { docType }       ◀│          │
 │            │                    │   extract            │          │
 │            │                    │─────────────────────▶│          │
 │            │                    │   { data,confidence}◀│          │
 │            │                    │ create CaseDocument  │          │
 │            │                    │─────────────────────────────────▶│
 │            │                    │ updateCaseSections   │          │
 │            │                    │─────────────────────────────────▶│
 │            │                    │ post ANALYSIS_CARD   │          │
 │            │                    │─────────────────────────────────▶│
 │            │                    │ commentary           │          │
 │            │                    │─────────────────────▶│          │
 │            │                    │                     ◀│          │
 │            │                    │ post commentary msg  │          │
 │            │                    │─────────────────────────────────▶│
 │            │ ◀─── result ───────│                      │          │
 │            │ chat.store reload  │                      │          │
 │            │ GET /messages      │                      │          │
 │            │───────────────────▶│                      │          │
 │            │ ◀───────────────── │                      │          │
 │ ◀── render │                    │                      │          │`
));

children.push(h("15.2 @bail command (chat path)", HeadingLevel.HEADING_2));
children.push(pre(
`User    Frontend         Backend            researcher  drafter  Postgres  OpenAI
 │  @bail   │                │                    │          │         │        │
 │────────▶ │ POST messages  │                    │          │         │        │
 │          │───────────────▶│                    │          │         │        │
 │          │                │ parseCommand→cmd   │          │         │        │
 │          │                │ load Case+docs     │          │         │        │
 │          │                │────────────────────────────── │────────▶│        │
 │          │                │ researchCase()     │          │         │        │
 │          │                │   buildFirLike     │          │         │        │
 │          │                │   ─ research ─────▶│          │         │        │
 │          │                │     mapIPC→BNS     │          │         │        │
 │          │                │     ──────────────────────────│────────▶│        │
 │          │                │     hybridSearch   │          │         │        │
 │          │                │     ──────────────────────────│────────▶│        │
 │          │                │     vector preced. │          │         │        │
 │          │                │     ──────────────────────────│────────▶│────────▶
 │          │                │     synthesize     │          │         │        │
 │          │                │     ──────────────────────────│─────────│───────▶│
 │          │                │     validateMemo   │          │         │        │
 │          │                │   ◀───── memo ─────│          │         │        │
 │          │                │ drafterFactory.draft          │         │        │
 │          │                │   ─ regularBail ──────────────▶         │        │
 │          │                │     prompt + chatJSON          │        │        │
 │          │                │     ──────────────────────────────────────▶      │
 │          │                │     docgen                     │        │        │
 │          │                │   ◀── { md,docx} ─────────────│         │        │
 │          │                │ saveOutput, PipelineRun, GenDoc│        │        │
 │          │                │ ──────────────────────────────────────▶│         │
 │          │                │ post GENERATION_CARD           │        │        │
 │          │                │ ──────────────────────────────────────▶│         │
 │          │ ◀── result ────│                                │        │        │
 │ ◀ render │                │                                │        │        │`
));

children.push(h("15.3 Legacy pipeline (SSE)", HeadingLevel.HEADING_2));
children.push(pre(
`User    Frontend       Backend                 Workflow      Agents
 │ upload  │              │                       │             │
 │───────▶ │ POST /run    │                       │             │
 │         │─────────────▶│ res.json {runId}      │             │
 │         │ ◀────────────│                       │             │
 │         │              │ setImmediate runBailPipeline        │
 │         │              │ ──────────────────────▶│             │
 │         │ GET /stream  │                       │             │
 │         │─────────────▶│ register SSE conn      │             │
 │         │              │                       │ pipeline:start emit ──▶ res.write
 │         │              │                       │ step:start (upload)   ──▶ res.write
 │         │              │                       │ step:complete         ──▶ res.write
 │         │              │                       │ step:start (extract)  ──▶ ...
 │         │              │                       │ ──▶ extractorAgent
 │         │              │                       │ step:complete         ──▶ res.write
 │         │              │                       │ step:start (research) ──▶ ...
 │         │              │                       │ ──▶ researcherAgent
 │         │              │                       │ step:complete
 │         │              │                       │ step:start (draft)
 │         │              │                       │ ──▶ drafterAgent
 │         │              │                       │ step:complete
 │         │              │                       │ step:start (saveOutput)
 │         │              │                       │ pipeline:complete     ──▶ res.end
 │         │ ◀ live UI ◀──│                       │             │`
));

children.push(pageBreak());

// 16. Deployment & Scaling
children.push(h("16. Deployment & Scaling Notes"));

children.push(h("16.1 Local development", HeadingLevel.HEADING_2));
children.push(pre(
`# Prerequisites: Node 20+, PostgreSQL 16+ with pgvector

# Backend
cd backend
npm install
cp .env.example .env          # Fill OPENAI_API_KEY + DATABASE_URL
npx prisma db push             # Create all tables + pgvector
npm run db:seed                # Seed Acts + Chapters
npm run ingest:statutes        # BNS/BNSS/BSA → Postgres + embeddings
npm run ingest:precedents      # Case law → Postgres + embeddings
npm run dev                    # → http://localhost:3001

# Frontend
cd frontend
npm install
npm run dev                    # → http://localhost:5173`
));

children.push(h("16.2 Environment variables", HeadingLevel.HEADING_2));
children.push(table(
  [
    ["Variable", "Purpose"],
    ["DATABASE_URL", "Postgres connection string with pgvector enabled"],
    ["OPENAI_API_KEY", "OpenAI API key (chat + vision + embeddings)"],
    ["PORT", "Server port (default 3001)"],
    ["NODE_ENV", "development | production"],
    ["CORS_ORIGIN", "Allowed frontend origin"],
    ["OUTPUT_DIR", "Generated .docx output directory"],
    ["UPLOAD_DIR", "Uploaded source storage"],
  ],
  [30, 70]
));

children.push(h("16.3 Scaling hooks already in place", HeadingLevel.HEADING_2));
children.push(table(
  [
    ["Concern", "Where", "How it scales"],
    ["Storage", "storage.service.ts", "Abstract FS ops — swap to S3 by replacing one service"],
    ["Workflow", "workflow-engine.ts", "Add steps; supports retries, branching, error recovery"],
    ["Search", "hybrid-search.service.ts", "Add new retrievers (cross-encoder, parent-child)"],
    ["Database", "Prisma + pgvector", "Migrations, read replicas, HNSW tuning"],
    ["Plugin discovery", "domains/<x>/", "New domain = new folder, no code change"],
    ["Citation providers", "services/citation/providers/", "Drop a new provider, register it"],
    ["LLM provider", "openai.service.ts", "Single boundary — swap to Claude / Gemini"],
    ["Events", "WorkflowEngine emit()", "Swap SSE for WebSockets / Redis pub-sub"],
  ],
  [16, 32, 52]
));

children.push(h("16.4 Production gaps to close", HeadingLevel.HEADING_2));
[
  "No queue layer — generations run in-request (setImmediate for legacy pipeline). Add BullMQ + Redis for concurrent runs and priority queues.",
  "Plugin discovery uses process.cwd() + readdirSync at boot — production deployment must preserve src/domains/* on disk OR pre-compile and adjust the registry path.",
  "No auth — add Clerk / Auth.js with role-based access (lawyer, admin, reviewer) and per-case ACLs.",
  "Two execution paths (chat vs legacy pipeline) — eventually unify chat onto WorkflowEngine so retries/SSE/observability apply uniformly.",
  "researcherAgent is criminal-law-shaped (bailability, IPC mappings) — generalize for civil before scaling civil drafters.",
  "Add observability: Sentry for errors, Prometheus + Grafana for latency, OpenTelemetry across the agent chain.",
].forEach(t => children.push(bullet(t)));

children.push(pageBreak());

// 17. Strengths / Soft Spots / Roadmap
children.push(h("17. Strengths, Soft Spots, Roadmap"));

children.push(h("17.1 Strong points", HeadingLevel.HEADING_2));
[
  "Real plugin architecture — filesystem → registry → DB → API → UI is consistent end to end. New domains and document types ship as config.",
  "Multiple grounding layers genuinely enforced in code, not just claimed in prompts.",
  "Hybrid retrieval with exact-match boost is the right pattern for statute search where section numbers carry primary weight.",
  "Chat-as-history is a clean abstraction: every event replayable, full audit trail, easy to add review agents later.",
  "Citation system with deep-links to PDF page-anchors gives lawyers the verifiability they need.",
  "Clear separation between agents (LLM-facing) and services (deterministic).",
].forEach(t => children.push(bullet(t)));

children.push(h("17.2 Soft spots", HeadingLevel.HEADING_2));
[
  "Two execution paths coexist — chat path doesn't use WorkflowEngine, so no unified retry/SSE/telemetry.",
  "researchCase fakes a synthetic FIR-like object even for civil cases — works today but won't scale cleanly to non-criminal domains.",
  "No worker queue — long generations block request threads.",
  "Plugin discovery relies on filesystem layout being preserved in production builds.",
  "No auth, multi-tenancy, or rate-limit-per-user.",
  "Single LLM provider (OpenAI) — no multi-model routing yet.",
].forEach(t => children.push(bullet(t)));

children.push(h("17.3 Roadmap (from EXTENSIBILITY.md + ARCHITECTURE.md)", HeadingLevel.HEADING_2));
[
  "Phase 2 — Multi-document support (chargesheet, prior orders, witness statements) and advanced RAG (BGE-Reranker, parent-child chunks, query decomposition, full Indian case law corpus 100K+).",
  "Phase 3 — Self-correcting agentic loops: add a Reviewer agent that audits drafts and triggers re-research when grounding fails. LangGraph or extend WorkflowEngine with goto/branch/loop primitives.",
  "Phase 4 — Multi-language (Hindi, Marathi, Tamil, Telugu, Bengali) and court-variant templates (Sessions / High Court / SLP / anticipatory / default / interim bail).",
  "Phase 5 — Scale: Clerk auth, BullMQ queues, S3 storage, Postgres read replicas + PgBouncer + HNSW tuning, Docker/K8s, GitHub Actions CI, Grafana + Prometheus + Sentry, Stripe billing.",
  "Phase 6 — AI improvements: fine-tune on Indian legal corpus, automated evals (mapping accuracy, hallucination rate, lawyer scores), multi-model router (Claude for drafting, Gemini for OCR), Redis embedding cache, dedupe identical FIR re-runs.",
].forEach(t => children.push(bullet(t)));

children.push(spacer());
children.push(p([
  bold("End of document. "),
  txt("This documentation is generated from a verified read of the codebase as of "),
  txt(new Date().toISOString().split("T")[0]),
  txt(". For source-level detail, see ARCHITECTURE.md and EXTENSIBILITY.md in the leximini/ folder."),
]));

// ─── Build & save ────────────────────────────────────────────────────

const doc = new Document({
  creator: "LexiMini Architecture Generator",
  title: "LexiMini — System Architecture & Flow",
  description: "Full architecture and end-to-end flow documentation",
  styles: {
    default: {
      document: { run: { font: FONT, size: 22 } },
    },
  },
  numbering: {
    config: [{
      reference: "ord",
      levels: [{
        level: 0,
        format: LevelFormat.DECIMAL,
        text: "%1.",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360, hanging: 360 } } },
      }],
    }],
  },
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
            new TextRun({ text: "LexiMini Architecture · ", font: FONT, size: 18, color: COLOR.muted }),
            new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: COLOR.muted }),
          ],
        })],
      }),
    },
    children,
  }],
});

const buffer = await Packer.toBuffer(doc);
const outPath = resolve("c:/Users/HP/Desktop/Personal/lexmind/lexmind/leximini/LexiMini-Architecture.docx");
writeFileSync(outPath, buffer);
console.log("WROTE:", outPath, "size=", buffer.length);
