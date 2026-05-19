# Anti-Hallucination

A bail draft that cites a non-existent section, an invented precedent, or a fact not in the FIR is **worse than useless** — it is dangerous. The whole pipeline is designed so this cannot happen by construction.

LexiMini layers **four** defences. Each one is a backstop; together they make hallucination quantitatively rare and easy to detect.

---

## 1. The four layers

```
┌──────────────────────────────────────────────────────────────────┐
│                       GROUNDING STACK                            │
│                                                                  │
│  Layer 1 — DATA GROUNDING                                        │
│    • Every section / precedent given to the LLM is a DB row.     │
│    • IPC→BNS mapping is a verified lookup table (IPCMapping).    │
│    • The Researcher never accepts free-text section refs from    │
│      the LLM; it pulls structured rows by id.                    │
│                                                                  │
│  Layer 2 — PROMPT GROUNDING                                      │
│    • Every agent prompt declares "ONLY cite provided data".      │
│    • temperature 0.1 for extract/research, 0 for rerank.         │
│    • JSON mode (response_format: json_object) forces parseable   │
│      output.                                                     │
│    • The Strategy Advisor includes a "sources JSON" trailer with │
│      cited IDs.                                                  │
│                                                                  │
│  Layer 3 — POST-VALIDATION                                       │
│    • researcher.agent.validateMemo() drops sections that aren't  │
│      in knownSections (set of DB ids).                           │
│    • drafter.agent.validateDraft() regex-scans the draft and     │
│      flags every section/case that isn't in the memo.            │
│    • citation-validator strips unsupported claims sentence-by-   │
│      sentence (chat side).                                       │
│    • WorkflowStep.validate() enforces structural minimums.       │
│                                                                  │
│  Layer 4 — DETERMINISTIC OVERRIDE                                │
│    • Bailability is computed from DB rows, not LLM output.       │
│    • Section *details* are always re-fetched from DB after the   │
│      LLM has suggested IDs — the LLM cannot bend the punishment, │
│      title, or ingredients.                                      │
│    • Precedent fields (court, year, citation) come from DB.      │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Layer 1 — Data grounding

Implementation contact points:

- `database.service.ts` — only place that produces `StatuteSection` / `Precedent` rows.
- `hybridSearchService.search()` returns DB-backed rows (vector + BM25 + exact).
- `findIPCMapping(ipc)` returns a fully-typed row with FK to a `StatuteSection`.
- The Researcher composes its prompt context **after** all rows are pulled — at no point does it ask the LLM to *invent* a section.

A query path that bypassed the DB would be a regression we'd catch in code review — there is no "free-form" LLM section-suggestion path anywhere.

---

## 3. Layer 2 — Prompt grounding

Every structured-output agent prompt has the same skeleton:

```
You are a <role>.
Below is a FIR / case context: <DB-derived JSON>.
Below are the applicable sections / precedents: <DB-derived JSON>.

Constraints:
  • Cite ONLY the sections / precedents listed above by their id.
  • Do NOT invent case names, citations, or punishment text.
  • Output STRICT JSON with the following keys: { ... }

