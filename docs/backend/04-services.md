# Backend — Services

Infrastructure singletons. Stateless or holding in-memory indexes. Imported by agents, routes, and workflows.

Location: [`backend/src/services/`](../../backend/src/services/).

```
services/
├── openai.service.ts
├── database.service.ts
├── bm25.service.ts
├── hybrid-search.service.ts
├── reranker.service.ts
├── docgen.service.ts
├── storage.service.ts
├── chat.service.ts
└── citation/                  ← see backend/06-citations.md
    ├── citation-aggregator.service.ts
    ├── citation-validator.service.ts
    ├── citation-verifier.service.ts
    ├── provider.types.ts
    └── providers/  (internal · case-documents · indian-kanoon)
```

---

## 1. `openai.service.ts`

Wrapper around the OpenAI SDK with retry, structured JSON, and vision support.

```ts
class OpenAIService {
  async chat(messages: ChatCompletionMessageParam[], opts?:
    { model?: string; temperature?: number; maxTokens?: number; response_format?: "json_object" | "text" }
  ): Promise<string>;

  async chatJSON<T>(messages, opts?): Promise<T>;

  async vision(buffer: Buffer, mimeType: string, prompt: string, opts?): Promise<string>;

  async visionJSON<T>(buffer, mimeType, prompt, opts?): Promise<T>;

  async embed(text: string): Promise<number[]>;                  // 1536-d
  async embedBatch(texts: string[]): Promise<number[][]>;        // 100/batch
  async healthCheck(): Promise<{ ok: boolean }>;
}

export const openaiService = new OpenAIService();
```

Defaults:
- `model = env.OPENAI_MODEL` (`gpt-4o`).
- `embeddingModel = env.OPENAI_EMBEDDING_MODEL` (`text-embedding-3-small`).
- `temperature` defaults `0.2` for chat, `0.1` for vision.
- Vision images sent as base64 data URIs with `detail: "high"`.
- All methods wrapped in `withRetry()` (exp backoff, 3 attempts).
- `embedBatch` chunks to 100 inputs/call, logs progress.

Health check pings `client.models.list()` so it's cheap.

---

## 2. `database.service.ts`

Singleton Prisma client + raw pgvector helpers.

```ts
export const prisma: PrismaClient;

async initDatabase(): Promise<void>;            // ensures CREATE EXTENSION vector + connects
async disconnectDatabase(): Promise<void>;
async healthCheck(): Promise<{ ok: boolean }>;

// Vector search
async vectorSearchStatutes(emb: number[], topK = 10, actFilter?: ActType)
  : Promise<Array<{ id: string; score: number }>>;
async vectorSearchPrecedents(emb: number[], topK = 5, bailOnly = false)
  : Promise<Array<{ id: string; score: number }>>;

// Embedding upserts (raw SQL for vector type)
async updateStatuteEmbedding(id: string, emb: number[]): Promise<void>;
async updatePrecedentEmbedding(id: string, emb: number[]): Promise<void>;

// Convenience lookups
async findSectionByNumber(act: ActType, number: string): Promise<StatuteSection | null>;
async findIPCMapping(ipc: string): Promise<IPCMapping & { bnsSection: StatuteSection } | null>;
async searchSections(q: string, act?: ActType, limit = 20): Promise<StatuteSection[]>;

// PipelineRun CRUD
async createPipelineRun(data: Partial<PipelineRun>): Promise<PipelineRun>;
async updatePipelineRun(id: string, patch: Partial<PipelineRun>): Promise<PipelineRun>;
async getPipelineRun(id: string): Promise<PipelineRun | null>;
async listPipelineRuns(opts: { limit; offset }): Promise<PipelineRun[]>;

async createGeneratedDocument(...): Promise<GeneratedDocument>;
```

### Vector queries
```sql
-- Statutes (cosine)
SELECT id, 1 - (embedding <=> $1::vector) AS score
FROM statute_sections
WHERE embedding IS NOT NULL
  AND ($2::text IS NULL OR act_type = $2)
ORDER BY embedding <=> $1::vector
LIMIT $3;
```

Prisma `$queryRaw` is used so the `vector(1536)` cast survives the driver.

### Logging
The Prisma client is initialised with `log: ["error", "warn"]` event emission → routed into pino via `prisma.$on("error", e => logger.error(e))`. Slow-query observability is straightforward to add by also listening to `query`.

---

## 3. `bm25.service.ts`

In-memory BM25 over all `StatuteSection` rows.

