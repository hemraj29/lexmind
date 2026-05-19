# Backend — Developer Overview

This is the start of the backend developer track. Every page in `docs/backend/` documents one logical layer:

1. **Overview** — entry point, request lifecycle, layout (this page).
2. [Agents](./02-agents.md) — the 7 LLM orchestrators.
3. [Workflows](./03-workflows.md) — engine, steps, events.
4. [Services](./04-services.md) — OpenAI, DB, search, docgen, storage, chat.
5. [Routes](./05-routes.md) — every HTTP/SSE endpoint, expanded.
6. [Citations](./06-citations.md) — aggregator, validator, verifier, providers.
7. [Middleware & Config](./07-middleware-config.md) — env, upload, validate, errors.
8. [Domains & Drafters](./08-domains-drafters.md) — the plugin code, per domain.

---

## 1. Entry point

[`backend/src/index.ts`](../../backend/src/index.ts) does, in order:

```
1.  env.load()                                ← zod-validated env (fails fast)
2.  app = express()
3.  app.use(helmet())
    app.use(cors({ origin: env.CORS_ORIGIN }))
    app.use(rateLimit({ windowMs: 60_000, max: 60 }))
    app.use(express.json({ limit: "10mb" }))
4.  await initDatabase()                      ← prisma + pgvector
    await storageService.init()               ← mkdir uploads/, output/
    await bootstrapPlugins()                  ← load domains, drafters, acts + sync to DB
5.  app.use("/api/health", healthRoutes)
    app.use("/api/cases",        chatRoutes)
    app.use("/api/cases",        sourcesRoutes)   ← mounted BEFORE chat for sub-paths
    app.use("/api/studio-actions", studioRoutes)
    app.use("/api/commands",      commandsRoutes)
    app.use("/api/citations",     citationsRoutes)
    app.use("/api/pipeline",      pipelineRoutes)
    app.use("/api/sections",      sectionsRoutes)
    app.use("/output", express.static(env.OUTPUT_DIR))
6.  app.use(notFoundHandler)
    app.use(errorHandler)
7.  server.listen(env.PORT)
8.  Process signals: on SIGINT/SIGTERM → close server + disconnectDatabase()
```

Important: **`sourcesRoutes` is mounted before `chatRoutes`** even though they share the `/api/cases` prefix — Express routes with sub-paths must register first so the `:id/sources/*` matchers don't get shadowed by `:id/messages` early-out behaviour.

---

## 2. Directory map

```
backend/
├── prisma/
│   ├── schema.prisma         18 models, 10 enums
│   └── seed.ts               Acts + Chapters
├── scripts/                  data ingestion (extract → enrich → ingest)
├── book/                     Raw PDFs of legislation (not committed in some setups)
├── uploads/                  runtime: user-uploaded files
├── output/                   runtime: generated .docx
├── src/
│   ├── index.ts              ← entry point
│   ├── config/               env + constants
│   ├── core/                 ← plugin engine + workflow engine
│   ├── domains/              ← plugin code (criminal, civil, _template)
│   ├── acts/                 ← ActPlugin JSON files
│   ├── agents/               ← 7 LLM agents
│   ├── services/             ← infra singletons
│   │   └── citation/         aggregator + validator + verifier + 3 providers
│   ├── routes/               ← Express routers
│   ├── workflows/            ← composed pipelines + steps
│   ├── middleware/           error-handler, upload, validate
│   ├── types/                shared TS types
│   ├── utils/                logger, pdf, retry
│   └── data/                 statutes/, precedents/ ingestion JSON
└── tests/                    (placeholder; tests live next to code or in this folder)
```

---

## 3. Request lifecycle

### a) A typical chat message
```
POST /api/cases/:id/messages              ← multipart (content + optional file)
  ↓
helmet · cors · rate-limit                ← top-level middleware
  ↓
multer (memory)                           ← parse file if present
  ↓
chat.routes → handleMessage
  ├─ persist user message (ChatMessage row)
  ├─ if file:    documentAnalyzerAgent.classifyDocument + extract → save CaseDocument
  ├─ if @cmd:    dispatch in COMMAND_HANDLERS (analyze | summary | missing |
  │              cross_exam | sections | precedents | <generation>)
  └─ else:       strategyAdvisorAgent.chat(message, caseContext)
  ↓
persist assistant message(s)
  ↓
errorHandler (only on throw)
  ↓
JSON response: { success: true, data: { type, messages: ChatMessage[] }, timestamp }
```

