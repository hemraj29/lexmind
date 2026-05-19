# Backend — Agents

LLM-powered orchestrators. Each agent is a singleton with a small public surface, stateless across calls, and wrapped with `withRetry()` on every OpenAI hit.

Location: [`backend/src/agents/`](../../backend/src/agents/).

```
agents/
├── extractor.agent.ts            FIR → ExtractedFIR
├── researcher.agent.ts           ExtractedFIR → LegalMemo
├── drafter.agent.ts              ExtractedFIR + LegalMemo → bail .docx
├── drafter-factory.agent.ts      route a doc-type code → DrafterPlugin
├── domain-router.agent.ts        free-text query → domain code(s)
├── document-analyzer.agent.ts    any uploaded file → typed extraction
└── strategy-advisor.agent.ts     case analysis + grounded chat
```

Every agent imports `openaiService`, often `databaseService`/`hybridSearchService`, and `createChildLogger`. Prompts are inlined in TS — no template files — to keep the prompt + parsing logic side-by-side.

---

## 1. `extractor.agent.ts` — FIR fact extractor

```ts
extractorAgent.extract(buffer: Buffer, mimeType: string): Promise<FIRExtractionResult>
```

### Responsibilities
- Decide which path to take (text-extractable PDF vs scanned/image).
- Call GPT-4o **chat** for digital PDFs (faster, cheaper), GPT-4o **Vision** for the rest.
- Force strict-JSON output and normalise all fields.
- Compute a `confidence` score and emit `warnings` for missing critical fields.

### Algorithm
```
if mimeType is PDF:
    raw = await extractTextFromPDF(buffer)
    if raw.length > MIN_TEXT_PDF:
        out = await openaiService.chatJSON(prompt_text + raw, { temperature: 0.1, max: 4096 })
    else:
        # scanned PDF
        out = await openaiService.visionJSON(buffer, prompt_vision, …)
else:
    out = await openaiService.visionJSON(buffer, prompt_vision, …)
```

### Prompt rules
- Role: "Indian legal text reader, FIR specialist."
- "Extract ONLY what is explicitly stated. Use null for missing fields."
- Output schema enumerated: `firNumber`, `date`, `policeStation`, `district`, `state`, `accused[]`, `victim`, `ioName`, `sectionsRaw[]`, `briefFacts`, `rawText`, `confidence`.
- `temperature: 0.1`, JSON mode.

### Validation
- `confidence` clamped `0..1`.
- `warnings.push("FIR number missing")` etc. when critical fields are null.
- Empty arrays for `accused[]` / `sectionsRaw[]` get explicit defaults.

### Consumers
- Workflow step `extract.step.ts`.
- `document-analyzer.agent` delegates here when it classifies the document as FIR.

---

## 2. `researcher.agent.ts` — legal researcher

```ts
researcherAgent.research(fir: ExtractedFIR): Promise<LegalMemo>
```

### Responsibilities
1. **IPC→BNS mapping** — regex parse `fir.sectionsRaw[]` for `IPC <num>`, lookup `IPCMapping`, join with `StatuteSection`.
2. **Statute hybrid search** — two passes:
   - facts → `hybridSearchService.search({ query: fir.briefFacts, topK: 5 })`
   - each explicit `sectionsRaw[]` → `hybridSearchService.search({ query: ref, topK: 1 })`
   - dedupe by section id into a `Map`.
3. **Precedent search** — embed `applicableSections + facts`, call `vectorSearchPrecedents(emb, 5, bailOnly=true)`.
4. **LLM synthesis** — pass the *DB-derived* sections + precedents to GPT-4o; it returns `ingredients`, `bailability` rationale, and `riskAssessment`.
5. **Bailability override** — recomputed from `StatuteSection.bailable` flags, *not* the LLM.
6. **`validateMemo()`** — strip any section the LLM cites that isn't in `knownSections`.

### Output
```ts
LegalMemo {
  applicableSections: StatuteSection[];
  mappedSections:     IPCToBNSMapping[];
  ingredients:        string[];
  precedents:         CasePrecedent[];
  bailability:        "bailable" | "non-bailable" | "mixed";
  riskAssessment:     string;
}
```

