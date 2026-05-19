# LexiMini — System Architecture

This document explains the actual current architecture of LexiMini: how data flows, how plugins compose, how the citation system constrains AI output, and how the system scales.

---

## 1. System overview

```
═══════════════════════════════════════════════════════════════════════════════
                                  CLIENT
                          (Vue 3 + Vite + Tailwind)
═══════════════════════════════════════════════════════════════════════════════
                                     │
                  ┌──────────────────┼──────────────────┐
                  ▼                  ▼                  ▼
        ┌──────────────────┬──────────────────┬──────────────────┐
        │  SOURCES PANEL   │   CHAT AREA      │  STUDIO PANEL    │
        │  (uploads, web)  │   (messages)     │  (action cards)  │
        └────────┬─────────┴─────────┬────────┴─────────┬────────┘
                 │                   │                  │
                 │                   ▼                  │
                 │       ┌────────────────────┐         │
                 │       │ CITATION PREVIEW   │         │
                 │       │ (slide-in panel)   │         │
                 │       └────────────────────┘         │
                 │                                       │
                 └───────────────┬───────────────────────┘
                                 │
═════════════════════════════════│═════════════════════════════════════════════
                                 │
                          HTTP / SSE / multipart
                                 │
═════════════════════════════════│═════════════════════════════════════════════
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            API GATEWAY (Express)                            │
│  helmet · cors · rate-limit · multer · zod-validate                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  /api/cases             /api/sections      /api/citations                  │
│  /api/cases/:id/sources /api/studio-actions /api/health                    │
│  /api/cases/:id/messages /api/commands     /api/pipeline (legacy)          │
└─────────┬─────────────────────────────────────────────────┬─────────────────┘
          │                                                 │
          ▼                                                 ▼
┌───────────────────────────────────┐  ┌───────────────────────────────────┐
│   ORCHESTRATION LAYER             │  │   PLUGIN BOOTSTRAP                │
│   (chat.service.ts)               │  │   (loaded once at startup)        │
│                                   │  │                                   │
│   handleMessage()                 │  │   DomainRegistry                  │
│     ├─ parse @command             │  │   DrafterRegistry                 │
│     ├─ load case context          │  │   ActRegistry                     │
│     ├─ dispatch to:               │  │   ExtractionRegistry              │
│     │    file → DocumentAnalyzer  │  │                                   │
│     │    @cmd → DrafterFactory    │  │   Auto-discovers from:            │
│     │    text → StrategyAdvisor   │  │     src/domains/<name>/           │
│     └─ persist + return           │  │     src/acts/<domain>/<name>.json │
└───────────┬───────────────────────┘  └─────────────────┬─────────────────┘
            │                                            │
            ▼                                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AGENT LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ DocumentAnalyzer    Classifies + extracts ANY legal doc                    │
│ Researcher          Hybrid search → LegalMemo                              │
│ StrategyAdvisor     Case analysis + grounded chat                          │
│ DomainRouter        Routes query → domain plugin                           │
│ DrafterFactory      Looks up DrafterPlugin via DrafterRegistry             │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CITATION SYSTEM                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   CitationAggregator                                                        │
│     └─ runs in parallel:                                                    │
│           ├─ InternalProvider       (pgvector + BM25)                       │
│           ├─ CaseDocumentProvider   (user's uploaded files)                 │
│           ├─ IndianKanoonProvider   (external API)                          │
│           └─ SCCOnlineProvider      (optional, paid)                        │
│        ↓                                                                    │
│     Reciprocal Rank Fusion + Cross-encoder rerank → top 8                  │
│        ↓                                                                    │
│   CitationValidator                                                         │
│     └─ strips hallucinated cite_X tokens                                    │
│        ↓                                                                    │
│   CitationVerifier                                                          │
│     └─ on-demand deep verification (file exists, excerpt matches…)         │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SERVICE LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ openai.service          Chat, vision, embeddings (with retry)              │
│ database.service        Prisma client + raw pgvector queries               │
│ hybrid-search.service   pgvector + BM25 + RRF + rerank                     │
│ bm25.service            In-memory keyword index                            │
│ reranker.service        LLM cross-encoder                                  │
│ docgen.service          Native .docx generation                            │
│ storage.service         File I/O (uploads/, output/)                       │
│ chat.service            Message routing logic                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  PostgreSQL + pgvector (single DB)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Knowledge Base:   acts, chapters, statute_sections (embedding),            │
│                   precedents (embedding), section_relations,               │
│                   ipc_mappings                                              │
│                                                                             │
│ Case Workspace:   cases, case_documents, chat_messages, pipeline_runs,     │
│                   generated_documents                                       │
│                                                                             │
│ Citation Layer:   citations, citation_cache                                 │
│                                                                             │
│ Plugin Layer:     legal_domains, registered_document_types,                │
│                   studio_actions, chat_commands                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       EXTERNAL DATA SOURCES (on demand)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ IndiaCode.nic.in           Bare Acts (one-time scrape via Bedrock)         │
│ Indian Kanoon API          5M+ judgments (live, cached 1h)                  │
│ SCC Online API             Premium citations (optional)                     │
│ Government Gazettes        Notifications (planned)                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. End-to-end data flow

### 2.1 Lawyer uploads an FIR

```
USER drags fir.pdf into Sources panel
         │
         ▼
