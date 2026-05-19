# Backend — Workflows

The Workflow Engine is the orchestration layer between *routes* and *agents*. It is intentionally small (≈200 LOC) and avoids LangChain-style abstraction so that any developer can trace a run line-by-line.

Files:
- [`backend/src/core/workflow-engine.ts`](../../backend/src/core/workflow-engine.ts)
- [`backend/src/core/workflow-types.ts`](../../backend/src/core/workflow-types.ts)
- [`backend/src/workflows/bail-application.workflow.ts`](../../backend/src/workflows/bail-application.workflow.ts)
- [`backend/src/workflows/steps/*.step.ts`](../../backend/src/workflows/steps/)

---

## 1. Core types

```ts
type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";

interface WorkflowStep<TInput, TOutput> {
  name: string;
  execute(input: TInput, ctx: WorkflowContext): Promise<TOutput>;
  validate?(output: TOutput): boolean;
  onError?(err: Error, input: TInput, ctx: WorkflowContext): Promise<TOutput | null>;
  retries?: number;     // default 0
  timeout?: number;     // default ∞ (ms)
}

interface WorkflowContext {
  id: string;
  startedAt: number;
  steps: Record<string, StepResult<unknown>>;
  metadata: Record<string, unknown>;
  emit(event: WorkflowEvent): void;
  getStepOutput<T>(name: string): T;
}

interface WorkflowEvent {
  type:
    | "pipeline:start" | "pipeline:complete" | "pipeline:error"
    | "step:start"     | "step:progress"
    | "step:complete"  | "step:error";
  step?: string;
  data?: unknown;
  message?: string;
  timestamp: number;
}
```

The engine is generic over the **final output** (`TFinalOutput`). Each `addStep<TIn,TOut>` call constrains the next step's input — TypeScript catches mismatched chains.

---

## 2. WorkflowEngine API

```ts
class WorkflowEngine<TFinalOutput> {
  addStep<TIn, TOut>(step: WorkflowStep<TIn, TOut>): this;

  async run(
    initialInput: unknown,
    options?: WorkflowOptions
  ): Promise<{
    id: string;
    output: TFinalOutput;
    steps: StepResult<unknown>[];
    totalDurationMs: number;
  }>;

  get stepNames(): string[];
  get stepCount(): number;
}

interface WorkflowOptions {
  id?: string;
  metadata?: Record<string, unknown>;
  onEvent?(event: WorkflowEvent): void;
}
```

### Execution model

```ts
let cursor = initialInput;
emit("pipeline:start", { id, stepCount: steps.length });

for (const step of steps) {
  emit("step:start", { step: step.name });

  const out = await executeWithRetry(step, cursor, ctx);

  if (step.validate && !step.validate(out)) {
    emit("step:error", "validation failed");
    throw …;
  }

  ctx.steps[step.name] = { status: "success", output: out, durationMs };
  emit("step:complete", { step: step.name, data: { durationMs } });
  cursor = out;
}

emit("pipeline:complete", { id, totalDurationMs });
return { id, output: cursor, steps, totalDurationMs };
```

### `executeWithRetry`
```ts
for attempt in 0..retries:
  try {
    return await Promise.race([
      step.execute(input, ctx),
      timeoutPromise(step.timeout)
    ]);
  } catch (err) {
    if (attempt < retries)
      await sleep(baseDelay * 2^attempt + random(0..500));
    else if (step.onError)
      return step.onError(err, input, ctx);   // recovery
    else
      throw err;
  }
```

`baseDelay = 1000ms`. `retries` defaults to 0. The timeout race fires regardless of retry count.

---

## 3. The bail workflow

```ts
// backend/src/workflows/bail-application.workflow.ts
export function createBailApplicationWorkflow() {
  return new WorkflowEngine<SaveOutputResult>()
    .addStep(uploadStep)
    .addStep(extractStep)
    .addStep(researchStep)
    .addStep(draftStep)
    .addStep(saveOutputStep);
}

export async function runBailPipeline(
  input: { fileBuffer: Buffer; fileName: string; mimeType: string },
  options: { onEvent?(e: WorkflowEvent): void } = {}
) {
  const engine = createBailApplicationWorkflow();
  return engine.run(input, options);
}
```

`pipeline.routes.ts → POST /run` calls `runBailPipeline` after replying with `{ runId, streamUrl }`. Events go through the `onEvent` callback which broadcasts to all SSE subscribers for that run id.

---

## 4. The five steps in detail

### `upload.step.ts`
```ts
type UploadInput  = { fileBuffer: Buffer; fileName: string; mimeType: string };
type UploadOutput = { runId: string; filePath: string; fileBuffer: Buffer; mimeType: string };

const uploadStep: WorkflowStep<UploadInput, UploadOutput> = {
  name: "upload",
  async execute(input) {
    if (!SUPPORTED_MIME_TYPES.includes(input.mimeType)) throw …;
    const filePath = await storageService.saveUpload(input.fileBuffer, input.fileName);
    const run = await createPipelineRun({ fileName, mimeType, uploadPath: filePath, status: "PENDING" });
    return { runId: run.id, filePath, fileBuffer: input.fileBuffer, mimeType: input.mimeType };
  },
  validate: o => !!o.filePath && !!o.fileBuffer,
};
```

