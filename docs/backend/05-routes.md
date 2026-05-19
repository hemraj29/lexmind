# Backend — Routes

Every Express router in [`backend/src/routes/`](../../backend/src/routes/), explained file-by-file. The endpoint shapes are catalogued in the architecture-level [API Reference](../architecture/06-api-reference.md); this page focuses on **implementation details** developers need.

```
routes/
├── health.routes.ts        /api/health
├── pipeline.routes.ts      /api/pipeline/*    (legacy + SSE)
├── sections.routes.ts      /api/sections/*
├── chat.routes.ts          /api/cases + /api/cases/:id/messages
├── citations.routes.ts     /api/citations/:id/preview
├── commands.routes.ts      /api/commands
├── sources.routes.ts       /api/cases/:id/sources/*
└── studio.routes.ts        /api/studio-actions
```

Every router exports default, follows `ApiResponse<T>`, uses `validate(zodSchema, source)` for input, and forwards errors via `next(err)`.

---

## 1. `health.routes.ts`
Simple parallel probe.

```ts
router.get("/", async (_req, res) => {
  const [openai, db] = await Promise.allSettled([
    openaiService.healthCheck(),
    healthCheck(),                  // database.service
  ]);

  const status = openai.status === "fulfilled" && db.status === "fulfilled" ? "ok" : "degraded";
  res.status(status === "ok" ? 200 : 503).json({
    success: true,
    data: { status, uptime: process.uptime() * 1000, services: { openai: …, pinecone: … } },
    timestamp: Date.now(),
  });
});
```

(`pinecone` is a legacy key name — currently surfaces the *Postgres* health. Plan: rename.)

---

## 2. `pipeline.routes.ts`

Legacy FIR→Bail surface. Highlights:

### `POST /run`
```ts
router.post("/run", upload.single("file"), async (req, res, next) => {
  const file = req.file!;
  const runId = await primeRun(file);                        // creates PipelineRun pending row
  res.json({ success: true, data: { runId, status: "started", streamUrl: `/api/pipeline/${runId}/stream` }, timestamp: Date.now() });

  setImmediate(async () => {
    try {
      await runBailPipeline(
        { fileBuffer: file.buffer, fileName: file.originalname, mimeType: file.mimetype },
        { id: runId, onEvent: e => broadcast(runId, e) }
      );
    } catch (err) {
      logger.error({ err, runId }, "pipeline failed");
    }
  });
});
```

We reply *first*, then run the workflow in `setImmediate` so multipart memory is freed quickly and the client gets a `runId` to subscribe to.

### `GET /:id/stream`
```ts
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.setHeader("Connection", "keep-alive");
res.flushHeaders?.();

const subs = sseClients.get(id) ?? [];
subs.push(res);
sseClients.set(id, subs);

req.on("close", () => {
  const idx = subs.indexOf(res);
  if (idx >= 0) subs.splice(idx, 1);
});
```

`broadcast(runId, event)` writes a `data: <json>\n\n` frame to every subscriber and closes them on terminal events.

### `GET /:id/result`, `GET /:id/download`, `GET /` (history)
Straightforward DB reads. Download is `res.download(absPath, "bail-application-<runId>.docx")`.

---

## 3. `sections.routes.ts`

Statute search surface.

```ts
router.get("/search", validate(SearchSchema, "query"), async (req, res, next) => {
  const { q, act, limit } = req.query;
  const rows = await searchSections(q, act, limit);
  res.json({ success: true, data: rows.map(formatSection), timestamp: Date.now() });
});

router.get("/:act/:number", async (req, res, next) => {
  const { act, number } = req.params;
  if (!ACT_TYPES.includes(act)) throw new AppError("Invalid act", 400);
  const section = await prisma.statuteSection.findUnique({
    where: { actType_sectionNumber: { actType: act, sectionNumber: number } },
    include: { act: true, chapter: true, ipcMappingsAsBNS: true, precedentLinks: { include: { precedent: true } } },
  });
  if (!section) throw new AppError("Not found", 404);
  res.json({ success: true, data: section, timestamp: Date.now() });
});
```