POST /api/cases/:caseId/sources/upload (multipart)
         │
         ▼
sources.routes.ts
   ├─ storageService.saveUpload(buffer, "fir.pdf")
   │     → uploads/abc-123.pdf            (file lives on disk)
   │
   ├─ documentAnalyzerAgent.extract(buffer, mimeType)
   │     ├─ classify → "fir"
   │     └─ extract → { firNumber, accused[], sectionsRaw[], briefFacts, ... }
   │
   ├─ prisma.caseDocument.create({
   │     docType: "FIR",
   │     filePath: "uploads/abc-123.pdf",
   │     extractedData: { ... },           (JSONB)
   │     rawText: "<full OCR text>",
   │     confidence: 0.94,
   │     enabled: true,
   │   })
   │
   └─ return source row to frontend
         │
         ▼
Frontend renders source in SourcesPanel
   ☑ 📄 FIR — fir.pdf — 94% confidence
```

### 2.2 Lawyer types `@bail`

```
POST /api/cases/:caseId/messages
   body: { content: "@bail" }
         │
         ▼
chat.service.ts → handleMessage()
   ├─ parseCommand("@bail") → { type: "regular_bail" }
   ├─ buildCaseContext(caseId) → loads case + docs + chat history
   │
   ├─ (planned) citationAggregator.gather(query, { caseContext, domains })
   │     ├─ InternalProvider:    pgvector search of statute_sections
   │     ├─ CaseDocumentProvider: text search of user's FIR
   │     └─ IndianKanoonProvider: external API search
   │   → returns top 8 CitationCandidates
   │
   ├─ researchCase(caseData) → LegalMemo
   │     ├─ Extract section refs from all uploaded docs
   │     ├─ Map IPC → BNS via ipc_mappings table
   │     ├─ hybridSearchService.search(briefFacts)
   │     │     ├─ pgvector cosine search
   │     │     ├─ BM25 keyword search
   │     │     ├─ Reciprocal Rank Fusion
   │     │     └─ Cross-encoder rerank (GPT-4o)
   │     ├─ vectorSearchPrecedents() with bail_relevant filter
   │     └─ GPT-4o synthesizes memo (ingredients, risk, bailability)
   │
   ├─ drafterFactory.draft("regular_bail", caseData, memo, { citations })
   │     ├─ drafterRegistry.getByDocumentTypeCode("criminal", "regular_bail")
   │     │     → criminal.regular_bail plugin
   │     ├─ plugin.draft({ caseData, memo, citations })
   │     │     ├─ Build prompt with constrained citations
   │     │     ├─ GPT-4o generates section JSON
   │     │     └─ docgenService.generate() → .docx Buffer
   │     └─ return { markdown, sections, docxBuffer, citationIds }
   │
   ├─ (planned) validateCitations(markdown, citationIds)
   │     → strips any hallucinated [^cite_X]
   │
   ├─ storageService.saveOutput(docxBuffer, ...)
   │     → output/bail-application-abc-regular_bail.docx
   │
   ├─ INSERT INTO pipeline_runs (...)
   ├─ INSERT INTO generated_documents (...)
   ├─ INSERT INTO chat_messages (type: GENERATION_CARD, ...)
   ├─ For each cite → INSERT INTO citations (...)
   │
   └─ return GenerationCard JSON to frontend
         │
         ▼
Frontend renders <GenerationCard> in chat thread
   ⚖️ Regular Bail Application       Generated ✓
   📥 Download bail-application.docx
   ✓ 14 verified citations
