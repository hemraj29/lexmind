# Plugin Architecture

> The core never changes. Plugins extend.
> A new legal domain (Tax, Family, Labour, IP) is a folder drop, not a code rewrite.

This page explains the contracts (`*.types.ts`), the registries that load them, and how they all stay in sync with the database — so the UI can discover them without redeploying.

---

## 1. The four plugin contracts

All live in [`backend/src/core/plugin.types.ts`](../../backend/src/core/plugin.types.ts).

### a) `DomainPlugin`

A legal practice area.

```ts
interface DomainPlugin {
  code: string;                      // unique e.g. "criminal", "civil", "tax"
  name: string;                      // "Criminal Law"
  description: string;
  iconName: string;                  // for UI icon map (e.g. "scale")
  colorHex: string;                  // "#dc2626"
  sortOrder: number;
  defaultActCodes: string[];         // e.g. ["BNS", "BNSS", "BSA"]
  documentTypes: DocumentTypeConfig[];
  routingHints: {
    keywords: string[];              // case-insensitive match
    actReferences: string[];         // e.g. "BNS", "IPC", "CrPC"
    queryPatterns: RegExp[];         // free-form route hints
  };
  prerequisiteCheckers?: {
    [docCode: string]: (caseData) => { ready: boolean; missing: string[] };
  };
}
```

Live examples:
- [`backend/src/domains/criminal/domain.config.ts`](../../backend/src/domains/criminal/domain.config.ts) — 6 document types
- [`backend/src/domains/civil/domain.config.ts`](../../backend/src/domains/civil/domain.config.ts) — 3 document types
- [`backend/src/domains/_template/`](../../backend/src/domains/_template/) — skeleton to copy

### b) `DocumentTypeConfig`

One row in `domain.documentTypes[]`.

```ts
interface DocumentTypeConfig {
  code: string;                      // "regular_bail"
  name: string;                      // "Regular Bail"
  description: string;
  category: "draft" | "analyze" | "research" | "extract";
  iconName: string;
  colorHex: string;
  command?: string;                  // "@bail" — surfaces as a ChatCommand
  requiredSourceTypes: string[];     // e.g. ["fir"], ["chargesheet"]
  primarySectionCodes: string[];     // e.g. ["BNSS-480"]
  drafterId: string;                 // "criminal.regular_bail"
  templateConfig?: Record<string, unknown>;
  sortOrder?: number;
}
```

### c) `DrafterPlugin`

The thing that turns a Case into a draft.

```ts
interface DrafterPlugin {
  id: string;                        // "criminal.regular_bail"
  domainCode: string;                // "criminal"
  documentTypeCode: string;          // "regular_bail"
  draft(input: DrafterInput): Promise<DrafterOutput>;
}

interface DrafterInput {
  caseData: CaseWithDocuments;
  memo: LegalMemo;                   // produced by researcher
  options?: Record<string, unknown>;
  citations?: Array<{ id: string; ... }>;
}

interface DrafterOutput {
  markdown: string;
  sections: Record<string, unknown>; // keys passed to docgenService
  docxBuffer: Buffer;
  citationIds?: string[];
}
```

Examples:
- `criminal/drafters/regular-bail.drafter.ts` — delegates to legacy `drafterAgent.draft()`.
- `criminal/drafters/anticipatory-bail.drafter.ts`, `quashing.drafter.ts`, `discharge.drafter.ts`, `appeal.drafter.ts`, `default-bail.drafter.ts` — each owns its own prompt + JSON schema.
- `civil/drafters/plaint.drafter.ts`, `written-statement.drafter.ts`, `temporary-injunction.drafter.ts` — share `civil/drafters/_shared.ts`.

### d) `ActPlugin`

JSON metadata for a piece of legislation. Lives in `backend/src/acts/<domain>/*.act.json`.

```ts
interface ActPlugin {
  code: string;                      // "BNS"
  name: string;                      // "Bharatiya Nyaya Sanhita, 2023"
  shortName?: string;
  year?: number;
  domainCode: string;                // "criminal"
  isCentralAct: boolean;
  stateCode?: string;                // e.g. "MH" for state-specific
  description?: string;
  sourcePdfPath?: string;
  sourceUrl?: string;
  searchPriority?: number;
}
```

There is also a fifth, opt-in contract: `ExtractionPlugin` for pluggable document extractors. Registered manually in [`extraction-registry.ts`](../../backend/src/core/extraction-registry.ts).

---

## 2. The four registries

All under [`backend/src/core/`](../../backend/src/core/). All export a singleton.

```
domainRegistry      // auto-loads backend/src/domains/*/domain.config.ts
drafterRegistry     // auto-loads backend/src/domains/*/drafters/*.drafter.ts
actRegistry         // loads backend/src/acts/<domain>/*.act.json
extractionRegistry  // manual register() — pluggable doc extractors
```

### Loading strategy

