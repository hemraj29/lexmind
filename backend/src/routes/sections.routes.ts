import { Router, type Request, type Response } from "express";
import {
  searchSections,
  findSectionByNumber,
  findIPCMapping,
  prisma,
} from "../services/database.service.js";
import { AppError } from "../middleware/error-handler.js";
import type { ActType } from "@prisma/client";
import type { ApiResponse } from "../types/api.types.js";

const router = Router();

// ─── GET /api/sections/search?q=&act=&limit= ────────────

router.get("/search", async (req: Request, res: Response) => {
  const q = req.query.q as string;
  if (!q || q.trim().length < 2) {
    throw new AppError("Query parameter 'q' must be at least 2 characters", 400);
  }

  const act = req.query.act as ActType | undefined;
  const limit = Math.min(Number(req.query.limit) || 20, 50);

  const results = await searchSections(q.trim(), act, limit);

  res.json({
    success: true,
    data: results,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse);
});

// ─── GET /api/sections/:act/:number ─────────────────────

router.get("/:act/:number", async (req: Request, res: Response) => {
  const { act, number } = req.params;
  const actType = act!.toUpperCase() as ActType;

  if (!["BNS", "BNSS", "BSA"].includes(actType)) {
    throw new AppError("Act must be one of: BNS, BNSS, BSA", 400);
  }

  const section = await findSectionByNumber(number!, actType);
  if (!section) {
    throw new AppError(`Section ${actType} ${number} not found`, 404);
  }

  res.json({
    success: true,
    data: section,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse);
});

// ─── GET /api/sections/ipc/:section — IPC to BNS mapping ─

router.get("/ipc/:section", async (req: Request, res: Response) => {
  const mapping = await findIPCMapping(req.params.section!);
  if (!mapping) {
    throw new AppError(`No BNS mapping found for IPC Section ${req.params.section}`, 404);
  }

  res.json({
    success: true,
    data: mapping,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse);
});

// ─── GET /api/sections/stats — Overview stats ───────────

router.get("/stats", async (_req: Request, res: Response) => {
  const [sectionCounts, mappingCount, precedentCount] = await Promise.all([
    prisma.statuteSection.groupBy({
      by: ["actType"],
      _count: true,
    }),
    prisma.iPCMapping.count(),
    prisma.precedent.count(),
  ]);

  res.json({
    success: true,
    data: {
      sections: Object.fromEntries(sectionCounts.map((c) => [c.actType, c._count])),
      ipcMappings: mappingCount,
      precedents: precedentCount,
    },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse);
});

export default router;
