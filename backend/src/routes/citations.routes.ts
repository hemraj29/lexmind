import { Router, type Request, type Response } from "express";
import { prisma } from "../services/database.service.js";
import { AppError } from "../middleware/error-handler.js";
import type { ApiResponse } from "../types/api.types.js";

const router = Router();

// GET /api/citations/:id/preview
router.get("/:id/preview", async (req: Request, res: Response) => {
  const cite = await prisma.citation.findUnique({
    where: { id: req.params.id! },
    include: { section: true, precedent: true, document: true },
  });

  if (!cite) throw new AppError("Citation not found", 404);

  const preview: Record<string, unknown> = {
    id: cite.id,
    sourceType: cite.sourceType.toLowerCase(),
    excerptText: cite.excerptText,
    pageNumber: cite.pageNumber || cite.documentPage,
    paragraphRef: cite.paragraphRef,
    title: cite.section?.title || cite.precedent?.caseTitle || cite.document?.fileName || cite.webTitle || "Source",
    reference:
      cite.sccReference ||
      cite.section?.sourceReference ||
      cite.document?.fileName ||
      cite.webUrl ||
      undefined,
    sourceUrl: cite.fullSourceUrl || cite.webUrl,
    pdfUrl: cite.section?.sourceFile
      ? `/api/sources/pdf/${encodeURIComponent(cite.section.sourceFile)}#page=${cite.pageNumber || 1}`
      : null,
    documentUrl: cite.document
      ? `/api/case-documents/${cite.document.id}/view#page=${cite.documentPage || 1}`
      : null,
  };

  res.json({
    success: true,
    data: preview,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse);
});

export default router;
