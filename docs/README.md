# LexiMini — Documentation Index

> **Buildio-Legal AI Engine**
> Converts Indian legal source documents (FIRs, chargesheets, court orders, etc.) into court-ready drafts — bail applications, plaints, written statements, quashing petitions, and more — using a plugin-driven, anti-hallucination, retrieval-augmented pipeline.

This `docs/` tree is generated from the source code of the LexiMini monorepo. It is organised so that:

- A **product/business reader** can pick up just the [Architecture](./architecture/01-overview.md) and the [Planning](./planning/01-roadmap.md) tracks.
- A **frontend developer** can read [Frontend Developer Guide](./frontend/01-overview.md) plus the [API Reference](./architecture/06-api-reference.md).
- A **backend developer** can read the full [Backend Developer Guide](./backend/01-overview.md) plus [Data Model](./architecture/05-data-model.md) and [Pipeline Flow](./architecture/04-pipeline-flow.md).
- A **plugin author** (adding a domain / act / drafter / citation source) can jump straight to [Extending LexiMini](./planning/03-extending.md).

---

## How to navigate

```
docs/
├── README.md                              ← you are here
├── 01-getting-started.md                  ← run the stack locally in 10 minutes
├── 02-glossary.md                         ← every term, acronym, and code defined
│
├── architecture/                          ← system-level understanding
│   ├── 01-overview.md                     ← what the system is & why it exists
│   ├── 02-tech-stack.md                   ← every library, why it was chosen
│   ├── 03-plugin-architecture.md          ← domains / drafters / acts / providers
│   ├── 04-pipeline-flow.md                ← FIR → Bail full data flow
│   ├── 05-data-model.md                   ← Prisma schema, 18 tables, every field
│   ├── 06-api-reference.md                ← every HTTP/SSE endpoint, shapes incl.
│   ├── 07-anti-hallucination.md           ← grounding / validation / citations
│   └── 08-hybrid-search.md                ← pgvector + BM25 + RRF + rerank
│
├── backend/                               ← developer-specific backend docs
│   ├── 01-overview.md                     ← layout, entry point, request lifecycle
│   ├── 02-agents.md                       ← extractor, researcher, drafter, etc.
│   ├── 03-workflows.md                    ← engine, steps, events, retries
│   ├── 04-services.md                     ← OpenAI, DB, search, docgen, storage
│   ├── 05-routes.md                       ← each route file + endpoint
│   ├── 06-citations.md                    ← aggregator, validator, verifier
│   ├── 07-middleware-config.md            ← env, upload, validate, error handler
│   └── 08-domains-drafters.md             ← per-domain plugin walkthrough
│
├── frontend/                              ← developer-specific frontend docs
│   ├── 01-overview.md                     ← Vite, Vue 3, Pinia, Tailwind, router
│   ├── 02-views.md                        ← every page view explained
│   ├── 03-stores.md                       ← Pinia stores: state + actions
│   ├── 04-composables.md                  ← useApi, usePipeline, useUpload
│   └── 05-components.md                   ← shared + chat + sources + studio
│
└── planning/                              ← product, roadmap, ops
    ├── 01-roadmap.md                      ← Phase 2–6 plans (Q3 26 → Q3 27)
    ├── 02-mvp-scope.md                    ← what is and isn't in MVP
    ├── 03-extending.md                    ← add domain / act / drafter / provider
    ├── 04-deployment.md                   ← envs, secrets, hosting plan
    └── 05-contributing.md                 ← coding style, commits, PR flow
```

---

## At-a-glance

| Layer        | Tech                                            |
|--------------|-------------------------------------------------|
| Frontend     | Vue 3.5 · Vite 6 · Pinia · Tailwind 4 · Router 4 |
| Backend      | Node 20 · Express 4 · TypeScript 5 (strict)     |
| Data         | PostgreSQL 16 + `pgvector` · Prisma 6           |
| AI           | OpenAI `gpt-4o` · `text-embedding-3-small` (1536d) |
| Search       | pgvector (cosine) + custom BM25 + RRF + LLM rerank |
| Streaming    | Server-Sent Events (SSE) for pipeline progress  |
| Doc output   | `docx` npm package (no LibreOffice)             |
| Validation   | Zod (env + API + LLM output)                    |
| Logging      | Pino (pretty in dev, structured JSON in prod)   |

---

## Key design pillars

1. **Plugin-driven, not switch-driven.** New legal domains (Tax, Family, Labour, IP…) drop in as a folder. No `core/` change.
2. **Grounded by construction.** Every LLM prompt is given *only* DB-retrieved sections / precedents. Outputs are validated, hallucinations stripped.
3. **One database, two access paths.** Postgres holds relational + `vector(1536)` columns in the same row, so no separate vector DB to operate.
4. **Workflows are typed pipelines.** A `WorkflowEngine` chains typed steps with retries, timeouts, per-step validation, and SSE events.
5. **Citations are a first-class entity.** Every claim in a generated document links back to a `Citation` row (section / precedent / case-doc / web).

---

## Where to start reading, by role

| If you are…                            | Read this first                                    |
|----------------------------------------|----------------------------------------------------|
| Brand new to the project               | [Architecture Overview](./architecture/01-overview.md) → [Pipeline Flow](./architecture/04-pipeline-flow.md) |
| Setting up local dev                   | [Getting Started](./01-getting-started.md)         |
| Building a UI feature                  | [Frontend Overview](./frontend/01-overview.md)     |
| Adding a backend endpoint              | [Backend Overview](./backend/01-overview.md) → [Routes](./backend/05-routes.md) |
| Adding a new legal domain (Tax, IP, …) | [Plugin Architecture](./architecture/03-plugin-architecture.md) → [Extending](./planning/03-extending.md) |
| Debugging a pipeline run               | [Pipeline Flow](./architecture/04-pipeline-flow.md) → [Workflows](./backend/03-workflows.md) |
| Reviewing legal accuracy               | [Anti-Hallucination](./architecture/07-anti-hallucination.md) → [Citations](./backend/06-citations.md) |
