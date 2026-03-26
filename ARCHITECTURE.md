# LexiMini — System Architecture

**Buildio-Legal AI Engine**
FIR Document → Court-Ready Bail Application

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Vue 3 + Vite)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │  Upload   │  │ Pipeline │  │  Draft   │  │ Sections │           │
│  │  View     │  │  View    │  │  View    │  │  Search  │           │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       │    SSE Stream│             │              │                  │
└───────┼──────────────┼─────────────┼──────────────┼─────────────────┘
        │              │             │              │
   ─────┼──────────────┼─────────────┼──────────────┼──── HTTP / SSE ──
        │              │             │              │
┌───────┼──────────────┼─────────────┼──────────────┼─────────────────┐
│       ▼              ▼             ▼              ▼                  │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    EXPRESS.js API GATEWAY                    │    │
│  │  /api/pipeline/*   /api/sections/*   /api/health            │    │
│  │  Rate Limit · CORS · Helmet · Multer · Zod Validation       │    │
│  └─────────────────────────┬───────────────────────────────────┘    │
│                            │                                        │
│  ┌─────────────────────────▼───────────────────────────────────┐    │
│  │                 WORKFLOW ENGINE (Custom)                      │    │
│  │                                                              │    │
│  │   ┌─────────┐   ┌─────────┐   ┌──────────┐   ┌─────────┐  │    │
│  │   │ Upload  │──▶│ Extract │──▶│ Research │──▶│  Draft  │──┐│    │
│  │   │  Step   │   │  Step   │   │   Step   │   │  Step   │  ││    │
│  │   └─────────┘   └─────────┘   └──────────┘   └─────────┘  ││    │
│  │                                                        │   ││    │
│  │                                              ┌─────────▼┐  ││    │
│  │                              SSE Events ◄────│  Save    │◄─┘│    │
│  │                                              │  Output  │   │    │
│  │                                              └──────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                            │                                        │
│  ┌─────────────────────────┴───────────────────────────────────┐    │
│  │                      AGENT LAYER                             │    │
│  │                                                              │    │
│  │  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │    │
│  │  │   EXTRACTOR    │  │   RESEARCHER   │  │   DRAFTER    │  │    │
│  │  │                │  │                │  │              │  │    │
│  │  │ GPT-4o Vision  │  │ Hybrid Search  │  │ GPT-4o Chat  │  │    │
│  │  │ PDF → JSON     │  │ IPC→BNS Map    │  │ Template     │  │    │
│  │  │ OCR + Entity   │  │ Precedent      │  │ .docx Gen    │  │    │
│  │  │ Extraction     │  │ Lookup         │  │              │  │    │
│  │  └───────┬────────┘  └───────┬────────┘  └──────┬───────┘  │    │
│  └──────────┼───────────────────┼───────────────────┼──────────┘    │
│             │                   │                   │               │
│  ┌──────────┴───────────────────┴───────────────────┴──────────┐    │
│  │                     SERVICE LAYER                            │    │
│  │                                                              │    │
│  │  ┌──────────┐ ┌──────────────┐ ┌─────────┐ ┌────────────┐  │    │
│  │  │  OpenAI  │ │Hybrid Search │ │Reranker │ │  DocGen    │  │    │
│  │  │ Service  │ │   Service    │ │ Service │ │  Service   │  │    │
│  │  │          │ │              │ │         │ │            │  │    │
│  │  │ chat()   │ │ pgvector +   │ │ GPT-4o  │ │ .docx via  │  │    │
│  │  │ vision() │ │ BM25 + RRF + │ │ scoring │ │ docx npm   │  │    │
│  │  │ embed()  │ │ Rerank       │ │ 0-10    │ │ package    │  │    │
│  │  └──────────┘ └──────────────┘ └─────────┘ └────────────┘  │    │
│  │  ┌──────────┐ ┌──────────────┐ ┌──────────────────────┐    │    │
│  │  │ Storage  │ │   BM25       │ │   Database Service   │    │    │
│  │  │ Service  │ │   Service    │ │   (Prisma + pgvector)│    │    │
│  │  │ fs/S3    │ │   in-memory  │ │                      │    │    │
│  │  └──────────┘ └──────────────┘ └──────────┬───────────┘    │    │
│  └───────────────────────────────────────────┼────────────────┘    │
│                                              │                      │
│                      BACKEND (Express + TypeScript)                 │
└──────────────────────────────────────────────┼──────────────────────┘
                                               │
                     ┌─────────────────────────┼──────────────────┐
                     │            PostgreSQL + pgvector            │
                     │                                            │
                     │  ┌────────────┐  ┌───────────────────┐    │
                     │  │    Acts    │  │  statute_sections  │    │
                     │  │ BNS,BNSS, │──│  + vector(1536)    │    │
                     │  │ BSA       │  │  + ingredients     │    │
                     │  └────────────┘  │  + punishment      │    │
                     │                  └─────────┬─────────┘    │
                     │                            │               │
                     │  ┌────────────┐  ┌─────────▼─────────┐    │
                     │  │ipc_mappings│  │   precedents      │    │
                     │  │ IPC → BNS  │──│  + vector(1536)   │    │
                     │  │ lookup     │  │  + ratio          │    │
                     │  └────────────┘  │  + citation       │    │
                     │                  └───────────────────┘    │
                     │                                            │
                     │  ┌────────────────────────────────────┐    │
                     │  │         pipeline_runs              │    │
                     │  │  + extracted_fir (JSONB)           │    │
                     │  │  + legal_memo (JSONB)              │    │
                     │  │  + steps[] (JSONB)                 │    │
                     │  │  → generated_documents             │    │
                     │  └────────────────────────────────────┘    │
                     └────────────────────────────────────────────┘
```

---

## 2. Data Flow — Full Pipeline

```
   FIR (PDF/JPG)
       │
       ▼
  ┌─────────────────────────────────────────────────────────┐
  │  STEP 1: UPLOAD                                         │
  │  • Validate MIME type (PDF, JPG, PNG)                   │
  │  • Save to disk (./uploads/)                            │
  │  • Create PipelineRun record in Postgres                │
  │  Output: { fileBuffer, filePath, runId }                │
  └──────────────────────┬──────────────────────────────────┘
                         │
                         ▼
  ┌─────────────────────────────────────────────────────────┐
  │  STEP 2: EXTRACT (Agent 1 — Fact Extractor)             │
  │                                                         │
  │  if (PDF with text) → extract text → GPT-4o chat        │
  │  if (PDF scanned / Image) → GPT-4o Vision               │
  │                                                         │
  │  Prompt: "Extract FIR number, accused, victim, IO,      │
  │           sections, brief facts as strict JSON"          │
  │                                                         │
  │  Output: ExtractedFIR {                                 │
  │    firNumber, date, policeStation, district,             │
  │    accused[], victim, ioName, sectionsRaw[],             │
  │    briefFacts, rawText, confidence (0-1)                 │
  │  }                                                      │
  │                                                         │
  │  Validation: confidence >= 0.3, FIR# or facts present   │
  └──────────────────────┬──────────────────────────────────┘
                         │
                         ▼
  ┌─────────────────────────────────────────────────────────┐
  │  STEP 3: RESEARCH (Agent 2 — Legal Researcher)          │
  │                                                         │
  │  ┌─── IPC Detection ───────────────────────────────┐    │
  │  │ Regex scan sectionsRaw[] for "IPC xxx"           │    │
  │  │ Lookup ipc_mappings table → get BNS equivalents  │    │
  │  └─────────────────────────────────────────────────┘    │
  │                                                         │
  │  ┌─── Hybrid Search ──────────────────────────────┐     │
  │  │                                                │     │
  │  │  briefFacts ──┬──▶ pgvector (cosine) ──┐       │     │
  │  │               │                        ├─ RRF  │     │
  │  │               └──▶ BM25 (keyword) ─────┘   │   │     │
  │  │                                            │   │     │
  │  │                              Rerank (GPT-4o score    │
  │  │                              each candidate 0-10)    │
  │  │                                            │   │     │
  │  │                                    Top 3 sections    │
  │  └────────────────────────────────────────────┘   │     │
  │                                                   │     │
  │  ┌─── Precedent Search ──────────────────────┐    │     │
  │  │ Embed: sections + facts context            │    │     │
  │  │ pgvector query on precedents table         │    │     │
  │  │ Filter: bail_relevant = true               │    │     │
  │  │ Return top 3-5 landmark cases              │    │     │
  │  └────────────────────────────────────────────┘    │     │
  │                                                         │
  │  ┌─── GPT-4o Synthesis ────────────────────────────┐    │
  │  │ Input: facts + sections + precedents             │    │
  │  │ Output: ingredients[], bailability, riskAssess   │    │
  │  │ GROUNDED: only cite sections/cases from DB       │    │
  │  └─────────────────────────────────────────────────┘    │
  │                                                         │
  │  Output: LegalMemo {                                    │
  │    applicableSections[], mappedSections[],               │
  │    ingredients[], precedents[],                          │
  │    bailability, riskAssessment                           │
  │  }                                                      │
  └──────────────────────┬──────────────────────────────────┘
                         │
                         ▼
  ┌─────────────────────────────────────────────────────────┐
  │  STEP 4: DRAFT (Agent 3 — Legal Drafter)                │
  │                                                         │
  │  Input: ExtractedFIR + LegalMemo                        │
  │                                                         │
  │  GPT-4o generates bail application with:                │
  │    1. Introduction (applicant, FIR, relief sought)      │
  │    2. Brief Facts (from FIR — no invention)             │
  │    3. Grounds for Bail (5-7 arguments)                  │
  │    4. Legal Arguments (cite sections + precedents)      │
  │    5. Prayer (formal bail request)                      │
  │                                                         │
  │  Anti-Hallucination Checks:                             │
  │    • Every section cited must exist in LegalMemo        │
  │    • Every case cited must exist in LegalMemo           │
  │    • All facts must come from ExtractedFIR              │
  │                                                         │
  │  Output: { markdown, BailDraftSections }                │
  └──────────────────────┬──────────────────────────────────┘
                         │
                         ▼
  ┌─────────────────────────────────────────────────────────┐
  │  STEP 5: SAVE OUTPUT                                    │
  │                                                         │
  │  BailDraftSections → docx npm package → .docx file      │
  │                                                         │
  │  Formatting:                                            │
  │    • Times New Roman, legal margins                     │
  │    • Proper court heading                               │
  │    • Numbered grounds (roman numerals)                  │
  │    • Signature block                                    │
  │                                                         │
  │  Save: ./output/bail-application-{runId}.docx           │
  │  Record: generated_documents table                      │
  │  Update: pipeline_runs.status = COMPLETED               │
  │                                                         │
  │  Output: { docxPath, docxFileName }                     │
  └─────────────────────────────────────────────────────────┘
```

---

## 3. Hybrid Search Architecture (Detail)

```
  Query: "accused stole vehicle under threat of violence"
                    │
    ┌───────────────┴────────────────┐
    │                                │
    ▼                                ▼
 ┌──────────────────┐    ┌──────────────────┐
 │ VECTOR SEARCH    │    │ BM25 SEARCH      │
 │ (pgvector)       │    │ (in-memory)      │
 │                  │    │                  │
 │ 1. Embed query   │    │ 1. Tokenize      │
 │    via OpenAI    │    │ 2. IDF scoring   │
 │ 2. Cosine dist   │    │ 3. TF-IDF rank  │
 │    on statute_   │    │                  │
 │    sections      │    │                  │
 │ 3. Top 10        │    │ 3. Top 10        │
 └────────┬─────────┘    └────────┬─────────┘
          │                       │
          └───────────┬───────────┘
                      │
              ┌───────▼────────┐
              │  EXACT MATCH   │
              │  DETECTION     │
              │                │
              │ Regex: "Section│
              │  \d+" → direct │
              │  DB lookup     │
              │ Score: 1.0     │
              └───────┬────────┘
                      │
              ┌───────▼────────┐
              │  RECIPROCAL    │
              │  RANK FUSION   │
              │                │
              │ RRF(r) = 1/    │
              │  (k + rank)    │
              │                │
              │ Exact: 2x boost│
              │ Merge + dedup  │
              └───────┬────────┘
                      │
              ┌───────▼────────┐
              │  RERANKER      │
              │  (GPT-4o)      │
              │                │
              │ Score each     │
              │ candidate 0-10 │
              │ for relevance  │
              │ to the query   │
              │                │
              │ Return top 3   │
              └───────┬────────┘
                      │
                      ▼
              Top 3 StatuteSections
              (with relevance scores)
```

---

## 4. Database Schema (Entity Relationship)

```
  ┌──────────┐         ┌───────────────────┐
  │   acts   │────────▶│    chapters       │
  │          │ 1    N  │                   │
  │ id       │         │ id                │
  │ code     │         │ act_id (FK)       │
  │ fullName │         │ number            │
  │ year     │         │ title             │
  └──────┬───┘         └────────┬──────────┘
         │                      │
         │ 1                    │ 1
         │                      │
         ▼ N                    ▼ N
  ┌──────────────────────────────────────┐
  │         statute_sections              │
  │                                      │
  │ id                                   │
  │ act_id (FK → acts)                   │
  │ act_type (BNS | BNSS | BSA)         │
  │ chapter_id (FK → chapters)           │
  │ section_number                       │
  │ title                                │
  │ description                          │
  │ offence_type (cognizable | non-)     │
  │ bailable (bool)                      │
  │ compoundable (bool)                  │
  │ punishment                           │
  │ min_punishment                       │
  │ max_punishment                       │
  │ ingredients[]                        │
  │ keywords[]                           │
  │ exceptions[]                         │
  │ explanation                          │
  │ embedding vector(1536)  ◄── pgvector │
  │                                      │
  │ UNIQUE(act_type, section_number)     │
  └──────────┬────────┬──────────────────┘
             │        │
             │        │ N
             │        ▼ 1
             │  ┌─────────────────────┐
             │  │    ipc_mappings     │
             │  │                     │
             │  │ ipc_section (unique)│
             │  │ ipc_title           │
             │  │ bns_section         │
             │  │ bns_title           │
             │  │ bns_section_id (FK) │───▶ statute_sections
             │  │ change_type (enum)  │
             │  │ notes               │
             │  └─────────────────────┘
             │
             │ M:N via precedent_sections
             │
  ┌──────────▼───────────────────────────┐
  │       precedent_sections (join)       │
  │                                      │
  │ precedent_id (FK)                    │
  │ section_id (FK)                      │
  │ relevance                            │
  │ UNIQUE(precedent_id, section_id)     │
  └──────────┬───────────────────────────┘
             │
             ▼
  ┌──────────────────────────────────────┐
  │            precedents                 │
  │                                      │
  │ id                                   │
  │ case_title                           │
  │ citation (unique)                    │
  │ court                                │
  │ bench                                │
  │ year                                 │
  │ ratio                                │
  │ summary                              │
  │ headnotes                            │
  │ tags[]                               │
  │ bail_relevant (bool)                 │
  │ embedding vector(1536) ◄── pgvector  │
  └──────────────────────────────────────┘


  ┌──────────────────────────────────────┐
  │          pipeline_runs                │
  │                                      │
  │ id                                   │
  │ status (pending|running|completed|   │
  │         failed)                      │
  │ file_name                            │
  │ mime_type                            │
  │ upload_path                          │
  │ extracted_fir (JSONB)                │
  │ legal_memo (JSONB)                   │
  │ draft_markdown                       │
  │ docx_path                            │
  │ steps[] (JSONB)                      │
  │ current_step                         │
  │ total_duration_ms                    │
  │ error                                │
  └──────────┬───────────────────────────┘
             │ 1
             ▼ N
  ┌──────────────────────────────────────┐
  │       generated_documents             │
  │                                      │
  │ pipeline_run_id (FK)                 │
  │ doc_type (bail_app | memo | extract) │
  │ file_path                            │
  │ file_size                            │
  │ mime_type                            │
  └──────────────────────────────────────┘
```

---

## 5. API Surface

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/pipeline/run` | Upload FIR + start full pipeline (returns runId) |
| `GET` | `/api/pipeline/:id/stream` | SSE event stream for live pipeline progress |
| `GET` | `/api/pipeline/:id/result` | Get completed pipeline result (FIR + memo + draft) |
| `GET` | `/api/pipeline/:id/download` | Download generated .docx file |
| `GET` | `/api/pipeline` | List past pipeline runs (paginated) |
| `GET` | `/api/sections/search?q=&act=&limit=` | Search statute sections |
| `GET` | `/api/sections/:act/:number` | Lookup specific section (e.g., `/bns/101`) |
| `GET` | `/api/sections/ipc/:section` | IPC to BNS mapping lookup |
| `GET` | `/api/sections/stats` | Section/mapping/precedent counts |
| `GET` | `/api/health` | Health check (DB + OpenAI status) |

---

## 6. Frontend Routes

| Route | View | Description |
|-------|------|-------------|
| `/` | HomeView | Upload FIR, start pipeline |
| `/pipeline/:id` | PipelineView | Live step-by-step progress (SSE) |
| `/draft/:id` | DraftView | Preview draft, view FIR/memo, download .docx |
| `/history` | HistoryView | Past pipeline runs with status |
| `/sections` | SectionsView | Search and browse BNS/BNSS/BSA sections |

---

## 7. Workflow Engine Design

```
WorkflowEngine
  │
  ├── addStep(step)           Add a typed step to the pipeline
  ├── run(input, options)     Execute all steps sequentially
  │     │
  │     ├── Per step:
  │     │   ├── emit("step:start")
  │     │   ├── executeWithRetry(step, input, ctx)
  │     │   │     └── executeWithTimeout()
  │     │   ├── step.validate(output)?
  │     │   ├── emit("step:complete")
  │     │   └── on error:
  │     │       ├── step.onError() → recovery?
  │     │       └── emit("step:error") → throw
  │     │
  │     └── emit("pipeline:complete")
  │
  └── Features:
      ├── Per-step retries with exponential backoff
      ├── Per-step timeouts
      ├── Output validation per step
      ├── Error recovery callbacks
      ├── SSE event emission for real-time UI
      └── Context object with getStepOutput() for cross-step access
```

---

## 8. Anti-Hallucination Strategy

```
  ┌─────────────────────────────────────────────────────────┐
  │                  GROUNDING LAYERS                        │
  │                                                         │
  │  Layer 1: DATA GROUNDING                                │
  │  ├── Every section in LegalMemo comes from Postgres     │
  │  ├── Every precedent comes from Postgres                │
  │  └── IPC→BNS mappings from verified lookup table        │
  │                                                         │
  │  Layer 2: PROMPT GROUNDING                              │
  │  ├── Agents receive ONLY verified data in prompts       │
  │  ├── Explicit instruction: "ONLY cite provided data"    │
  │  └── JSON mode forces structured output                 │
  │                                                         │
  │  Layer 3: VALIDATION                                    │
  │  ├── ResearcherAgent.validateMemo():                    │
  │  │   └── Remove sections not in knownSections set       │
  │  ├── DrafterAgent.validateDraft():                      │
  │  │   ├── Regex scan for section references              │
  │  │   └── Flag any section not in LegalMemo              │
  │  └── WorkflowStep.validate():                           │
  │      └── Structural checks (min length, required fields)│
  │                                                         │
  │  Layer 4: DETERMINISTIC OVERRIDE                        │
  │  ├── Bailability computed from DB data, not LLM         │
  │  ├── Section data always from DB, never from LLM output │
  │  └── Precedents filtered to only DB-stored entries      │
  └─────────────────────────────────────────────────────────┘
```

---

## 9. Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Language** | TypeScript (strict) | Type safety across full stack |
| **Backend** | Express.js | Battle-tested, large ecosystem |
| **Frontend** | Vue 3 + Vite + Tailwind | Reactive, fast dev, clean UI |
| **Database** | PostgreSQL + pgvector | Single DB for relational data AND vectors |
| **ORM** | Prisma | Type-safe queries, migrations, schema-first |
| **LLM** | OpenAI GPT-4o | Vision OCR + chat + structured output |
| **Embeddings** | text-embedding-3-small (1536d) | Fast, accurate, stored in pgvector |
| **Keyword Search** | Custom BM25 (in-memory) | Exact statutory reference matching |
| **Doc Generation** | docx npm package | Native .docx without LibreOffice |
| **Validation** | Zod | Runtime type checking for API + LLM output |
| **Logging** | Pino | Structured JSON logging |
| **State** | Pinia | Vue state management |
| **Real-time** | Server-Sent Events (SSE) | Pipeline progress streaming |

---

## 10. File Structure

```
leximini/
├── backend/                          # Express.js API Server
│   ├── prisma/
│   │   ├── schema.prisma             # 8 models, pgvector, enums
│   │   └── seed.ts                   # Seed Acts + Chapters
│   ├── scripts/
│   │   ├── ingest-statutes.ts        # BNS/BNSS/BSA → Postgres + embeddings
│   │   └── ingest-precedents.ts      # Cases → Postgres + embeddings
│   ├── src/
│   │   ├── agents/
│   │   │   ├── extractor.agent.ts    # GPT-4o Vision → ExtractedFIR
│   │   │   ├── researcher.agent.ts   # Hybrid RAG → LegalMemo
│   │   │   └── drafter.agent.ts      # GPT-4o → Bail Draft → .docx
│   │   ├── config/
│   │   │   ├── env.ts                # Zod-validated environment
│   │   │   └── constants.ts          # App-wide constants
│   │   ├── core/
│   │   │   ├── workflow-engine.ts     # Generic step runner
│   │   │   └── workflow-types.ts      # Step, Context, Event types
│   │   ├── data/                      # JSON data (seeded later)
│   │   │   ├── statutes/{bns,bnss,bsa}.json
│   │   │   ├── mapper/ipc-to-bns.json
│   │   │   └── precedents/landmark-cases.json
│   │   ├── middleware/
│   │   │   ├── error-handler.ts       # Global error + 404
│   │   │   ├── upload.ts              # Multer config
│   │   │   └── validate.ts            # Zod request validation
│   │   ├── routes/
│   │   │   ├── health.routes.ts       # /api/health
│   │   │   ├── pipeline.routes.ts     # /api/pipeline/* + SSE
│   │   │   └── sections.routes.ts     # /api/sections/*
│   │   ├── services/
│   │   │   ├── openai.service.ts      # Chat, Vision, Embeddings
│   │   │   ├── database.service.ts    # Prisma + pgvector queries
│   │   │   ├── bm25.service.ts        # Keyword search engine
│   │   │   ├── hybrid-search.service.ts # Vector + BM25 + Rerank
│   │   │   ├── reranker.service.ts    # GPT-4o cross-encoder
│   │   │   ├── docgen.service.ts      # .docx generation
│   │   │   └── storage.service.ts     # File storage (local/S3)
│   │   ├── types/                     # Full TypeScript type system
│   │   ├── utils/                     # Logger, retry, PDF utils
│   │   ├── workflows/
│   │   │   ├── bail-application.workflow.ts
│   │   │   └── steps/                 # 5 pipeline steps
│   │   └── index.ts                   # Express entry point
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                          # Vue 3 + Vite SPA
│   ├── src/
│   │   ├── views/                     # 5 page views
│   │   ├── components/                # FileUploader, StepProgress
│   │   ├── composables/               # useApi, usePipeline, useUpload
│   │   ├── stores/                    # Pinia stores
│   │   └── router/                    # Vue Router
│   ├── package.json
│   └── vite.config.ts
│
├── .gitignore
└── ARCHITECTURE.md                    # This file
```

---

## 11. Future Roadmap

### Phase 2: Enhanced Legal Intelligence (Q3 2026)

```
  ┌─────────────────────────────────────────────────────────┐
  │  MULTI-DOCUMENT SUPPORT                                  │
  │                                                         │
  │  Current: FIR only                                      │
  │  Future:                                                │
  │    ├── Chargesheet parsing                              │
  │    ├── Previous court orders (bail rejection analysis)  │
  │    ├── Witness statements                               │
  │    ├── Custody applications                             │
  │    └── Anticipatory bail applications                   │
  └─────────────────────────────────────────────────────────┘
```

```
  ┌─────────────────────────────────────────────────────────┐
  │  ADVANCED RAG                                            │
  │                                                         │
  │  Current: pgvector + BM25 + GPT-4o rerank               │
  │  Future:                                                │
  │    ├── Dedicated cross-encoder model (BGE-Reranker)     │
  │    │   → Faster + cheaper than GPT-4o for reranking     │
  │    ├── Contextual chunk retrieval (parent-child chunks)  │
  │    ├── Query decomposition for complex legal queries     │
  │    ├── Full Indian case law corpus (100K+ cases)        │
  │    └── High Court / Supreme Court specific indices       │
  └─────────────────────────────────────────────────────────┘
```

### Phase 3: Agentic Workflows (Q4 2026)

```
  ┌─────────────────────────────────────────────────────────┐
  │  SELF-CORRECTING AGENT LOOP                              │
  │                                                         │
  │  Current: Linear pipeline (A → B → C → D → E)          │
  │  Future:                                                │
  │                                                         │
  │   ┌──────────┐    ┌──────────┐    ┌──────────┐         │
  │   │ Extract  │───▶│ Research │───▶│  Draft   │         │
  │   └──────────┘    └────┬─────┘    └────┬─────┘         │
  │        ▲               │               │                │
  │        │               │     ┌─────────▼─────────┐     │
  │        │               │     │    REVIEWER        │     │
  │        │               │     │    (New Agent)     │     │
  │        │               │     │                    │     │
  │        │               │     │ Checks:            │     │
  │        │               │     │ • All facts cited? │     │
  │        └───────────────┤     │ • Sections match?  │     │
  │         "need more     │     │ • Arguments strong?│     │
  │          sections"     │     │ • Format correct?  │     │
  │                        │     └─────────┬──────────┘     │
  │                        │               │                │
  │                        │        pass ──┤── fail         │
  │                        │               │                │
  │                        └───────────────┘                │
  │                        "redo research                   │
  │                         for section X"                  │
  │                                                         │
  │  Implementation: LangGraph.js or custom cycle support   │
  │  in WorkflowEngine (add goto/branch/loop primitives)    │
  └─────────────────────────────────────────────────────────┘
```

### Phase 4: Multi-Language + Court Variants (Q1 2027)

```
  ┌─────────────────────────────────────────────────────────┐
  │  LANGUAGE & JURISDICTION EXPANSION                       │
  │                                                         │
  │  Languages:                                             │
  │    ├── Hindi FIR input (already works via GPT-4o)       │
  │    ├── Hindi draft output                               │
  │    ├── Marathi, Tamil, Telugu, Bengali FIR support       │
  │    └── Bilingual drafts (English + regional)            │
  │                                                         │
  │  Court-Specific Templates:                              │
  │    ├── Sessions Court bail application                  │
  │    ├── High Court bail application (different format)   │
  │    ├── Supreme Court SLP (Special Leave Petition)       │
  │    ├── Anticipatory bail (Section 482 BNSS)             │
  │    ├── Default bail (Section 187 BNSS)                  │
  │    └── Interim bail                                     │
  │                                                         │
  │  Implementation: Template registry + court-specific      │
  │  prompt chains                                          │
  └─────────────────────────────────────────────────────────┘
```

### Phase 5: Platform Scale (Q2-Q3 2027)

```
  ┌─────────────────────────────────────────────────────────┐
  │  INFRASTRUCTURE SCALE-UP                                 │
  │                                                         │
  │  Authentication:                                        │
  │    ├── Clerk / Auth.js for lawyer login                 │
  │    ├── Role-based access (lawyer, admin, reviewer)      │
  │    └── API key management for integrations              │
  │                                                         │
  │  Queue System:                                          │
  │    ├── BullMQ / Redis for pipeline job queue            │
  │    ├── Concurrent pipeline runs                         │
  │    └── Priority queue (paid users first)                │
  │                                                         │
  │  Storage:                                               │
  │    ├── StorageService → swap local FS to AWS S3         │
  │    ├── CDN for generated documents                      │
  │    └── Document versioning                              │
  │                                                         │
  │  Database:                                              │
  │    ├── Read replicas for search-heavy queries           │
  │    ├── Connection pooling (PgBouncer)                   │
  │    └── HNSW index tuning for pgvector at scale          │
  │                                                         │
  │  Deployment:                                            │
  │    ├── Docker Compose (dev)                             │
  │    ├── Kubernetes (prod)                                │
  │    ├── CI/CD via GitHub Actions                         │
  │    └── Monitoring: Grafana + Prometheus + Sentry        │
  │                                                         │
  │  Billing:                                               │
  │    ├── Stripe integration                               │
  │    ├── Per-generation pricing                           │
  │    └── Subscription tiers                               │
  └─────────────────────────────────────────────────────────┘
```

### Phase 6: AI Improvements (Ongoing)

```
  ┌─────────────────────────────────────────────────────────┐
  │  MODEL & AI ENHANCEMENTS                                 │
  │                                                         │
  │  Fine-tuning:                                           │
  │    ├── Fine-tune GPT-4o on Indian legal FIR corpus      │
  │    ├── Fine-tune extraction model for Hindi handwriting  │
  │    └── Fine-tune drafter on accepted bail applications   │
  │                                                         │
  │  Evaluation:                                            │
  │    ├── Automated evals: section mapping accuracy         │
  │    ├── Lawyer review scoring (1-5 usability)            │
  │    ├── Hallucination detection rate                     │
  │    └── A/B testing for prompt strategies                 │
  │                                                         │
  │  Multi-model:                                           │
  │    ├── Claude for drafting (better legal writing)       │
  │    ├── Gemini for OCR (longer context for big FIRs)     │
  │    ├── Local models for embeddings (cost reduction)     │
  │    └── Model router: pick best model per task           │
  │                                                         │
  │  Caching:                                               │
  │    ├── Redis cache for embeddings                       │
  │    ├── Cache common section lookups                     │
  │    └── Deduplicate identical FIR re-runs                │
  └─────────────────────────────────────────────────────────┘
```

---

## 12. Scalability Hooks Already Built In

| What | Where | How it scales |
|------|-------|---------------|
| **Storage** | `storage.service.ts` | Abstract FS ops → swap to S3 |
| **Workflow** | `workflow-engine.ts` | Add steps, retries, branching |
| **Templates** | `bail-application.template.ts` | Add new doc types (chargesheet, SLP) |
| **Search** | `hybrid-search.service.ts` | Add more retrieval sources |
| **Database** | Prisma + pgvector | Schema migrations, read replicas |
| **API** | Express routes | Add auth middleware, versioning |
| **Agents** | Plain TS functions | Swap LLM, add reviewer agent |
| **Events** | SSE via WorkflowEngine | Swap to WebSockets or Redis pub/sub |

---

## 13. Getting Started

```bash
# Prerequisites: Node 20+, PostgreSQL 16+ with pgvector extension

# Backend
cd backend
npm install
cp .env.example .env        # Fill OPENAI_API_KEY + DATABASE_URL
npx prisma db push           # Create all tables + pgvector
npm run db:seed              # Seed Acts + Chapters
npm run dev                  # → http://localhost:3001

# Frontend
cd frontend
npm install
npm run dev                  # → http://localhost:5173

# Seed legal data (when JSON files are populated)
cd backend
npm run ingest:statutes      # BNS/BNSS/BSA → Postgres + vectors
npm run ingest:precedents    # Case law → Postgres + vectors
```
