# Getting Started

This guide takes you from a clean machine to a running LexiMini stack in roughly **10 minutes**.

> If you only want to *read* the architecture and contribute docs/code without running it, skip to [Architecture Overview](./architecture/01-overview.md).

---

## 1. Prerequisites

| Requirement      | Version              | Notes |
|------------------|----------------------|-------|
| Node.js          | **≥ 20.x**           | Backend & frontend share this runtime. |
| pnpm (preferred) | ≥ 9.x                | npm/yarn also work; lockfiles are pnpm. |
| PostgreSQL       | **≥ 16** with `pgvector` extension | Local Postgres or hosted (Neon/Supabase) both work. |
| OpenAI API key   | Any tier with `gpt-4o` access | Vision + chat + embeddings used. |
| Git              | recent               | — |
| OS               | macOS / Linux / Windows 10+ | Repo verified on Windows 11. |

> Optional: an **Indian Kanoon API key** (`INDIAN_KANOON_API_KEY`) — without it, the Indian Kanoon citation provider is silently disabled and only internal+case-document citations are used.

---

## 2. Clone & install

```bash
git clone <repo-url> leximini
cd leximini

# Backend
cd backend
pnpm install         # or: npm install

# Frontend
cd ../frontend
pnpm install
```

---

## 3. Provision Postgres + pgvector

Any of these works:

### Option A — local Docker (fastest)
```bash
docker run -d --name leximini-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=leximini \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

### Option B — managed (Neon, Supabase, RDS)
Create a Postgres 16 instance and run once:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

> The backend's `initDatabase()` will also try `CREATE EXTENSION IF NOT EXISTS vector` on boot. Some managed providers require it pre-installed by an admin.

---

## 4. Configure environment

Create `backend/.env`:

```dotenv
# Required
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/leximini

# Recommended defaults
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
UPLOAD_DIR=./uploads
OUTPUT_DIR=./output
MAX_FILE_SIZE_MB=20
LOG_LEVEL=info

OPENAI_MODEL=gpt-4o
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Optional
# INDIAN_KANOON_API_KEY=...
```

Every variable is validated by Zod at startup — see [`backend/src/config/env.ts`](../backend/src/config/env.ts) and [Backend / Middleware & Config](./backend/07-middleware-config.md).

---

## 5. Initialise the database

```bash
cd backend
pnpm db:generate       # generate Prisma client
pnpm db:push           # create all 18 tables + pgvector columns
pnpm db:seed           # seed BNS / BNSS / BSA Acts + chapters
```

The seed creates:

- 3 `Act` rows (BNS, BNSS, BSA)
- 9 sample `Chapter` rows

Full statute sections + precedents come from **ingestion scripts** (Step 7).

---

## 6. Start the dev servers

```bash
# Terminal 1 — Backend
cd backend
pnpm dev               # http://localhost:3001

# Terminal 2 — Frontend
cd frontend
pnpm dev               # http://localhost:5173
```

Open <http://localhost:5173>. You should see the **ChatView** (the primary 3-pane interface). For the legacy bail-only demo go to <http://localhost:5173/legacy>.

Health check: <http://localhost:3001/api/health> — should return `{ "data": { "status": "ok", "services": { "openai": "...", "pinecone": "..." } } }`.

---

## 7. (Optional) Ingest statute & precedent data

The empty database has no searchable statute rows yet. To load BNS/BNSS/BSA full text + precedents:

```bash
cd backend
pnpm extract:books     # extract section text from PDFs in backend/book/
pnpm enrich:data       # call LLM to add ingredients/keywords
pnpm ingest:statutes   # write to Postgres + generate 1536-d embeddings
pnpm ingest:precedents # case law into precedents table
```

Costs OpenAI tokens (embedding the full statute corpus). Budget a few dollars at MVP scale.

After ingestion, hit `GET /api/sections/stats` to verify counts.

---

## 8. End-to-end smoke test

1. Open <http://localhost:5173>.
2. **New case** → upload an FIR PDF in the left **Sources** panel.
3. In the right **Studio** panel, click **Regular Bail** (or type `@bail` in chat).
4. Watch the chat: a *GenerationCard* will appear and stream progress.
5. When it completes, click **Download** to retrieve the `.docx`.

If you'd rather test the legacy linear demo:
- Go to `/legacy` → drag an FIR → watch live `StepProgress` (SSE) → auto-redirected to `/draft/:id`.

---

## 9. Useful scripts

| Script                          | Purpose                                            |
|---------------------------------|----------------------------------------------------|
| `backend/pnpm dev`              | hot-reload backend via `tsx watch`                 |
| `backend/pnpm build`            | TypeScript → `dist/`                               |
| `backend/pnpm start`            | run compiled production build                      |
| `backend/pnpm db:studio`        | Prisma Studio UI on tables                         |
| `backend/pnpm db:migrate`       | create a versioned migration (vs `db:push` which is dev-only) |
| `frontend/pnpm dev`             | Vite hot-reload at :5173                           |
| `frontend/pnpm build`           | static build to `frontend/dist`                    |

---

## 10. Troubleshooting

| Symptom                                           | Fix                                                  |
|---------------------------------------------------|------------------------------------------------------|
| `OPENAI_API_KEY is required` on boot              | Set it in `backend/.env`.                            |
| `extension "vector" does not exist`               | Run `CREATE EXTENSION vector;` as a superuser, or use the `pgvector/pgvector:pg16` Docker image. |
| Vite proxy 502 on `/api/*`                        | Make sure backend is running on `:3001` (matches `frontend/vite.config.ts`). |
| `Citation provider error: indian-kanoon` warnings | Either set `INDIAN_KANOON_API_KEY` or ignore — it auto-disables. |
| `pnpm: command not found`                         | `npm i -g pnpm`, or use `npm install`/`npm run dev`. |
| Pipeline stuck on "Extract"                       | Slow OCR — vision step has a 120s timeout and one retry. Check `OPENAI_API_KEY` quota. |
| `LegalMemo has zero sections`                     | You haven't ingested statutes. Run `pnpm ingest:statutes`. |

---

Next: read the [Architecture Overview](./architecture/01-overview.md).
