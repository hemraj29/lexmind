# Extending LexiMini

How to add capability without touching `core/`. This guide covers the five common extension points:

1. [A new legal **domain** (Tax, Family, Labour, IP, …)](#1-new-legal-domain)
2. [A new **act** (NDPS, POCSO, PMLA, IT Act, …)](#2-new-act)
3. [A new **drafter** in an existing domain](#3-new-drafter-existing-domain)
4. [A new **citation provider** (SCC Online, Manupatra, …)](#4-new-citation-provider)
5. [A new **agent / workflow** for a new pipeline](#5-new-agent--workflow)

All of these are *additive*. The core never changes. See [Plugin Architecture](../architecture/03-plugin-architecture.md) for the underlying contracts.

---

## 1. New legal domain

Total time: ~30 min for the config + drafter. Add data later.

```bash
cp -r backend/src/domains/_template backend/src/domains/tax
```

### a) Edit `backend/src/domains/tax/domain.config.ts`

```ts
import type { DomainPlugin } from "../../core/plugin.types.js";

export const taxDomain: DomainPlugin = {
  code: "tax",
  name: "Tax Law",
  description: "Income tax, GST, customs, IT appeals (IT Act, CGST, Customs Act).",
  iconName: "calculator",
  colorHex: "#0891b2",
  sortOrder: 5,

  defaultActCodes: ["IT_ACT_1961", "CGST_2017", "CUSTOMS_1962"],

  routingHints: {
    keywords: [
      "GST", "income tax", "TDS", "ITAT", "CESTAT",
      "appeal", "notice", "refund", "assessment",
    ],
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
      description: "Reply to Income Tax notice (Sec 142 / 148 / 263).",
      category: "draft",
      iconName: "file-text",
      colorHex: "#0891b2",
      command: "@it_reply",
      requiredSourceTypes: ["court_order"],   // user must upload the notice
      primarySectionCodes: ["IT-142", "IT-148"],
      drafterId: "tax.it_appeal_reply",
      sortOrder: 1,
    },
  ],
};
```

### b) Add the drafter

`backend/src/domains/tax/drafters/it-appeal-reply.drafter.ts`:

```ts
import type { DrafterPlugin, DrafterInput, DrafterOutput } from "../../../core/plugin.types.js";
import { openaiService } from "../../../services/openai.service.js";
import { docgenService } from "../../../services/docgen.service.js";

export const itAppealReplyDrafter: DrafterPlugin = {
  id: "tax.it_appeal_reply",
  domainCode: "tax",
  documentTypeCode: "it_appeal_reply",

  async draft({ caseData, memo }: DrafterInput): Promise<DrafterOutput> {
    const provisions = memo.applicableSections.map(s => `${s.actType} ${s.sectionNumber}: ${s.title}`).join("\n");
    const prompt = `
Draft a reply to an Income Tax notice.

CASE CONTEXT (truncated)
${JSON.stringify(caseData).slice(0, 6000)}

APPLICABLE PROVISIONS
${provisions}

Return strict JSON with these keys:
{
  "courtName": "Income Tax Appellate Tribunal / Commissioner (Appeals) — XXX",
  "title": "REPLY TO INCOME TAX NOTICE UNDER SECTION 148",
  "introduction": "...",
  "factualResponse": "...",
  "legalArguments": "...",
  "prayer": "...",
  "date": "YYYY-MM-DD"
}

Cite ONLY provisions above.
`.trim();

    const sections = await openaiService.chatJSON<Record<string, unknown>>(
      [{ role: "user", content: prompt }],
      { temperature: 0.3, maxTokens: 8192 }
    );

    const docxBuffer = await docgenService.generateFromSections(
      "LEGAL_MEMO" as any,             // until GenerationDocType is widened
      sections,
      caseData,
      memo
    );

    return {
      markdown: `# ${sections.title as string}\n\n${sections.introduction as string}\n\n${sections.factualResponse as string}\n\n${sections.legalArguments as string}\n\n${sections.prayer as string}`,
      sections,
      docxBuffer,
    };
  },
};
```

### c) (Optional) Add act metadata

`backend/src/acts/tax/it-act-1961.act.json`:

```json
{
  "code": "IT_ACT_1961",
  "name": "Income Tax Act, 1961",
  "shortName": "IT Act",
  "year": 1961,
  "domainCode": "tax",
  "isCentralAct": true,
  "description": "Direct tax law of India.",
  "sourceUrl": "https://www.indiacode.nic.in/handle/123456789/2435"
}
```

### d) (Optional) Ingest statute text

```bash
# Drop a PDF at backend/book/it-act-1961.pdf, then:
pnpm extract:books -- --pdf book/it-act-1961.pdf --domain tax --code IT_ACT_1961
pnpm enrich:data
pnpm ingest:statutes
```

### e) Restart

```bash
pnpm dev
```

Log lines you should see:
```
✓ Domain plugin loaded: code=tax
✓ Drafter plugin loaded: id=tax.it_appeal_reply
✓ Plugin bootstrap complete: domains=3, drafters=10, acts=N
```

Frontend updates **automatically**:
- A new "IT Notice Reply" card in the **Studio** panel under the Draft category.
- A new `@it_reply` chip in chat command suggestions.
- `domainRouterAgent` will classify "GST notice" / "income tax appeal" queries to `"tax"`.

What you didn't touch:
- `core/`, `agents/`, `services/`, `routes/`, `index.ts`, the frontend.

---

## 2. New act

If the legal area already exists (e.g. NDPS belongs to criminal):

```bash
# 1. Drop act metadata
cat > backend/src/acts/criminal/ndps.act.json <<'EOF'
{
  "code": "NDPS_1985",
  "name": "Narcotic Drugs and Psychotropic Substances Act, 1985",
  "shortName": "NDPS",
  "year": 1985,
  "domainCode": "criminal",
  "isCentralAct": true,
  "sourcePdfPath": "book/ndps-act-1985.pdf"
}
EOF

# 2. Drop the PDF at backend/book/ndps-act-1985.pdf

# 3. Extract + ingest
pnpm extract:books -- --pdf book/ndps-act-1985.pdf --domain criminal --code NDPS_1985
pnpm enrich:data
pnpm ingest:statutes
```

Restart — sections are searchable. No drafter changes (existing criminal drafters will pick up the new sections via hybrid search).

> Note: until `ActType` enum is widened (planned), DB-level `Act.code` is one of `BNS | BNSS | BSA`. NDPS/POCSO etc. currently live as ActPlugin JSON only — the registry can read them but Prisma `Act` rows are limited to the three primary codes. This is a known limitation and tracked in [Roadmap Phase 2](./01-roadmap.md).

---

## 3. New drafter in an existing domain

E.g. add an "Anticipatory Bail (NDPS)" variant of the criminal domain.

### a) Add the `DocumentTypeConfig`

Edit `backend/src/domains/criminal/domain.config.ts`:

```ts
{
  code: "anticipatory_bail_ndps",
  name: "Anticipatory Bail (NDPS)",
  description: "Pre-arrest bail in NDPS cases — Section 482 BNSS + NDPS-specific arguments.",
  category: "draft",
  iconName: "shield",
  colorHex: "#0ea5e9",
  command: "@ab_ndps",
  requiredSourceTypes: ["fir"],
  primarySectionCodes: ["BNSS-482"],
  drafterId: "criminal.anticipatory_bail_ndps",
  sortOrder: 7,
}
```

### b) Add the drafter file

`backend/src/domains/criminal/drafters/anticipatory-bail-ndps.drafter.ts`:

```ts
export const anticipatoryBailNdpsDrafter: DrafterPlugin = {
  id: "criminal.anticipatory_bail_ndps",
  domainCode: "criminal",
  documentTypeCode: "anticipatory_bail_ndps",

  async draft({ caseData, memo }) {
    // ... prompt that emphasises Section 37 NDPS test
  },
};
```

Restart — the new entry appears automatically.

---

## 4. New citation provider

E.g. SCC Online.

### a) Provider file

`backend/src/services/citation/providers/scc-online.provider.ts`:

```ts
import type { CitationProvider, CitationCandidate, ProviderSearchOptions } from "../provider.types.js";

class SCCOnlineProvider implements CitationProvider {
  name = "scc-online";
  type = "external" as const;
  get enabled() { return !!process.env.SCC_API_KEY; }

  async search(query: string, opts: ProviderSearchOptions): Promise<CitationCandidate[]> {
    if (!this.enabled) return [];
    const resp = await fetch(
      `https://api.scconline.com/v1/search?q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${process.env.SCC_API_KEY}` }, signal: AbortSignal.timeout(8000) }
    );
    if (!resp.ok) throw new Error(`SCC ${resp.status}`);
    const data = await resp.json();
    return data.results.map((r: any): CitationCandidate => ({
      providerId: "scc-online",
      externalId: String(r.id),
      sourceType: "precedent",
      title: r.title,
      reference: r.citation,
      excerpt: r.snippet,
      sourceUrl: r.url,
      relevanceScore: r.score,
      metadata: { court: r.court, year: r.year },
    }));
  }
}

