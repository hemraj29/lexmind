# LexiMini — Developer Guide

A practical guide for engineers working on the LexiMini codebase. Covers project layout, dev workflow, common tasks, and how to extend the system.

---

## 1. Repository layout

```
leximini/
├── README.md                      ← project intro
├── ARCHITECTURE.md                ← system architecture
├── DEVELOPER.md                   ← you are here
├── AUDIT.md                       ← known gaps + fix plan
│
├── backend/
│   ├── EXTENSIBILITY.md           ← how to add domains/acts/providers
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example               ← copy to .env
│   │
│   ├── book/                      ← source PDFs of bare Acts (gov gazettes)
│   │   ├── 250883_english_01042024.pdf      (BNS)
│   │   ├── Bharatiya_Nagarik_Suraksha_Sanhita,_2023.pdf
│   │   └── 250882_english_01042024_0.pdf    (BSA)
│   │
│   ├── prisma/
│   │   ├── schema.prisma          ← single source of truth for DB schema
│   │   ├── seed.ts                ← seeds Acts + Chapters
│   │   └── migrations/            ← (created by prisma migrate)
│   │
│   ├── scripts/
│   │   ├── extract-from-books.ts  ← Bedrock-powered PDF → JSON
│   │   ├── ingest-statutes.ts     ← JSON → Postgres + pgvector embeddings
│   │   ├── ingest-precedents.ts   ← Curated cases → Postgres + embeddings
│   │   └── enrich-data.ts         ← Fill missing fields (punishments, etc.)
│   │
│   └── src/
│       ├── index.ts               ← Express bootstrap + plugin loader
│       │
│       ├── core/                  ← PLUGIN REGISTRIES (never changes)
│       │   ├── plugin.types.ts
│       │   ├── domain-registry.ts
│       │   ├── drafter-registry.ts
│       │   ├── act-registry.ts
│       │   ├── extraction-registry.ts
│       │   ├── bootstrap.ts       ← loads + syncs all plugins to DB
│       │   ├── workflow-engine.ts ← legacy pipeline runner
│       │   └── workflow-types.ts
│       │
│       ├── domains/               ← ADD NEW DOMAINS HERE
│       │   ├── criminal/
│       │   │   ├── domain.config.ts
│       │   │   └── drafters/
│       │   │       ├── _shared.ts
│       │   │       ├── regular-bail.drafter.ts
│       │   │       ├── anticipatory-bail.drafter.ts
│       │   │       ├── default-bail.drafter.ts
│       │   │       ├── quashing.drafter.ts
│       │   │       ├── discharge.drafter.ts
│       │   │       └── appeal.drafter.ts
│       │   ├── civil/
│       │   │   ├── domain.config.ts
│       │   │   └── drafters/
│       │   │       ├── _shared.ts
│       │   │       ├── plaint.drafter.ts
│       │   │       ├── written-statement.drafter.ts
│       │   │       └── temporary-injunction.drafter.ts
│       │   └── _template/         ← copy this for new domains
│       │       ├── README.md
│       │       ├── domain.config.ts
│       │       └── drafters/
│       │
│       ├── acts/                  ← ACT METADATA (one JSON per act)
│       │   ├── criminal/
│       │   │   ├── bns.act.json
│       │   │   ├── bnss.act.json
│       │   │   └── bsa.act.json
│       │   └── civil/
│       │       ├── cpc.act.json
│       │       ├── contract-act.act.json
│       │       └── specific-relief.act.json
│       │
│       ├── agents/                ← AI agents (domain-agnostic)
│       │   ├── document-analyzer.agent.ts  ← classify + extract any legal doc
│       │   ├── extractor.agent.ts          ← FIR-specific (legacy, kept)
│       │   ├── researcher.agent.ts         ← hybrid search → LegalMemo
│       │   ├── strategy-advisor.agent.ts   ← case analysis + chat
│       │   ├── domain-router.agent.ts      ← query → domain classifier
│       │   ├── drafter-factory.agent.ts    ← dispatcher (uses registry)
│       │   └── drafter.agent.ts            ← legacy bail drafter
│       │
│       ├── services/
│       │   ├── openai.service.ts
│       │   ├── database.service.ts
│       │   ├── hybrid-search.service.ts
│       │   ├── bm25.service.ts
│       │   ├── reranker.service.ts
│       │   ├── docgen.service.ts
│       │   ├── storage.service.ts
│       │   ├── chat.service.ts             ← message routing orchestrator
│       │   └── citation/                    ← citation system
│       │       ├── provider.types.ts
│       │       ├── citation-aggregator.service.ts
│       │       ├── citation-validator.service.ts
│       │       ├── citation-verifier.service.ts
│       │       └── providers/
│       │           ├── internal.provider.ts
│       │           ├── case-documents.provider.ts
│       │           └── indian-kanoon.provider.ts
│       │
│       ├── routes/                ← Express routers
│       │   ├── health.routes.ts
│       │   ├── chat.routes.ts             ← cases + messages
│       │   ├── sources.routes.ts          ← case document upload
│       │   ├── studio.routes.ts           ← studio panel actions
│       │   ├── commands.routes.ts         ← @command chips
│       │   ├── citations.routes.ts        ← citation previews
│       │   ├── sections.routes.ts         ← statute search
│       │   └── pipeline.routes.ts         ← legacy bail pipeline
│       │
│       ├── middleware/
│       │   ├── error-handler.ts
│       │   ├── upload.ts                  ← multer config
│       │   └── validate.ts                ← zod schema validation
│       │
│       ├── types/
│       │   ├── api.types.ts
│       │   ├── fir.types.ts
│       │   ├── legal.types.ts
│       │   ├── pipeline.types.ts
│       │   ├── document.types.ts
│       │   ├── strategy.types.ts
│       │   ├── generation.types.ts
│       │   ├── case.types.ts
│       │   └── index.ts
│       │
│       ├── config/
│       │   ├── env.ts                     ← Zod-validated env
│       │   └── constants.ts
│       │
│       ├── utils/
│       │   ├── logger.ts                  ← pino + child loggers
│       │   ├── retry.ts                   ← exponential backoff
│       │   └── pdf.ts
│       │
│       ├── workflows/                     ← legacy pipeline steps
│       │   ├── bail-application.workflow.ts
│       │   └── steps/
│       │       ├── upload.step.ts
│       │       ├── extract.step.ts
│       │       ├── research.step.ts
│       │       ├── draft.step.ts
│       │       └── save-output.step.ts
│       │
│       └── data/                          ← extracted statute data (JSON)
│           ├── statutes/
│           │   ├── bns.json
│           │   ├── bnss.json
│           │   └── bsa.json
│           ├── mapper/
│           │   └── ipc-to-bns.json
│           └── precedents/
│               └── landmark-cases.json
│
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html
    │
    └── src/
        ├── main.ts
        ├── App.vue
        ├── router/
        │   └── index.ts
        │
        ├── views/
        │   ├── ChatView.vue                 ← MAIN view (3-pane)
        │   ├── SectionsView.vue             ← statute search
        │   ├── HomeView.vue                 (legacy)
        │   ├── PipelineView.vue             (legacy)
        │   ├── DraftView.vue                (legacy)
        │   └── HistoryView.vue              (legacy)
        │
        ├── components/
        │   ├── AppHeader.vue
        │   ├── FileUploader.vue              (legacy)
        │   ├── StepProgress.vue              (legacy)
        │   ├── CitationPreview.vue           ← citation side panel
        │   │
        │   ├── chat/
        │   │   ├── ChatHeader.vue
        │   │   ├── ChatArea.vue
        │   │   ├── ChatInput.vue
        │   │   ├── MessageBubble.vue
        │   │   ├── CommandChips.vue          ← orphaned (not yet imported)
        │   │   ├── AnalysisCard.vue
        │   │   └── GenerationCard.vue
        │   │
        │   ├── sources/
        │   │   ├── SourcesPanel.vue
        │   │   ├── AddSourceCard.vue
        │   │   ├── WebSearchBar.vue
        │   │   └── SourceItem.vue
        │   │
        │   └── studio/
        │       ├── StudioPanel.vue
        │       ├── StudioGrid.vue
        │       └── StudioCard.vue
        │
        ├── stores/                          ← Pinia
        │   ├── cases.store.ts
        │   ├── chat.store.ts
        │   ├── sources.store.ts
        │   ├── studio.store.ts
        │   ├── citation.store.ts
        │   └── pipeline.store.ts            (legacy)
        │
        └── composables/
            ├── useApi.ts
            ├── useUpload.ts
            └── usePipeline.ts               (legacy)
```

