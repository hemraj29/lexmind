# Backend — Citations

Citations are how LexiMini stays honest. Every claim a generated document or chat message makes can be traced to a `Citation` row, which in turn points to a `StatuteSection`, `Precedent`, `CaseDocument`, or web URL.

The citation system has **four moving parts**:

```
services/citation/
├── provider.types.ts                  contracts
├── citation-aggregator.service.ts     RRF across providers + optional rerank
├── citation-validator.service.ts      strip uncited claims + hallucinated [^cite_N]
├── citation-verifier.service.ts       on-demand deep checks of one or many citations
└── providers/
    ├── internal.provider.ts           pgvector + BM25 over OWN DB (always on)
    ├── case-documents.provider.ts     term-freq scan of uploaded files (always on)
    └── indian-kanoon.provider.ts      external API (env-gated)
```

---

## 1. Contracts (`provider.types.ts`)

```ts
type CitationSourceType = "section" | "precedent" | "document" | "web";

interface CitationCandidate {
  providerId: string;
  externalId: string;                   // unique within provider
  sourceType: CitationSourceType;
  title: string;
  reference: string;                    // human readable e.g. "BNS Section 303"
  excerpt: string;
  sourceUrl?: string;                   // for "web" / "precedent" with public link
  relevanceScore: number;               // 0..1
  metadata?: Record<string, unknown>;
}

interface ProviderSearchOptions {
  topK?: number;
  domains?: string[];                   // restrict to e.g. ["criminal"]
  caseContext?: {
    caseId: string;
    sectionsRaw?: string[];
    facts?: string;
  };
  filters?: { bailOnly?: boolean; actFilter?: ActType };
}

interface CitationProvider {
  name: string;
  type: "internal" | "external";
  enabled: boolean;
  search(query: string, opts: ProviderSearchOptions): Promise<CitationCandidate[]>;
  fetchFullText?(externalId: string): Promise<string>;     // optional
}
```

Plug-in style — drop a new file under `providers/`, register it in the aggregator, done.

---

## 2. Aggregator (`citation-aggregator.service.ts`)

```ts
class CitationAggregator {
  register(p: CitationProvider): void;
  async gather(query: string, opts: ProviderSearchOptions & { rerank?: boolean }): Promise<CitationCandidate[]>;
}
export const citationAggregator: CitationAggregator;
```

### Pipeline
1. **Parallel provider calls** with `Promise.allSettled()` and an **8-second timeout** per provider.
2. **Deduplicate** by canonical key:
   - `precedent:{normalizedReference}`
   - `section:{normalizedReference}`
   - `{providerId}:{externalId}` (fallback)
3. **Reciprocal Rank Fusion** with `k = 60` over per-provider rankings.
4. **Optional rerank** — only if `candidates.length > 8` and `rerank !== false`.
   - GPT-4o JSON mode, 0–10 scoring, drop `<5`.
5. **Return** top results, each annotated with the provider that produced its best score.

### Boot order
```ts
this.register(internalProvider);        // always on
this.register(caseDocumentProvider);    // always on
this.register(indianKanoonProvider);    // gated on INDIAN_KANOON_API_KEY
```

The aggregator drives `@sections`, `@precedents`, and the citation chips inside Strategy Advisor replies.

---

## 3. Validator (`citation-validator.service.ts`)

The runtime guardrail. Given an LLM-produced text + the set of citation IDs known to be valid, it returns a cleaned version of the text *and* a list of flagged sentences.

```ts
function validateCitations(
  text: string,
  availableCitationIds: string[]
): {
  cleanText: string;
  isValid: boolean;
  flaggedSentences: string[];
  usedCitationIds: string[];
};
```

### Decision matrix per sentence

