# Pipeline Flow — FIR → Bail Application (legacy demo)

This document walks through one **full FIR → Bail** run: every step, every artifact, every error path. It corresponds 1:1 to:

- `backend/src/workflows/bail-application.workflow.ts`
- `backend/src/workflows/steps/{upload,extract,research,draft,save-output}.step.ts`
- `backend/src/routes/pipeline.routes.ts`
- `frontend/src/composables/usePipeline.ts`
- `frontend/src/views/{HomeView,PipelineView,DraftView}.vue`

> The newer **ChatView + Studio Actions** path runs the *same* researcher → drafterFactory → save sequence inside `chat.service.ts`; only the entry trigger differs (a `@command` instead of a file POST). See [Backend / Services](../backend/04-services.md) → `chat.service.ts`.

---

## 1. High-level

```
   ┌────────────────────────────────────────────────────────────────┐
   │                          CLIENT                                │
   │                                                                │
   │   HomeView.vue                                                 │
   │     ⇣ user drops FIR (PDF/JPG/PNG)                             │
   │   useUpload.ts validates                                       │
   │   useUpload + usePipeline.start(file)                          │
   │     ↓ POST /api/pipeline/run  (multipart "file")               │
   │                                                                │
   │  ←─ { runId, streamUrl }                                       │
   │     ↓                                                          │
   │   navigate /pipeline/:runId                                    │
   │   PipelineView.vue subscribes via EventSource(streamUrl)       │
   │     ↓ live SSE events update StepProgress                      │
   │  ⇣ on "pipeline:complete" → router.push(`/draft/${id}`)       │
   │                                                                │
   │   DraftView.vue → GET /api/pipeline/:id/result                 │
   │   (tabs: Draft Preview · Extracted FIR · Legal Memo)           │
   │   download → /api/pipeline/:id/download                        │
   └────────────────────────────────────────────────────────────────┘
                              ▲      ▼
─────────────────────── HTTP + SSE ────────────────────────
                              │
   ┌────────────────────────────────────────────────────────────────┐
   │                          SERVER                                │
   │                                                                │
   │   pipeline.routes.ts                                           │
   │     POST /run → multer parses file                             │
   │       → reply { runId, streamUrl } immediately                 │
   │       → setImmediate(runBailPipeline(...))                     │
   │     GET  /:id/stream → SSE Response, kept open                 │
   │     GET  /:id/result → DB row                                  │
   │     GET  /:id/download → DOCX from disk                        │
   │                                                                │
   │   runBailPipeline ─┐                                           │
   │                    │ (workflow-engine.ts)                      │
   │                    ▼                                           │
   │   ┌────────────┬────────────┬────────────┬────────────┬─────┐  │
   │   │  upload    │ extract    │ research   │  draft     │save │  │
   │   │  step      │ step       │ step       │  step      │step │  │
   │   └────────────┴────────────┴────────────┴────────────┴─────┘  │
   │      validate · retries · timeouts · emit() SSE                │
   └────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                       PostgreSQL + pgvector
                       PipelineRun (status: pending → running → completed/failed)
                       GeneratedDocument (one per run)
```

---

## 2. Step-by-step contract

Each step is a typed `WorkflowStep<TInput, TOutput>` with optional `validate`, `onError`, `retries`, and `timeout`.

### Step 1 — `upload.step.ts`

| Field | Value |
|-------|-------|
| Input | `{ fileBuffer, fileName, mimeType }` |
| Validates | MIME ∈ `SUPPORTED_MIME_TYPES` (pdf, jpg, png) |
| Side effects | `storageService.saveUpload()` writes `{uuid}.{ext}` to `./uploads/`. Creates a `PipelineRun(status=PENDING)` row. |
| Output | `{ runId, filePath, fileBuffer, mimeType }` |
| Validate (post) | `!!filePath && !!fileBuffer` |
| Timeout / retries | none |
| Error recovery | none (terminal) |

### Step 2 — `extract.step.ts`

| Field | Value |
|-------|-------|
| Input | `UploadOutput` |
| Calls | `extractorAgent.extract(buffer, mimeType)` |
| Vision/text routing | digital PDF → `pdf-parse` → GPT-4o text chat. Scanned PDF / image → GPT-4o **Vision** with `detail: "high"`. |
| Prompt rules | strict JSON, `temperature: 0.1`, max 4096 tokens, "no hallucination" guard. |
| Validates | `confidence ≥ 0.3` AND (`firNumber` OR `briefFacts`) present. |
| Side effects | persist `extractedData` JSON, `currentStep="extract"` on `PipelineRun`. |
| Output | `ExtractedFIR` with `confidence`, `warnings[]`. |
| Timeout | **120 s** |
| Retries | 1 |

