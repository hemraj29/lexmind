# LexiMini Backend — Extensibility Guide

> **The core never changes. Plugins extend.**
> Adding a new legal domain, act, or document type is a config drop, not a code rewrite.

---

## Architecture overview

```
backend/src/
├── core/                          ← Plugin registries (NEVER CHANGES)
│   ├── plugin.types.ts            # Plugin contracts (interfaces)
│   ├── domain-registry.ts         # Auto-discovers domain plugins
│   ├── drafter-registry.ts        # Auto-discovers drafter plugins
│   ├── act-registry.ts            # Loads act JSON configs
│   ├── extraction-registry.ts     # Pluggable document extractors
│   └── bootstrap.ts               # Loads all plugins on startup + syncs to DB
│
├── domains/                       ← ADD YOUR DOMAIN HERE
│   ├── criminal/                  # Criminal Law plugin
│   │   ├── domain.config.ts       # Domain definition
│   │   └── drafters/              # One file per document type
│   │       ├── regular-bail.drafter.ts
│   │       ├── anticipatory-bail.drafter.ts
│   │       ├── default-bail.drafter.ts
│   │       ├── quashing.drafter.ts
│   │       ├── discharge.drafter.ts
│   │       ├── appeal.drafter.ts
│   │       └── _shared.ts         # Shared helpers (private to domain)
│   │
│   ├── civil/                     # Civil Litigation plugin
│   │   ├── domain.config.ts
│   │   └── drafters/
│   │       ├── plaint.drafter.ts
│   │       ├── written-statement.drafter.ts
│   │       ├── temporary-injunction.drafter.ts
│   │       └── _shared.ts
│   │
│   └── _template/                 # COPY THIS to start a new domain
│       ├── domain.config.ts
│       ├── README.md
│       └── drafters/
│
├── acts/                          ← ACT METADATA (one JSON per act)
│   ├── criminal/
│   │   ├── bns.act.json
│   │   ├── bnss.act.json
│   │   ├── bsa.act.json
│   │   └── ...
│   └── civil/
│       ├── cpc.act.json
│       ├── contract-act.act.json
│       └── ...
│
├── data/
│   ├── statutes/                  # Extracted section data (JSON, per act)
│   │   ├── criminal/
│   │   │   └── bns.json
│   │   └── civil/
│   │       └── cpc.json
│   └── precedents/                # Curated case law
│
├── agents/                        ← CORE AGENTS (don't change per domain)
│   ├── document-analyzer.agent.ts   # Classify + extract any uploaded doc
│   ├── researcher.agent.ts          # Hybrid search across statutes
│   ├── strategy-advisor.agent.ts    # Case analysis + grounded chat
│   ├── domain-router.agent.ts       # Routes query to domain
│   ├── drafter-factory.agent.ts     # Dispatcher (uses drafter-registry)
│   └── extractor.agent.ts           # FIR-specific extractor (legacy, kept for compat)
│
├── services/
│   ├── citation/                  # Citation system (zero-hallucination)
│   │   ├── provider.types.ts      # CitationProvider contract
│   │   ├── citation-aggregator.service.ts   # Multi-provider RRF + rerank
│   │   ├── citation-validator.service.ts    # Strips uncited claims
│   │   ├── citation-verifier.service.ts     # On-demand deep verification
│   │   └── providers/
│   │       ├── internal.provider.ts          # pgvector search of own DB
│   │       ├── case-documents.provider.ts    # Lawyer's uploaded files
│   │       ├── indian-kanoon.provider.ts     # IK external API
│   │       └── (drop new providers here)
│   │
│   └── (other infrastructure services — db, storage, openai, etc.)
│
├── routes/                        # HTTP API (domain-agnostic)
│   ├── chat.routes.ts             # /api/cases + /api/cases/:id/messages
│   ├── sources.routes.ts          # /api/cases/:id/sources/*
│   ├── studio.routes.ts           # /api/studio-actions
│   ├── commands.routes.ts         # /api/commands
│   ├── citations.routes.ts        # /api/citations/:id/preview
│   ├── sections.routes.ts         # /api/sections/*
│   ├── pipeline.routes.ts         # /api/pipeline/* (legacy)
│   └── health.routes.ts           # /api/health
│
└── workflows/                     # Workflow engine (orchestration)
```

