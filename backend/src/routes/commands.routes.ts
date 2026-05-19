import { Router, type Request, type Response } from "express";
import { prisma } from "../services/database.service.js";
import type { ApiResponse } from "../types/api.types.js";

const router = Router();

// GET /api/commands — list of @commands available in chat input
router.get("/", async (_req: Request, res: Response) => {
  let chips: any[] = [];

  try {
    const dbCmds = await prisma.chatCommand.findMany({
      where: { enabled: true },
      orderBy: { sortOrder: "asc" },
    });
    if (dbCmds.length > 0) {
      chips = dbCmds.map((c) => ({
        cmd: c.cmd,
        label: c.label,
        color: c.color || "border-gray-200 text-gray-700 hover:bg-gray-50",
      }));
    }
  } catch {
    // fallback below
  }

  if (chips.length === 0) {
    chips = [
      { cmd: "@bail", label: "Bail", color: "border-emerald-200 text-emerald-700 hover:bg-emerald-50" },
      { cmd: "@anticipatory", label: "Anticipatory Bail", color: "border-blue-200 text-blue-700 hover:bg-blue-50" },
      { cmd: "@quashing", label: "Quashing", color: "border-purple-200 text-purple-700 hover:bg-purple-50" },
      { cmd: "@discharge", label: "Discharge", color: "border-orange-200 text-orange-700 hover:bg-orange-50" },
      { cmd: "@analyze", label: "Analyze Case", color: "border-amber-200 text-amber-700 hover:bg-amber-50" },
      { cmd: "@cross_exam", label: "Cross-Exam", color: "border-pink-200 text-pink-700 hover:bg-pink-50" },
      { cmd: "@missing", label: "Missing Info", color: "border-gray-200 text-gray-700 hover:bg-gray-50" },
    ];
  }

  res.json({
    success: true,
    data: chips,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse);
});

export default router;
