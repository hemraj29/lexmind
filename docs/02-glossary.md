# Glossary

Domain-specific and project-specific terms used across the codebase and these docs.

---

## Indian legal vocabulary

| Term | Meaning |
|------|---------|
| **FIR** | First Information Report — the formal complaint that initiates a criminal investigation in India. Primary input to the bail pipeline. |
| **IPC** | Indian Penal Code (1860) — the legacy criminal code, *replaced* by BNS in 2023. |
| **CrPC** | Code of Criminal Procedure (1973) — legacy procedural code, *replaced* by BNSS. |
| **Evidence Act** | Indian Evidence Act (1872) — legacy, *replaced* by BSA. |
| **BNS** | Bharatiya Nyaya Sanhita (2023) — new substantive criminal code. |
| **BNSS** | Bharatiya Nagarik Suraksha Sanhita (2023) — new criminal procedure code. |
| **BSA** | Bharatiya Sakshya Adhiniyam (2023) — new evidence law. |
| **CPC** | Code of Civil Procedure, 1908 — civil-side procedural code. |
| **Plaint** | The originating pleading in a civil suit (Order VII CPC). |
| **Written Statement** | The defendant's reply to a plaint (Order VIII CPC). |
| **Cognizable offence** | Police can arrest without warrant. |
| **Non-cognizable** | Requires court permission to arrest. |
| **Bailable / non-bailable** | Whether bail is a right (bailable) or court's discretion (non-bailable). |
| **Compoundable** | Whether the complainant can withdraw / settle. |
| **Regular bail** | Bail after arrest (BNSS § 480). |
| **Anticipatory bail** | Bail granted before arrest, when arrest is feared (BNSS § 482). |
| **Default bail** | Bail when chargesheet not filed within statutory limit (BNSS § 187). |
| **Quashing petition** | Application to quash FIR / proceedings (BNSS § 528). |
| **Discharge** | Court releases accused before trial for lack of *prima facie* case (BNSS § 250). |
| **Precedent** | A judgment cited for its legal principle (*ratio*). |
| **Ratio (decidendi)** | The legal rule that decided a case — what gives a precedent its binding force. |
| **Headnote** | A short editor-written summary of a precedent. |
| **SCC** | Supreme Court Cases (a reporter) — citation like `(2024) 5 SCC 100`. |
| **Ingredients** | The elements that must be proved for a section to be made out. |
| **Cause of action** | The set of facts that gives rise to a legal right to sue (civil). |

---

## LexiMini-specific terms

| Term | Meaning |
|------|---------|
| **Pipeline** | One end-to-end FIR → bail run, persisted as a `PipelineRun` row. |
| **PipelineRun** | DB row tracking status, extracted FIR, legal memo, draft, errors, step timings. |
| **Run ID** | The `id` (cuid) of a `PipelineRun`. Used in URLs, SSE channels, and filenames. |
| **Workflow** | The composed sequence of `WorkflowStep`s (e.g., upload → extract → research → draft → save). |
| **WorkflowEngine** | Generic typed step-runner in [`backend/src/core/workflow-engine.ts`](../backend/src/core/workflow-engine.ts). |
| **WorkflowContext** | Per-run carrier of metadata, step outputs, and the `emit()` SSE callback. |
| **Case** | A long-lived legal matter (DB: `Case`). Owns documents, chat messages, pipeline runs, generations. |
| **CaseDocument** | An uploaded source file scoped to a case (FIR / chargesheet / court order / etc.). |
| **GeneratedDocument** | A produced file (`.docx`) emitted by a pipeline run. |
| **LegalMemo** | The Researcher Agent's output — applicable sections, mappings, ingredients, precedents, bailability, risk. |
| **ExtractedFIR** | The Extractor Agent's structured JSON of FIR contents. |
| **Studio Action** | A button in the right-pane Studio panel (`StudioAction` table + `/api/studio-actions`). Mirrors a Domain × DocumentType. |
| **Chat Command** | The `@…` shortcut you can type in chat (`ChatCommand` table + `/api/commands`). Always paired with a Studio Action. |
| **Domain** | A legal area plugin (Criminal, Civil, …). Drives routing + UI grouping. |
| **Drafter** | A document generator plugin. One per Document Type per Domain. ID convention: `<domain>.<docTypeCode>`. |
| **Act plugin** | JSON metadata about a piece of legislation (BNS, CPC, …). Lives in `backend/src/acts/<domain>/*.act.json`. |
| **Citation** | Traceability row linking a generated claim to its source (section, precedent, case-doc, or web URL). |
| **Hybrid search** | Vector + BM25 + exact-match merged via RRF, optionally LLM-reranked. |
| **RRF** | Reciprocal Rank Fusion — `score = 1 / (k + rank)`. Used to merge multiple ranked result lists. |
| **Reranker** | A GPT-4o cross-encoder that scores each candidate 0-10 for query relevance. |
| **Grounding** | The discipline of providing the LLM *only* with DB-verified data so it can't invent sections or cases. |
| **Anti-hallucination** | The 4-layer strategy that combines grounding + prompt constraints + post-validation + deterministic overrides. |
| **SSE** | Server-Sent Events — used for streaming pipeline progress. One stream per run ID. |

---

## Code conventions

| Pattern | Meaning |
|--------|---------|
| `*.agent.ts` | An LLM-powered orchestrator. Has a single public class instance and a small surface (e.g., `extract()`, `research()`, `draft()`). |
| `*.service.ts` | An infrastructure singleton (OpenAI, DB, BM25, etc.). Stateless or holds in-memory indexes. |
| `*.drafter.ts` | A `DrafterPlugin` for one document type. Lives under `backend/src/domains/<domain>/drafters/`. |
| `*.step.ts` | A `WorkflowStep<TIn,TOut>` used inside a workflow. |
| `*.routes.ts` | An Express `Router` mounted under `/api`. |
| `*.types.ts` | Pure TypeScript type declarations re-exported via `src/types/index.ts`. |
| `*.store.ts` | A Pinia store on the frontend. |
| `use*.ts` | A Vue 3 composable on the frontend. |
| `_shared.ts` | A private helper module for the folder it lives in. Not imported across domain boundaries. |
| `_template/` | A copy-paste starter (e.g., for a new domain plugin). Skipped by the loader. |
| `<domain>.<docType>` | Drafter / document-type ID convention. E.g., `criminal.regular_bail`, `civil.plaint`. |
| `@<command>` | A chat command. E.g., `@bail`, `@analyze`, `@cross_exam`. |

---

Continue: [Architecture Overview](./architecture/01-overview.md).
