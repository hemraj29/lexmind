import { Router, type Request, type Response } from "express";
import { upload } from "../middleware/upload.js";
import { prisma } from "../services/database.service.js";
import { storageService } from "../services/storage.service.js";
import { documentAnalyzerAgent } from "../agents/document-analyzer.agent.js";
import { AppError } from "../middleware/error-handler.js";
import { createChildLogger } from "../utils/logger.js";
import type { ApiResponse } from "../types/api.types.js";

const router = Router({ mergeParams: true });
const log = createChildLogger("sources-routes");

// GET /api/cases/:id/sources — list all sources for a case
router.get("/:id/sources", async (req: Request, res: Response) => {
  const caseId = req.params.id!;
  const docs = await prisma.caseDocument.findMany({
    where: { caseId },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    success: true,
    data: docs.map((d) => ({
      id: d.id,
      caseId: d.caseId,
      type: (d.docType || "OTHER").toLowerCase(),
      title: d.title || d.fileName,
      fileName: d.fileName,
      pageCount: undefined,
      enabled: d.enabled ?? true,
      confidence: d.confidence,
      excerpt: d.rawText ? d.rawText.slice(0, 200) : undefined,
      createdAt: d.createdAt,
    })),
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse);
});

// POST /api/cases/:id/sources/upload — upload a new source file
router.post("/:id/sources/upload", upload.single("file"), async (req: Request, res: Response) => {
  const caseId = req.params.id!;
  if (!req.file) throw new AppError("No file uploaded", 400);

  const caseExists = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseExists) throw new AppError("Case not found", 404);

  const { buffer, originalname, mimetype } = req.file;

  try {
    const { path: filePath } = await storageService.saveUpload(buffer, originalname);
    const analysis = await documentAnalyzerAgent.extract(buffer, mimetype);

    const doc = await prisma.caseDocument.create({
      data: {
        caseId,
        docType: (analysis.docType?.toUpperCase() as any) || "OTHER",
        fileName: originalname,
        title: originalname,
        mimeType: mimetype,
        filePath,
        fileSize: buffer.length,
        extractedData: analysis.data as any,
        rawText: analysis.rawText,
        confidence: analysis.confidence,
        enabled: true,
      },
    });

    res.json({
      success: true,
      data: {
        id: doc.id,
        caseId: doc.caseId,
        type: (doc.docType || "OTHER").toLowerCase(),
        title: doc.title || doc.fileName,
        fileName: doc.fileName,
        enabled: doc.enabled,
        confidence: doc.confidence,
        excerpt: doc.rawText ? doc.rawText.slice(0, 200) : undefined,
        createdAt: doc.createdAt,
      },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse);
  } catch (err: any) {
    log.error({ caseId, err: err.message }, "Source upload failed");
    throw new AppError(err.message || "Failed to upload source", 500);
  }
});

// POST /api/cases/:id/sources/web-search — search and add web sources
router.post("/:id/sources/web-search", async (req: Request, res: Response) => {
  const caseId = req.params.id!;
  const { query } = req.body;
  if (!query) throw new AppError("query is required", 400);

  // Stub: store query as a placeholder web source (real implementation will hit Indian Kanoon etc.)
  const doc = await prisma.caseDocument.create({
    data: {
      caseId,
      docType: "OTHER",
      fileName: query.slice(0, 80),
      title: `Web search: ${query.slice(0, 80)}`,
      mimeType: "text/html",
      filePath: "",
      fileSize: 0,
      enabled: true,
      rawText: `Pending web search results for: ${query}`,
    },
  });

  res.json({
    success: true,
    data: [
      {
        id: doc.id,
        caseId: doc.caseId,
        type: "web",
        title: doc.title,
        fileName: undefined,
        enabled: true,
        excerpt: doc.rawText?.slice(0, 200),
        createdAt: doc.createdAt,
      },
    ],
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse);
});

// PATCH /api/cases/:id/sources/:sourceId — toggle enabled
router.patch("/:id/sources/:sourceId", async (req: Request, res: Response) => {
  const { sourceId } = req.params;
  const { enabled } = req.body;
  await prisma.caseDocument.update({
    where: { id: sourceId! },
    data: { enabled },
  });
  res.json({ success: true, timestamp: new Date().toISOString() } satisfies ApiResponse);
});

// DELETE /api/cases/:id/sources/:sourceId
router.delete("/:id/sources/:sourceId", async (req: Request, res: Response) => {
  const { sourceId } = req.params;
  await prisma.caseDocument.delete({ where: { id: sourceId! } });
  res.json({ success: true, timestamp: new Date().toISOString() } satisfies ApiResponse);
});

export default router;