---

## 2. First-time setup

### Prerequisites

```
Node.js          20+
PostgreSQL       16+ with pgvector extension
OpenAI API key
AWS credentials  (optional, for PDF extraction)
Indian Kanoon    (optional, for external case law)
```

### Install pgvector on Postgres

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Or use the Docker image that ships with it:

```bash
docker run -d --name leximini-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=leximini \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

### Backend bootstrap

```bash
cd backend
npm install
cp .env.example .env
# edit .env: set OPENAI_API_KEY, DATABASE_URL

npx prisma generate          # generate Prisma client + types
npx prisma db push           # create tables + enable pgvector
npm run db:seed              # seed Acts + Chapters

npm run dev                  # tsx watch — auto-reload on save
```

You should see:

```
[domain-registry] Domain plugin loaded: code=criminal
[domain-registry] Domain plugin loaded: code=civil
[drafter-registry] Drafter plugin loaded: id=criminal.regular_bail
…
[bootstrap] Plugin bootstrap complete: domains=2, drafters=9, acts=6
[server] LexiMini server running on http://localhost:3001
```

### Frontend bootstrap

```bash
cd frontend
npm install
npm run dev                  # Vite — http://localhost:5173
```

### Verify

```bash
# In a separate terminal
curl http://localhost:3001/api/health
curl http://localhost:3001/api/studio-actions?domain=criminal
curl http://localhost:3001/api/commands
```

Open `http://localhost:5173` and click **"+ Create notebook"**.

