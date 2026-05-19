# Hybrid Search

The search stack is the engine room of the Researcher agent and of the Citation aggregator. It blends:

```
   vector recall      (pgvector cosine on 1536-d embeddings)
 + lexical recall     (in-memory BM25, k1=1.5, b=0.75)
 + exact-match recall (regex on "section N" / "<act> N")
 ─────────────────────────────────────────────────────────────
 → Reciprocal Rank Fusion (RRF, k=60)  · 2× boost for exact
 → Optional GPT-4o reranker            · 0–10 scoring, drop <3
 → Top-K (default 3)                   · normalised 0..1 score
```

Implementation: [`backend/src/services/hybrid-search.service.ts`](../../backend/src/services/hybrid-search.service.ts) plus the three component services.

---

## 1. Why hybrid?

| Signal | Strength | Weakness |
|--------|----------|----------|
| Vector | catches *semantic* matches: "took car without consent" → theft sections | mediocre on exact statutory references |
| BM25 | excellent on rare terms, statutory keywords, section numbers | misses paraphrasing |
| Exact regex | 100% precision when the user mentions a section by number | useless if number not present |

Combining the three gives both recall (vector) and precision (BM25 + exact). RRF gracefully blends without needing a learned weight.

---

## 2. Component services

### `services/openai.service.ts`
- `embed(text)` → `number[1536]`
- `embedBatch(texts)` → batches of 100, with retry.

Used for: embedding the FIR facts, embedding statute sections during ingestion, embedding precedents.

### `services/database.service.ts`
Raw-SQL pgvector queries:

```ts
async vectorSearchStatutes(
  embedding: number[],
  topK = 10,
  actFilter?: ActType
): Promise<Array<{ id: string; score: number }>>;

async vectorSearchPrecedents(
  embedding: number[],
  topK = 5,
  bailOnly = false
): Promise<Array<{ id: string; score: number }>>;
```

Uses `embedding <=> $1::vector` (cosine distance) ordered ASC, with `1 - distance` as score.

### `services/bm25.service.ts`
In-memory BM25 index over `StatuteSection`s. Built on first use:

- Document = concatenation of `actType`, `sectionNumber`, `title`, `description`, `ingredients`, `punishment`.
- Tokenisation = lowercase, alphanumeric only, drop length-1 tokens.
- Index = `{ token → Map<docId, termFreq> }`.

Public API:
```ts
bm25Service.search(query: string, topK = 10): Array<{ id: string; score: number }>;
bm25Service.searchExact(sectionRef: string): Array<{ id: string }>;
```

`searchExact` normalises section references (`"Section 303"`, `"BNS 303"`, `"303(a)"`) to a canonical key before lookup.

### `services/reranker.service.ts`
GPT-4o cross-encoder.

```ts
rerankerService.rerank(
  query: string,
  candidates: Array<{ id: string; text: string; score: number }>,
  topK: number
): Promise<Array<{ id: string; score: number; reasoning?: string }>>;
```

Prompt (JSON mode):
```
You are scoring legal-search candidates for the query: "<query>".
For each candidate, return an integer 0–10 indicating relevance.
{
  "rankings": [
    { "index": 0, "score": 9, "reasoning": "..." },
    ...
  ]
}
```

- `temperature: 0`
- Drops scores `< 3`.
- Normalises `score / 10` to `0..1`.
- On any LLM error → returns the original ranking unchanged with `reasoning: "Fallback: reranking failed"`.

---

## 3. The hybrid pipeline

```
hybridSearchService.search({
  query: string;
  topK?: number;             // default 3
  actFilter?: ActType;       // optional BNS/BNSS/BSA filter
  includeRerank?: boolean;   // default true if candidates > topK
}): Promise<SearchResult[]>
```

### a) Detect exact references
Two regex patterns:
- generic — `section\s+(\d+[a-z]?)`
- act-prefixed — `(BNS|BNSS|BSA|IPC|CRPC)\s+(?:section\s+)?(\d+[a-z]?)`

Matches → `bm25Service.searchExact(ref)` for each.

### b) Run vector + BM25 in parallel
- `openaiService.embed(query)` → `database.vectorSearchStatutes(emb, 10)`
- `bm25Service.search(query, 10)`

### c) RRF fusion
```
finalScore(id) = Σ over each list L where id appears:
                 weight(L) / (k + rank_in_L)
```
with `k = 60`, `weight = 1.0` for vector & BM25, `weight = 2.0` for exact.

