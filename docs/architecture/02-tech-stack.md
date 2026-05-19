# Tech Stack — what & why

This page is a fast lookup table for every external dependency and the reason it's in the build.

---

## Languages & runtime

| Choice | Rationale |
|--------|-----------|
| **TypeScript** (strict mode) on both sides | Shared shape vocabulary (`LegalMemo`, `ExtractedFIR`, `PipelineEvent`) without a code-gen step. Strict mode catches null-safety bugs in agent outputs. |
| **Node.js ≥ 20**, ESM only | `tsx` for dev hot reload, native `import` so Prisma + Vite work cleanly. `pathToFileURL` is used by the plugin loader. |
| **Vue 3.5** Composition API + `<script setup>` | Tight `ref`/`computed`/`watch` semantics, no JSX overhead, fast SSR-less iteration. |

---

## Backend dependencies

(from [`backend/package.json`](../../backend/package.json))

| Package | Used for |
|---------|----------|
| `express@^4.21` | HTTP routing, middleware composition, SSE responses. |
| `helmet@^8` | Default security headers. |
| `express-rate-limit@^7.4` | 60 req/min/IP throttle. |
| `cors@^2.8` | Cross-origin between Vite (`:5173`) and API (`:3001`). |
| `multer@^1.4` | Multipart upload handling for FIR / chargesheet PDFs. |
| `zod@^3.23` | Env validation, request body validation, structured LLM output validation. |
| `@prisma/client` + `prisma@^6.1` | ORM + migrations. |
| `pgvector@^0.2` | Native pgvector type binding for Prisma raw SQL. |
| `openai@^4.73` | Chat completions, vision, embeddings. Wrapped in `openai.service.ts`. |
| `groq-sdk` + `@aws-sdk/client-bedrock-runtime` | Reserved for future multi-model routing (Groq Llama, Bedrock Claude/Mistral). Not in active runtime paths yet. |
| `pdf-parse@^1.1` | Text extraction from digital PDFs before vision-fallback. |
| `sharp@^0.33` | (reserved) image preprocessing for vision OCR. |
| `docx@^9.1` | Native `.docx` generation — no LibreOffice / Pandoc needed. |
| `pino` + `pino-pretty` | Structured logs (pretty in dev, JSON in prod). |
| `uuid@^11` | Upload file naming. |
| `dotenv@^16` | `.env` loading. |

Dev: `tsx`, `typescript@^5.6`, `@types/*`.

---

## Frontend dependencies

(from [`frontend/package.json`](../../frontend/package.json))

| Package | Used for |
|---------|----------|
| `vue@^3.5` | UI framework. |
| `vue-router@^4` | Client routing (7 routes). |
| `pinia@^2` | Global state — one store per domain (cases, chat, sources, studio, citation, pipeline). |
| `tailwindcss@^4` + `@tailwindcss/vite` | Utility-first styling, configured via the new Vite plugin (no `tailwind.config.js`). |
| `vite@^6` | Dev server, HMR, proxy `/api → :3001`, build. |
| `@vitejs/plugin-vue@^5` | SFC compilation. |

---

## AI / ML

| Choice | Why |
|--------|-----|
| `gpt-4o` (chat + vision) | Single model handles OCR (scanned FIR JPGs), structured JSON extraction, and legal synthesis. |
| `text-embedding-3-small` (1536-d) | Cheap, fast, decent for legal text; matches the `vector(1536)` column. |
| Temperature schedule: 0 (rerank) · 0.1 (extract, research) · 0.2 (chat) · 0.3 (drafting) | Stricter where hallucination cost is highest; slightly higher only when phrasing variation is desired. |
| JSON mode (`response_format: json_object`) | Forces parseable output for the structured agents. |
| Optional Groq / Bedrock SDKs imported | Future multi-model router (see [Roadmap](../planning/01-roadmap.md) Phase 6). |

---

## Data layer

| Choice | Why |
|--------|-----|
| **PostgreSQL 16** | Battle-tested, supports CTEs/triggers/JSONB heavily used here. |
| **pgvector** | One database to operate, not two (no Pinecone/Weaviate). Cosine distance via `<=>` operator on `vector(1536)` columns. HNSW index can be added at scale. |
| **JSONB** for `extracted_fir`, `legal_memo`, `steps`, `extracted_data`, `template_config`, `candidates` | Schema-on-read for agent outputs; Prisma's `Json` type. |
| **Prisma** | Type-safe DAL, declarative migrations, `db push` for dev iteration. Raw SQL used only where pgvector requires it. |

---

## Search

The hybrid search stack is hand-rolled (no Elasticsearch / Meilisearch):

| Component | Source | Notes |
|-----------|--------|-------|
| Vector recall | `services/database.service.ts → vectorSearchStatutes/Precedents` | `<=>` cosine over `embedding` column; default `topK=10`. |
| Lexical recall | `services/bm25.service.ts` | In-memory BM25 with `k1=1.5`, `b=0.75`; index loaded on first use. |
| Exact-section recall | `services/hybrid-search.service.ts` | Regex `section\s+\d+` + act-prefixed patterns; gets a 2× RRF boost. |
| Fusion | `hybrid-search.service.ts` | Reciprocal Rank Fusion, `k=60`. |
| Reranker | `services/reranker.service.ts` | GPT-4o JSON mode, 0–10 score per candidate, drops `<3`, normalises `/10 → 0..1`. |

Detailed walk-through: [Hybrid Search](./08-hybrid-search.md).

---

## Document output

| Choice | Why |
|--------|-----|
| `docx` npm package | Pure JS .docx writer. Programmatic Times-New-Roman, justified paragraphs, roman numeral grounds, signature blocks. No native dependencies. |

Implementation: [`backend/src/services/docgen.service.ts`](../../backend/src/services/docgen.service.ts). Generic per-section generator supports bail, anticipatory, default-bail, quashing, discharge, appeal, legal memo.

---

## Realtime / streaming

| Choice | Why |
|--------|-----|
| **Server-Sent Events (SSE)** | Lower complexity than WebSockets; uni-directional fit (server → client progress). Implemented in `pipeline.routes.ts` with a `Map<runId, Response[]>` connection registry. |

When concurrency grows, swap to Redis pub/sub or BullMQ — the `WorkflowEngine`'s `emit()` callback is the only seam.

---

## Logging & ops

| Choice | Why |
|--------|-----|
| `pino` + `pino-pretty` | Structured JSON logs in prod, colourised in dev. Child loggers per module via `createChildLogger(name)`. |
| `withRetry()` util (`utils/retry.ts`) | Exponential backoff + jitter; wraps all OpenAI calls. |
| Health check `GET /api/health` | Parallel OpenAI + DB probes; 200/503 wire status. |

---

## Why *not* X?

| Considered | Why not (for now) |
|------------|-------------------|
| **LangChain / LangGraph** | Too much ceremony for a five-step pipeline. Custom `WorkflowEngine` is 200 LOC, fully typed, easy to debug. |
| **Pinecone / Weaviate** | A second store to operate + sync; `pgvector` is good enough at MVP scale and removes a whole class of bugs. |
| **NestJS** | Express + plain TS keeps cognitive load low for a small team. |
| **BullMQ / Redis** | No concurrency story yet — pipelines run synchronously per request. Listed under [Roadmap Phase 5](../planning/01-roadmap.md). |
| **TypeORM** | Prisma's schema-first + type-safety + migration flow is friendlier. |
| **GraphQL** | Frontend is built by the same team; one repo, REST/SSE is sufficient. |

---

Next: [Plugin Architecture](./03-plugin-architecture.md).
