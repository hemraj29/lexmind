# Deployment

The MVP is **single-process, single-tenant**. This page covers what works today and where the seams are for scaling out.

---

## 1. Runtime topology (MVP)

```
        ┌─────────────────────────────┐
        │  CDN / static host           │   frontend/dist (built static)
        │  (Vercel, Netlify, Caddy)    │
        └─────────────┬───────────────┘
                      │  fetches  /api/*  + /output/*
                      ▼
        ┌─────────────────────────────┐
        │  Node 20 process             │   backend, single instance
        │  (Docker / PM2 / systemd)    │
        │                              │
        │  - express 4                 │
        │  - prisma client             │
        │  - openai sdk                │
        │  - in-process BM25 cache     │
        │  - local fs uploads/, output │
        └─────────────┬───────────────┘
                      │ TCP 5432
                      ▼
        ┌─────────────────────────────┐
        │  PostgreSQL 16 + pgvector    │
        │  managed (Neon / Supabase)   │
        │  or self-hosted              │
        └─────────────────────────────┘
```

Storage volumes:
- `backend/uploads/` — user-uploaded source files.
- `backend/output/` — generated `.docx`.
Both are bind-mounted in production so they survive container restarts.

---

## 2. Required environment

| Var | Required? | Default | Notes |
|-----|-----------|---------|-------|
| `OPENAI_API_KEY` | yes | — | gpt-4o + embeddings + vision |
| `DATABASE_URL` | yes | — | Postgres 16 + pgvector |
| `PORT` | no | 3001 | |
| `NODE_ENV` | no | `development` | set `production` in prod |
| `CORS_ORIGIN` | no | `http://localhost:5173` | exact match, no wildcard in MVP |
| `UPLOAD_DIR` | no | `./uploads` | absolute path in prod |
| `OUTPUT_DIR` | no | `./output` | absolute path in prod |
| `MAX_FILE_SIZE_MB` | no | 20 | multer body limit |
| `LOG_LEVEL` | no | `info` | `debug` is fine for staging |
| `OPENAI_MODEL` | no | `gpt-4o` | swap to override globally |
| `OPENAI_EMBEDDING_MODEL` | no | `text-embedding-3-small` | dim must equal 1536 |
| `INDIAN_KANOON_API_KEY` | no | — | enables IK citation provider |

The whole list is validated by Zod at startup. Missing required → process exits with a readable error.

---

## 3. Build & ship — backend

```bash
cd backend
pnpm install --frozen-lockfile
pnpm db:generate
pnpm build           # → dist/
NODE_ENV=production node dist/index.js
```

Recommended Dockerfile sketch:

```dockerfile
FROM node:20-bookworm-slim AS base
WORKDIR /app
COPY backend/package.json backend/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod=false
COPY backend ./
RUN pnpm db:generate && pnpm build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/prisma ./prisma
RUN mkdir -p /app/uploads /app/output
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

Pre-deploy: run `pnpm db:migrate deploy` against the target DB. The boot process *also* calls `initDatabase()` which runs `CREATE EXTENSION IF NOT EXISTS vector` if it has permission.

---

## 4. Build & ship — frontend

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm build
# → frontend/dist/{index.html, assets/*}
```

Host options:

| Host | Notes |
|------|-------|
| **Vercel / Netlify / Cloudflare Pages** | drop `frontend/dist` as the build output. Configure a redirect/rewrite for `/api/*` and `/output/*` to your backend host. |
| **Same origin as backend** | add `app.use(express.static(path.join(__dirname, "../frontend/dist")))` to `index.ts`. Easier auth/CORS story. |
| **Nginx / Caddy** | reverse-proxy `/api → :3001`, serve static `frontend/dist/` for everything else. |

The frontend assumes routes don't 404 on hard refresh — make sure your host serves `index.html` for unknown paths (SPA fallback).

---

## 5. Database

Any Postgres 16+ with the `pgvector` extension.

### Schema bootstrap

In dev: `pnpm db:push` (no migration tracking).

