# Roadmap

This page is the long-term plan: where LexiMini is going phase by phase, and which subsystems each phase touches. Dates are *targets*, not commitments. Anything before today is shipping in the MVP.

---

## Status at a glance (as of 2026-05)

| Track | Status |
|-------|--------|
| FIR → Bail end-to-end pipeline | **Shipped** (legacy `/legacy` flow) |
| ChatView 3-pane interface | **Shipped** |
| Criminal domain plugin (6 drafters) | **Shipped** |
| Civil domain plugin (3 drafters) | **Shipped** |
| Plugin registry + auto-discovery | **Shipped** |
| Hybrid search (vector + BM25 + RRF + rerank) | **Shipped** |
| Citation aggregator + validator + verifier | **Shipped** |
| Indian Kanoon provider | **Shipped** (env-gated) |
| Statute ingestion + embedding | **Shipped** |
| Precedent ingestion | **Shipped** |
| Authentication | Phase 5 |
| Queue / concurrent runs | Phase 5 |
| Reviewer agent loop | Phase 3 |
| Multi-language input/output | Phase 4 |

---

## Phase 2 — Enhanced Legal Intelligence (Q3 2026)

Goal: lift quality and coverage without changing the architecture.

```
┌─────────────────────────────────────────────────────────────────┐
│  MULTI-DOCUMENT SUPPORT                                          │
│                                                                 │
│   Current: FIR alone drives the pipeline                        │
│   Future:                                                       │
│     ├── Chargesheet parsing (already extractable via            │
│     │   documentAnalyzerAgent — wire into researcher prompts)   │
│     ├── Previous court orders (analyse for prior bail rejection)│
│     ├── Witness statements                                      │
│     ├── Custody applications                                    │
│     └── Anticipatory bail applications (incoming, for review)   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  ADVANCED RAG                                                    │
│                                                                 │
│   Current: pgvector + BM25 + GPT-4o rerank                      │
│   Future:                                                       │
│     ├── BGE-Reranker (self-hosted)  →  ~50ms vs 1.5s            │
│     ├── Parent-child chunk retrieval (sections + paragraphs)    │
│     ├── Query decomposition for complex legal queries           │
│     ├── Full Indian case law corpus (100K+ cases)               │
│     └── High Court / Supreme Court-specific indices             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  STRUCTURAL CLEANUP                                              │
│                                                                 │
│   • Convert ActType / GenerationDocType Prisma enums → String   │
│     so new acts/doc-types don't require migrations              │
│   • Rename health "pinecone" key → "postgres"                   │
│   • Persist BM25 index to disk (or move to Postgres FTS)        │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 3 — Agentic workflows (Q4 2026)

Goal: self-correcting drafts.

```
┌─────────────────────────────────────────────────────────────────┐
│  SELF-CORRECTING AGENT LOOP                                      │
│                                                                 │
│   Current: linear pipeline  A → B → C → D → E                   │
│   Future:                                                       │
│                                                                 │
│     ┌──────────┐    ┌──────────┐    ┌──────────┐                │
│     │ Extract  │───▶│ Research │───▶│  Draft   │                │
│     └──────────┘    └────┬─────┘    └────┬─────┘                │
│           ▲              │               │                       │
│           │              │     ┌─────────▼──────────┐            │
│           │              │     │    REVIEWER         │            │
│           │              │     │    (new agent)      │            │
│           │              │     │                     │            │
│           │              │     │  • All facts cited? │            │
│           │              │     │  • Sections match?  │            │
│           └──────────────┤     │  • Arguments strong?│            │
│             "need more   │     │  • Format correct?  │            │
│              sections"   │     └─────────┬───────────┘            │
│                          │               │                       │
│                          │       pass ──┤── fail                 │
│                          │               │                       │
│                          └───────────────┘                       │
│                          "redo research for section X"           │
│                                                                 │
│   Implementation:                                                │
│     • Extend WorkflowEngine with goto / branch / loop            │
│     • New ReviewerAgent at src/agents/reviewer.agent.ts          │
│     • Persist a "review cycles" counter on PipelineRun          │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 4 — Languages & court variants (Q1 2027)