### Prompt levers
- `temperature: 0.1`, JSON mode, max 4096 tokens.
- Includes only DB-derived rows; explicit "only cite the sections above" instruction.

---

## 3. `drafter.agent.ts` — bail-specific drafter

```ts
drafterAgent.draft(fir, memo): Promise<{ markdown; sections: BailDraftSections; docxBuffer: Buffer }>
```

### Responsibilities
- Assemble the prompt context from FIR + memo (facts, accused, IO, applicable sections, ingredients, precedents).
- GPT-4o generates a 5-section bail application as JSON: `introduction`, `briefFacts`, `grounds[]`, `legalArguments`, `prayer`.
- Convert JSON to markdown (numbered grounds, headings).
- `docgenService.generate(sections, fir, memo)` produces the `.docx` buffer.
- Validate: regex-scan for unknown section refs, warn if `grounds.length < 3`.

### Prompt levers
- `temperature: 0.3` (a touch of variation in phrasing), max 8192 tokens.
- Forbids inventing facts, sections, case names.

### Used by
- Workflow step `draft.step.ts`.
- Domain drafter `criminal/drafters/regular-bail.drafter.ts` delegates here for backward compatibility.

---

## 4. `drafter-factory.agent.ts` — registry dispatcher

```ts
drafterFactory.draft(
  documentTypeCode: string,
  caseData: CaseWithDocuments,
  memo:     LegalMemo,
  options?: { citations?, … }
): Promise<DraftResult>;
drafterFactory.listAvailable(): string[];
```

### Lookup strategy
1. `drafterRegistry.get("<domain>.<docType>")` — explicit id match.
2. Iterate `domainRegistry.all()`, call `drafterRegistry.getByDocumentTypeCode(domainCode, docTypeCode)`.
3. As a final fallback, pattern-match plugin ids against `<domain>.<docType>`.

If nothing is found, throw with a list of available drafter ids. The `chat.service.ts` generation handler is the main caller.

---

## 5. `domain-router.agent.ts` — query → domain

```ts
domainRouterAgent.route(
  query: string,
  context?: { actReferences?: string[] }
): Promise<string[]>;          // ordered list of domain codes
```

### Strategies, applied in order
1. **Keyword match** — case-insensitive on `domain.routingHints.keywords`.
2. **Pattern match** — `domain.routingHints.queryPatterns` regexes.
3. **Act-reference match** — if context contains section refs, look at the prefix (BNS → criminal, CPC → civil, etc.).
4. **LLM fallback** — assemble all domain descriptions and ask GPT-4o to classify. Returned codes are validated against the registry.

If all strategies fail → default to the first registered domain (criminal). Used by chat ingestion to choose which domain's prompt to load.

---

## 6. `document-analyzer.agent.ts` — universal document extractor

```ts
documentAnalyzerAgent.classifyDocument(buffer, mimeType): Promise<CaseDocType>;
documentAnalyzerAgent.extract(buffer, mimeType, docType?): Promise<ExtractionResult>;
```

### Classify
Forces GPT-4o to return exactly one of: `fir | chargesheet | court_order | witness_statement | evidence | previous_petition | other`. Temperature 0.

### Extract (per type)
- **FIR** → delegates to `extractorAgent`.
- **Chargesheet** → `charges[]`, `witnessList`, `documentsRelied`, `accusedDetails`.
- **Court order** → `reasoning`, `directions[]`, `bailGranted?`.
- **Witness statement** → `witnessName`, `keyStatements[]`, `contradictions[]`.
- **Evidence** → `chainOfCustody`, `items[]`, `forensicNotes`.
- **Previous petition** → `petitionType`, `outcome`, `arguments[]`.

Each path tries: text extraction → vision → generic. Confidence defaults to 0.7 except for FIR (preserved from extractor).

### Used by
- `sources.routes.ts → POST /sources/upload`
- `chat.routes.ts` when a file is attached to a message.

---

## 7. `strategy-advisor.agent.ts` — analysis & chat