```

### 2.3 Lawyer clicks `[^cite_3]`

```
MessageBubble parses [^cite_3] → renders <sup data-cite-id="cite_3">[3]</sup>
         │
         │ User clicks
         ▼
citationStore.open("cite_3")
         │
         ▼
GET /api/citations/:id/preview
         │
         ▼
citations.routes.ts
   ├─ SELECT citation + section/precedent/document
   ├─ Build preview JSON:
   │     { sourceType, title, reference, excerptText,
   │       pageNumber, paragraphRef,
   │       pdfUrl: /api/sources/pdf/...#page=N,
   │       sourceUrl: https://indiankanoon.org/doc/123/#para=8 }
   │
   ▼
Frontend <CitationPreview> slides in from right
   ┌───────────────────────────────────────┐
   │ ⚖️ SUPREME COURT          Para 8      │
   │ Sanjay Chandra v. CBI                 │
   │ (2012) 1 SCC 40                       │
   │ ─────────────────────────────────     │
   │ CITED PASSAGE                         │
   │ ┃ "The object of bail is to..."       │
   │ ─────────────────────────────────     │
   │ [Indian Kanoon embedded, Para 8       │
   │  highlighted]                         │
   │ ─────────────────────────────────     │
   │ [Open original on indiankanoon.org →] │
   └───────────────────────────────────────┘
```

---

## 3. Plugin architecture

### 3.1 Three discovery mechanisms

```
1. Domains            src/domains/<name>/domain.config.ts
2. Drafters           src/domains/<name>/drafters/*.drafter.ts
3. Acts               src/acts/<domain>/<name>.act.json
```

At startup, `bootstrapPlugins()` walks these folders and:
1. Loads each plugin into its in-memory registry
2. Syncs domain + document type + chat command + studio action rows to PostgreSQL
3. Frontend then reads from those DB rows via `/api/studio-actions` and `/api/commands`

### 3.2 Plugin contracts

**`DomainPlugin`** — declares a legal practice domain

```typescript
{
  code: string;              // "criminal"
  name: string;              // "Criminal Law"
  routingHints: {
    keywords: string[];      // "bail", "fir", "arrest"
    actReferences: string[]; // "BNS", "BNSS", "CrPC"
    queryPatterns: RegExp[]; // /section\s+\d+\s+bns/i
  };
  documentTypes: DocumentTypeConfig[];
  prerequisiteCheckers?: Record<string, PrerequisiteChecker>;
}
```

**`DrafterPlugin`** — generates one type of document

```typescript
{
  id: string;                  // "criminal.regular_bail"
  domainCode: string;          // "criminal"
  documentTypeCode: string;    // "regular_bail"
  async draft(input): DrafterOutput
}
```

**`ActPlugin`** — describes a piece of legislation

```typescript
{
  code: "BNS",
  name: "Bharatiya Nyaya Sanhita, 2023",
  year: 2023,
  domainCode: "criminal",
  sourcePdfPath: "book/250883_english_01042024.pdf",
  sourceUrl: "https://www.indiacode.nic.in/...",
}
```

### 3.3 Adding a new domain (30 minutes)

```bash
cp -r backend/src/domains/_template backend/src/domains/tax
# edit tax/domain.config.ts: codes, keywords, document types
# write tax/drafters/*.drafter.ts for each document type
# (optional) drop acts/tax/it-act-1961.act.json
npm run dev      # plugin auto-loads
```

**No core code changes. No agent changes. No service changes. No route changes. No frontend deploy.**

The frontend Studio panel automatically displays new domain doc types via `/api/studio-actions`. Chat input automatically picks up new `@commands` via `/api/commands`.

Full guide: [`backend/EXTENSIBILITY.md`](./backend/EXTENSIBILITY.md)

---

## 4. Knowledge base — how data is stored

### 4.1 Single source of truth: Postgres + pgvector

Everything lives in **one database**. No separate vector DB, no separate cache (yet — citation cache is a Postgres table).

```
PostgreSQL                                    Disk
├── acts                                      ├── uploads/
├── chapters                                  │     ├── abc-123.pdf       (raw FIR)
├── statute_sections                          │     └── ...               (one per upload)
│     └── embedding vector(1536)              │
├── precedents                                ├── output/
│     └── embedding vector(1536)              │     ├── bail-app-xyz.docx (generated)
├── section_relations                         │     └── ...
├── ipc_mappings                              │
├── cases                                     └── book/
├── case_documents                                  ├── 250883_english.pdf (BNS gazette)
├── chat_messages                                   ├── BNSS gazette
├── pipeline_runs                                   └── BSA gazette
├── generated_documents
├── citations
├── citation_cache
├── legal_domains
├── registered_document_types
├── studio_actions
└── chat_commands
```

### 4.2 Why one DB

| Reason | Detail |
|--------|--------|
| **Atomicity** | Section + embedding + relations updated in one transaction |
| **No sync issues** | No drift between vector DB and relational DB |
| **Single backup** | `pg_dump` captures everything |
| **Single deploy** | One service to manage, monitor, alert on |
| **Hybrid queries** | `SELECT … WHERE bailable = true ORDER BY embedding <=> :vec` works natively |
| **Cost** | One Postgres instance handles 100K+ nodes easily |

### 4.3 When you'd add a separate vector DB

Only if:
- > 10M embeddings (we're at ~2K)
- Need sub-10ms p99 latency at high QPS
- Want graph algorithms (PageRank, community detection)

For LexiMini's scale (criminal + civil + tax + family + corporate = ~150K nodes max), Postgres + pgvector is the right call. We've documented when to migrate in the audit doc.

---

## 5. Citation system — zero hallucination

The whole moat of LexiMini is "every claim verifiable." This is enforced by **three layers**:

### 5.1 Pre-fetch citations BEFORE the LLM

```
USER QUERY
   ↓
CitationAggregator.gather(query, context)
   ↓
   ├─ InternalProvider       (pgvector + BM25)
   ├─ CaseDocumentProvider   (user's own files)
   ├─ IndianKanoonProvider   (external API)
   └─ SCCOnlineProvider      (premium, optional)
   ↓
Parallel results merged via Reciprocal Rank Fusion
   ↓
GPT-4o cross-encoder reranks top 20 → top 8
   ↓
Each result becomes [^cite_1], [^cite_2], …, [^cite_8]
```

### 5.2 Constrain the LLM to only cite from the list

```typescript
const systemPrompt = `
You are a senior Indian criminal defense lawyer.

AVAILABLE CITATIONS (you may ONLY use these):
[^cite_1] BNSS Section 480, Page 142
[^cite_2] Sanjay Chandra v. CBI (2012) 1 SCC 40, Para 8
…

RULES:
1. EVERY legal claim MUST end with [^cite_N]
2. NEVER invent a citation token
3. If no citation supports a claim, mark it [OPINION] or skip
`;
```

### 5.3 Validate the LLM output before showing to user

```typescript
const validation = validateCitations(
  llmOutput,
  new Set(availableCitations.map(c => `cite_${c.id}`))
);

// validation.cleanedText drops any sentence with a legal claim
// that has no valid citation, AND strips invalid [^cite_X] tokens.
```

**Net result:** If the LLM invents "[^cite_999]", that token is removed. If it makes a legal claim without any citation, that sentence is dropped. The user only sees grounded statements.

### 5.4 Persist citations as evidence

Every used citation gets a row in the `citations` table:

```
citations
├── id
├── message_id            → chat_messages
├── source_type           SECTION | PRECEDENT | DOCUMENT | WEB
├── section_id            → statute_sections (if SECTION)
├── precedent_id          → precedents       (if PRECEDENT)
├── document_id           → case_documents   (if DOCUMENT)
├── page_number, paragraph_ref
├── excerpt_text          ← the actual quoted passage
└── full_source_url       ← clickable link
```

This is what powers the side-panel preview when a lawyer clicks `[1]` in the UI.

---

## 6. Frontend architecture

### 6.1 Three-pane layout (NotebookLM-inspired)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ AppHeader                                                                │
├────────────────┬──────────────────────────────────┬──────────────────────┤
│ SOURCES        │ CHAT                              │ STUDIO              │
│ (340px fixed)  │ (flexible)                        │ (340px fixed)       │
├────────────────┼──────────────────────────────────┼──────────────────────┤
│ AddSourceCard  │ ChatHeader                        │ Audio overview      │
│ WebSearchBar   │ ChatArea (messages)               │ Mind map promo      │
│ SourceItem[]   │ MessageBubble                     │ StudioGrid (draft)  │
│                │   ├─ TextBubble                   │ StudioGrid (analyze)│
│                │   ├─ AnalysisCard                 │ StudioGrid (research)│
│                │   ├─ GenerationCard               │ [+ Add note]        │
│                │   └─ CitationLink (clickable [N]) │                     │
│                │ ChatInput                          │                     │
└────────────────┴──────────────────────────────────┴──────────────────────┘
                                  ↓ click [N]
                        ┌─────────────────────────┐
                        │ CitationPreview         │
                        │ (slide-in from right)   │
                        └─────────────────────────┘
```

### 6.2 State management (Pinia)

```
stores/
├── cases.store.ts       — Sidebar case list
├── chat.store.ts        — Current case's messages
├── sources.store.ts     — Current case's documents (upload, toggle, remove)
├── studio.store.ts      — Available studio actions per domain
└── citation.store.ts    — Currently-previewed citation in the side panel
```

### 6.3 Composables

```
composables/
├── useApi.ts            — Generic fetch wrapper (get/post/uploadFile)
├── useUpload.ts         — Drag-drop + validation
└── usePipeline.ts       — SSE listener (legacy flow)
```

### 6.4 Routing

```
/                        ChatView (no active case)
/case/:id                ChatView (active case)
/sections                SectionsView (statute search)

# Legacy routes (kept for backward compat, may be removed)
/legacy
/pipeline/:id
/draft/:id
/history
```

---

## 7. Database schema (full picture)

```
─── KNOWLEDGE BASE ──────────────────────────────────────

Act ─< Chapter ─< StatuteSection
                    │
                    ├─ embedding vector(1536)
                    ├─ IPCMapping (cross-ref to old IPC)
                    ├─ PrecedentSection (join to precedents)
                    └─ SectionRelation (graph edges:
                          punishes, exception_to, variant_of,
                          procedure_for, evidence_rule_for)

Precedent
   ├─ embedding vector(1536)
   ├─ PrecedentSection (join)
   └─ Citation

─── CASE WORKSPACE ──────────────────────────────────────

Case ─< CaseDocument
     ├─ ChatMessage  (TEXT | FILE_UPLOAD | COMMAND |
     │                ANALYSIS_CARD | GENERATION_CARD)
     ├─ PipelineRun (generation tracking)
     └─ GeneratedDocument (.docx file metadata)

─── CITATION LAYER ──────────────────────────────────────

Citation (the evidence trail)
   ├─ → ChatMessage           (which message contains it)
   ├─ → PipelineRun           (or which generation used it)
   ├─ → StatuteSection        (if statute citation)
   ├─ → Precedent             (if case-law citation)
   ├─ → CaseDocument          (if user's own file)
   ├─ web_url, web_title      (if external article)
   ├─ excerpt_text            (THE quoted passage)
   ├─ page_number, paragraph_ref
   └─ full_source_url         (click-through)

CitationCache (external API results, 1h TTL)
   ├─ query_hash
   ├─ provider_id
   ├─ candidates (JSONB)
   └─ expires_at

─── PLUGIN LAYER ────────────────────────────────────────

LegalDomain ─< RegisteredDocumentType
            ├─< StudioAction
            └─< ChatCommand
```

---

## 8. Anti-hallucination architecture

```
Layer 1: GROUNDING
   All facts come from: case docs OR DB sections OR fetched precedents
                                    ↓
Layer 2: CITATION CONSTRAINT
   LLM prompt: "ONLY use cite_X tokens from this list"
                                    ↓
Layer 3: TOKEN VALIDATION
   Regex parse all [^cite_N] from LLM output
   Strip any not in availableCitations
                                    ↓
Layer 4: SEMANTIC VERIFICATION (on-demand)
   Did excerpt X actually support claim Y?
                                    ↓
Layer 5: SOURCE TRACEABILITY
   Every Citation row → sourceUrl + excerptText + pageNumber
   Lawyer can audit any claim in seconds
```

A wrong citation in court can lose a case. Every architectural decision is filtered through "would this be acceptable in front of a judge?"

---

## 9. Workflow engine

The legacy bail pipeline still uses a custom workflow engine in `core/workflow-engine.ts`:

```
WorkflowEngine
  ├─ addStep(step)          ─ chains steps
  └─ run(input, options)    ─ executes with:
     ├─ Per-step retries (exponential backoff)
     ├─ Per-step timeouts
     ├─ Output validation per step
     ├─ Error recovery callbacks
     ├─ SSE event emission for real-time UI
     └─ Context object with getStepOutput(stepName)
```

Used by the standalone `POST /api/pipeline/run` endpoint (legacy). New chat-based flow bypasses this and dispatches directly via `chat.service.ts`.

---

## 10. Tech decisions explained

| Decision | Why |
|----------|-----|
| **PostgreSQL + pgvector** (not Neo4j / Pinecone) | Single DB, type-safe ORM, handles 1M+ nodes. Vector + relational + graph in one query. |
| **Plugin architecture** (not microservices) | Adding a new domain = drop files. No service registration, no deployment dance. Fast iteration. |
| **TypeScript everywhere** | Type safety across full stack (Vue, Express, Prisma). Catches integration bugs at compile time. |
| **Express** (not Fastify / Hono) | Battle-tested, massive ecosystem. Performance is plenty for LexiMini's scale. |
| **Vue 3** (not React) | Reactivity model is cleaner for this kind of stateful UI. Composables fit the use case. |
| **Tailwind v4** | Fast dev, no CSS file proliferation. Light theme aesthetic. |
| **OpenAI GPT-4o** (chat) | Best for legal reasoning + structured output. JSON mode is reliable. |
| **AWS Bedrock GPT-OSS 120B** (bulk PDF) | High throughput for one-time extraction. Pay-per-use, no rate limits. |
| **Indian Kanoon** (free) | 5M+ judgments, free tier, sufficient for MVP. |
| **`docx` npm package** | Native .docx without LibreOffice/headless browser. |
| **No Redis** | Postgres handles cache table; one less service to manage. |
| **SSE** (not WebSockets) | One-way streaming is all we need. SSE is simpler, works with HTTP/2, reconnects natively. |

---

## 11. Scaling thresholds

```
┌────────────────────────────────────────────────────────────────┐
│ Scale         │ Postgres OK? │ When to consider migration      │
├────────────────────────────────────────────────────────────────┤
│ 2K nodes      │ ✅            │ Today                          │
│ 50K nodes     │ ✅            │ Year 1 — full criminal + civil │
│ 150K nodes    │ ✅            │ Year 2 — all major domains     │
│ 500K nodes    │ ✅            │ Full SC + HC case law corpus   │
│ 1M+ nodes     │ ✅ (with HNSW)│ Tier-4 platform                │
│ 5M+ + deep    │ ⚠️ consider   │ Add Memgraph/Neo4j as          │
│   graph algos │              │ analytics projection            │
└────────────────────────────────────────────────────────────────┘
```

---

## 12. Open gaps

We maintain a brutally-honest audit in [`AUDIT.md`](./AUDIT.md). High-priority items as of this writing:

1. **Citation system not yet wired to chat** — built but not called from `chat.service.ts`
2. **Domain router dead code** — not invoked anywhere
3. **Dynamic plugin imports break in production builds** — work in `tsx`, fail in compiled `.js`
4. **`enabled` flag on sources ignored** by case context loader
5. **CommandChips component orphaned** — never imported by ChatInput

See `AUDIT.md` for the full list (49 items) and fix order.

---

## 13. What this architecture wins

| Quality | How |
|---------|-----|
| **Verifiable** | Every claim → source URL + page + excerpt |
| **Extensible** | New domain = config drop, no core code change |
| **Single-DB** | Atomicity + simplicity + low ops overhead |
| **Multi-source** | Internal + user docs + 5M judgments in parallel |
| **Multi-domain** | Criminal + civil today, any domain tomorrow |
| **Type-safe** | TypeScript + Prisma catch errors at compile time |
| **Fast retrieval** | Hybrid (vector + keyword + exact) + rerank |
| **Zero hallucination** | 4-layer grounding |
| **Court-ready output** | Native .docx with proper formatting |
| **Lawyer-grade UX** | NotebookLM-style 3-pane, every feature one click away |

---

## 14. What this architecture is NOT trying to do

| Non-goal | Why |
|----------|-----|
| Real-time collaboration | Lawyers work on one case at a time |
| Mobile-first | Drafting on phone is impractical |
| Multi-tenant SaaS (yet) | MVP is single-firm. Auth added later. |
| Replace lawyer judgment | LexiMini surfaces, lawyer decides |
| Predict case outcomes | Inherently uncertain. We don't pretend. |
| Translate to other jurisdictions | India-only. Cleaner focus. |

---

## See also

- [`README.md`](./README.md) — Project intro, quick start
- [`DEVELOPER.md`](./DEVELOPER.md) — How to work in the codebase
- [`backend/EXTENSIBILITY.md`](./backend/EXTENSIBILITY.md) — Adding domains/acts/providers
- [`AUDIT.md`](./AUDIT.md) — Known gaps and fix plan