---

## 3. Environment variables

Copy `backend/.env.example` to `backend/.env` and fill:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Postgres connection string with pgvector |
| `OPENAI_API_KEY` | ✅ | For chat + embeddings |
| `OPENAI_MODEL` | optional | Default `gpt-4o` |
| `OPENAI_EMBEDDING_MODEL` | optional | Default `text-embedding-3-small` |
| `PORT` | optional | Default `3001` |
| `CORS_ORIGIN` | optional | Default `http://localhost:5173` |
| `UPLOAD_DIR` | optional | Default `./uploads` |
| `OUTPUT_DIR` | optional | Default `./output` |
| `MAX_FILE_SIZE_MB` | optional | Default `20` |
| `LOG_LEVEL` | optional | Default `info` |
| `AWS_ACCESS_KEY_ID` | optional | For Bedrock-based PDF extraction |
| `AWS_SECRET_ACCESS_KEY` | optional | Same |
| `AWS_REGION` | optional | Default `us-east-1` |
| `INDIAN_KANOON_API_KEY` | optional | Enables external case-law search |
| `SCC_API_KEY` | optional | Enables premium SCC citations |

---

## 4. Daily development workflow

### Run everything

```bash
# Terminal 1: backend
cd backend && npm run dev

# Terminal 2: frontend
cd frontend && npm run dev

# Terminal 3: Prisma Studio (optional — visual DB explorer)
cd backend && npm run db:studio
```

### Make a schema change

```bash
# 1. Edit prisma/schema.prisma
# 2. Push to DB (dev only):
npx prisma db push
# 3. Regenerate client:
npx prisma generate
```

For production-grade migrations:

```bash
npx prisma migrate dev --name describe_the_change
```

### Add a backend service

```typescript
// backend/src/services/my-service.service.ts
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("my-service");

class MyService {
  async doThing(): Promise<void> {
    log.info("doing thing");
    // ...
  }
}

export const myService = new MyService();
```

Import as:

```typescript
import { myService } from "../services/my-service.service.js";
```

### Add a backend route

```typescript
// backend/src/routes/my-route.routes.ts
import { Router } from "express";
import type { ApiResponse } from "../types/api.types.js";

const router = Router();

router.get("/", async (_req, res) => {
  res.json({
    success: true,
    data: { hello: "world" },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse);
});

export default router;
```

Wire in `backend/src/index.ts`:

```typescript
import myRoute from "./routes/my-route.routes.js";
app.use("/api/my-route", myRoute);
```

### Add a frontend component

```vue
<!-- frontend/src/components/MyComponent.vue -->
<script setup lang="ts">
defineProps<{ label: string }>();
defineEmits<{ click: [] }>();
</script>

<template>
  <button class="px-3 py-1.5 bg-indigo-600 text-white rounded-lg" @click="$emit('click')">
    {{ label }}
  </button>
</template>
```

### Add a Pinia store

```typescript
// frontend/src/stores/my.store.ts
import { defineStore } from "pinia";
import { ref } from "vue";

export const useMyStore = defineStore("my", () => {
  const items = ref<string[]>([]);
  const loading = ref(false);

  async function fetchItems() {
    loading.value = true;
    try {
      const res = await fetch("/api/my-route");
      const json = await res.json();
      if (json.success) items.value = json.data;
    } finally {
      loading.value = false;
    }
  }

  return { items, loading, fetchItems };
});
```

---

## 5. Common tasks

### Add a new legal domain (e.g., Family Law)

```bash
cd backend/src/domains
cp -r _template family
```

Edit `family/domain.config.ts`:

```typescript
import type { DomainPlugin } from "../../core/plugin.types.js";

export const familyDomain: DomainPlugin = {
  code: "family",
  name: "Family Law",
  description: "Divorce, custody, maintenance, succession",
  iconName: "heart",
  colorHex: "#ec4899",
  sortOrder: 4,

  defaultActCodes: ["HMA_1955", "HSA_1956", "SMA_1954"],

  routingHints: {
    keywords: ["divorce", "custody", "maintenance", "marriage", "succession"],
    actReferences: ["HMA", "Special Marriage Act", "Hindu Succession"],
    queryPatterns: [/\bdivorce\b/i, /custody/i, /section\s+125\s+crpc/i],
  },

  documentTypes: [
    {
      code: "divorce_petition_hma",
      name: "Divorce Petition (HMA)",
      description: "Divorce under Hindu Marriage Act, 1955",
      category: "draft",
      iconName: "heart-crack",
      colorHex: "#ec4899",
      command: "@divorce",
      requiredSourceTypes: [],
      primarySectionCodes: ["HMA-13"],
      drafterId: "family.divorce_petition_hma",
      sortOrder: 1,
    },
  ],
};
```

Create `family/drafters/divorce-petition-hma.drafter.ts`:

```typescript
import type { DrafterPlugin } from "../../../core/plugin.types.js";
import { openaiService } from "../../../services/openai.service.js";
import { docgenService } from "../../../services/docgen.service.js";

export const divorcePetitionDrafter: DrafterPlugin = {
  id: "family.divorce_petition_hma",
  domainCode: "family",
  documentTypeCode: "divorce_petition_hma",

  async draft({ caseData, memo }) {
    const prompt = `Draft a divorce petition under HMA, 1955 for the following case:
${JSON.stringify(caseData).slice(0, 2000)}

Return JSON: { courtName, caseTitle, factsOfMarriage, groundsForDivorce, reliefSought, ... }`;

    const sections = await openaiService.chatJSON<Record<string, unknown>>(
      [{ role: "user", content: prompt }],
      { temperature: 0.3, maxTokens: 8000 }
    );

    const docxBuffer = await docgenService.generateFromSections(
      "divorce_petition_hma" as any,
      sections,
      caseData,
      memo
    );

    return {
      markdown: `# Divorce Petition\n\n${JSON.stringify(sections, null, 2)}`,
      sections,
      docxBuffer,
    };
  },
};
```

Restart the server. The new domain appears in Studio + chat commands automatically.

Full guide: [`backend/EXTENSIBILITY.md`](./backend/EXTENSIBILITY.md)

### Add a new act (e.g., NDPS)

1. Drop the PDF into `backend/book/ndps-act-1985.pdf`
2. Drop metadata at `backend/src/acts/criminal/ndps.act.json`:
   ```json
   {
     "code": "NDPS_1985",
     "name": "Narcotic Drugs and Psychotropic Substances Act, 1985",
     "shortName": "NDPS",
     "year": 1985,
     "domainCode": "criminal",
     "isCentralAct": true,
     "sourcePdfPath": "book/ndps-act-1985.pdf"
   }
   ```
3. Run extraction:
   ```bash
   npm run extract:books
   npm run ingest:statutes
   ```

That's it. Sections are now searchable.

### Add a new citation provider (e.g., Manupatra)

```typescript
// backend/src/services/citation/providers/manupatra.provider.ts
import type { CitationProvider, CitationCandidate, ProviderSearchOptions } from "../provider.types.js";

