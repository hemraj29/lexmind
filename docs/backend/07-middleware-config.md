# Backend — Middleware & Config

Small but load-bearing modules that every request flows through.

```
backend/src/
├── middleware/
│   ├── error-handler.ts        AppError + errorHandler + notFoundHandler
│   ├── upload.ts               multer (memory) with size + mime filter
│   └── validate.ts             zod schema → 400 with field details
├── config/
│   ├── env.ts                  zod-validated environment
│   └── constants.ts            shared constants (mime types, top-K, etc.)
└── utils/
    ├── logger.ts               pino + module child loggers
    ├── pdf.ts                  extractTextFromPDF, base64 helpers
    └── retry.ts                exponential backoff with jitter
```

---

## 1. `config/env.ts`

Loaded once at boot. Failure to validate prints the field-level error and exits.

```ts
const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  DATABASE_URL: z.string().url(),

  PORT: z.coerce.number().int().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  UPLOAD_DIR: z.string().default("./uploads"),
  OUTPUT_DIR: z.string().default("./output"),
  MAX_FILE_SIZE_MB: z.coerce.number().int().min(1).max(200).default(20),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  INDIAN_KANOON_API_KEY: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);
```

Plain object — import where needed. No singleton wrapper, no DI.

Adding a new env var:
1. Add it to the schema with a sensible default.
2. Reference it as `env.MY_VAR`.
3. (Optional) document in [Getting Started](../01-getting-started.md).

---

## 2. `config/constants.ts`

```ts
export const DEFAULT_TOP_K = 10;
export const RERANK_TOP_K = 3;
export const EMBEDDING_DIMENSION = 1536;

export const MAX_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 1000;

export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
];

// Legacy namespaces (unused at runtime, kept for API-shape compatibility)
export const PINECONE_NAMESPACE_STATUTES = "statutes";
export const PINECONE_NAMESPACE_PRECEDENTS = "precedents";
```

If a constant is *behavioural* (e.g. retry policy), it belongs here. If it's *plumbing* (e.g. a SQL string), keep it next to its caller.

---

## 3. `middleware/error-handler.ts`

```ts
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // 1. multer file-size errors → 413
  if (err?.message?.includes?.("File too large"))
    return res.status(413).json({ success: false, error: "File too large", timestamp: Date.now() });

  // 2. AppError
  if (err instanceof AppError)
    return res.status(err.statusCode).json({ success: false, error: err.message, timestamp: Date.now() });

  // 3. generic
  logger.error({ err }, "unhandled");
  const message =
    env.NODE_ENV === "production" ? "Internal server error" : err?.message ?? "Unknown error";
  res.status(500).json({ success: false, error: message, timestamp: Date.now() });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ success: false, error: "Not found", timestamp: Date.now() });
}
```

Conventions:
- Throw `AppError("…", 400|404|409|...)` from route handlers — no manual `res.status()` calls in business logic.
- Operational vs programmer errors: `isOperational = true` (the default) signals "expected" failures (validation, not-found); `false` is reserved for bugs.
- Production hides internal messages but **always** logs them.

---

## 4. `middleware/upload.ts`

```ts
import multer from "multer";
import { env } from "../config/env.js";
import { SUPPORTED_MIME_TYPES } from "../config/constants.js";

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (SUPPORTED_MIME_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});
```

- **Memory storage** so the workflow engine can hand the buffer to OpenAI Vision without an intermediate disk hop.
- The 20 MB default is generous for an FIR; bump `MAX_FILE_SIZE_MB` in `.env` if needed.

---

## 5. `middleware/validate.ts`

```ts
export function validate<T extends ZodSchema>(schema: T, source: "body" | "query" | "params") {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: result.error.errors.map(e => ({ field: `${source}.${e.path.join(".")}`, message: e.message })),
        timestamp: Date.now(),
      });
    }
    req[source] = result.data;
    next();
  };
}
```

Used as `validate(MySchema, "body")` or `…, "query"` or `…, "params"`. Coerced/cleaned values overwrite the original `req.body/query/params` so the handler sees a typed object.

---

## 6. `utils/logger.ts`

```ts
import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
});

export function createChildLogger(module: string) {
  return logger.child({ module });
}
```

Standard usage:
```ts
const log = createChildLogger("hybrid-search");
log.info({ topK, candidates: c.length }, "fused");
log.warn({ err }, "rerank failed; falling back");
```

In production every line is single-line JSON. In dev it's coloured human-readable.

---

## 7. `utils/pdf.ts`

```ts
export async function extractTextFromPDF(buffer: Buffer): Promise<string>;
export function isImageMimeType(m: string): boolean;
export function isPDFMimeType(m: string): boolean;
export function bufferToBase64(buffer: Buffer, mimeType: string): string;     // data:…;base64,…
```

`extractTextFromPDF` uses `pdf-parse`. Returns the raw text — pagination is stripped, formatting is best-effort. Used as the *first* attempt in the Extractor; failure / very short text falls through to GPT-4o Vision.

---

## 8. `utils/retry.ts`

```ts
interface RetryOptions {
  maxRetries?: number;       // default MAX_RETRIES = 3
  baseDelayMs?: number;      // default RETRY_BASE_DELAY_MS = 1000
  onRetry?: (attempt: number, err: unknown) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T> {
  const { maxRetries = MAX_RETRIES, baseDelayMs = RETRY_BASE_DELAY_MS, onRetry } = opts ?? {};
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      if (attempt === maxRetries) break;
      onRetry?.(attempt, err);
      const delay = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 500);
      await sleep(delay);
    }
  }
  throw lastErr;
}
```

Used by all OpenAI calls. Don't wrap inside `withRetry` again from agent code — it's already in the service.

---

## 9. Cross-cutting concerns

### Body limit / file limit

| Limit | Where | Value |
|-------|-------|-------|
| JSON body | `express.json({ limit: "10mb" })` in `index.ts` | 10 MB |
| Multipart file | `MAX_FILE_SIZE_MB` env, default 20 | 20 MB |
| Rate limit | `rateLimit({ windowMs: 60_000, max: 60 })` | 60/min/IP |

Bump per use case but don't undermine the rate limit without adding queuing.

### CORS

A single allowed origin (`CORS_ORIGIN`). Multi-tenant deployments should swap this for an array or origin function — adjust in `index.ts`.

### Headers

`helmet()` sets a sensible default header set. SSE routes do **not** set `X-Content-Type-Options: nosniff` (that's compatible with `text/event-stream`).

### Graceful shutdown

`index.ts` registers handlers for `SIGINT` and `SIGTERM` that call `server.close()` then `disconnectDatabase()`. Allow up to 30 s of in-flight pipelines to finish.

---

Next: [Domains & Drafters](./08-domains-drafters.md).