`stats` aggregates `groupBy actType count(*)` plus `count(IPCMapping)` and `count(Precedent)`. The IPC mapping endpoint is a `findUnique({ where: { ipcSection } })`.

---

## 4. `chat.routes.ts`

Mounts at `/api/cases`. Largest router.

Important: multipart on `POST /:id/messages` uses `upload.single("file")` so `req.file` is optional.

```ts
router.post("/:id/messages", upload.single("file"), async (req, res, next) => {
  const { content } = req.body;
  const file = req.file;
  const result = await chatService.handleMessage(req.params.id, { content, file });
  res.json({ success: true, data: result, timestamp: Date.now() });
});
```

All command logic lives **inside** `chatService.handleMessage` — the route is a thin shell. This keeps the surface easy to test (just call the service directly with an in-memory `file` object).

### Sub-routes
- `GET /` — list cases (active, `_count` decorated).
- `POST /` — create.
- `GET /:id` — case + relations.
- `DELETE /:id` — archive (soft).
- `GET /:id/messages` — paginated.
- `GET /:id/documents` / `GET /:id/documents/:docId`.
- `GET /:id/generations` — joins `PipelineRun` and `GeneratedDocument`.
- `GET /:id/generations/:runId/download` — `res.download(...)`.
- `GET /:id/generations/:runId/result` — metadata.
- `GET /:id/commands` — returns `CHAT_COMMANDS` map.

---

## 5. `citations.routes.ts`

Builds a `CitationPreview` payload from whichever source the `Citation` row points to.

```ts
router.get("/:id/preview", async (req, res, next) => {
  const c = await prisma.citation.findUnique({
    where: { id: req.params.id },
    include: { section: true, precedent: true, document: true },
  });
  if (!c) throw new AppError("Citation not found", 404);

  switch (c.sourceType) {
    case "SECTION":   return res.json({ data: previewSection(c) });
    case "PRECEDENT": return res.json({ data: previewPrecedent(c) });
    case "DOCUMENT":  return res.json({ data: previewDocument(c) });
    case "WEB":       return res.json({ data: previewWeb(c) });
  }
});
```

Each helper constructs the same `CitationPreview` shape so the frontend `<CitationPreview>` component is source-agnostic.

For `DOCUMENT` previews, a `pdfUrl` with `#page=<n>` anchor is constructed — the frontend uses this in an `<iframe>` for inline PDF viewing.

---

## 6. `commands.routes.ts`

Reads `ChatCommand` from DB; falls back to a hardcoded default list:

```ts
const DEFAULTS = [
  { cmd: "@bail",         label: "Bail App",       color: "#10b981" },
  { cmd: "@anticipatory", label: "Anticipatory",   color: "#0ea5e9" },
  { cmd: "@quashing",     label: "Quashing",       color: "#f59e0b" },
  { cmd: "@discharge",    label: "Discharge",      color: "#8b5cf6" },
  { cmd: "@analyze",      label: "Analyze",        color: "#6366f1" },
  { cmd: "@cross_exam",   label: "Cross-exam Qs",  color: "#06b6d4" },
  { cmd: "@missing",      label: "Missing info",   color: "#f97316" },
];

router.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.chatCommand.findMany({ where: { enabled: true }, orderBy: { sortOrder: "asc" } });
    if (rows.length === 0) return res.json({ data: DEFAULTS });
    return res.json({ data: rows.map(toChip) });
  } catch (err) {
    logger.warn({ err }, "DB unavailable; returning defaults");
    return res.json({ data: DEFAULTS });
  }
});
```

`/api/commands` is the contract the frontend `CommandChips.vue` reads — failure to reach the DB does **not** break the chat input.

---

## 7. `sources.routes.ts`

