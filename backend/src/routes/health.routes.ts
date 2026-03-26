import { Router } from "express";
import { healthCheck as dbHealth } from "../services/database.service.js";
import { openaiService } from "../services/openai.service.js";
import type { HealthResponse, ApiResponse } from "../types/api.types.js";

const router = Router();

const startTime = Date.now();

router.get("/health", async (_req, res) => {
  const [dbOk, aiOk] = await Promise.all([
    dbHealth(),
    openaiService.healthCheck(),
  ]);

  const status = dbOk && aiOk ? "ok" : "degraded";

  const response: ApiResponse<HealthResponse> = {
    success: true,
    data: {
      status,
      uptime: Date.now() - startTime,
      services: {
        openai: aiOk,
        pinecone: dbOk, // keeping field name for API compat, but it's postgres now
      },
    },
    timestamp: new Date().toISOString(),
  };

  res.status(status === "ok" ? 200 : 503).json(response);
});

export default router;
