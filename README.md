# LexiMini

> **AI defense lawyer's workstation for Indian law — every claim verifiable, every citation traceable.**

LexiMini is a citation-first AI platform built for Indian lawyers. Upload an FIR, chargesheet, or any legal document. Chat with your case. Generate court-ready bail applications, plaints, quashing petitions, and more — with every legal claim backed by a clickable source.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  LexiMini                                            [+ Create notebook]│
├────────────────┬──────────────────────────────────┬──────────────────────┤
│ Sources    (3) │ State vs. Rajesh Kumar           │ Studio              │
├────────────────┼──────────────────────────────────┼──────────────────────┤
│ ☑ 📄 FIR       │ 👤 What are bail chances?        │ DRAFT DOCUMENTS     │
│ ☑ 📄 Chargesht │                                  │ ┌──┬──┐ ┌──┬──┐    │
│ ☑ 📄 Order     │ 🤖 Both sections [1][2] are      │ │⚖️│🛡️│ │❌│📄│    │
│                │ bailable. SC in Sanjay Chandra   │ └──┴──┘ └──┴──┘    │
│ [+ Add source] │ v. CBI [3] held bail is the     │ CASE ANALYSIS       │
│ Web search ──→ │ rule. Section 480 BNSS [4]...    │ ┌──┬──┐             │
│                │                                  │ │📊│📋│             │
│                │ Type @bail to generate.          │ └──┴──┘             │
│                │ ✓ 4 verified citations           │ [+ Add note]        │
└────────────────┴──────────────────────────────────┴──────────────────────┘
                            ↓ click [3]
                  Side panel opens with Indian Kanoon
                  judgment scrolled to Para 8, passage
                  highlighted in yellow.
```

---

## What it does

| Feature | Description |
|---------|-------------|
| 📥 **Upload anything** | FIR, chargesheet, court orders, witness statements, evidence, prior petitions. AI auto-classifies and extracts structured data. |
| 💬 **Chat with your case** | Ask questions in plain language. Every legal claim cites a real section, judgment, or your own uploaded document. |
| ⚖️ **Generate court-ready drafts** | 9+ document types across criminal and civil law — bail, anticipatory bail, quashing, discharge, appeal, plaint, written statement, injunction. Output is a properly formatted `.docx`. |
| 🔍 **Verifiable citations** | Hover any `[1]` to see the source excerpt. Click to open the original PDF/judgment at the exact page. Zero hallucinated case names. |
| 🧠 **Case analysis** | Strengths, weaknesses, prosecution's likely arguments, recommended petition order. |
| 🌐 **Multi-source retrieval** | Searches local knowledge base, your case docs, and external legal databases (Indian Kanoon, SCC Online) in parallel. |
| 🔌 **Plugin architecture** | Add new legal domains (tax, family, IP) or new acts (NDPS, POCSO, PMLA) by dropping config files. No core code changes. |

---

## Quick start

### Prerequisites

- **Node.js 20+**
- **PostgreSQL 16+** with the `pgvector` extension
- **OpenAI API key** (for embeddings + chat)
- **AWS Bedrock access** (optional — for bulk PDF extraction with GPT-OSS 120B)
- **Indian Kanoon API key** (optional — for external case law search)

### One-shot install

```bash
# 1. Clone and install
git clone <repo-url> leximini
cd leximini

# 2. Backend setup
cd backend
npm install
cp .env.example .env       # fill in OPENAI_API_KEY + DATABASE_URL
npx prisma generate
npx prisma db push         # creates all tables + enables pgvector
npm run db:seed            # seeds Acts + Chapters
npm run dev                # starts API at http://localhost:3001

# 3. Frontend setup (new terminal)
cd ../frontend
npm install
npm run dev                # starts UI at http://localhost:5173
```

Open `http://localhost:5173` and click **"+ Create notebook"** to start.

### Optional: Seed legal data

```bash
cd backend

# Extract sections from BNS/BNSS/BSA PDFs (uses AWS Bedrock)
npm run extract:books

# Ingest into Postgres + generate pgvector embeddings (uses OpenAI)
npm run ingest:statutes

# Add curated landmark precedents (optional)
npm run ingest:precedents
```

---

## How it works (60-second mental model)