- **Filesystem scan** under the relevant root.
- **ESM dynamic import** via `pathToFileURL` (Windows-safe).
- **Duck-typed export detection** — the loader picks the first exported object that has the expected shape (`code` + `documentTypes` + `routingHints` for a domain; `id` + `domainCode` + `draft` for a drafter).
- `_template/` directories and `_shared.ts` files are skipped by convention.
- Errors during load are logged but don't crash the server.

### Public API (each registry)

| Method | Purpose |
|--------|---------|
| `get(code)` | look up by primary key |
| `all()` | enumerate everything loaded |
| `domainRegistry.classifyByHints(query)` | route a free-text query → domain code(s) via `keywords` + `queryPatterns` |
| `domainRegistry.classifyByActReference(refs)` | route by detected act mentions |
| `drafterRegistry.getByDocumentTypeCode(domainCode, docTypeCode)` | dispatch helper for the factory |
| `actRegistry.byDomain(code)` | acts that belong to a given domain |

---

## 3. Bootstrap — sync to the database

[`backend/src/core/bootstrap.ts`](../../backend/src/core/bootstrap.ts) runs once on server start:

```
loadPlugins (parallel)
  ├─ domainRegistry.load()
  ├─ drafterRegistry.load()
  └─ actRegistry.load()
  
syncToDb (idempotent upserts via Prisma)
  ├─ LegalDomain                ← from DomainPlugin
  ├─ StudioAction (per domain)  ← also one per docType
  ├─ RegisteredDocumentType     ← from DocumentTypeConfig
  └─ ChatCommand                ← from DocumentTypeConfig.command (if set)

logs: domains=2, drafters=9, acts=N
```

After bootstrap, the **frontend can read everything** from the public catalog APIs:

| Frontend reads | Endpoint | Backed by |
|----------------|----------|-----------|
| Studio panel cards | `GET /api/studio-actions?domain=` | `StudioAction` table |
| Chat command chips | `GET /api/commands` | `ChatCommand` table |

So **a new domain plugin shows up in the UI without a frontend deploy**.

---

## 4. The agents that consume the registries

| Agent | What it asks of the registries |
|-------|-------------------------------|
| `domain-router.agent.ts` | `domainRegistry.all()` (for keywords) → fall back to GPT-4o classification of `query` against descriptions |
| `drafter-factory.agent.ts` | `drafterRegistry.get(id)` first; fall back to `getByDocumentTypeCode(domain, docType)`; finally try id pattern `<domain>.<docType>` |
| `chat.service.ts` (generation commands) | uses `drafterFactory.draft()` so it's domain-agnostic |
| `extraction-registry` | tried first; falls back to the legacy `extractorAgent` / `documentAnalyzerAgent` |

No agent contains a `switch (domain)` block. New domains slot in cleanly.

---

## 5. End-to-end: adding the **Tax** domain in 30 minutes

Lifted verbatim from [`backend/EXTENSIBILITY.md`](../../backend/EXTENSIBILITY.md):

```bash
cp -r src/domains/_template src/domains/tax
```

1. Edit `src/domains/tax/domain.config.ts`:
   - set `code: "tax"`, name, keywords (`GST`, `ITAT`, …), `defaultActCodes: ["IT_ACT_1961", ...]`.
   - declare one or more `documentTypes`, each with a `drafterId` like `"tax.it_appeal_reply"`.
2. Create `src/domains/tax/drafters/it-appeal-reply.drafter.ts` exporting a `DrafterPlugin` with the matching `id`.
3. Drop `src/acts/tax/it-act-1961.act.json` (act metadata).
4. (Optional) Drop statute JSON in `src/data/statutes/tax/` and run `pnpm ingest:statutes`.
5. Restart. Logs should report:
   ```
   ✓ Domain plugin loaded: code=tax
   ✓ Drafter plugin loaded: id=tax.it_appeal_reply
   ✓ Plugin bootstrap complete: domains=3, drafters=10, acts=N
   ```

What you did **not** touch:

- `core/` — registries auto-discover.
- `agents/` — agents query registries.
- `services/` — pure infrastructure.
- `routes/` — generic, domain-agnostic.
- `index.ts` — bootstrap auto-discovers.
- **Frontend** — `/api/studio-actions` and `/api/commands` are dynamic.

A full step-by-step example with code is in [Extending LexiMini](../planning/03-extending.md).

---

## 6. Architecture invariants

| Invariant | Why it matters |
|-----------|---------------|
| Drafter IDs follow `<domain>.<docTypeCode>` | Lets the factory fall back to pattern-matching when the explicit registration is missing. |
| `_template/` is the **only** copy-pasteable folder | Loader explicitly skips it. |
| Domain metadata lives in TS, act metadata lives in JSON | TS gives type-safe enums/keywords; JSON keeps act lists trivial for non-developers to extend. |
| Plugin → DB sync is idempotent (`upsert`) | Safe to restart, safe to ship behind a flag. |
| No enum changes for new doc types | `RegisteredDocumentType.code` is `String`, not a Prisma enum. New types don't require migrations. |
| Bootstrap failures log but don't crash | A malformed plugin disables itself; the rest of the system stays up. |

---

Next: [Pipeline Flow](./04-pipeline-flow.md).
