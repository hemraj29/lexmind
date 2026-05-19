# Frontend — Pinia Stores

Pinia setup-style stores. One per concern. Stores import `useApi`, but never each other — composition happens in views.

```
stores/
├── cases.store.ts        list / create / archive cases
├── chat.store.ts         per-case message thread
├── sources.store.ts      case documents (upload / toggle / remove)
├── studio.store.ts       Studio action catalog
├── citation.store.ts     CitationPreview slide-in pane
└── pipeline.store.ts     legacy pipeline runs (history + result)
```

---

## 1. `cases.store.ts`

```ts
state {
  cases:   Case[];
  loading: boolean;
}

actions {
  fetchCases():            GET /api/cases            → cases
  createCase(input):       POST /api/cases           → refetch
  archiveCase(id):         DELETE /api/cases/:id     → refetch
}
```

Used by `ChatView` for the case dropdown (`AppHeader` + dropdown).

---

## 2. `chat.store.ts`

```ts
state {
  activeCaseId: string | null;
  messages:     ChatMessage[];
  loading:      boolean;
  sending:      boolean;
}

getters {
  sortedMessages: messages ordered by createdAt ASC
}

actions {
  loadMessages(caseId): GET /api/cases/:id/messages?limit=100   → messages
  sendMessage(content, file?):
      1) optimistic: push a USER message + "Thinking..." placeholder
      2) POST /api/cases/:id/messages   (FormData: content + optional file)
      3) replace placeholder with server-returned messages
  clearMessages(): reset state
}
```

Optimistic UI: the user sees their message instantly. The placeholder uses `metadata.thinking = true` so `MessageBubble.vue` can render a pulse animation.

Concurrency: `sending` is a single boolean — only one message in flight at a time. The chat input disables submit while `sending = true`.

---

## 3. `sources.store.ts`

```ts
state {
  sources:    Source[];
  loading:    boolean;
  uploading:  boolean;
  searching:  boolean;
}

getters {
  enabledSources: sources.filter(s => s.enabled)
  sourceCount:    sources.length
}

actions {
  fetchSources(caseId):                GET /api/cases/:id/sources
  uploadSource(caseId, file):          POST (multipart) /api/cases/:id/sources/upload
                                        → prepend to sources[]
  searchWeb(caseId, query):            POST /api/cases/:id/sources/web-search
                                        → prepend to sources[]
  toggleSource(caseId, srcId, enabled):
        PATCH /api/cases/:id/sources/:srcId   { enabled }
        + optimistic update of the local source's enabled flag
  removeSource(caseId, srcId):
        DELETE /api/cases/:id/sources/:srcId
        + filter out from sources[]
  clear(): reset state
}
```

The Source shape (frontend-only DTO):
```ts
interface Source {
  id: string;
  type: "fir" | "chargesheet" | "court_order" | "witness_statement" | "evidence" | "previous_petition" | "other";
  title: string;
  fileName: string;
  pageCount?: number;
  enabled: boolean;
  confidence?: number;
  excerpt?: string;
  createdAt: string;
}
```

---

## 4. `studio.store.ts`

```ts
state {
  actions:   StudioAction[];
  loading:   boolean;
  executing: string | null;       // id of action currently running
}

getters {
  actionsByCategory: { draft: [], analyze: [], research: [], extract: [] }
}

actions {
  fetchActions(domainCode?):   GET /api/studio-actions?domain=criminal
                               → actions (or DEFAULTS on error)
  executeAction(caseId, action):
        executing = action.id
        POST (multipart) /api/cases/:id/messages
            FormData: content = action.command || `@${action.code}`
        → returns boolean (success)
        executing = null
}
```

The 12 hardcoded `DEFAULTS` ensure the Studio panel never shows empty even if the bootstrap sync hasn't run or `/api/studio-actions` is unreachable.

---

## 5. `citation.store.ts`

Powers the right-side slide-in `CitationPreview` panel.

```ts
state {
  isOpen:  boolean;
  loading: boolean;
  preview: CitationPreview | null;
}

interface CitationPreview {
  id: string;
  sourceType: "section" | "precedent" | "document" | "web";
  title: string;
  reference: string;
  excerptText: string;
  pageNumber?: number;
  paragraphRef?: string;
  sourceUrl?: string;
  pdfUrl?: string;
  documentUrl?: string;
}

actions {
  open(citationId):
        loading = true; isOpen = true
        try { preview = await GET /api/citations/:id/preview }
        catch { preview = MOCK_FALLBACK }    // for dev when DB is empty
        loading = false
  close():
        // animate-out: 250ms transition
        setTimeout(() => preview = null, 250)
        isOpen = false
}
```

Opened from `MessageBubble.vue` whenever a `[^cite_N]` chip is clicked.

---

## 6. `pipeline.store.ts` (legacy)

Used only by the `/legacy → /draft/:id → /history` flow.

```ts
state {
  runs:          PipelineRunSummary[];
  currentResult: PipelineResultResponse | null;
  loading:       boolean;
}

actions {
  fetchHistory(limit = 20): GET /api/pipeline?limit=...
  fetchResult(runId):       GET /api/pipeline/:id/result
}
```

The live-progress flow uses `usePipeline` (composable) directly — see [Composables](./04-composables.md).

---

## 7. Cross-store conventions

| Convention | Why |
|-----------|-----|
| One store per concern; no cross-store imports | Avoids cyclic dependencies + lets each store be unit-tested independently. |
| All side-effects in actions | Reactivity stays clean; views call actions, watch state. |
| Optimistic updates **only** when the operation is essentially never going to fail | E.g. toggling a source's `enabled` flag is optimistic; uploading a file isn't. |
| Errors are *not* surfaced via store state | Each call returns the API result and the view decides whether to alert. Future: add a global `toastStore`. |
| Reset on `clear()` after navigation | `ChatView` calls `chatStore.clearMessages()` + `sourcesStore.clear()` when leaving a case. |

Next: [Composables](./04-composables.md).