---

## Adding a new legal domain (e.g., Tax)

**Total time: ~30 minutes** — pure config + drafter writing.

### Step 1: Copy the template (10 seconds)

```bash
cp -r src/domains/_template src/domains/tax
```

### Step 2: Edit `src/domains/tax/domain.config.ts`

```typescript
import type { DomainPlugin } from "../../core/plugin.types.js";

export const taxDomain: DomainPlugin = {
  code: "tax",
  name: "Tax Law",
  description: "Income tax, GST, customs, IT appeals",
  iconName: "calculator",
  colorHex: "#0891b2",
  sortOrder: 5,

  defaultActCodes: ["IT_ACT_1961", "CGST_2017", "CUSTOMS_1962"],

  routingHints: {
    keywords: ["GST", "income tax", "TDS", "ITAT", "CESTAT", "appeal", "notice", "refund", "assessment"],
    actReferences: ["IT Act", "CGST", "SGST", "IGST", "Customs"],
    queryPatterns: [
      /section\s+\d+\s+of\s+the\s+income[-\s]tax\s+act/i,
      /\bgst\s+(notice|appeal)/i,
      /\bitr\b/i,
    ],
  },

  documentTypes: [
    {
      code: "it_appeal_reply",
      name: "IT Notice Reply",
      description: "Reply to Income Tax notice (Sec 142, 148, 263)",
      category: "draft",
      iconName: "file-text",
      colorHex: "#0891b2",
      command: "@it_reply",
      requiredSourceTypes: ["court_order"],
      primarySectionCodes: ["IT-142", "IT-148"],
      drafterId: "tax.it_appeal_reply",
      sortOrder: 1,
    },
  ],
};
```

### Step 3: Create `src/domains/tax/drafters/it-appeal-reply.drafter.ts`

```typescript
import type { DrafterPlugin, DrafterInput, DrafterOutput } from "../../../core/plugin.types.js";
import { openaiService } from "../../../services/openai.service.js";
import { docgenService } from "../../../services/docgen.service.js";

export const itAppealReplyDrafter: DrafterPlugin = {
  id: "tax.it_appeal_reply",
  domainCode: "tax",
  documentTypeCode: "it_appeal_reply",

  async draft(input: DrafterInput): Promise<DrafterOutput> {
    const { caseData, memo } = input;

    const prompt = `Draft a reply to an Income Tax Notice...

[case context: ${JSON.stringify(caseData).slice(0, 2000)}]
[applicable provisions: ${memo.applicableSections.map(s => s.act + " " + s.sectionNumber).join(", ")}]

