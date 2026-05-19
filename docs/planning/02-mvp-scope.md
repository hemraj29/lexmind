# MVP Scope — what's in, what's out

The MVP is a working FIR → court-ready bail application generator (Criminal domain), plus a notebook-style ChatView that orchestrates analysis and generation across multiple document types and the Civil domain in beta. The objective is:

> A practicing lawyer uploads an FIR (or full case folder), clicks **Regular Bail**, and gets a `.docx` good enough that their first edit is content, not structure.

Anything that doesn't serve that goal is deliberately out of scope.

---

## In scope (shipping in MVP)

### Functional

- **FIR Parsing.** PDF (digital + scanned), JPG, PNG → structured `ExtractedFIR` JSON.
- **Multi-document case context.** FIR + chargesheet + court orders + witness statements + evidence + prior petitions — extracted and persisted under a single `Case`.
- **Legal Section Mapping.**
  - IPC → BNS lookup via `IPCMapping`.
  - Hybrid retrieval (`pgvector` + BM25 + exact-regex) of BNS / BNSS / BSA sections.
  - GPT-4o reranker on candidates.
- **Precedent Retrieval.** Vector-search the `precedents` table for bail-relevant landmark cases.
- **Six criminal drafters.** Regular bail · Anticipatory bail · Default bail · Quashing · Discharge · Criminal appeal.
- **Three civil drafters.** Plaint · Written statement · Temporary injunction.
- **DOCX generation.** Court-formatted output via `docx` npm package.
- **Citations.** Every claim in every output traces back to a `Citation` row (section / precedent / case-doc / web).
- **Anti-hallucination.** 4-layer grounding stack (see [Anti-Hallucination](../architecture/07-anti-hallucination.md)).
- **Chat assistance.** Strategy Advisor agent for `@analyze`, `@summary`, `@missing`, `@cross_exam` + grounded free-form Q&A.
- **Statute search UI.** `/sections` browse + lookup.
- **Pipeline progress streaming.** SSE on the legacy bail flow.
- **Plugin auto-discovery.** New legal domains require zero core changes.

### Technical

- Express + Vue 3 + Postgres + pgvector stack (no separate vector store).
- Zod validation at every wire boundary.
- Pino structured logging.
- Strict TypeScript everywhere.
- Single-tenant local-disk file storage.
- Single-process server, no queue.

---

## Deliberately out of scope (for MVP)

- ❌ **Auth, multi-tenancy, billing.** A demo lawyer uses the system as themselves on a single deployment. Coming in [Phase 5](./01-roadmap.md).
- ❌ **Concurrent / queued pipelines.** One request, one process. No BullMQ / Redis.
- ❌ **S3 / cloud storage.** Local filesystem only. `storage.service.ts` is the seam to swap.
- ❌ **Court e-filing.** No integration with any e-filing portal.
- ❌ **PDF e-signature.** Output is `.docx`, signed manually.
- ❌ **WhatsApp / SMS / email notifications.** Web UI only.
- ❌ **Mobile native app.** Desktop browser only (responsive web works at iPad sizes).
- ❌ **Reviewer / self-correcting agent.** Linear pipeline; reviewer loop is [Phase 3](./01-roadmap.md).
- ❌ **Hindi / regional language drafts.** Drafts are English-only. Input *may* be Hindi (GPT-4o handles it) but output is not optimised. [Phase 4](./01-roadmap.md).
- ❌ **Court-specific template variants.** One template per drafter; HC / SC variants are [Phase 4](./01-roadmap.md).
- ❌ **Audio overview / Mind map.** Studio panel teases these — they are placeholder callouts pending implementation.
- ❌ **Live citation verification on the web.** `citation-verifier` skips HTTP fetch on `WEB` source — verification is "is the URL set". Live snapshotting comes later.
- ❌ **Fine-tuned models.** Stock `gpt-4o` + `text-embedding-3-small`. Fine-tuning is [Phase 6](./01-roadmap.md).
- ❌ **LangChain / LangGraph.** Custom 200-LOC workflow engine is sufficient.
- ❌ **Comprehensive automated evals.** Spot-checks and lawyer review for now. Auto-evals are [Phase 6](./01-roadmap.md).

---

## "Done" criteria for MVP

A practising lawyer can:

1. Create a Case.
2. Upload at least an FIR; optionally a chargesheet / order / witness statement.
3. Run `@analyze` → see strengths/weaknesses/recommendations.
4. Run `@bail` (or click **Regular Bail** in Studio) → receive a `.docx` within ~60 s.
5. Open the `.docx` and verify:
   - All cited sections exist (BNS/BNSS/BSA).
   - No invented case names.
   - All facts trace back to the FIR.
   - At least 5 grounds for bail are present.
6. Click any citation chip in the chat and see a verifiable preview.
7. (Optional) Click `@cross_exam` against a witness statement → receive 7-10 questions.

If they say "this saves me time and is usable", MVP succeeds.

---

## What we will defer reading too deeply about

These are *known unknowns* that we'll handle in production by monitoring rather than designing for upfront:

- Specific OpenAI rate limits per account.
- Cold-start time of the BM25 index past a few hundred thousand sections.
- The exact correctness of every IPC→BNS mapping edge case.
- Behaviour on FIRs in languages other than English / Hindi.
- Handling of scanned FIRs with handwritten annotations.

Each of these has a concrete graceful-degradation behaviour today (retry, warning, fallback). They become hard requirements only when [Phase 5](./01-roadmap.md) ships.

---

Next: [Extending LexiMini](./03-extending.md).