```ts
class BM25Service {
  isLoaded: boolean;
  async load(): Promise<void>;                            // builds the index
  search(query: string, topK = 10): Array<{ id; score }>;
  searchExact(sectionRef: string): Array<{ id }>;
}
export const bm25Service = new BM25Service();
```

### Index build
- Document = lowercase concat of `actType + sectionNumber + title + description + ingredients.join + punishment`.
- Tokenise: replace non-`[a-z0-9]` with spaces, split, drop length-1 tokens.
- Maintain:
  - `docLen[id] → number`
  - `tf[id][token] → number`
  - `df[token] → number`
  - `avgDocLen → number`
- Parameters: `k1 = 1.5`, `b = 0.75`.

### Search
Standard BM25 scoring. Returns `score > 0` only, sorted desc, sliced topK.

### `searchExact`
Normalises section refs (strip non-alnum, lowercase) and does a direct hash lookup on `{act}-{number}` keys built during indexing. Returns id matches with no score (the hybrid layer applies the 2× boost).

### Loading
Called on first use via `hybridSearchService.ensureLoaded()`. Cold start time on ~5k sections: ~1-2 s.

---

## 4. `hybrid-search.service.ts`

The fusion layer documented at length in [Hybrid Search](../architecture/08-hybrid-search.md).

```ts
interface HybridSearchOptions {
  query: string;
  topK?: number;                  // default 3
  actFilter?: ActType;
  includeRerank?: boolean;        // default: candidates.length > topK
}

class HybridSearchService {
  async ensureLoaded(): Promise<void>;
  async search(opts: HybridSearchOptions): Promise<SearchResult[]>;
}
```

`SearchResult.section` is the **fully populated DB row** — callers do not need to re-fetch.

`source` indicates origin: `"vector" | "bm25" | "exact" | "rerank"`. After rerank, the highest-ranked source is `"rerank"`.

---

## 5. `reranker.service.ts`

```ts
class RerankerService {
  async rerank(
    query: string,
    candidates: Array<{ id: string; text: string; score: number }>,
    topK: number
  ): Promise<Array<{ id: string; score: number; reasoning?: string }>>;
}
export const rerankerService = new RerankerService();
```

- Builds a single GPT-4o JSON-mode call asking for `{ rankings: [{ index, score, reasoning }] }`.
- `temperature: 0`.
- Filters `score < 3`, sorts desc, slices topK, normalises `score / 10`.
- On any error → returns the input list unchanged tagged with `reasoning: "Fallback"`.

---

## 6. `docgen.service.ts`

Produces `.docx` via the `docx` npm package.

```ts
class DocGenService {
  // bail-specific
  async generate(sections: BailDraftSections, fir: ExtractedFIR, memo: LegalMemo): Promise<Buffer>;

  // generic per-section (used by domain drafters)
  async generateFromSections(
    docType: GenerationDocType,
    sections: Record<string, unknown>,
    caseData: CaseWithDocuments,
    memo: LegalMemo
  ): Promise<Buffer>;
}
```

### Layout
- Page size A4 with 1-inch margins (`1440` twips).
- Times New Roman, justified body.
- Court heading: centered, all-caps.
- Case title: centered, bold.
- "In the matter of FIR No. XYZ" line.
- Horizontal rule.
- Dynamic sections — keys map to headings:
  - `introduction` → "INTRODUCTION"
  - `briefFacts` → "BRIEF FACTS"
  - `grounds` (array) → "GROUNDS FOR BAIL", numbered roman (i, ii, iii…)
  - `legalArguments` → "LEGAL ARGUMENTS"
  - `apprehensionGrounds` → "GROUNDS OF APPREHENSION" (anticipatory bail)
  - `conditions` (array) → "CONDITIONS OFFERED"
  - `prayer` → "PRAYER"
- Signature block: date + place + advocate name (right-aligned).

Helper methods (private): `centeredHeading()`, `sectionHeading()`, `paragraph()`, `splitIntoParagraphs()` (splits on `\n\n`).

---

## 7. `storage.service.ts`

Abstraction over file I/O. Easy to swap for S3 (single class, no fan-out across the code base).

```ts
class StorageService {
  async init(): Promise<void>;                                          // mkdir uploads/, output/
  async saveUpload(buffer: Buffer, fileName: string): Promise<string>;  // → ./uploads/{uuid}.{ext}
  async saveOutput(docType: string, runId: string, buffer: Buffer):
    Promise<{ path: string; fileName: string }>;                        // → ./output/{docType}-{runId}.docx
  async readFile(path: string): Promise<Buffer>;
  async deleteFile(path: string): Promise<void>;                        // warns on error, doesn't throw
  async exists(path: string): Promise<boolean>;
  getOutputPath(fileName: string): string;
}
```