### Step 3 — `research.step.ts`

| Field | Value |
|-------|-------|
| Input | `ExtractOutput` |
| Calls | `researcherAgent.research(fir)` |
| IPC mapping | Regex scan `sectionsRaw[]` for `IPC|Indian Penal Code` + section number → `findIPCMapping()` → join with `statute_sections`. |
| Hybrid search | (a) facts → `hybridSearchService.search()` top 5; (b) explicit `sectionsRaw` → top 1 each. Deduped via `Map<id>`. |
| Precedent search | `vectorSearchPrecedents(embed(sections + facts), bailOnly=true)` top 3-5. |
| Synthesis | GPT-4o chat at `temperature 0.1` with **only** retrieved sections + precedents in the prompt. |
| Bailability rule | DB-side: any bailable + any non-bailable → "mixed"; only bailable → "bailable"; else "non-bailable". |
| Post-validation | `ResearcherAgent.validateMemo()` filters any section the LLM mentioned that wasn't in `knownSections` (set of DB ids). |
| Output | `LegalMemo { applicableSections, mappedSections, ingredients, precedents, bailability, riskAssessment }` |
| Validate | ≥ 1 applicable section. |
| Timeout | **180 s** |
| Retries | 1 |

### Step 4 — `draft.step.ts`

| Field | Value |
|-------|-------|
| Input | `ResearchOutput = { fir, memo }` |
| Calls | `drafterAgent.draft(fir, memo)` |
| Prompt | Builds 5-section bail application: Introduction · Facts · Grounds · Legal Arguments · Prayer. Forbids inventing facts/sections. `temperature: 0.3`, max 8192 tokens. |
| Post-validation | regex `section\s+\d+[a-z]?` over the draft; logs/warns on any reference *not* in `memo.applicableSections`. Warns if `grounds.length < 3`. |
| DOCX | `docgenService.generate(draftSections, fir, memo)` — Times New Roman, justified, roman-numeral grounds, signature block. |
| Output | `{ markdown, sections, docxBuffer }` |
| Validate | markdown ≥ 200 chars, `docxBuffer` non-empty. |
| Timeout | **180 s** |
| Retries | 1 |

### Step 5 — `save-output.step.ts`

| Field | Value |
|-------|-------|
| Input | `DraftOutput` |
| Side effects | `storageService.saveOutput("bail-application", runId, docxBuffer)` writes `./output/bail-application-{runId}.docx`. Updates `PipelineRun` (`status=COMPLETED`, `draftMarkdown`, `docxPath`, `totalDurationMs`, `steps`). Creates a `GeneratedDocument` row. |
| Output | `{ fir, memo, draftMarkdown, docxPath, docxFileName }` |

---

## 3. SSE event timeline

A typical successful run produces the following event stream on `GET /api/pipeline/:id/stream`:

```text
event:  data: {"type":"pipeline:start","data":{"runId":"…","stepCount":5},"timestamp":1715000000000}

event:  data: {"type":"step:start","step":"upload","timestamp":…}
event:  data: {"type":"step:complete","step":"upload","data":{"durationMs":120}}

event:  data: {"type":"step:start","step":"extract"}
event:  data: {"type":"step:progress","step":"extract","message":"Running vision OCR"}
event:  data: {"type":"step:complete","step":"extract","data":{"durationMs":18345,"confidence":0.87}}

event:  data: {"type":"step:start","step":"research"}
event:  data: {"type":"step:progress","step":"research","message":"Hybrid search returned 7 candidates"}
event:  data: {"type":"step:complete","step":"research","data":{"durationMs":12031,"sections":3}}

event:  data: {"type":"step:start","step":"draft"}
event:  data: {"type":"step:complete","step":"draft","data":{"durationMs":21002}}

event:  data: {"type":"step:start","step":"save-output"}
event:  data: {"type":"step:complete","step":"save-output","data":{"docxFileName":"bail-application-….docx"}}

event:  data: {"type":"pipeline:complete","data":{"runId":"…","totalDurationMs":52000}}
```

Errors emit `step:error` then `pipeline:error` and the SSE response closes.