export const sccOnlineProvider = new SCCOnlineProvider();
```

### b) Register

In `services/citation/citation-aggregator.service.ts`'s constructor:

```ts
import { sccOnlineProvider } from "./providers/scc-online.provider.js";
// ...
this.register(internalProvider);
this.register(caseDocumentProvider);
this.register(indianKanoonProvider);
this.register(sccOnlineProvider);     // ← NEW
```

That's it. The aggregator runs SCC in parallel, dedupes, fuses, and reranks across all four providers. Errors are swallowed per-provider, so a flaky SCC API doesn't break a chat reply.

### c) Env

Add `SCC_API_KEY=...` to `.env`. The `enabled` getter gates participation.

---

## 5. New agent / workflow

E.g. a "Plaint generation" pipeline that mirrors the bail workflow but for civil cases.

### a) Steps

Compose new `*.step.ts` files under `backend/src/workflows/steps/`. Reuse existing ones where possible (`upload.step.ts`, `save-output.step.ts` are domain-agnostic).

For genuinely new logic (e.g. civil-specific research), wrap an agent call:

```ts
// civil-research.step.ts
const civilResearchStep: WorkflowStep<CivilExtractOutput, { caseData, memo }> = {
  name: "civil-research",
  retries: 1,
  timeout: 180_000,
  async execute(input, ctx) {
    const memo = await civilResearcherAgent.research(input);
    await updatePipelineRun(ctx.metadata.runId, { legalMemo: memo, currentStep: "civil-research" });
    return { caseData: input.caseData, memo };
  },
  validate: o => o.memo.applicableSections.length > 0,
};
```

### b) Workflow

```ts
// backend/src/workflows/plaint-generation.workflow.ts
export function createPlaintWorkflow() {
  return new WorkflowEngine<SaveOutputResult>()
    .addStep(uploadStep)
    .addStep(civilExtractStep)
    .addStep(civilResearchStep)
    .addStep(plaintDraftStep)
    .addStep(saveOutputStep);
}
```

### c) Route / chat command

Two options:
1. **Reuse the chat path** — register `plaint` in the criminal/civil domain's `documentTypes` with `category: "draft"` and an appropriate drafter id; the existing `@plaint` command auto-routes through `chat.service.ts → runGeneration()`.
2. **Add a new SSE endpoint** mirroring `pipeline.routes.ts → POST /run` that calls `runPlaintWorkflow()` and broadcasts SSE.

Option 1 is the path the codebase favours — synchronous responses inside chat are simpler for users.

---

## Checklist before opening a PR

| Item | Why |
|------|-----|
| New file follows naming conventions | discovery loaders are pattern-based |
| `temperature` / `maxTokens` chosen with intent | hallucination cost vs prose variation |
| Prompt **only references DB-derived data** | grounding |
| Validation runs after every LLM call | catches hallucinations |
| Logging in place with module child logger | observability |
| `docs/architecture/06-api-reference.md` updated if a new endpoint | discoverability |
| `docs/backend/...` updated if you added a service/agent/step | future-you |
| Manual smoke test against a real FIR / case document | end-to-end check |

---

Next: [Deployment](./04-deployment.md).
