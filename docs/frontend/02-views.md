# Frontend — Views

One page-level Vue component per route. Each is documented with its layout, data flow, and key handlers.

```
views/
├── ChatView.vue        primary 3-pane UI    /  and  /case/:id
├── SectionsView.vue    statute search       /sections
├── HomeView.vue        legacy upload         /legacy
├── PipelineView.vue    legacy SSE progress   /pipeline/:id
├── DraftView.vue       legacy 3-tab draft    /draft/:id
└── HistoryView.vue     legacy runs list      /history
```

---

## 1. `ChatView.vue` — main interface

**Layout:**
```
┌────────────────────────────────────────────────────────────┐
│ AppHeader                                                   │
│  Logo · "<case title>" dropdown · share · settings · avatar │
├────────────────────────────────────────────────────────────┤
│  Sources        │            Chat            │   Studio    │
│  panel (340 px) │   ChatHeader               │   panel     │
│  ┌──────────┐   │   ChatArea (messages)      │   (340 px)  │
│  │AddSource │   │   ChatInput (textarea +    │             │
│  │WebSearch │   │              file + send)  │   Draft     │
│  │SourceList│   │                            │   Analyze   │
│  └──────────┘   │                            │   Research  │
└────────────────────────────────────────────────────────────┘
  CitationPreview slide-in pane (right, on demand)
```

**Stores used:** `casesStore`, `chatStore`, `sourcesStore`, `studioStore`, `citationStore`.

**Lifecycle (key code):**

```ts
onMounted(async () => {
  await casesStore.fetchCases();
  await studioStore.fetchActions("criminal");
  if (route.params.id) await selectCase(route.params.id as string);
});

watch(() => route.params.id, async id => {
  if (id) await selectCase(id as string);
  else clearCase();
}, { immediate: false });
```

**Key handlers:**

| Action | Implementation |
|--------|----------------|
| `handleNewCase()` | `casesStore.createCase({}) → router.push("/case/" + id)` |
| `handleSelectCase(id)` | `router.push("/case/" + id)` |
| `handleSend(content, file?)` | optimistic user message → `chatStore.sendMessage()` → reload messages |
| `handleStudioAction(action)` | `studioStore.executeAction(caseId, action)` → reload messages |
| `handleSourceUpload(file)` | `sourcesStore.uploadSource(caseId, file)` |
| Citation click on a `[^cite_N]` chip in `MessageBubble` | `citationStore.open(citationId)` |

**Transitions:** the Sources and Studio panels each have a `collapsed` boolean — toggled via header buttons. Tailwind `translate-x` + 250 ms `transition-transform` for slide animation.

---

## 2. `SectionsView.vue` — statute search

Simple form view. Doesn't use a Pinia store — uses `useApi` directly.

```vue
<script setup lang="ts">
const api = useApi();
const q = ref("");
const act = ref<"BNS" | "BNSS" | "BSA" | "">("");
const limit = ref(20);
const results = ref<StatuteSection[]>([]);

async function search() {
  if (q.value.length < 2) return;
  const data = await api.get<StatuteSection[]>(
    `/sections/search?q=${encodeURIComponent(q.value)}` +
    (act.value ? `&act=${act.value}` : "") +
    `&limit=${limit.value}`
  );
  if (data) results.value = data;
}
</script>
```

Each result card shows: `act SECTION_NO` badge, title, bailable badge (green/red), description excerpt, punishment line, offence type chip.

Click → `<RouterLink>` to a future `/section/:act/:number` page (currently the link is not wired; planned in Phase 2).

---

## 3. `HomeView.vue` — legacy upload landing

Header: "Generate Bail Application" + "Upload an FIR. AI does the research. You get a court-ready draft."

Uses `useUpload` (drag/drop validation + preview) and `usePipeline` (start + SSE).

```ts
const upload = useUpload();
const pipeline = usePipeline();

async function start() {
  if (!upload.file.value) return;
  await pipeline.start(upload.file.value);
  router.push(`/pipeline/${pipeline.runId.value}`);
}
```

3 cards beneath the uploader explain "Upload FIR · AI Research · Download Draft".

---

## 4. `PipelineView.vue` — legacy SSE progress

```ts
const route = useRoute();
const pipeline = usePipeline();

onMounted(() => pipeline.connectSSE(route.params.id as string));
onBeforeUnmount(() => pipeline.close());

watch(() => pipeline.status.value, s => {
  if (s === "completed") setTimeout(() => router.push(`/draft/${pipeline.runId.value}`), 1500);
});
```

Renders `<StepProgress :steps :progress />`. On `pipeline.status === "failed"` shows an error message + retry link.

---

## 5. `DraftView.vue` — legacy generated draft

```ts
const pipelineStore = usePipelineStore();
onMounted(() => pipelineStore.fetchResult(route.params.id as string));

const result = computed(() => pipelineStore.currentResult);
const tab = ref<"draft" | "fir" | "memo">("draft");
```

Three tabs:
- **Draft** — `markdownToHtml(result.draftMarkdown)` rendered in a prose container.
- **FIR** — raw JSON of `result.fir`.
- **Memo** — raw JSON of `result.memo`.

Download button: `<a :href="`/api/pipeline/${id}/download`" download>...</a>`.

Footer: per-step timing line ("Upload 120ms · Extract 18 s · Research 12 s · Draft 21 s · Save 1 s · Total 52 s").

---

## 6. `HistoryView.vue` — legacy runs list

```ts
const pipelineStore = usePipelineStore();
onMounted(() => pipelineStore.fetchHistory(20));
```

Renders each run as a row:
```
[status badge]   fileName             5 min ago      52 s total
```

Click row → `/draft/{id}`. Empty state: "No pipeline runs yet."

---

## 7. Adding a new view

1. Create `src/views/MyView.vue` with `<script setup lang="ts">`.
2. Register the route in `router/index.ts`.
3. Reuse existing stores where applicable, or create a new one in `stores/`.
4. Hit only `/api/...` paths via `useApi`.

The codebase has no global error boundary — each view shows its own error states. If you need a global toast/snackbar, this is the place to add it (Pinia store + injected component slot in `App.vue`).

Next: [Stores](./03-stores.md).