### b) A bail pipeline run (legacy)
See [Pipeline Flow](../architecture/04-pipeline-flow.md).

### c) An error path
- Zod validation in `middleware/validate.ts` returns `400` immediately with `details: [{ field, message }]`.
- `multer` `LIMIT_FILE_SIZE` → `413` with friendly message.
- `AppError(message, status)` → that status + the message; non-AppError errors become `500` with the original message in dev / `"Internal server error"` in prod.
- `notFoundHandler` matches anything unknown → `404`.

All error responses follow `{ success: false, error, timestamp, details? }`.

---

## 4. Conventions

### Logging
```ts
import { createChildLogger } from "../utils/logger.js";
const logger = createChildLogger("research.agent");
logger.info({ runId, sections: 3 }, "memo synthesised");
```

Module name appears in every log line. Pretty-printed in dev, JSON in prod.

### Retries
All OpenAI calls are wrapped in [`utils/retry.ts → withRetry()`](../../backend/src/utils/retry.ts) with exponential backoff and jitter, 3 attempts by default.

### Singletons
Service objects (e.g. `openaiService`, `prisma`, `storageService`, `bm25Service`, `hybridSearchService`, `rerankerService`, `docgenService`) are exported as instances, not classes. They hold no per-request state.

### File naming
| Pattern        | Meaning |
|----------------|---------|
| `*.agent.ts`   | LLM orchestrator. Single instance export. |
| `*.service.ts` | Infra singleton. |
| `*.routes.ts`  | Express router. Default export. |
| `*.step.ts`    | WorkflowStep. |
| `*.drafter.ts` | DrafterPlugin. |
| `*.types.ts`   | Pure TS types. |
| `_shared.ts`   | Folder-private helper. |

---

## 5. Build / dev / prod

| Script | What |
|--------|------|
| `pnpm dev`        | `tsx watch src/index.ts` — hot reload, source TS |
| `pnpm build`      | `tsc` → `dist/` |
| `pnpm start`      | `node dist/index.js` |
| `pnpm db:generate`| `prisma generate` |
| `pnpm db:push`    | `prisma db push` (dev, no migration) |
| `pnpm db:migrate` | `prisma migrate dev` (create migration) |
| `pnpm db:studio`  | open Prisma Studio |
| `pnpm db:seed`    | run `prisma/seed.ts` |
| `pnpm ingest:statutes` | bulk-load + embed BNS/BNSS/BSA |
| `pnpm ingest:precedents` | bulk-load + embed case law |

Production deployment shape (recommended): Node 20 container with `dist/` + a managed Postgres with pgvector. The frontend is fully static (`frontend/dist`) — serve via any CDN or behind the same reverse proxy.

---

## 6. Adding a new endpoint (recipe)

1. Create the file under `src/routes/<name>.routes.ts`:
   ```ts
   import { Router } from "express";
   import { z } from "zod";
   import { validate } from "../middleware/validate.js";
   import { createChildLogger } from "../utils/logger.js";

   const logger = createChildLogger("<name>.routes");
   const router = Router();

   router.get("/", validate(z.object({ q: z.string().min(2) }), "query"), async (req, res, next) => {
     try {
       const data = await someService(req.query.q);
       res.json({ success: true, data, timestamp: Date.now() });
     } catch (err) { next(err); }
   });

   export default router;
   ```
2. Mount it in `src/index.ts` under `/api/<name>`.
3. (Optional) Update [`docs/architecture/06-api-reference.md`](../architecture/06-api-reference.md).

That's it — no DI container, no module decorators, no codegen.

---

## 7. Where to look for…

| Need to… | File |
|----------|------|
| Add a new chat command | `chat.service.ts → COMMAND_HANDLERS` (and `types/case.types.ts → CHAT_COMMANDS`) |
| Change retry behaviour | `utils/retry.ts` |
| Tweak rate limit | `index.ts` `rateLimit({ … })` |
| Change body-size / file-size | `index.ts` (`express.json`) + `middleware/upload.ts` |
| Add a new search source | `services/citation/providers/` + register in `citation-aggregator.service.ts` |
| Bootstrap a domain | see [Plugin Architecture](../architecture/03-plugin-architecture.md) + [Extending](../planning/03-extending.md) |
| Inspect SSE flow | `core/workflow-engine.ts` + `routes/pipeline.routes.ts` |

Next: [Agents](./02-agents.md).