class ManupatraProvider implements CitationProvider {
  name = "manupatra";
  type = "external" as const;
  get enabled() { return !!process.env.MANUPATRA_API_KEY; }

  async search(query: string, opts: ProviderSearchOptions): Promise<CitationCandidate[]> {
    // Call Manupatra API and map to CitationCandidate[]
    return [];
  }
}

export const manupatraProvider = new ManupatraProvider();
```

Register in `citation-aggregator.service.ts`:

```typescript
import { manupatraProvider } from "./providers/manupatra.provider.js";

// In CitationAggregator constructor:
this.register(manupatraProvider);
```

Done. The aggregator now searches Manupatra in parallel with all other providers.

### Add a new @command

Three options:

**Option A: Add a document type to a domain (recommended)**

In `domain.config.ts`, add an entry under `documentTypes` with a `command` field. Bootstrap will sync it to `chat_commands` table automatically.

**Option B: Insert directly into DB**

```sql
INSERT INTO chat_commands (cmd, label, description, color)
VALUES ('@my_command', 'My Command', 'Does something', 'border-cyan-200 text-cyan-700 hover:bg-cyan-50');
```

The `/api/commands` endpoint will return it on the next frontend load.

**Option C: Handle special commands in chat.service.ts**

If the command doesn't map to a drafter (e.g., `@analyze`), add a case in `handleCommand()`.

---

## 6. Tooling cheat-sheet

### Backend scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start backend with `tsx watch` (auto-reload) |
| `npm run build` | Compile TS → JS into `dist/` |
| `npm start` | Run compiled JS from `dist/` |
| `npm run db:generate` | Generate Prisma client + types |
| `npm run db:push` | Push schema to DB (no migration) |
| `npm run db:migrate` | Create + apply a migration |
| `npm run db:studio` | Open Prisma Studio (visual DB explorer) |
| `npm run db:seed` | Seed Acts + Chapters |
| `npm run extract:books` | PDF → JSON via Bedrock |
| `npm run enrich:data` | Fill missing fields in extracted JSON |
| `npm run ingest:statutes` | JSON → Postgres + embeddings |
| `npm run ingest:precedents` | Curated cases → Postgres + embeddings |

### Frontend scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start Vite dev server at :5173 |
| `npm run build` | Build for production into `dist/` |
| `npm run preview` | Preview production build locally |

---

## 7. Debugging

### Backend logs

We use Pino with child loggers per module:

```typescript
import { createChildLogger } from "../utils/logger.js";
const log = createChildLogger("my-module");

log.info({ caseId, action: "draft" }, "Starting draft");
log.warn({ err }, "External API timed out");
log.error({ err }, "Drafter threw");
```

In dev, output is colorized. Filter by module:

```bash
npm run dev | grep "module:domain-registry"
```

### Database inspection

```bash
# Visual UI
npm run db:studio

# SQL shell
psql $DATABASE_URL

# Check vector indexes
\d statute_sections

