# Architecture Overview

LexiMini is a **legal document generation engine** for Indian law. It takes one or more *source* documents (FIRs, chargesheets, court orders, witness statements, evidence schedules, prior petitions) attached to a **Case**, and produces *output* documents (bail applications, plaints, written statements, quashing petitions, discharge applications, criminal appeals) — each fully grounded in a retrieved corpus of statutes and precedents.

---

## 1. Mission statement

> **Take unstructured Indian legal input → extract structured facts → ground in verified statutes & case law → produce a court-ready, fully cited draft.**

The system must behave like three professionals in sequence:

1. A **legal reader** — understands FIR/chargesheet/order text, even when noisy or scanned.
2. A **legal researcher** — knows which BNS/BNSS/BSA sections apply, knows the IPC→BNS mapping, knows landmark precedents.
3. A **legal drafter** — writes a court-formatted document citing only the facts and law it has been given.

It must do this with **zero hallucinations** — every section/case in the output must exist in the database.

---

## 2. System diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Vue 3 + Vite)                      │
│                                                                     │
│  ChatView   │  PipelineView  │  DraftView  │  HistoryView  │ Sections │
│  (3-pane)   │  (SSE stream)  │  (tabs)     │  (list)       │ (search) │
└───────────┬───────────┬───────────┬───────────┬───────────────────────┘
            │           │           │           │
            ▼           ▼           ▼           ▼              HTTP + SSE