Mounted under `/api/cases` (yes, alongside `chat.routes`). All paths begin with `:id/sources/...`. Highlights:

```ts
router.post(
  "/:id/sources/upload",
  upload.single("file"),
  async (req, res, next) => {
    const c = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!c) throw new AppError("Case not found", 404);
    const f = req.file!;
    const { docType, data, rawText, confidence } = await documentAnalyzerAgent.extract(f.buffer, f.mimetype);
    const filePath = await storageService.saveUpload(f.buffer, f.originalname);
    const doc = await prisma.caseDocument.create({ data: {
      caseId: c.id, docType: docType.toUpperCase(),
      fileName: f.originalname, mimeType: f.mimetype, filePath,
      fileSize: f.size, extractedData: data, rawText, confidence, enabled: true,
    }});
    res.json({ success: true, data: doc, timestamp: Date.now() });
  }
);

router.patch("/:id/sources/:sourceId", async (req, res, next) => {
  const { enabled } = req.body;
  const updated = await prisma.caseDocument.update({ where: { id: req.params.sourceId }, data: { enabled } });
  res.json({ data: updated });
});

router.delete("/:id/sources/:sourceId", async (req, res, next) => {
  await prisma.caseDocument.delete({ where: { id: req.params.sourceId } });
  res.json({ data: { ok: true } });
});

router.post("/:id/sources/web-search", async (req, res, next) => {
  // STUB — saves a placeholder document with the query as title.
});
```

The `web-search` endpoint is currently a stub awaiting integration with Indian Kanoon and SCC Online — the design intent is that "Search the web" reuses the citation aggregator + provider plug-in pattern.

---

## 8. `studio.routes.ts`

Returns the dynamic Studio panel catalog:

```ts
router.get("/", async (req, res, next) => {
  const { domain } = req.query;
  try {
    const rows = await prisma.studioAction.findMany({
      where: { enabled: true, ...(domain ? { domain: { code: String(domain) } } : {}) },
      orderBy: { sortOrder: "asc" },
      include: { domain: true },
    });
    if (rows.length === 0) return res.json({ data: DEFAULT_STUDIO_ACTIONS });
    return res.json({ data: rows.map(toStudioAction) });
  } catch (err) {
    return res.json({ data: DEFAULT_STUDIO_ACTIONS });
  }
});
```

`DEFAULT_STUDIO_ACTIONS` is a 12-item hardcoded list (6 draft / 3 analyze / 2 research / 1 extract) used as a fallback if the bootstrap sync hasn't run.

---

## 9. Common route patterns

### Validation
```ts
const SearchSchema = z.object({
  q: z.string().min(2).max(200),
  act: z.enum(["BNS", "BNSS", "BSA"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.get("/search", validate(SearchSchema, "query"), handler);
```

### Standard handler shape
```ts
router.get("/path", async (req, res, next) => {
  try {
    const data = await someService(...);
    res.json({ success: true, data, timestamp: Date.now() });
  } catch (err) {
    next(err);
  }
});
```

### Multipart uploads
```ts
import { upload } from "../middleware/upload.js";
router.post("/upload", upload.single("file"), handler);
// req.file: Express.Multer.File   (memory storage; req.file.buffer)
```

### File downloads
```ts
res.download(absolutePath, suggestedFileName, err => { if (err) next(err); });
```

### SSE
```ts
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.setHeader("Connection", "keep-alive");
res.write(`data: ${JSON.stringify(event)}\n\n`);
// To end: res.end();
```

---

## 10. Adding a new route — checklist

1. Create `src/routes/<name>.routes.ts` with a default export.
2. Use Zod for every input that crosses the wire.
3. Wrap business logic in a *service*, not the handler — handlers should be 3–10 lines.
4. Return the `ApiResponse<T>` envelope.
5. Mount under `/api/<name>` in `index.ts` — *order matters* for shared prefixes.
6. Update [API Reference](../architecture/06-api-reference.md).

Next: [Citations](./06-citations.md).