```
┌─────────────────────────────────────────────────────────────────┐
│  LANGUAGE & JURISDICTION                                         │
│                                                                 │
│   Languages:                                                    │
│     ├── Hindi FIR input (already works — exercise + tune        │
│     │   prompts)                                                │
│     ├── Hindi draft output (new docgen templates)               │
│     ├── Marathi, Tamil, Telugu, Bengali FIR support             │
│     └── Bilingual drafts (English + regional)                   │
│                                                                 │
│   Court-specific templates (use DocumentTypeConfig.templateConfig):│
│     ├── Sessions Court bail                                     │
│     ├── High Court bail (different format)                      │
│     ├── Supreme Court SLP                                       │
│     ├── Anticipatory bail (Sec 482 BNSS)                        │
│     ├── Default bail (Sec 187 BNSS)                             │
│     └── Interim bail                                            │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 5 — Platform scale (Q2–Q3 2027)

```
┌─────────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE                                                  │
│                                                                 │
│   Authentication:                                               │
│     ├── Clerk / Auth.js for lawyer login                        │
│     ├── Role-based access (lawyer / admin / reviewer)           │
│     └── API key management                                      │
│                                                                 │
│   Queue:                                                        │
│     ├── BullMQ + Redis for pipeline jobs                        │
│     ├── Concurrent pipeline runs                                │
│     └── Priority queue (paid users first)                       │
│                                                                 │
│   Storage:                                                      │
│     ├── storage.service → AWS S3 (interface already abstracts)  │
│     ├── CDN for generated documents                             │
│     └── Document versioning                                     │
│                                                                 │
│   Database:                                                     │
│     ├── Read replicas for search-heavy queries                  │
│     ├── PgBouncer connection pooling                            │
│     └── HNSW index tuning for pgvector at scale                 │
│                                                                 │
│   Deployment:                                                   │
│     ├── Docker Compose (dev)                                    │
│     ├── Kubernetes (prod)                                       │
│     ├── GitHub Actions CI/CD                                    │
│     └── Monitoring: Grafana + Prometheus + Sentry              │
│                                                                 │
│   Billing:                                                      │
│     ├── Stripe integration                                      │
│     ├── Per-generation pricing                                  │
│     └── Subscription tiers                                      │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 6 — AI enhancements (ongoing)

```
┌─────────────────────────────────────────────────────────────────┐
│  MODEL + AI                                                      │
│                                                                 │
│   Fine-tuning:                                                  │
│     ├── GPT-4o on Indian FIR corpus                             │
│     ├── Extraction model for Hindi handwritten FIRs             │
│     └── Drafter on accepted bail applications                   │
│                                                                 │
│   Evaluation:                                                   │
│     ├── Section-mapping accuracy autoevals                      │
│     ├── Lawyer 1-5 usability scoring                            │
│     ├── Hallucination detection rate                            │
│     └── A/B testing for prompt strategies                       │
│                                                                 │
│   Multi-model router:                                           │
│     ├── Claude for drafting (better legal prose?)               │
│     ├── Gemini for OCR (longer context big FIRs)                │
│     ├── Local model embeddings (cost reduction)                 │
│     └── Per-task best-model selection                           │
│                                                                 │
│   Caching:                                                      │
│     ├── Redis for embeddings                                    │
│     ├── Cache common section lookups                            │
│     └── Deduplicate identical FIR re-runs                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## What's already pluggable

Subsystems are *built* to accept the future without rewrites:

| Future need | Where it already plugs in |
|-------------|---------------------------|
| New legal domain (Tax, Family, Labour, IP) | `domains/<code>/` folder drop |
| New act (NDPS, POCSO, PMLA, …) | `acts/<domain>/*.act.json` |
| New citation source (SCC Online, Manupatra) | `services/citation/providers/*.provider.ts` |
| New document type | `documentTypes[]` entry + a drafter file |
| New chat command | maps 1:1 with a `documentTypes.command` |
| Reviewer agent loop | `WorkflowEngine` already has `onError`/recovery seams |
| S3 file storage | `storage.service.ts` is the only file-IO seam |
| Redis queue | `pipeline.routes` already returns `runId` before processing |
| WebSocket | `WorkflowEngine.emit` is the only event seam (currently SSE) |

---

## Tracking decisions

This document is the **forward-looking** view. Anything that has *actually shipped* belongs in commit messages and PR descriptions, not here.

When a phase ships, move its block under "Status at a glance" and tick it.

Next: [MVP Scope](./02-mvp-scope.md) for what's intentionally *not* in MVP.
