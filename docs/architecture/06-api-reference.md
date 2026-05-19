# API Reference

All routes are mounted under `/api` from [`backend/src/index.ts`](../../backend/src/index.ts).

- **Base URL (dev):** `http://localhost:3001`
- **Auth:** none (MVP). Future: see [Roadmap Phase 5](../planning/01-roadmap.md).
- **Rate limit:** 60 req/min/IP (express-rate-limit).
- **CORS:** allowed origin from `CORS_ORIGIN` env (default `http://localhost:5173`).
- **Body limit:** 10 MB JSON; 20 MB multipart (configurable via `MAX_FILE_SIZE_MB`).
- **Response envelope:** every JSON response follows `ApiResponse<T>`:
  ```ts
  { success: true,  data: T,        timestamp: number }
  // or
  { success: false, error: string,  timestamp: number, details?: any[] }
  ```

Mount order (matters — `sources` is registered before `chat` to avoid a `:id/messages` shadowing):

```
/api/health        ← health.routes.ts
/api/cases         ← chat.routes.ts (cases + messages + generations)
/api/cases/:id/sources       ← sources.routes.ts  (mounted first)
/api/studio-actions          ← studio.routes.ts
/api/commands                ← commands.routes.ts
/api/citations               ← citations.routes.ts
/api/pipeline      ← pipeline.routes.ts  (legacy + SSE)
/api/sections      ← sections.routes.ts
```

---

## 1. Health

### `GET /api/health`
Parallel checks against OpenAI + Postgres.

```json
{
  "success": true,
  "data": {
    "status": "ok",            // or "degraded"
    "uptime": 12345,           // ms
    "services": { "openai": "ok", "pinecone": "ok" }
  },
  "timestamp": 1715000000000
}
```
Status code: `200` (ok) | `503` (degraded).

---

## 2. Cases & chat (`/api/cases/*`)

The primary interface used by `ChatView`.

### `POST /api/cases`
Create a new case.

Body:
```json
{ "title": "string?", "clientName": "string?", "court": "string?", "district": "string?", "state": "string?" }
```
Response `201`: `{ data: Case + systemWelcomeMessage }`

### `GET /api/cases`
List active cases ordered by `createdAt DESC`.
Each case is decorated with `_count: { documents, messages, generatedDocs }`.

### `GET /api/cases/:id`
Fetch one case with relations.

### `DELETE /api/cases/:id`
Soft-delete (sets `status = "ARCHIVED"`).

### `GET /api/cases/:id/messages`
Paginated chat history.
Query: `limit` (default 50, max 200), `before` (ISO timestamp cursor).
Returns: `ChatMessage[]` reverse-chronological by default.

### `POST /api/cases/:id/messages`
Send a message **or** upload a file in one call.

Content-Type: `multipart/form-data`.
- `content` — text (optional if `file` present)
- `file` — single file (PDF/JPG/PNG/DOCX). Optional.

Routing inside `chat.service.handleMessage()`:

```
if (file)         → documentAnalyzerAgent.classifyDocument + extract
elif (@command)   → handler in COMMAND_HANDLERS map
else              → strategyAdvisorAgent.chat(...)
```

Response shape (`MessageResult`):
```ts
{
  type: "text" | "file_upload" | "analysis_card" | "generation_card";
  messages: ChatMessage[];   // newly-saved messages (user + assistant)
}
```

### `GET /api/cases/:id/documents`
Lists `CaseDocument` rows for the sources panel.

### `GET /api/cases/:id/documents/:docId`
Single doc with `extractedData`.

### `GET /api/cases/:id/generations`
Lists `GeneratedDocument` rows joined with their `PipelineRun` (status, type, duration, markdown excerpt, downloadUrl).

### `GET /api/cases/:id/generations/:runId/download`
Streams the `.docx` (filename = `{generationType}-{runId}.docx`).

### `GET /api/cases/:id/generations/:runId/result`
Metadata for a single generation:
```ts
{
  runId, status, generationType, draftMarkdown, legalMemo,
  downloadUrl, totalDurationMs
}
```

### `GET /api/cases/:id/commands`
Catalog of available `@commands` for the chat input chips. Returns the in-memory `CHAT_COMMANDS` registry merged with anything in the DB.

---

## 3. Sources (`/api/cases/:id/sources/*`)

### `GET /api/cases/:id/sources`
List documents (alias for `GET /api/cases/:id/documents` with a UI-friendly shape).
Returns: `[{ id, type, title, fileName, pageCount, enabled, confidence, excerpt, createdAt }]`

### `POST /api/cases/:id/sources/upload`
Multipart upload. Triggers `documentAnalyzerAgent`.

Form-data:
- `file` — PDF / JPG / PNG

### `POST /api/cases/:id/sources/web-search`
**Stub** — saves the query as a placeholder document.

Body:
```json
{ "query": "string" }
```
Reserved for upcoming Indian Kanoon / SCC Online integration.

### `PATCH /api/cases/:id/sources/:sourceId`
Toggle enabled flag.
Body: `{ "enabled": true }`.

### `DELETE /api/cases/:id/sources/:sourceId`
Remove a source. Cascades remove citations / message links via FK.

---

## 4. Studio actions (`/api/studio-actions`)