```
                              YOU UPLOAD A DOCUMENT
                                       │
                                       ▼
                    Document Analyzer Agent classifies it
                    (FIR? Chargesheet? Court Order?)
                                       │
                                       ▼
                       Extracts structured data via LLM
                    (firNumber, accused, sections, facts…)
                                       │
                                       ▼
                  Saved to PostgreSQL + indexed for search
                                       │
                                       │
                              YOU ASK A QUESTION
                                       │
                                       ▼
                   Domain Router picks the right domain
                          (criminal / civil / tax…)
                                       │
                                       ▼
              Citation Aggregator runs all providers in parallel:
              ┌─ Internal pgvector (your DB)       ─┐
              ├─ Case documents (your uploads)      ├─ → Reciprocal Rank Fusion
              └─ Indian Kanoon API (external)      ─┘    + LLM rerank
                                       │
                                       ▼
                       LLM generates response CONSTRAINED
                       to use ONLY the fetched citations
                                       │
                                       ▼
                Citation Validator strips any unsupported claim
                                       │
                                       ▼
                You see the answer with clickable [^cite_N] chips
```

---

## Architecture at a glance

LexiMini is built on a **plugin architecture**. The core never changes — new domains, drafters, and citation providers plug in at runtime.

```
backend/src/
├── core/                  # Plugin registries (never changes)
├── domains/               # Plugins per domain
│   ├── criminal/          # Criminal law: 6 drafters
│   ├── civil/             # Civil litigation: 3 drafters
│   └── _template/         # Copy this to add new domains
├── acts/                  # Act metadata (one JSON per act)
├── agents/                # AI agents (domain-agnostic)
│   ├── document-analyzer.agent.ts
│   ├── researcher.agent.ts
│   ├── strategy-advisor.agent.ts
│   ├── domain-router.agent.ts
│   └── drafter-factory.agent.ts
├── services/
│   ├── citation/          # Multi-provider citation system
│   │   ├── providers/     # Pluggable retrieval sources
│   │   └── citation-aggregator.service.ts
│   └── …
└── routes/                # HTTP API (Express)
```

Full architecture details: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
Adding a new domain or act: [`backend/EXTENSIBILITY.md`](./backend/EXTENSIBILITY.md)
Developer setup: [`DEVELOPER.md`](./DEVELOPER.md)

---

## Tech stack

| Layer | Tech | Why |
|-------|------|-----|
| Frontend | Vue 3 + Vite + Tailwind v4 | Reactive, fast dev, clean UI |
| Frontend state | Pinia | Type-safe, simple |
| Backend | Express.js + TypeScript | Mature, well-known |
| Database | PostgreSQL + pgvector | Vector + relational + graph in one |
| ORM | Prisma | Type-safe migrations |
| Vector embeddings | OpenAI `text-embedding-3-small` (1536d) | Cheap, accurate, fast |
| LLM (chat) | OpenAI GPT-4o | Best for legal reasoning |
| LLM (bulk extraction) | AWS Bedrock GPT-OSS 120B | High throughput for PDF parsing |
| External legal data | Indian Kanoon API | Free, comprehensive |
| Document generation | `docx` npm package | Native .docx output, no LibreOffice |

---

## Project status

This is an **MVP under active development**. As of now:

| Feature | Status |
|---------|--------|
| 3-pane NotebookLM-inspired UI | ✅ Built |
| FIR upload + extraction (criminal) | ✅ Working |
| Bail application generation (`@bail`) | ✅ Working |
| Plugin schema (DB + filesystem layout) | ✅ Built |
| Criminal domain plugins (6 drafters) | ✅ Built |
| Civil domain plugins (3 drafters) | ✅ Built |
| BNS/BNSS/BSA statutory data | ✅ Extracted (1017 sections) |
| IPC → BNS mappings | ✅ 462 mappings |
| Citation system (multi-provider) | ⚠️ Built but not yet wired to chat flow |
| Domain router | ⚠️ Built but not yet wired to chat flow |
| External providers (Indian Kanoon) | ⚠️ Needs API key + wiring |
| Special acts (NDPS, POCSO, PMLA) | ❌ Not yet ingested |
| Landmark precedents library | ❌ Not yet curated |
| Mobile-responsive UI | ❌ Desktop-only |

For a brutally-honest gap report and the fix order, see [`AUDIT.md`](./AUDIT.md).

---

## License

Proprietary — © Buildio Legal, 2026. All rights reserved.

---

## Contact

For demo requests, partnership inquiries, or support: **legal@buildio.in**