# Manual vector query
SELECT id, title, embedding <=> '[0.1, 0.2, ...]'::vector AS distance
FROM statute_sections
ORDER BY embedding <=> '[0.1, 0.2, ...]'::vector
LIMIT 5;
```

### Frontend state

Use Pinia DevTools (Vue DevTools browser extension). Each store appears in the DevTools panel — you can inspect state and trigger actions.

### Network inspection

The frontend proxies `/api/*` to `http://localhost:3001`. In Chrome DevTools → Network tab, you can see all backend calls.

### Common issues

| Symptom | Likely cause |
|---------|--------------|
| `Module '@prisma/client' has no exported member 'PrismaClient'` | Run `npx prisma generate` |
| `relation "..." does not exist` | Run `npx prisma db push` |
| `extension "vector" is not available` | Install pgvector on your Postgres instance |
| Plugin not loaded in production | Dynamic import expects `.js` after build; check `domain-registry.ts` |
| `@bail` works but no citations show up | Citation system not yet wired to chat.service.ts (see AUDIT.md) |
| Frontend shows mock data | Backend endpoint failing; check console & network tab |
| File upload returns 413 | Increase `MAX_FILE_SIZE_MB` |
| `Cors error` | Check `CORS_ORIGIN` in `.env` matches your frontend URL |

---

## 8. Coding conventions

### TypeScript

- **Strict mode is on.** Don't disable it for convenience.
- **Avoid `any`.** Use `unknown` and narrow.
- **All files end with `.ts` in source, `.js` in compiled output.**
- **Import with `.js` extension** (Node ESM requires it):
  ```typescript
  import { foo } from "./bar.js";   // ✅
  import { foo } from "./bar";      // ❌ runtime error
  ```

### Naming

| What | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `document-analyzer.agent.ts` |
| Classes | PascalCase | `class DocumentAnalyzer` |
| Functions / variables | camelCase | `extractFIR()` |
| Constants | UPPER_SNAKE | `MAX_RETRIES` |
| Types | PascalCase | `interface ExtractedFIR` |
| Vue components | PascalCase | `SourceItem.vue` |
| Pinia stores | camelCase | `useCasesStore` |
| Routes files | kebab-case + `.routes.ts` | `chat.routes.ts` |
| Services | kebab-case + `.service.ts` | `openai.service.ts` |
| Agents | kebab-case + `.agent.ts` | `researcher.agent.ts` |

### Error handling

- Throw `AppError(message, statusCode)` for known business errors
- Let unknown errors bubble up to the global error handler
- Always log errors with context: `log.error({ err, caseId }, "...")`
- Frontend: show user-friendly messages, log full details to console

### Logging level

| Level | When to use |
|-------|-------------|
| `trace` | Verbose step-by-step (don't use in normal code) |
| `debug` | Useful for development, off in prod |
| `info` | Notable events: server start, plugin loaded, generation complete |
| `warn` | Recovered failures, fallbacks, rate-limit hits |
| `error` | Failures that affect user but recoverable |
| `fatal` | System-level failures: DB unreachable, OOM |

---

## 9. Testing

> ⚠️ Tests don't exist yet. When you add them, here's the plan:

### Backend (Vitest)

```bash
# backend/tests/
backend/tests/
├── unit/
│   ├── citation-validator.test.ts
│   ├── domain-router.test.ts
│   └── hybrid-search.test.ts
├── integration/
│   ├── plugin-registry.test.ts
│   ├── chat-flow.test.ts
│   └── source-upload.test.ts
└── e2e/
    └── bail-pipeline.test.ts
```

Run with `npm test`.

### Frontend (Vitest + Vue Test Utils)

```bash
# frontend/tests/
frontend/tests/
├── components/
│   ├── MessageBubble.test.ts
│   ├── SourceItem.test.ts
│   └── StudioCard.test.ts
└── stores/
    ├── chat.store.test.ts
    └── citation.store.test.ts
```

---

## 10. Performance tips

### Hot paths

| Hot path | Optimization |
|----------|--------------|
| Citation aggregation | Cache external API results in `citation_cache` table (1h TTL) |
| pgvector search | Create HNSW index: `CREATE INDEX ON statute_sections USING hnsw (embedding vector_cosine_ops);` |
| BM25 search | Loaded into memory on startup; rebuild if statute data changes |
| OpenAI embedding | Batch 100 at a time when ingesting |
| File uploads | Multer uses memory storage; if files get huge, switch to disk |

### Query optimization

```typescript
// ❌ N+1 query
const docs = await prisma.caseDocument.findMany({ where: { caseId } });
for (const doc of docs) {
  const messages = await prisma.chatMessage.findMany({ where: { documentId: doc.id } });
}

// ✅ One query with include
const docs = await prisma.caseDocument.findMany({
  where: { caseId },
  include: { chatMessages: true },
});
```

### Frontend bundle size

- Tree-shake unused Tailwind classes (handled automatically by v4)
- Lazy-load views via dynamic import (already done in router)
- Avoid importing entire icon libraries; inline SVGs are fine for ~30 icons

---

## 11. Git workflow

```bash
# Feature work
git checkout -b feature/family-domain
# ... edit + commit ...
git push origin feature/family-domain
# Open PR

# Hotfix
git checkout -b fix/citation-validator-crash
```

### Commit messages

Format: `<type>(<scope>): <subject>`

| Type | Use |
|------|-----|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code change, no behavior change |
| `docs` | Documentation only |
| `chore` | Maintenance |
| `perf` | Performance |
| `test` | Tests |

Examples:

```
feat(domains): add family law domain with divorce petition drafter
fix(citation): handle missing pageNumber in preview endpoint
refactor(chat): extract handleCommand into per-domain dispatchers
docs(architecture): clarify pgvector storage model
```

---

## 12. Production deployment

> 🚧 Not yet productionized. When deploying:

### Backend

```bash
cd backend
npm install --production
npx prisma generate
npx prisma migrate deploy
npm run build
node dist/index.js
```

**Known issue:** Dynamic plugin imports use `.ts` paths which don't exist in `dist/`. Before production, fix `domain-registry.ts` and `drafter-registry.ts` to try `.js` first.

### Frontend

```bash
cd frontend
npm install
npm run build
# Serve dist/ behind nginx or any static host
```

### Infrastructure (minimal)

| Component | Service |
|-----------|---------|
| Postgres | RDS / Cloud SQL / Supabase (must enable pgvector) |
| Backend | Single Node.js process; PM2 / systemd / Fly.io |
| Frontend | Vercel / Netlify / nginx |
| File storage | Local disk works for MVP; swap to S3 in `storage.service.ts` for prod |
| Logs | Pino to stdout; pipe to your logging service |

---

## 13. Where to look when…

| You want to… | Read |
|--------------|------|
| Understand the big picture | `ARCHITECTURE.md` |
| Get started developing | This file |
| Add a domain, act, or provider | `backend/EXTENSIBILITY.md` |
| Know what's broken or missing | `AUDIT.md` |
| Pitch the product | `README.md` |
| Trace a chat request | `chat.service.ts:handleMessage` |
| Trace a bail generation | `domains/criminal/drafters/regular-bail.drafter.ts` |
| See the DB schema | `prisma/schema.prisma` |
| Tweak the UI layout | `frontend/src/views/ChatView.vue` |
| Add an API endpoint | `backend/src/routes/<scope>.routes.ts` |
| Change citation behavior | `backend/src/services/citation/` |
| Generate embeddings | `scripts/ingest-statutes.ts` |

---

## 14. Open questions for new contributors

When you join the project, here are good first issues:

1. **Wire the citation system** into `chat.service.ts` (see AUDIT.md S1)
2. **Wire the domain router** into chat (AUDIT.md S2)
3. **Filter by `enabled`** flag when loading case context (AUDIT.md S5)
4. **Fix dynamic plugin imports** for production builds (AUDIT.md B3)
5. **Add prerequisite checks** before generation (AUDIT.md S3)
6. **Import CommandChips** into ChatInput (AUDIT.md I4)
7. **Remove legacy routes** or migrate them (AUDIT.md I8)
8. **Add unit tests** for citation-validator (no tests exist yet)
9. **Implement real web search** in `sources.routes.ts` (currently a stub)
10. **Make UI mobile-responsive**

---

## 15. Quick reference

```bash
# Start everything
cd backend && npm run dev    # one terminal
cd frontend && npm run dev   # another terminal

# Reset DB
npx prisma db push --force-reset
npm run db:seed

# Reload extracted data
npm run extract:books
npm run ingest:statutes

# Check what plugins loaded
curl http://localhost:3001/api/health
curl http://localhost:3001/api/studio-actions
curl http://localhost:3001/api/commands

# Browse the DB
npm run db:studio
```

---

## 16. Need help?

- **Architecture questions** → read `ARCHITECTURE.md`, then ping the maintainer
- **"How do I add X"** → check `EXTENSIBILITY.md` first
- **"Why is X broken"** → check `AUDIT.md` — it's probably a known gap
- **"What does this code do"** → most files have a header comment; logger module name tells you which service it is

Welcome to the codebase. Build something good.
