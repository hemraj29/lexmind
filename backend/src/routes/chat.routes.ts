import { Router, type Request, type Response } from "express";
import { upload } from "../middleware/upload.js";
import {
  createCase,
  listCases,
  getCase,
  getChatHistory,
  handleMessage,
} from "../services/chat.service.js";
import { prisma } from "../services/database.service.js";
import { storageService } from "../services/storage.service.js";
import { AppError } from "../middleware/error-handler.js";
import { CHAT_COMMANDS } from "../types/case.types.js";
import { createChildLogger } from "../utils/logger.js";
import type { ApiResponse } from "../types/api.types.js";

const router = Router();
const log = createChildLogger("chat-routes");

// ─── CASE CRUD ──────────────────────────────────────────

router.post("/", async (req: Request, res: Response) => {
  const { title, clientName, court, district, state } = req.body;
  const newCase = await createCase({ title, clientName, court, district, state });

  // Create welcome system message
  await prisma.chatMessage.create({
    data: {
      caseId: newCase.id,
      role: "ASSISTANT",
      type: "TEXT",
      content: `Welcome! I'm your AI legal assistant for this case. Upload an FIR or describe your case to get started.\n\nYou can use these commands anytime:\n${Object.entries(CHAT_COMMANDS).map(([cmd, meta]) => `• **${cmd}** — ${meta.description}`).join("\n")}`,
    },
  });

  res.status(201).json({
    success: true,
    data: newCase,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse);
});

router.get("/", async (_req: Request, res: Response) => {
  const cases = await listCases();
  res.json({ success: true, data: cases, timestamp: new Date().toISOString() } satisfies ApiResponse);
});

router.get("/:id", async (req: Request, res: Response) => {
  const caseData = await getCase(req.params.id!);
  if (!caseData) throw new AppError("Case not found", 404);
  res.json({ success: true, data: caseData, timestamp: new Date().toISOString() } satisfies ApiResponse);
});

router.delete("/:id", async (req: Request, res: Response) => {
  await prisma.case.update({
    where: { id: req.params.id! },
    data: { status: "ARCHIVED" },
  });
  res.json({ success: true, timestamp: new Date().toISOString() } satisfies ApiResponse);
});

// ─── CHAT MESSAGES ──────────────────────────────────────

router.get("/:id/messages", async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const before = req.query.before as string | undefined;

  const messages = await getChatHistory(req.params.id!, limit, before);
  res.json({ success: true, data: messages, timestamp: new Date().toISOString() } satisfies ApiResponse);
});

router.post("/:id/messages", upload.single("file"), async (req: Request, res: Response) => {
  const caseId = req.params.id!;
  const content = req.body.content || "";
  const file = req.file
    ? { buffer: req.file.buffer, fileName: req.file.originalname, mimeType: req.file.mimetype }
    : undefined;

  if (!content && !file) {
    throw new AppError("Message content or file is required", 400);
  }

  // Verify case exists
  const caseExists = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseExists) throw new AppError("Case not found", 404);

  try {
    const result = await handleMessage(caseId, content, file);

    // Update case updatedAt
    await prisma.case.update({ where: { id: caseId }, data: { updatedAt: new Date() } });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    log.error({ caseId, error: error.message }, "Message handling failed");

    // Save error as assistant message so the user sees the error in chat
    try {
      await prisma.chatMessage.create({
        data: {
          caseId,
          role: "ASSISTANT",
          type: "TEXT",
          content: `⚠️ Something went wrong: ${error.message.slice(0, 200)}. Please check server logs.`,
        },
      });
    } catch (saveErr) {
      log.error({ saveErr }, "Failed to save error message");
    }

    // Return error to client WITHOUT throwing (prevents process crash)
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse);
  }
});

// ─── DOCUMENTS ──────────────────────────────────────────

router.get("/:id/documents", async (req: Request, res: Response) => {
  const docs = await prisma.caseDocument.findMany({
    where: { caseId: req.params.id! },
    orderBy: { createdAt: "asc" },
  });
  res.json({ success: true, data: docs, timestamp: new Date().toISOString() } satisfies ApiResponse);
});

router.get("/:id/documents/:docId", async (req: Request, res: Response) => {
  const doc = await prisma.caseDocument.findUnique({ where: { id: req.params.docId! } });
  if (!doc) throw new AppError("Document not found", 404);
  res.json({ success: true, data: doc, timestamp: new Date().toISOString() } satisfies ApiResponse);
});

// ─── GENERATED DOCUMENTS ────────────────────────────────

router.get("/:id/generations", async (req: Request, res: Response) => {
  const docs = await prisma.generatedDocument.findMany({
    where: { caseId: req.params.id! },
    orderBy: { createdAt: "desc" },
    include: { pipelineRun: { select: { generationType: true, draftMarkdown: true, totalDurationMs: true } } },
  });
  res.json({ success: true, data: docs, timestamp: new Date().toISOString() } satisfies ApiResponse);
});

router.get("/:id/generations/:runId/download", async (req: Request, res: Response) => {
  const run = await prisma.pipelineRun.findUnique({ where: { id: req.params.runId! } });
  if (!run || !run.docxPath) throw new AppError("Document not found", 404);

  const exists = await storageService.exists(run.docxPath);
  if (!exists) throw new AppError("File not found on disk", 404);

  res.download(run.docxPath, `${run.generationType || "document"}-${run.id}.docx`);
});

router.get("/:id/generations/:runId/result", async (req: Request, res: Response) => {
  const run = await prisma.pipelineRun.findUnique({ where: { id: req.params.runId! } });
  if (!run) throw new AppError("Pipeline run not found", 404);

  res.json({
    success: true,
    data: {
      runId: run.id,
      status: run.status,
      generationType: run.generationType,
      draftMarkdown: run.draftMarkdown,
      legalMemo: run.legalMemo,
      downloadUrl: run.docxPath ? `/api/cases/${req.params.id}/generations/${run.id}/download` : null,
      totalDurationMs: run.totalDurationMs,
    },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse);
});

// ─── COMMANDS LIST ──────────────────────────────────────

router.get("/:id/commands", async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: CHAT_COMMANDS,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse);
});

export default router;