### `extract.step.ts`
```ts
const extractStep: WorkflowStep<UploadOutput, ExtractedFIR> = {
  name: "extract",
  retries: 1,
  timeout: 120_000,
  async execute({ runId, fileBuffer, mimeType }) {
    const { data, warnings, confidence } = await extractorAgent.extract(fileBuffer, mimeType);
    await updatePipelineRun(runId, { extractedData: data, currentStep: "extract", status: "RUNNING" });
    return data;
  },
  validate: fir => !!(fir.firNumber || fir.briefFacts) && (fir.confidence ?? 0) >= 0.3,
};
```

### `research.step.ts`
```ts
const researchStep: WorkflowStep<ExtractedFIR, { fir: ExtractedFIR; memo: LegalMemo }> = {
  name: "research",
  retries: 1,
  timeout: 180_000,
  async execute(fir, ctx) {
    const memo = await researcherAgent.research(fir);
    const runId = ctx.metadata.runId as string;
    await updatePipelineRun(runId, { legalMemo: memo, currentStep: "research" });
    return { fir, memo };
  },
  validate: o => o.memo.applicableSections.length > 0,
};
```

### `draft.step.ts`
```ts
const draftStep: WorkflowStep<{ fir, memo }, { fir, memo, draftMarkdown, docxBuffer }> = {
  name: "draft",
  retries: 1,
  timeout: 180_000,
  async execute({ fir, memo }, ctx) {
    const { markdown, docxBuffer } = await drafterAgent.draft(fir, memo);
    await updatePipelineRun(ctx.metadata.runId, { draftMarkdown: markdown, currentStep: "draft" });
    return { fir, memo, draftMarkdown: markdown, docxBuffer };
  },
  validate: o => o.draftMarkdown.length >= 200 && o.docxBuffer.length > 0,
};
```

### `save-output.step.ts`
```ts
const saveOutputStep: WorkflowStep<DraftOutput, SaveOutputResult> = {
  name: "save-output",
  async execute({ fir, memo, draftMarkdown, docxBuffer }, ctx) {
    const runId = ctx.metadata.runId as string;
    const { path: docxPath, fileName: docxFileName } =
      await storageService.saveOutput("bail-application", runId, docxBuffer);
    await updatePipelineRun(runId, {
      status: "COMPLETED",
      docxPath,
      totalDurationMs: Date.now() - ctx.startedAt,
      steps: Object.values(ctx.steps),
    });
    await createGeneratedDocument({ pipelineRunId: runId, docType: "REGULAR_BAIL", filePath: docxPath, fileSize: docxBuffer.length, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    return { fir, memo, draftMarkdown, docxPath, docxFileName };
  },
};
```

---

## 5. Event flow & SSE

[`pipeline.routes.ts`](../../backend/src/routes/pipeline.routes.ts) holds `Map<runId, Response[]>`. When a client connects to `/api/pipeline/:id/stream`:

```ts
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.setHeader("Connection", "keep-alive");
sseClients.get(runId)?.push(res) ?? sseClients.set(runId, [res]);

req.on("close", () => removeFromMap(runId, res));
```

When `runBailPipeline` fires events, the route callback broadcasts:

```ts
function broadcast(runId: string, event: WorkflowEvent) {
  const subs = sseClients.get(runId) ?? [];
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const r of subs) r.write(payload);

  if (event.type === "pipeline:complete" || event.type === "pipeline:error") {
    for (const r of subs) r.end();
    sseClients.delete(runId);
  }
}
```

**Late subscribers** miss earlier events — clients should also call `/api/pipeline/:id/result` to reconstruct state.

---

## 6. Adding a new workflow

Suppose you want a "Plaint generation" workflow.

1. Build the steps (e.g. `civil-extract.step.ts`, `civil-research.step.ts`, `plaint-draft.step.ts`, `save-output.step.ts`).
2. Compose in `workflows/plaint-generation.workflow.ts`:
   ```ts
   export function createPlaintWorkflow() {
     return new WorkflowEngine<SaveOutputResult>()
       .addStep(civilExtractStep)
       .addStep(civilResearchStep)
       .addStep(plaintDraftStep)
       .addStep(saveOutputStep);
   }
   ```
3. Expose a route (or hook into `chat.service.ts → COMMAND_HANDLERS`).
4. Optionally reuse `pipeline.routes.ts` if you want SSE — pass the right `runBailPipeline`-style trigger.

Patterns to follow:
- Each step writes its own DB update so a crashed pipeline leaves a useful partial trail.
- Validation belongs *in the step*, not in callers.
- Retries default to 0 — only set when the failure mode is genuinely transient (network blips, occasional vision flakiness).

---

## 7. Roadmap for the engine itself

Tracked in [Roadmap Phase 3](../planning/01-roadmap.md):

- **Branching / goto**: a step returns a *next-step name* instead of just an output, enabling reviewer-loop topologies.
- **Parallel steps**: `addParallel([stepA, stepB])` for independent sub-tasks (e.g. extract & domain-route concurrently).
- **Step skipping**: a `shouldRun(input, ctx)` predicate to skip steps based on inputs (e.g. skip extract if the case already has an extracted FIR).
- **Resumability**: persist `ctx.steps` and `cursor` between runs so a crashed pipeline can resume from the last successful step.

The current implementation is intentionally minimal so that none of these are blocked — each is an *additive* change.

Next: [Services](./04-services.md).