┌─────────────────────────────────────────────────────────────────────┐
│                        EXPRESS API GATEWAY                          │
│  /api/cases · /api/cases/:id/messages · /api/cases/:id/sources      │
│  /api/studio-actions · /api/commands · /api/citations/:id/preview   │
│  /api/pipeline/* (legacy) · /api/sections/* · /api/health           │
│  · helmet · CORS · rate-limit · multer · Zod ·                      │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
   ┌────────────────────────────┴───────────────────────────────────┐
   │                       WORKFLOW ENGINE                          │
   │   Upload → Extract → Research → Draft → Save                   │
   │   per-step retries · timeouts · SSE events · validation        │
   └────────────────────────────┬───────────────────────────────────┘
                                │
   ┌────────────────────────────┴───────────────────────────────────┐
   │                          AGENT LAYER                           │
   │                                                                │
   │  Extractor   Researcher   Drafter   DomainRouter   Analyzer    │
   │  Strategy    DrafterFactory (registry-dispatched)              │
   └────────────────────────────┬───────────────────────────────────┘
                                │
   ┌────────────────────────────┴───────────────────────────────────┐
   │                         SERVICE LAYER                          │
   │                                                                │
   │  OpenAI · DB (Prisma+pgvector) · BM25 · HybridSearch · Rerank  │
   │  DocGen (.docx) · Storage (fs/S3) · Chat · Citations           │
   │   ├ Aggregator (multi-provider RRF + rerank)                   │
   │   ├ Validator (strip uncited claims)                           │
   │   ├ Verifier  (on-demand deep checks)                          │
   │   └ Providers (internal · case-documents · Indian Kanoon · …)  │
   └────────────────────────────┬───────────────────────────────────┘
                                │
                  ┌─────────────┴─────────────┐
                  │   PostgreSQL + pgvector   │
                  │  18 tables incl. embeddings(1536d)  │
                  └───────────────────────────┘
```

Detailed flow lives in [Pipeline Flow](./04-pipeline-flow.md). The plugin/registry architecture is described in [Plugin Architecture](./03-plugin-architecture.md).

---

## 3. The two primary surfaces

The codebase exposes **two end-user experiences** that share the same backend services and database:

### a) ChatView — the "Notebook" interface (default `/`)

A 3-pane layout:

| Pane (LTR) | Content | Backed by |
|------------|---------|-----------|
| **Sources** | Upload + toggle case documents, optional web search | `/api/cases/:id/sources/*` |
| **Chat** | Messages, file uploads, @commands, analysis/generation cards | `/api/cases/:id/messages` |
| **Studio** | Action grid (Draft / Analyze / Research) | `/api/studio-actions` |

A user creates a **Case**, uploads sources, chats with the **Strategy Advisor** agent, and triggers `@bail` / `@analyze` / `@cross_exam` actions that produce inline message cards (`ANALYSIS_CARD` or `GENERATION_CARD`).

This is the production interface and where new domain plugins (Civil, Tax, …) automatically surface — the Studio panel reads from the DB, not hardcoded UI.

### b) Legacy FIR → Bail demo (`/legacy`)

A simpler, focused flow:

1. `HomeView` — upload one FIR.
2. `PipelineView` — live `StepProgress` over SSE.
3. `DraftView` — tabbed view of (Draft / Extracted FIR / Legal Memo) + download `.docx`.
4. `HistoryView` — list of past runs.

Kept for demo and quick smoke-tests; both surfaces hit the same `runBailPipeline()` and the same DB.

---

## 4. Backend layout

```
backend/src/
├── core/                   ← plugin engine (NEVER changes per-domain)
│   ├── plugin.types.ts            DomainPlugin · DrafterPlugin · ActPlugin · ExtractionPlugin
│   ├── domain-registry.ts         auto-discovers backend/src/domains/*/
│   ├── drafter-registry.ts        auto-discovers backend/src/domains/*/drafters/*.drafter.ts
│   ├── act-registry.ts            loads backend/src/acts/<domain>/*.act.json
│   ├── extraction-registry.ts     manual register; pluggable extractors
│   ├── workflow-engine.ts         typed step runner with SSE
│   ├── workflow-types.ts          step / context / event / option types
│   └── bootstrap.ts               loads plugins → syncs to LegalDomain/StudioAction/ChatCommand rows
│
├── domains/                ← plugin code (per legal area)
│   ├── _template/                 starter — skipped by loader
│   ├── criminal/                  6 drafters: regular_bail / anticipatory_bail / default_bail / quashing / discharge / appeal
│   └── civil/                     3 drafters: plaint / written_statement / temporary_injunction
│
├── agents/                 ← LLM orchestrators (domain-agnostic)
│   ├── extractor.agent.ts         GPT-4o Vision / text → ExtractedFIR (+ confidence)
│   ├── researcher.agent.ts        IPC→BNS + hybrid search + GPT-4o synthesis → LegalMemo
│   ├── drafter.agent.ts           GPT-4o → bail markdown + DOCX (legacy bail-specific)
│   ├── drafter-factory.agent.ts   dispatch to a domain drafter via registry
│   ├── domain-router.agent.ts     classify a query → domain code(s)
│   ├── document-analyzer.agent.ts classify + extract any case document
│   └── strategy-advisor.agent.ts  case analysis + chat + cross-exam Qs
│
├── services/               ← infrastructure singletons
│   ├── openai.service.ts          chat / chatJSON / vision / visionJSON / embed / embedBatch
│   ├── database.service.ts        Prisma client + raw pgvector queries
│   ├── bm25.service.ts            in-memory BM25 over statute sections
│   ├── hybrid-search.service.ts   vector + BM25 + exact + RRF + optional rerank
│   ├── reranker.service.ts        GPT-4o cross-encoder
│   ├── docgen.service.ts          docx npm package; bail + generic per-section
│   ├── storage.service.ts         fs read/write; swappable for S3
│   ├── chat.service.ts            full case/messages/commands lifecycle
│   └── citation/                  aggregator · validator · verifier · 3 providers
│
├── routes/                 ← HTTP API (domain-agnostic)
│   ├── chat.routes.ts             cases + messages + generations
│   ├── sources.routes.ts          case documents
│   ├── studio.routes.ts           studio action catalog
│   ├── commands.routes.ts         chat command catalog
│   ├── citations.routes.ts        citation preview
│   ├── sections.routes.ts         statute search + lookup + IPC mapping + stats
│   ├── pipeline.routes.ts         legacy FIR→bail + SSE
│   └── health.routes.ts           /api/health
│
├── workflows/              ← composed pipelines using the engine
│   ├── bail-application.workflow.ts
│   └── steps/  (upload · extract · research · draft · save-output)
│
├── middleware/             error-handler · upload (multer) · validate (zod)
├── config/                 env (zod) · constants
├── utils/                  logger (pino) · pdf · retry (exp backoff)
├── types/                  api · fir · legal · case · document · pipeline · generation · strategy
└── index.ts                Express bootstrap (helmet, CORS, rate-limit, routes, SIGINT)
```

See [Backend Overview](../backend/01-overview.md) for the request lifecycle and per-file details.

---

## 5. Frontend layout

```
frontend/src/
├── main.ts                 Pinia + Router → mount #app
├── App.vue                 RouterView only
├── router/index.ts         7 routes (see Frontend Overview)
│
├── views/                  page-level Vue components
│   ├── ChatView.vue        3-pane primary surface
│   ├── PipelineView.vue    legacy SSE progress
│   ├── DraftView.vue       legacy 3-tab draft viewer
│   ├── HomeView.vue        legacy upload landing
│   ├── HistoryView.vue     legacy runs list
│   └── SectionsView.vue    statute search
│
├── stores/                 Pinia
│   ├── cases.store.ts            list / create / archive
│   ├── chat.store.ts             messages + sendMessage (FormData)
│   ├── sources.store.ts          case documents
│   ├── studio.store.ts           studio actions
│   ├── citation.store.ts         citation preview pane
│   └── pipeline.store.ts         legacy pipeline history/result
│
├── composables/
│   ├── useApi.ts                 get / post / uploadFile + loading/error
│   ├── usePipeline.ts            start() + SSE + step state
│   └── useUpload.ts              drag/drop + validation + preview
│
└── components/
    ├── AppHeader.vue · FileUploader.vue · StepProgress.vue · CitationPreview.vue
    ├── chat/    8 files — message bubble, cards, sidebar, input, header
    ├── sources/ 4 files — panel + item + add-card + web-search-bar
    └── studio/  3 files — panel + grid + card
```

See [Frontend Overview](../frontend/01-overview.md).

---

## 6. Database in one paragraph

PostgreSQL 16 with `pgvector` is the *only* runtime data store. Prisma is the ORM. Eighteen models cover:

- The **knowledge graph**: `Act`, `Chapter`, `StatuteSection` (with a `vector(1536)` embedding column), `IPCMapping`, `Precedent` (also with embeddings), `PrecedentSection`, `SectionRelation`.
- The **operational data**: `Case`, `CaseDocument`, `ChatMessage`, `PipelineRun`, `GeneratedDocument`, `Citation`.
- The **plugin metadata mirror**: `LegalDomain`, `RegisteredDocumentType`, `StudioAction`, `ChatCommand` — populated by `bootstrap.ts` from the on-disk plugins so the frontend can read them dynamically.
- A **performance cache**: `CitationCache`.

Full schema in [Data Model](./05-data-model.md).

---

## 7. Where to go next

| Topic                            | Doc |
|----------------------------------|-----|
| Why every library was chosen     | [Tech Stack](./02-tech-stack.md) |
| Plugins / registries / contracts | [Plugin Architecture](./03-plugin-architecture.md) |
| End-to-end data flow             | [Pipeline Flow](./04-pipeline-flow.md) |
| All 18 tables                    | [Data Model](./05-data-model.md) |
| Every endpoint                   | [API Reference](./06-api-reference.md) |
| The 4-layer grounding strategy   | [Anti-Hallucination](./07-anti-hallucination.md) |
| pgvector + BM25 + RRF + rerank   | [Hybrid Search](./08-hybrid-search.md) |