| Sentence pattern | Decision |
|------------------|----------|
| Has `[OPINION] … [/OPINION]` wrapper | Keep as-is. |
| Conversational opener ("Sure, let me…", "Would you like…") | Keep. |
| Hedged claim ("generally held", "well-established") | Keep. |
| Concrete legal claim (section #, act, court holding, punishment, "cognizable", SCC citation) **with** at least one **valid** `[^cite_N]` | Keep — but strip any hallucinated `[^cite_X]`. |
| Concrete legal claim **without** any valid citation | **Drop** the sentence. |
| Plain factual sentence (no legal claim, no hedging) | Keep — but strip hallucinated `[^cite_X]`. |

`[^cite_N]` tokens whose `N` doesn't appear in `availableCitationIds` are removed silently; the underlying text is preserved unless the sentence as a whole is unsupported.

The validator returns `isValid = (flaggedSentences.length === 0)` so callers can decide whether to surface a warning ("Some unsupported claims were removed").

This is wired into `strategyAdvisorAgent.chat()` — after the LLM returns a reply, the validator runs before persisting the `ChatMessage`.

---

## 4. Verifier (`citation-verifier.service.ts`)

On-demand deep checks of one citation or all citations on a message.

```ts
async verifyCitation(citationId: string): Promise<VerificationResult>;
async verifyAllForMessage(messageId: string): Promise<VerificationResult[]>;

interface VerificationResult {
  citationId: string;
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; message: string }>;
}
```

### Checks performed per source type

| Source type | Checks |
|-------------|--------|
| **SECTION** | `exists` (DB row), `excerpt_in_section` (≥ 30% word-level overlap with `description`) |
| **PRECEDENT** | `precedent_exists`, `excerpt_in_precedent` (overlap with `headnotes` ∪ `summary`) |
| **DOCUMENT** | `document_exists`, `excerpt_in_document` (overlap with `rawText`) |
| **WEB** | `web_reference_set` (URL non-empty); no live HTTP fetch in MVP |

### Excerpt overlap
```
overlap = |words(excerpt) ∩ words(source)| / |words(excerpt)|
words filtered to length ≥ 4
threshold = 0.30
```

The verifier is invoked by `/api/citations/:id/preview` (cheap check on demand) and is designed to also run as a background sweep when needed.

---

## 5. Provider — `internal.provider.ts`

Always enabled. Delegates to the hybrid-search stack:

```ts
async search(query, opts) {
  await hybridSearchService.ensureLoaded();
  const results = await hybridSearchService.search({
    query,
    topK: opts.topK ?? 5,
    actFilter: opts.filters?.actFilter,
    includeRerank: true,
  });
  return results.map(r => ({
    providerId: "internal",
    externalId: r.section.id,
    sourceType: "section",
    title: `${r.section.actType} Section ${r.section.sectionNumber} — ${r.section.title}`,
    reference: `${r.section.actType} ${r.section.sectionNumber}`,
    excerpt: r.section.description?.slice(0, 400) ?? "",
    sourceUrl: undefined,
    relevanceScore: r.score,
    metadata: { bailable: r.section.bailable, punishment: r.section.punishment },
  }));
}
```

Cheap, deterministic, no external dependency.

---

## 6. Provider — `case-documents.provider.ts`

Always enabled. Searches the lawyer's uploaded files for passages that mention the query.

```ts
async search(query, opts) {
  if (!opts.caseContext?.caseId) return [];
  const docs = await prisma.caseDocument.findMany({
    where: { caseId: opts.caseContext.caseId, enabled: true },
  });
  return docs.flatMap(doc => extractPassages(doc, query));
}
```

`extractPassages`:
- Split `rawText` into 500-char windows.
- For each window, compute term-match count over query tokens (≥ 3 chars, lowercased).
- Score = matched / totalQueryTokens.
- Estimate page number as `floor(charPos / 3000) + 1`.
- Return top 3 passages per document.

Future enhancement (Roadmap Phase 2): replace term frequency with chunk-level embeddings reusing `pgvector`.

---

## 7. Provider — `indian-kanoon.provider.ts`

External. Enabled only when `INDIAN_KANOON_API_KEY` is set in env.

```ts
async search(query, opts) {
  if (!this.enabled) return [];
  const refined = refineQueryForDomain(query, opts.domains);
  const resp = await fetch(
    `https://api.indiankanoon.org/search/?formInput=${enc(refined)}&pagenum=0`,
    { headers: { Authorization: `Token ${apiKey}` }, signal: AbortSignal.timeout(8000) }
  );
  const data = await resp.json();
  return data.docs.map(d => ({
    providerId: "indian-kanoon",
    externalId: String(d.tid),
    sourceType: "precedent",
    title: d.title,
    reference: d.citation,
    excerpt: stripHtml(d.fragment ?? d.headline),
    sourceUrl: `https://indiankanoon.org/doc/${d.tid}/`,
    relevanceScore: normalize(d.score),
    metadata: { docsource: d.docsource, publishdate: d.publishdate },
  }));
}

fetchFullText?(externalId) → POST /doc/{externalId}/ → strip HTML.
```

`refineQueryForDomain` appends domain-boost terms — e.g. for `criminal`: `+ "bail criminal"`. This keeps the API search aligned with the user's intent.

Errors and timeouts are caught by the aggregator and converted to empty result sets — Indian Kanoon failure never breaks a chat reply.

---

## 8. End-to-end usage from chat

```ts
// inside strategyAdvisorAgent.chat()
const candidates = await citationAggregator.gather(
  message,
  {
    topK: 8,
    caseContext: {
      caseId: ctx.caseId,
      sectionsRaw: ctx.sectionsRaw,
      facts: extractFacts(ctx),
    },
    rerank: true,
  }
);

// Build prompt with candidates labeled [^cite_0], [^cite_1], ...
// LLM returns text + trailing JSON {"sources":[{"id":"cite_0","externalId":"..."}, ...]}
// Persist Citation rows mapping cite_X -> sectionId/precedentId/documentId
// Run validateCitations(text, availableIds) -> cleanedText
// Save ChatMessage(content=cleanedText, citations=[...])
```

The frontend then renders `[^cite_N]` tokens as clickable chips. Click → `citationStore.open(id)` → `GET /api/citations/:id/preview` → slide-in pane.

---

## 9. Adding a new provider

A worked example for an SCC Online provider lives in [`backend/EXTENSIBILITY.md`](../../backend/EXTENSIBILITY.md). The steps are:

1. Create `src/services/citation/providers/scc-online.provider.ts` implementing `CitationProvider`.
2. Gate behind an env var (e.g. `SCC_API_KEY`).
3. `this.register(sccOnlineProvider)` inside `CitationAggregator`'s constructor.

That's all. The aggregator now runs SCC Online in parallel with Indian Kanoon / internal / case documents — no other code changes.

---

Next: [Middleware & Config](./07-middleware-config.md).