To swap to S3: implement the same surface using `@aws-sdk/client-s3` and toggle via env. No call site changes.

---

## 8. `chat.service.ts`

The large service that powers the entire `ChatView` interface. It owns:

### Case CRUD
```ts
async createCase(input: CreateCaseInput): Promise<Case>;
async listCases(): Promise<Case[]>;                                 // active only, with _count
async getCase(id: string): Promise<CaseWithDocuments | null>;
async getChatHistory(caseId: string, opts: { limit; before }): Promise<ChatMessage[]>;
```

### Message routing
```ts
async handleMessage(
  caseId: string,
  input: { content?: string; file?: { buffer; originalname; mimetype } }
): Promise<{ type, messages: ChatMessage[] }>;
```

Internally:
```
1. Persist USER message (TEXT|COMMAND|FILE_UPLOAD).

2. if file:
     analyzed = await documentAnalyzerAgent.classifyDocument + extract
     storageService.saveUpload(file.buffer, file.originalname)
     prisma.caseDocument.create({ ... })
     update case.sectionsRaw if the doc surfaced section refs
     persist ASSISTANT message ({ type: "analysis_card", content: JSON.stringify(analyzed) })
     return { type: "analysis_card", … }

3. else if parseCommand(content):
     dispatch to COMMAND_HANDLERS[command]
       e.g. analyze → strategyAdvisorAgent.analyzeCase
            cross_exam → generateCrossExamQuestions
            sections / precedents → catalog lookups
            <generation_type> → runGeneration(genType, case)
     persist ASSISTANT message (text or {analysis|generation}_card)
     return result

4. else:
     reply = await strategyAdvisorAgent.chat(content, buildCaseContext(case))
     persist ASSISTANT TEXT message with citations
     return { type: "text", … }
```

### Generation flow (`runGeneration`)
```
1. buildCaseContext(case)
2. researcherAgent.research(extractedFirEquivalent)
3. drafterFactory.draft(docType, caseData, memo)
4. storageService.saveOutput(docType, runId, docxBuffer)
5. prisma.pipelineRun.create({ status: COMPLETED, ... })
6. prisma.generatedDocument.create({ ... })
7. return GenerationCard ChatMessage
```

Note: this path **does not use the WorkflowEngine** — for chat-style synchronous responses it's simpler to inline the calls and return one message. The legacy `/api/pipeline/run` still uses the engine for SSE.

### Helpers exported
```ts
buildCaseContext(case: CaseWithDocuments): Promise<CaseContext>;
researchCase(case: CaseWithDocuments): Promise<LegalMemo>;
getApplicableSections(sectionsRaw: string[]): Promise<StatuteSection[]>;
getRelevantPrecedents(sectionRefs: string[]): Promise<Precedent[]>;
```

---

## 9. Service interaction diagram

```
                ┌────────────────────┐
                │   openai.service   │ ← chat / vision / embed
                └────────┬───────────┘
                         │ uses
   ┌─────────────────────┴───────────────────────┐
   │                                             │
┌──┴────────────┐  ┌─────────────────┐  ┌────────┴────────────┐
│  bm25.service │  │ database.service│  │  reranker.service   │
└──┬────────────┘  └────────┬────────┘  └────────┬────────────┘
   │                        │                    │
   └──────────┐    ┌────────┘                    │
              ▼    ▼                             ▼
   ┌──────────────────────┐          ┌────────────────────┐
   │ hybrid-search.service│ ────────▶│ citation/aggregator│
   └──────────┬───────────┘          └──────────┬─────────┘
              │ used by                          │
              ▼                                  ▼
       ┌───────────────┐                ┌────────────────────┐
       │ researcher.agt│                │ citation/validator │
       └───────────────┘                │ citation/verifier  │
                                        └────────────────────┘

┌────────────────────┐   ┌───────────────────┐
│  storage.service   │   │   docgen.service  │
└────────────────────┘   └───────────────────┘
        │                          │
        └──── used by every drafter / save step / chat.service
```

`chat.service` sits on top of *everything* — it composes nearly the whole stack to keep the Studio/Chat experience seamless.

Next: [Routes](./05-routes.md).
