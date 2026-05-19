# Contributing

A short, opinionated guide to working on the LexiMini codebase.

---

## 1. Ground rules

1. **The core never changes.** Drafters, domains, acts, citation providers — everything *extends* via plugin files. Touching `core/` requires a strong rationale and review.
2. **Grounded by construction.** Every LLM call ships only DB-derived data in its prompt. Every LLM output is validated. No exception.
3. **One responsibility per file.** Agents have one method. Services have one purpose. Routes are 3–10 lines.
4. **Strict TypeScript.** No `any` without comment-justification. `unknown` is acceptable at boundaries.
5. **Test against real artifacts.** Have an FIR PDF, a chargesheet, and a witness statement on hand. End-to-end smoke beats unit tests for AI workflows.

---

## 2. Coding style

### TypeScript
- Strict mode is on. Honour it.
- Prefer `type` to `interface` except for plugin contracts and stores (where interface aids extension).
- Type imports use `import type { ... }` so they erase at build.
- Use `??` and `?.` liberally. Avoid `||` for default-fallback when the value can legitimately be `0` or `""`.

### Naming
- Files: `kebab-case`. Suffix by role: `.agent.ts`, `.service.ts`, `.routes.ts`, `.step.ts`, `.drafter.ts`, `.types.ts`, `.store.ts`.
- Variables: `camelCase`. Constants: `UPPER_SNAKE` only for shared cross-file constants.
- TS types/interfaces: `PascalCase`.
- React/Vue components: `PascalCase.vue`.
- Drafter IDs: `<domain>.<docType>` (this enables the registry's pattern fallback).

### Logging
- Always use a module child logger:
  ```ts
  const logger = createChildLogger("hybrid-search");
  logger.info({ topK, candidates }, "fused");
  ```
- First arg is an object of context, second is the message. Pino's preferred order.

### Errors
- Throw `AppError("message", 400)` for HTTP-mappable errors.
- Throw plain `Error` for programmer errors (the middleware will 500 them).
- Don't swallow — `try/catch` only when you can *meaningfully* recover (e.g. fallback path).

### Comments
- Default to **no comments**. Code + tests should explain themselves.
- When you do comment, write *why*, not *what*. Reference the case / bug / decision.

### Vue
- `<script setup lang="ts">` always.
- Type props/emits with the generic form.
- One responsibility per component. Smart views, dumb components.
- Tailwind utilities directly in the template. No scoped styles unless absolutely necessary.

---

## 3. Branches & commits

- Branch from `main`: `feat/<scope>`, `fix/<scope>`, `chore/<scope>`, `docs/<scope>`.
- Commit messages: short imperative subject (≤72 chars), optional body explaining *why*.
- Reference issues / PRs in the body, not the subject.
- Avoid mixed-purpose commits — one logical change per commit makes review and bisection easier.

Example:
```
feat(citations): add SCC Online provider

Drops a new provider class behind SCC_API_KEY. The aggregator's
parallel fan-out handles the API's flakiness via the existing
8s timeout + allSettled().

Refs: docs/planning/03-extending.md#4-new-citation-provider
```

---

## 4. Pull requests

A good PR:

1. Has a one-paragraph **why** at the top.
2. Lists every file changed and what changed in it (a few words each).
3. Has a **screenshot / log line** for any user-visible or pipeline-level change.
4. Updates the relevant doc page (this `docs/` tree).
5. Builds clean (`pnpm build` in both `backend` and `frontend`).
6. Doesn't introduce any new TypeScript errors.

Reviewers look for:

- Does this respect the plugin boundary? (no `core/` change unless justified)
- Is every LLM call grounded?
- Are there new env vars? Defaults sensible?
- Is the error path handled?
- Does it log enough to debug a production failure?

Small PRs ship fast. Aim for ≤300 lines of diff.

---

## 5. Manual test ritual before merging an AI-affecting change

For changes that touch agents, prompts, or the pipeline:

```
1. Spin up dev: pnpm dev in both backend and frontend
2. Have a known-good FIR PDF (small, clear) ready
3. Run /legacy upload -> watch the SSE -> open /draft/:id
   - Did the extract succeed?
   - Are the cited sections real BNS/BNSS rows?
   - Are the cited precedents real Precedent rows?
   - Is the bailability correct given the sections?
   - Does the .docx open cleanly in Word?
4. In ChatView, create a Case, upload the same FIR + a chargesheet
   - Run @analyze - reasonable strengths/weaknesses?
   - Run @bail - same output quality as step 3?
   - Click a citation chip - does the CitationPreview show the right excerpt?
5. Compare against the previous "known good" baseline.
```

If a prompt change makes step 4's analysis worse — even subtly — back it out.

---

## 6. Adding a dependency

Default: **don't**. The current stack is intentionally minimal.

If you must:

- Justify in the PR — what does it do that the existing stack can't?
- Prefer pure TS/JS, no native compilation if possible.
- Pin the version (`^1.2.3` is fine; never `*`).
- Add a one-liner to [`docs/architecture/02-tech-stack.md`](../architecture/02-tech-stack.md).

---

## 7. Working with prompts

Prompts live next to the code that uses them (no `prompts/` folder). When tweaking:

1. Note the *measurable* problem first ("the drafter sometimes invents Section 999").
2. Keep `temperature` low — only raise when you need phrasing variety, not factual variety.
3. Keep JSON mode on for any structured output.
4. Add the new rule **near** the top of the prompt. LLMs follow earlier instructions better.
5. Save a sample input + before/after output in the PR description so reviewers can judge.

Prompts can drift — if you suspect regression, do a 5-FIR sample comparison.

---

## 8. Working with data

- Statute / precedent data lives in `backend/src/data/`. Treat it as code — review every PR change.
- Ingestion scripts cost real money (OpenAI tokens). Run them locally first; don't bulk-rerun in CI.
- If you're updating ingredients/keywords for an existing section, write an idempotent migration script.

---

## 9. Documentation

Every PR that changes a file in `backend/src/` or `frontend/src/` should also touch the matching page under `docs/`:

| Change | Doc to update |
|--------|---------------|
| New endpoint | `docs/architecture/06-api-reference.md` |
| New agent | `docs/backend/02-agents.md` |
| New service | `docs/backend/04-services.md` |
| New domain / drafter | `docs/backend/08-domains-drafters.md` + `docs/architecture/03-plugin-architecture.md` |
| New view / component | the relevant `docs/frontend/*.md` |
| New schema field | `docs/architecture/05-data-model.md` |
| New env var | `docs/01-getting-started.md` + `docs/planning/04-deployment.md` |

Docs that are out of date are *worse than missing* — they get believed.

---

## 10. Releasing

MVP cadence is informal — no semver, no release notes. When MVP graduates:

1. Tag `v1.0.0` once auth + queue + multi-tenant ship.
2. Switch to semver: feature changes → minor; bug fixes → patch; breaking (schema/API) → major.
3. Write a `CHANGELOG.md` keyed by tag.

Until then, `main` is the release.

---

## 11. Asking for help

- Architecture questions → start with [Architecture Overview](../architecture/01-overview.md), then ask in the team chat with a doc link.
- Bugs in the agents → reproduce against a known FIR, capture the SSE log, attach.
- Plugin authoring → walk through [Extending LexiMini](./03-extending.md) and grep for the relevant `*.drafter.ts` file as a template.

Good luck — and don't break grounding.