```ts
strategyAdvisorAgent.analyzeCase(context: CaseContext): Promise<CaseAnalysis>;
strategyAdvisorAgent.chat(message, context): Promise<{ reply: string; metadata: any }>;
strategyAdvisorAgent.assessBailProspects(context): Promise<BailProspectAnalysis>;
strategyAdvisorAgent.generateCrossExamQuestions(witnessData, context): Promise<string[]>;
strategyAdvisorAgent.generateSummary(context): Promise<string>;
strategyAdvisorAgent.identifyMissingInfo(context): Promise<string[]>;
```

### Inputs
A `CaseContext` includes: title, clientName, all `CaseDocument`s (with `extractedData`), `sectionsRaw[]`, `applicableSections[]`, `precedents[]`, and the last ~30 chat messages (TEXT only).

### Outputs
- `analyzeCase` → `strengths[]`, `weaknesses[]`, `prosecutionArguments[]` with `counterStrategy`, `recommendedPetitions[]` (prioritised), `bailProspect`, `missingInfo[]`.
- `chat` → reply with inline `[^cite_N]` tokens and a trailing JSON sources block. Parser extracts citation IDs.

### Prompt design
- System prompt instructs:
  1. Only use the provided data.
  2. Cite *exact* section numbers.
  3. Suggest `@commands` for complex tasks.
  4. Include a closing JSON `{"sources":[…]}` block.
- Chat history is capped at the last 20 messages so the system prompt stays large enough to contain the case context.
- `temperature: 0.2` (analysis), `0.3` (chat).

### Where it's wired up
- `chat.service.ts` for `@analyze`, `@summary`, `@missing`, `@cross_exam`, and the default chat fallback.

---

## 8. Cross-agent collaboration diagram

```
                       ┌────────────────────────┐
                       │ documentAnalyzerAgent  │ ← any upload
                       └────────────┬───────────┘
                                    │ FIR detected
                                    ▼
                       ┌────────────────────────┐
                       │   extractorAgent       │
                       └────────────┬───────────┘
                                    │ ExtractedFIR
                                    ▼
                       ┌────────────────────────┐
                       │  researcherAgent       │
                       └────────────┬───────────┘
                                    │ LegalMemo
                          ┌─────────┴─────────┐
                          ▼                   ▼
            ┌──────────────────────┐  ┌───────────────────────┐
            │ drafterAgent (legacy)│  │ drafterFactory.draft()│
            │  + docgenService     │  │  → DrafterPlugin      │
            └──────────────────────┘  │  → docgenService      │
                                      └───────────────────────┘

                       ┌────────────────────────┐
                       │ strategyAdvisorAgent   │ ← @analyze, @cross_exam, chat
                       └────────────────────────┘

                       ┌────────────────────────┐
                       │ domainRouterAgent      │ ← future: auto-route case
                       └────────────────────────┘
```

---

## 9. Common patterns to copy when adding a new agent

```ts
import { openaiService } from "../services/openai.service.js";
import { withRetry } from "../utils/retry.js";
import { createChildLogger } from "../utils/logger.js";

const logger = createChildLogger("my.agent");

class MyAgent {
  async doThing(input: MyInput): Promise<MyOutput> {
    return withRetry(async () => {
      logger.info({ input }, "running");
      const out = await openaiService.chatJSON<MyOutput>(
        [
          { role: "system", content: "ONLY use the data provided. Output strict JSON." },
          { role: "user",   content: JSON.stringify(input) },
        ],
        { temperature: 0.1, maxTokens: 4096 }
      );
      this.validate(out);
      return out;
    });
  }

  private validate(o: MyOutput) { /* throw if structural issues */ }
}

export const myAgent = new MyAgent();
```

Key dos:

- **One thing, one method, one prompt.** Don't pack multiple intents.
- **No DB writes from the agent.** Let the calling step / route handle persistence.
- **Logger first.** Every external call gets an `info` or `warn` line with the inputs.
- **Throw, don't return errors.** Wrap callers in `try/catch` if needed; the workflow engine relies on this.

Next: [Workflows](./03-workflows.md).