### `GET /api/studio-actions?domain=criminal`
Returns the catalog for the right pane.

Response items:
```ts
{
  id, code, label, description,
  iconName, colorHex,
  category,                     // "draft" | "analyze" | "research" | "extract"
  domainCode,                   // "criminal" | "civil" | ...
  requiredSourceTypes,          // ["fir"] etc.
  enabled,
  command                       // "@bail" etc.
}
```

If the DB is empty the route falls back to a hardcoded default catalog (12 actions: 6 draft, 3 analyze, 2 research, 1 extract).

---

## 5. Commands (`/api/commands`)

### `GET /api/commands`
List of chip-style commands surfaced under the chat input.

Response items:
```ts
{ cmd: "@bail", label: "Bail App", color: "#10b981" }
```

Reads `ChatCommand` table; falls back to defaults including:
`@bail`, `@anticipatory`, `@quashing`, `@discharge`, `@analyze`, `@cross_exam`, `@missing` and more.

---

## 6. Citations (`/api/citations/:id/preview`)

### `GET /api/citations/:id/preview`
Returns a preview payload for the **CitationPreview** slide-in pane.

Response (`CitationPreview`):
```ts
{
  id, sourceType,                  // "section" | "precedent" | "document" | "web"
  title, reference,
  excerptText, pageNumber, paragraphRef,
  sourceUrl,
  pdfUrl?, documentUrl?
}
```

- For `SECTION` references — title="BNS 303 — Punishment for murder", reference="Section 303", excerpt from `description`.
- For `PRECEDENT` — title=case name, reference=SCC citation, excerpt from headnotes / ratio.
- For `DOCUMENT` — pulls page anchor from `documentPage`.
- For `WEB` — proxies `webUrl` (no live fetch).

---

## 7. Sections (`/api/sections/*`)

The statute search surface used by `SectionsView`.

### `GET /api/sections/search`
Query:
- `q` (required, ≥ 2 chars)
- `act` (optional: `BNS` / `BNSS` / `BSA`)
- `limit` (default 20, max 50)

Returns array of `StatuteSection` summary records (title, description, bailable, punishment, ingredients).

### `GET /api/sections/:act/:number`
e.g. `/api/sections/BNS/303` returns a full section incl. relations, IPC mappings, precedent links.

### `GET /api/sections/ipc/:section`
Lookup IPC → BNS mapping.

### `GET /api/sections/stats`
```json
{ "sections": { "BNS": 358, "BNSS": 531, "BSA": 170 }, "ipcMappings": 511, "precedents": 124 }
```

---

## 8. Legacy pipeline (`/api/pipeline/*`)

Powers `/legacy → /pipeline/:id → /draft/:id` flow.

### `POST /api/pipeline/run`
Multipart upload of one FIR.
Form-data: `file` (PDF/JPG/PNG).

Response (immediate, run continues async):
```json
{ "data": { "runId": "abc123", "status": "started", "streamUrl": "/api/pipeline/abc123/stream" } }
```

### `GET /api/pipeline/:id/stream`
SSE stream of `WorkflowEvent`s. Headers:

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

Each event is a JSON object — see [Pipeline Flow](./04-pipeline-flow.md#3-sse-event-timeline).

### `GET /api/pipeline/:id/result`
Complete artifacts:
```ts
{
  runId, status, fir, memo, draftMarkdown,
  steps,                       // StepResult[]
  totalDurationMs,
  downloadUrl
}
```

### `GET /api/pipeline/:id/download`
Streams the `.docx`. Filename: `bail-application-{runId}.docx`.

### `GET /api/pipeline`
Paginated history.
Query: `limit` (default 20, max 100), `offset` (default 0).
Returns: `[{ id, status, fileName, steps, totalDurationMs, createdAt }]`.

---

## 9. Error responses

All error bodies follow:

```json
{
  "success": false,
  "error": "Validation failed",
  "timestamp": 1715000000000,
  "details": [ { "field": "query.q", "message": "Required" } ]   // for ZodErrors
}
```

Common codes:
- `400` — Zod validation failure / bad multipart.
- `404` — `notFoundHandler` for unknown routes; explicit when entity missing.
- `413` — Multer file size limit exceeded.
- `429` — Rate limit (`express-rate-limit`).
- `500` — Uncaught; in `NODE_ENV=production` the message is hidden, replaced with `"Internal server error"`.
- `503` — Returned by `/api/health` when a dependent service is unreachable.

Hand-thrown errors use the `AppError` class (see [Middleware & Config](../backend/07-middleware-config.md)).

---

## 10. SSE event reference (recap)

Type strings:

| Type | When emitted |
|------|-------------|
| `pipeline:start` | once at the top of `runBailPipeline` |
| `step:start` | before a step runs |
| `step:progress` | optional, from inside an agent (e.g. "Running vision OCR") |
| `step:complete` | after validate passes |
| `step:error` | when retries exhausted and `onError` returned null |
| `pipeline:complete` | once at the end |
| `pipeline:error` | on uncaught pipeline-level error |

Common `data` payloads include `durationMs`, `confidence`, `sections`, and the final `docxFileName` / `totalDurationMs`.

---

Next: [Anti-Hallucination](./07-anti-hallucination.md).
