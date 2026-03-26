import { Router, type Request, type Response } from "express";
import { upload } from "../middleware/upload.js";
import { runBailPipeline } from "../workflows/bail-application.workflow.js";
import {
  getPipelineRun,
  listPipelineRuns,
  updatePipelineRun,
} from "../services/database.service.js";
import { storageService } from "../services/storage.service.js";
import { AppError } from "../middleware/error-handler.js";
import { createChildLogger } from "../utils/logger.js";
import type { WorkflowEvent } from "../core/workflow-types.js";
import type { ApiResponse } from "../types/api.types.js";

const router = Router();
const log = createChildLogger("pipeline-routes");

// Active SSE connections per run ID
const sseConnections = new Map<string, Response[]>();

// ─── POST /api/pipeline/run — Full pipeline with SSE ────

router.post("/run", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError("No file uploaded", 400);
  }

  const { buffer, originalname, mimetype } = req.file;

  // Start pipeline in background
  const runId = crypto.randomUUID();

  res.json({
    success: true,
    data: {
      runId,
      status: "started",
      streamUrl: `/api/pipeline/${runId}/stream`,
    },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse);

  // Run pipeline async (after response is sent)
  setImmediate(async () => {
    try {
      await runBailPipeline(
        { fileBuffer: buffer, fileName: originalname, mimeType: mimetype },
        {
          id: runId,
          onEvent: (event) => broadcastSSE(runId, event),
        }
      );
    } catch (err) {
      log.error({ runId, err }, "Pipeline failed");
      broadcastSSE(runId, {
        type: "pipeline:error",
        data: { error: err instanceof Error ? err.message : "Unknown error" },
        timestamp: Date.now(),
      });
    }
  });
});

// ─── GET /api/pipeline/:id/stream — SSE event stream ────

router.get("/:id/stream", (req: Request, res: Response) => {
  const runId = req.params.id!;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write(`data: ${JSON.stringify({ type: "connected", runId })}\n\n`);

  // Register this connection
  if (!sseConnections.has(runId)) {
    sseConnections.set(runId, []);
  }
  sseConnections.get(runId)!.push(res);

  // Clean up on disconnect
  req.on("close", () => {
    const conns = sseConnections.get(runId);
    if (conns) {
      const idx = conns.indexOf(res);
      if (idx >= 0) conns.splice(idx, 1);
      if (conns.length === 0) sseConnections.delete(runId);
    }
  });
});

// ─── GET /api/pipeline/:id/result — Get completed result ─

router.get("/:id/result", async (req: Request, res: Response) => {
  const run = await getPipelineRun(req.params.id!);
  if (!run) throw new AppError("Pipeline run not found", 404);

  res.json({
    success: true,
    data: {
      runId: run.id,
      status: run.status,
      fir: run.extractedFIR,
      memo: run.legalMemo,
      draftMarkdown: run.draftMarkdown,
      steps: run.steps,
      totalDurationMs: run.totalDurationMs,
      downloadUrl: run.docxPath ? `/api/pipeline/${run.id}/download` : null,
      createdAt: run.createdAt,
    },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse);
});

// ─── GET /api/pipeline/:id/download — Download .docx ─────

router.get("/:id/download", async (req: Request, res: Response) => {
  const run = await getPipelineRun(req.params.id!);
  if (!run) throw new AppError("Pipeline run not found", 404);
  if (!run.docxPath) throw new AppError("Document not yet generated", 400);

  const exists = await storageService.exists(run.docxPath);
  if (!exists) throw new AppError("Document file not found on disk", 404);

  const fileName = `bail-application-${run.id}.docx`;
  res.download(run.docxPath, fileName);
});

// ─── GET /api/pipeline/history — List past runs ──────────

router.get("/", async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;

  const runs = await listPipelineRuns(limit, offset);

  res.json({
    success: true,
    data: runs.map((r) => ({
      id: r.id,
      status: r.status,
      fileName: r.fileName,
      steps: r.steps,
      totalDurationMs: r.totalDurationMs,
      createdAt: r.createdAt,
    })),
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse);
});

// ─── SSE broadcast helper ────────────────────────────────

function broadcastSSE(runId: string, event: WorkflowEvent): void {
  const conns = sseConnections.get(runId);
  if (!conns || conns.length === 0) return;

  const data = JSON.stringify(event);
  for (const res of conns) {
    res.write(`data: ${data}\n\n`);
  }

  // Close connections when pipeline finishes
  if (event.type === "pipeline:complete" || event.type === "pipeline:error") {
    for (const res of conns) {
      res.end();
    }
    sseConnections.delete(runId);
  }
}

export default router;