Each event is exactly one JSON object. The connection is tracked in `Map<runId, Response[]>`; clients can disconnect and re-subscribe — they will only receive *future* events (history must be fetched via `/result`).

---

## 4. Anti-hallucination at each layer

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                       GROUNDING LAYERS                           │
  │                                                                  │
  │ 1. DATA GROUNDING                                                │
  │    • Every section / precedent passed to the LLM is a DB row.    │
  │    • IPC→BNS mapping is a verified lookup table.                 │
  │                                                                  │
  │ 2. PROMPT GROUNDING                                              │
  │    • Agents pass *only* verified data in prompts.                │
  │    • Explicit "ONLY cite provided data" instruction.             │
  │    • JSON mode forces structured output.                         │
  │                                                                  │
  │ 3. POST-VALIDATION                                               │
  │    • researcherAgent.validateMemo() removes unknown sections.    │
  │    • drafterAgent.validateDraft() regex-flags rogue sections.    │
  │    • WorkflowStep.validate() enforces structural requirements.   │
  │                                                                  │
  │ 4. DETERMINISTIC OVERRIDE                                        │
  │    • bailability is computed from DB rows, not LLM output.       │
  │    • section details are always pulled from DB (LLM only suggests│
  │      ids — the agent re-loads).                                  │
  └──────────────────────────────────────────────────────────────────┘
```

See [Anti-Hallucination](./07-anti-hallucination.md) for the chat-side counterpart (Citation Validator + Verifier).

---

## 5. Error recovery / partial success

The `WorkflowEngine.executeWithRetry()` policy:

```
attempt n:
  race(
    step.execute(input, ctx),
    timeout(step.timeout || ∞)
  )
  ├─ resolve →
  │     if step.validate?(output) === false → throw (no retry)
  │     emit("step:complete")
  └─ reject  →
        if attempt < retries → sleep(exp-backoff + jitter) → retry
        else if step.onError? → try recovery output (no retry on recovery)
        else → emit("step:error") → throw → emit("pipeline:error")
```

- **Validation errors do not retry** — they almost always indicate a deterministic agent failure.
- **`onError`** receives `(err, input, ctx)` and may return a *recovery output*, which is treated as success. None of the current steps use this hook; it's reserved for the upcoming **reviewer-agent loop** (see [Roadmap Phase 3](../planning/01-roadmap.md)).

---

## 6. Where every artifact ends up

| Artifact | Location | Source |
|----------|----------|--------|
| Uploaded FIR | `backend/uploads/{uuid}.{ext}` (filesystem) | `storageService.saveUpload()` |
| `PipelineRun` row | Postgres (`pipeline_runs`) | created in upload, updated each step |
| `ExtractedFIR` | JSONB in `pipeline_runs.extractedData` | extract step |
| `LegalMemo` | JSONB in `pipeline_runs.legalMemo` | research step |
| Draft markdown | TEXT in `pipeline_runs.draftMarkdown` | draft step |
| `.docx` | `backend/output/bail-application-{runId}.docx` | save-output step |
| `GeneratedDocument` row | Postgres (`generated_documents`) | save-output step |
| Step timings | JSONB[] in `pipeline_runs.steps[]` | engine emits per step |

---

## 7. ChatView path (current main UI)

When a user clicks **Regular Bail** in the right Studio pane:

```
1. Frontend studioStore.executeAction(caseId, action)
   POST /api/cases/:id/messages  (FormData: content="@bail")

2. chat.service.handleMessage()
   ├─ parseCommand("@bail") → { type: "generation", code: "regular_bail" }
   ├─ buildCaseContext(caseId) → assemble docs, sections, history
   ├─ researcherAgent.research(extractedFir-equivalent)
   ├─ drafterFactory.draft("regular_bail", caseData, memo)
   │     └─ drafterRegistry.get("criminal.regular_bail").draft(...)
   ├─ storageService.saveOutput("regular_bail", runId, docxBuffer)
   ├─ prisma.pipelineRun.create({ status: COMPLETED, ... })
   └─ prisma.generatedDocument.create({ ... })

3. Returns a ChatMessage of type GENERATION_CARD with
   { type, runId, status, downloadUrl, markdown }
```

The same researcher and drafter are reused — no duplication of pipeline logic. The Studio path simply *bypasses the workflow engine* (it doesn't need step-by-step SSE since the chat returns the result synchronously).

---

Next: [Data Model](./05-data-model.md).