In prod: **use migrations**.

```bash
pnpm db:migrate dev --name init           # local
pnpm db:migrate deploy                    # CI / prod
```

`prisma/migrations/` should be committed.

### pgvector

`initDatabase()` issues:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

If the DB user can't `CREATE EXTENSION`, ask the DBA to run it once.

### Vector index (recommended at scale)

The schema doesn't ship an HNSW index — it's optional but unlocks 10–100× search throughput once row counts exceed ~50k. After ingestion:

```sql
CREATE INDEX statute_sections_embedding_idx
  ON statute_sections USING hnsw (embedding vector_cosine_ops);

CREATE INDEX precedents_embedding_idx
  ON precedents USING hnsw (embedding vector_cosine_ops);
```

### Connection pooling

For high traffic, run **PgBouncer** in front with transaction-pool mode and set Prisma's `PRISMA_CLIENT_ENGINE_TYPE=binary` or use the data proxy.

---

## 6. Observability

### Logs
- `LOG_LEVEL=info` is the prod default.
- Pino emits JSON; ship to wherever (Loki, Datadog, CloudWatch).
- Look for `module` field to filter by subsystem.

### Health
- `GET /api/health` — wire into your load balancer's health-check.
- 200 means OpenAI + Postgres both responded.
- 503 means at least one dependency is unreachable.

### Tracing (future)
The current `WorkflowEngine.emit` is the natural seam for OpenTelemetry spans (one span per step).

### Metrics (future)
Counters worth adding when Phase 5 ships:
- pipeline_runs_total{status}
- pipeline_step_duration_ms{step}
- llm_calls_total{model}
- llm_tokens_total{model,direction}
- citation_validation_drops_total
- hybrid_search_latency_ms

---

## 7. Security checklist (MVP)

| Concern | Status |
|---------|--------|
| Helmet headers | ✅ |
| CORS allow-list | ✅ (single origin) |
| Rate limit | ✅ 60 req/min/IP |
| File size limit | ✅ 20 MB default |
| File type allow-list | ✅ PDF/JPG/PNG (chat upload also accepts DOCX) |
| Zod input validation | ✅ everywhere |
| Auth | ❌ MVP — single-tenant. Phase 5. |
| Multi-tenant data isolation | ❌ MVP — no users. Phase 5. |
| OpenAI key handling | ✅ env-only, never logged |
| TLS termination | ⚠️ deployment-specific; terminate at the CDN / reverse proxy. |
| Secret rotation | ⚠️ manual. |

Do not put a public domain in front of MVP without adding at least basic auth (e.g. nginx basic-auth or an upstream Auth proxy).

---

## 8. Backups

What you must back up:

| What | Where | Frequency |
|------|-------|-----------|
| Postgres database | hosted provider snapshot or `pg_dump` | daily at minimum |
| `backend/uploads/` | source PDFs/images | daily |
| `backend/output/` | generated `.docx` | weekly (idempotent — can re-run if you keep `pipeline_runs.steps`) |

When Phase 5 swaps storage to S3, both directories migrate there and lifecycle policies do the work.

---

## 9. Cost model (rough MVP)

Per FIR run, typical numbers (gpt-4o vision + chat + embedding):

| Step | Tokens (rough) | Cost (approx, USD) |
|------|---------------|---------------------|
| Extract (vision OCR on 2-page FIR) | 4-8 k vision + 1 k output | $0.05 – $0.10 |
| Research (3 hybrid queries + LLM synth) | 6 k + 1 k | $0.03 |
| Draft (long generation) | 8 k + 3 k | $0.06 |
| Reranker (1 call) | 4 k + 0.5 k | $0.02 |
| Embedding (per ingestion run only) | — | one-time, ~$10 for full BNS corpus |

Total per draft: **~$0.15–$0.25**. Plan a budget alert at the OpenAI dashboard.

When [Phase 6 caching](./01-roadmap.md) ships, ~40% of these tokens (repeated case context) drop into a cache.

---

Next: [Contributing](./05-contributing.md).