Return JSON now.
```

Key levers:

| Lever | Where set | Value |
|-------|-----------|-------|
| `temperature` | `openaiService.chat({ temperature })` | 0.1 (extract/research), 0.2 (chat), 0.3 (drafting), 0 (reranker) |
| `response_format: json_object` | `chatJSON` / `visionJSON` helpers | always |
| `max_tokens` | per call | 4096 (extract) — 8192 (draft) |
| System message | per agent | enforces role + "only use provided data" |

---

## 4. Layer 3 — Post-validation

### a) Researcher memo validation
[`backend/src/agents/researcher.agent.ts`](../../backend/src/agents/researcher.agent.ts)

After the LLM returns a JSON memo:

```ts
const knownSectionIds = new Set(applicableSections.map(s => s.id));
memo.applicableSections = memo.applicableSections.filter(s => knownSectionIds.has(s.id));
```

Sections the LLM mentioned but that aren't in the retrieved set are silently dropped — the rest of the pipeline sees a *narrower* but trustworthy memo.

### b) Drafter section reference scan
[`backend/src/agents/drafter.agent.ts`](../../backend/src/agents/drafter.agent.ts)

```ts
const refRegex = /section\s+(\d+[a-z]?)/gi;
for (const m of legalArguments.matchAll(refRegex)) {
  const ref = m[1].toLowerCase();
  if (!knownSections.has(ref)) {
    logger.warn({ ref }, "Unknown section reference in draft");
    warnings.push(`Unknown section ${ref}`);
  }
}
```

Warnings flow up to `step:complete data.warnings[]` so they're visible to the UI / monitoring.

A draft with `grounds.length < 3` is also flagged — empirically a sign the LLM didn't fully follow the prompt.

### c) Citation validator (chat side)
[`backend/src/services/citation/citation-validator.service.ts`](../../backend/src/services/citation/citation-validator.service.ts)

`validateCitations(text, availableCitationIds)` operates **per sentence**:

1. Skip `[OPINION] ... [/OPINION]` blocks.
2. Find any `[^cite_N]` tokens. Remove ones not in `availableCitationIds`.
3. Classify the sentence:
   - **Conversational** (intros, offers, conditional) → keep.
   - **Hedged claim** ("generally held", "well-established") → keep.
   - **Concrete legal claim** (section ref, act, court holding, punishment, "cognizable", SCC citation) → require at least one supported `[^cite_N]`; otherwise **drop the sentence**.
4. Rebuild text.

Output:
```ts
interface ValidationResult {
  cleanText: string;
  isValid: boolean;
  flaggedSentences: string[];
  usedCitationIds: string[];
}
```

### d) Citation verifier (on-demand)
[`backend/src/services/citation/citation-verifier.service.ts`](../../backend/src/services/citation/citation-verifier.service.ts)

Triggered by `/api/citations/:id/preview` (or background sweep). Checks:

| Check | Logic |
|-------|-------|
| `exists` | DB row for the cited `sourceType` exists |
| `excerpt_in_section` | ≥ 30% word overlap with `StatuteSection.description` (words ≥ 4 chars) |
| `precedent_exists` | precedent row + citation match |
| `document_exists` | uploaded case doc row found |
| `web_reference_set` | URL present (no live HTTP check) |

A failed verification is shown to the user inline (red dot on a citation chip).

### e) Workflow step validation
[`backend/src/core/workflow-engine.ts`](../../backend/src/core/workflow-engine.ts)

```ts
const out = await step.execute(input, ctx);
if (step.validate && !step.validate(out)) {
  throw new Error(`Step "${step.name}" output failed validation`);
}
```

Validation failures **do not retry** — they almost always indicate a deterministic agent bug, and silent retry would mask it.

---

## 5. Layer 4 — Deterministic overrides

Even after the LLM returns "valid" output, the system **does not trust it for facts that can be computed**:

| Computed deterministically | Where |
|----------------------------|-------|
| `bailability` (bailable / non-bailable / mixed) | `researcher.agent.ts` — derived from `StatuteSection.bailable` flags. |
| Section title, description, punishment, ingredients | always re-loaded from DB after the LLM names an id. |
| Precedent court, year, citation, ratio | DB-only — the LLM only sees the row and may *reason* about it but cannot rewrite it in output. |
| IPC→BNS mapping | DB only (`IPCMapping`). The LLM never produces a mapping. |
| Sections list in the final draft | sourced from `LegalMemo.applicableSections` (already post-validated). |

If the LLM produces text that contradicts the deterministic facts, the regex scan in `drafter.validateDraft()` flags it as a warning and a citation drop in the chat validator removes the offending sentence entirely.

---

## 6. Observability hooks

Anti-hallucination is only useful if you can *see* it working:

| Event | Where it surfaces |
|-------|-------------------|
| `warn: "Unknown section reference"` in pino logs | drafter / researcher |
| `warnings: [...]` in `WorkflowEvent.step:complete.data` | passed to SSE + persisted in `pipeline_runs.steps` |
| Citation validator's `flaggedSentences` | future endpoint — currently logged |
| `CitationVerificationResult.passed = false` | UI red-dot on citation chip |
| `confidence` field on `ExtractedFIR` | < 0.3 fails extract validation, < 0.5 flagged in UI |

Recommended monitoring: aggregate warning counts per run, alert on outliers.

---

## 7. What's *not* covered (and the plan)

| Risk | Status | Mitigation plan |
|------|--------|-----------------|
| LLM cites a real section but mis-summarises its scope | partial | Roadmap Phase 3 — **Reviewer agent** loop reads the draft and challenges every assertion against the memo. |
| Wrong applicable section (false positive from hybrid search) | partial | Increase rerank top-K; tune BM25 weights; add lawyer feedback loop. |
| Stale precedent (overruled by a later case) | open | Add `overruledBy` self-relation on `Precedent`; ingest pipeline must mark superseded cases. |
| Domain mis-routing (criminal query → civil drafter) | low | DomainRouter falls back to LLM; misroutes manifest as poor sections; user can re-route via `@command`. |
| Web-citation drift (Indian Kanoon page updated) | open | `CitationCache` stores the snapshot at fetch time. Future: store full HTML in S3. |

---

Next: [Hybrid Search](./08-hybrid-search.md).
