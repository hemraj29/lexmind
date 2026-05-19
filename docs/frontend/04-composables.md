# Frontend — Composables

Reusable bits of reactive logic that don't fit a Pinia store (because they don't represent global state).

```
composables/
├── useApi.ts         get / post / uploadFile + loading/error
├── usePipeline.ts    legacy pipeline start + SSE + step state
└── useUpload.ts      drag/drop + validation + preview
```

---

## 1. `useApi`

A tiny HTTP helper around `fetch`. Every method returns the *unwrapped* data (or `null` on error) and updates shared `loading` / `error` refs.

```ts
interface ApiHandle {
  loading: Ref<boolean>;
  error:   Ref<string | null>;
  get<T>(path: string): Promise<T | null>;
  post<T>(path: string, body?: unknown): Promise<T | null>;
  uploadFile<T>(path: string, file: File, extraFields?: Record<string, string>): Promise<T | null>;
}

export function useApi(): ApiHandle;
```

Internals:

```ts
async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  loading.value = true;
  error.value = null;
  try {
    const res = await fetch(`/api${path}`, { ...init, headers: { ...init?.headers } });
    const body = (await res.json()) as ApiResponse<T>;
    if (!body.success) {
      error.value = body.error ?? "Unknown error";
      return null;
    }
    return body.data ?? null;
  } catch (err) {
    error.value = (err as Error).message;
    return null;
  } finally {
    loading.value = false;
  }
}
```

- All paths are relative — they're rewritten via Vite proxy in dev and resolved by the reverse proxy in prod.
- `post` automatically `Content-Type: application/json` + serialises `body`.
- `uploadFile` builds a `FormData` with `"file"` plus any `extraFields`.

Usage:
```ts
const api = useApi();
const cases = await api.get<Case[]>("/cases");
const newCase = await api.post<Case>("/cases", { title: "Untitled" });
const uploaded = await api.uploadFile<CaseDocument>(`/cases/${id}/sources/upload`, file);
```

---

## 2. `useUpload`

Pure UI helper for the upload dropzone — validates and previews. Doesn't hit the network.

```ts
interface UploadHandle {
  file:       Ref<File | null>;
  preview:    Ref<string | null>;     // data URL if image, else null
  error:      Ref<string | null>;
  isDragging: Ref<boolean>;

  handleDrop(e: DragEvent): void;
  handleInput(e: Event): void;
  handleDragOver(e: DragEvent): void;
  handleDragLeave(): void;
  clear(): void;
}

export function useUpload(): UploadHandle;
```

Constraints:
- Accepts `application/pdf`, `image/jpeg`, `image/jpg`, `image/png`.
- Max size: 20 MB (sync with backend `MAX_FILE_SIZE_MB`).
- Sets `preview` only for images (uses `FileReader.readAsDataURL`).

Used by `HomeView` and the legacy `FileUploader` component.

---

## 3. `usePipeline`

The legacy SSE driver. Replaced by `chatStore.sendMessage()` for the modern flow but kept for `/legacy → /pipeline/:id → /draft/:id`.

```ts
interface PipelineStep {
  name:        string;     // "upload" | "extract" | "research" | "draft" | "save-output"
  label:       string;
  status:      "pending" | "running" | "success" | "failed" | "skipped";
  message?:    string;
  durationMs?: number;
}

interface PipelineHandle {
  runId:        Ref<string | null>;
  status:       Ref<"idle" | "running" | "completed" | "failed">;
  events:       Ref<WorkflowEvent[]>;
  errorMessage: Ref<string | null>;
  steps:        Ref<PipelineStep[]>;
  currentStep:  ComputedRef<PipelineStep | null>;
  progress:     ComputedRef<number>;   // 0..100

  start(file: File): Promise<void>;
  connectSSE(id: string): void;
  close(): void;
}

export function usePipeline(): PipelineHandle;
```

### Step seed
```ts
const STEPS: PipelineStep[] = [
  { name: "upload",       label: "Upload",       status: "pending" },
  { name: "extract",      label: "Extract FIR",  status: "pending" },
  { name: "research",     label: "Research Law", status: "pending" },
  { name: "draft",        label: "Draft Bail",   status: "pending" },
  { name: "save-output",  label: "Save .docx",   status: "pending" },
];
```

### `start(file)`
```ts
const api = useApi();
const data = await api.uploadFile<{ runId: string; streamUrl: string }>("/pipeline/run", file);
if (!data) { status = "failed"; return; }
runId.value = data.runId;
connectSSE(data.runId);
```

### `connectSSE(id)`
```ts
const es = new EventSource(`/api/pipeline/${id}/stream`);
es.onmessage = e => handleEvent(JSON.parse(e.data) as WorkflowEvent);
es.onerror = () => es.close();
```

### `handleEvent(ev)`
```
case "pipeline:start":     status = "running"
case "step:start":         findStep(ev.step).status = "running"
case "step:progress":      findStep(ev.step).message = ev.message
case "step:complete":      findStep(ev.step).status = "success"
                           findStep(ev.step).durationMs = ev.data.durationMs
case "step:error":         findStep(ev.step).status = "failed"
                           errorMessage = ev.message
case "pipeline:complete":  status = "completed"; es.close()
case "pipeline:error":     status = "failed";    es.close()
```

### `progress`
```ts
const progress = computed(() => {
  const done = steps.value.filter(s => s.status === "success").length;
  return Math.round((done / steps.value.length) * 100);
});
```

`currentStep` is the first `status === "running"` step. Used by `StepProgress.vue`.

---

## 4. Patterns for new composables

When you find yourself reaching for "reactive state + side effect" that isn't global, write a composable, not a store:

```ts
// src/composables/useDebouncedSearch.ts
export function useDebouncedSearch<T>(searcher: (q: string) => Promise<T>, delay = 300) {
  const query = ref("");
  const results = ref<T | null>(null);
  let timer: number;

  watch(query, q => {
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      results.value = await searcher(q);
    }, delay);
  });

  return { query, results };
}
```

Conventions:
- Function name starts with `use`.
- Returns refs and functions — never reactive proxies on the whole state.
- No side effects outside `watch` / explicit method calls.
- Use `onUnmounted` for cleanup (e.g. `es.close()`).

---

Next: [Components](./05-components.md).