Duplicates are detected by `id`; the `source` field on the merged result picks the *highest-scoring* origin (`vector` | `bm25` | `exact`).

### d) Optional rerank
If `(candidates.length > topK) && includeRerank`:
- Send up to 20 candidates with their `title` + first 200 chars of `description`.
- Filter scores `< 3`.
- Sort desc, slice topK.

Failure mode — log + fall through to RRF-only.

### e) Final shape
```ts
interface SearchResult {
  section: StatuteSection;        // fully loaded DB row
  score: number;                  // 0..1
  source: "vector" | "bm25" | "exact" | "rerank";
}
```

---

## 4. Why these numbers?

| Knob | Value | Reason |
|------|-------|--------|
| Vector topK | 10 | Cheap; gives the rerank room without inflating tokens. |
| BM25 topK | 10 | Same. |
| RRF `k` | 60 | Classic value (Cormack et al. 2009). |
| Exact boost | 2× | Empirically a `"Section 303"` mention almost always means "the section". |
| Rerank threshold | 3 / 10 | LLM gives `1–2` for clearly irrelevant; `3+` is the ambiguity edge. |
| Final topK | 3 | The drafter's prompt budget; the Researcher prompt also assembles ingredients per section, so more sections quickly blow context. |

All values are easy to tweak — they're constants in [`backend/src/config/constants.ts`](../../backend/src/config/constants.ts) and the corresponding service.

---

## 5. Citation aggregator reuse

[`backend/src/services/citation/citation-aggregator.service.ts`](../../backend/src/services/citation/citation-aggregator.service.ts) runs the **same RRF + rerank** logic across multiple **providers**:

```
provider:internal          (uses hybridSearchService internally)
provider:case-documents    (term frequency over uploaded docs)
provider:indian-kanoon     (external API, gated on env key)
+ future providers (SCC Online, etc.)
```

- Each provider runs in parallel with `Promise.allSettled()` + an 8 s timeout.
- Candidates are deduped by *canonical key*:
  - `section:{normalised section ref}`
  - `precedent:{normalised citation}`
  - or `{providerId}:{externalId}` as a last resort.
- RRF (`k=60`) merges per-provider rankings.
- Reranker triggers when `candidates.length > 8` (so we don't pay an LLM call for tiny pools).

The aggregator is what powers `@sections`, `@precedents`, and the citation chips throughout the Strategy Advisor chat replies.

---

## 6. Performance characteristics (MVP)

| Component | Latency | Scale ceiling |
|-----------|---------|---------------|
| `vectorSearchStatutes(topK=10)` | ~30-80 ms on 5k rows | up to ~100k rows without HNSW |
| BM25 `search(query, 10)` | ~5 ms on 5k docs | in-memory; rebuild on cold start (~1-2 s) |
| `rerankerService.rerank(20)` | 500-1500 ms (GPT-4o) | bounded by tokens, not data |
| `hybridSearchService.search()` | 200-1500 ms end-to-end | dominated by rerank |
| Citation aggregator (3 providers) | 1-3 s | dominated by Indian Kanoon (8 s hard cap) |

For higher scale ([Roadmap Phase 5](../planning/01-roadmap.md)):
- Add `CREATE INDEX … USING hnsw (embedding vector_cosine_ops)` on both vector columns.
- Move BM25 into Postgres GIN (full-text) for persistence.
- Swap GPT-4o reranker for a self-hosted cross-encoder (BGE-Reranker-large) — 50ms vs 1.5s.

---

## 7. Caveats

| Caveat | Workaround |
|--------|------------|
| BM25 index is **in-memory** and rebuilt on cold start. | If service restarts often, move to Postgres FTS. |
| Hybrid search runs at the `StatuteSection` granularity, not chunks. | OK for Indian statutes (sections are paragraph-sized). For long acts, add parent-child chunk retrieval. |
| Rerank is on **title + 200 chars of description**. | Long-tail sections may be under-served. Switch to summary field if available. |
| `searchExact` only knows BNS/BNSS/BSA/IPC/CrPC act codes. | Extend the regex when new acts are ingested. |

---

End of architecture track. Continue with the developer guides:
- [Backend Overview](../backend/01-overview.md)
- [Frontend Overview](../frontend/01-overview.md)