Return JSON: { "courtName", "title", "introduction", "factualResponse", "legalArguments", "prayer", "date" }`;

    const sections = await openaiService.chatJSON<Record<string, unknown>>(
      [{ role: "user", content: prompt }],
      { temperature: 0.3, maxTokens: 8192 }
    );

    const docxBuffer = await docgenService.generateFromSections("legal_memo" as any, sections, caseData, memo);
    return {
      markdown: `# ${(sections as any).title}\n\n${(sections as any).introduction}`,
      sections,
      docxBuffer,
    };
  },
};
```

### Step 4: (Optional) Add act metadata in `src/acts/tax/`

```bash
# src/acts/tax/it-act-1961.act.json
{
  "code": "IT_ACT_1961",
  "name": "Income Tax Act, 1961",
  "shortName": "IT Act",
  "year": 1961,
  "domainCode": "tax",
  "isCentralAct": true,
  "description": "Direct tax law of India",
  "sourceUrl": "https://www.indiacode.nic.in/handle/123456789/2435"
}
```

### Step 5: (Optional) Drop statute data in `src/data/statutes/tax/`

```bash
# Run extraction script (you have it already)
npm run extract:books -- --pdf book/it-act-1961.pdf --domain tax --code IT_ACT_1961
```

### Step 6: Restart the server

```bash
npm run dev
```

Look for log lines:

```
✓ Domain plugin loaded: code=tax
✓ Drafter plugin loaded: id=tax.it_appeal_reply
✓ Plugin bootstrap complete: domains=3, drafters=10, acts=8
```

That's it. Your tax plugin is live:

* Frontend Studio panel automatically shows new "IT Notice Reply" card
* Chat input shows new `@it_reply` chip
* Domain Router will classify queries containing "GST", "ITAT", "income tax" to your domain
* Citation aggregator searches across all domains automatically

**You did NOT touch:**

* ❌ `core/` (registries auto-discover)
* ❌ `agents/` (agents query the registries)
* ❌ `services/` (pure infrastructure)
* ❌ `routes/` (domain-agnostic)
* ❌ `index.ts` (bootstrap auto-discovers)
* ❌ Frontend (Studio panel pulls from `/api/studio-actions`)

---

## Adding a new external citation provider

Drop a new file in `src/services/citation/providers/`:

```typescript
// src/services/citation/providers/scc-online.provider.ts

import type { CitationProvider, CitationCandidate, ProviderSearchOptions } from "../provider.types.js";

class SCCOnlineProvider implements CitationProvider {
  name = "scc-online";
  type = "external" as const;
  get enabled() { return !!process.env.SCC_API_KEY; }

  async search(query: string, opts: ProviderSearchOptions): Promise<CitationCandidate[]> {
    // Call SCC Online API, return candidates
    return [];
  }
}

export const sccOnlineProvider = new SCCOnlineProvider();
```

Register it in `citation-aggregator.service.ts`:

```typescript
import { sccOnlineProvider } from "./providers/scc-online.provider.js";

// In constructor:
this.register(sccOnlineProvider);
```

That's it. The aggregator now runs SCC Online in parallel with Indian Kanoon, internal, and case documents.

---

## Adding a new act (e.g., NDPS, POCSO, PMLA)

Just drop a JSON file:

```bash
# src/acts/criminal/ndps.act.json
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

Then run extraction:

```bash
npm run extract:books -- --pdf book/ndps-act-1985.pdf --domain criminal --code NDPS_1985
```

Restart. Sections are now searchable. No code changes anywhere.

---

## What you DO need to do (just data + providers)

| Task                              | What                                    | Time |
|-----------------------------------|-----------------------------------------|------|
| Add a new Act                     | Drop JSON in `acts/<domain>/` + run extraction script | 10 min |
| Add a new domain                  | Copy `_template/` + edit config + write drafters     | 30 min |
| Add a new external citation source| Drop a provider file + register in aggregator        | 1 hour |
| Add new section data              | Drop extracted JSON in `data/statutes/<domain>/`     | 5 min |
| Add new precedents                | Drop curated cases in `data/precedents/`             | per-case |

## What you DON'T need to do (ever)

| What                              | Why                                                  |
|-----------------------------------|------------------------------------------------------|
| Touch `core/`                     | Registries are domain-agnostic; auto-discover plugins |
| Touch `agents/`                   | Agents query registries; don't know about domains    |
| Touch `services/`                 | Pure infrastructure (DB, OpenAI, storage, docgen)    |
| Touch `routes/`                   | API surface is generic                               |
| Modify enums in `schema.prisma`   | Document types live in DB rows, not enums            |
| Modify `chat.service.ts` switches | Switches are gone — registry dispatches              |
| Restart frontend                  | Frontend reads `/api/studio-actions` & `/api/commands` dynamically |

---

## Summary

```
   Need to add a new Act?      → drop JSON + statute data
   Need to add a domain?       → copy _template, write drafters
   Need a new external API?    → drop a provider file
   Need a new chat command?    → already covered (it's a domain doc type)

   Need to touch core code?    → never
```

That's the whole point of plugin architecture — **it grows by accretion, never by modification**.
