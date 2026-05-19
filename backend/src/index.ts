import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { initDatabase, disconnectDatabase } from "./services/database.service.js";
import { storageService } from "./services/storage.service.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { createChildLogger } from "./utils/logger.js";
import { bootstrapPlugins } from "./core/bootstrap.js";

// Routes
import healthRoutes from "./routes/health.routes.js";
import pipelineRoutes from "./routes/pipeline.routes.js";
import sectionsRoutes from "./routes/sections.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import sourcesRoutes from "./routes/sources.routes.js";
import studioRoutes from "./routes/studio.routes.js";
import commandsRoutes from "./routes/commands.routes.js";
import citationsRoutes from "./routes/citations.routes.js";

const log = createChildLogger("server");

async function bootstrap(): Promise<void> {
  const app = express();

  // ─── MIDDLEWARE ────────────────────────────────────────
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Rate limiting
  app.use(
    rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 60,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: "Too many requests, please try again later" },
    })
  );

  // ─── INITIALIZE SERVICES ──────────────────────────────
  await initDatabase();
  await storageService.init();
  await bootstrapPlugins();           // ← auto-discover all domain/drafter plugins from filesystem + sync to DB
  log.info("All services initialized");

  // ─── ROUTES ───────────────────────────────────────────
  app.use("/api", healthRoutes);
  app.use("/api/cases", sourcesRoutes);        // /api/cases/:id/sources/* (mounted FIRST so it takes precedence)
  app.use("/api/cases", chatRoutes);           // /api/cases + /api/cases/:id/messages
  app.use("/api/studio-actions", studioRoutes);
  app.use("/api/commands", commandsRoutes);
  app.use("/api/citations", citationsRoutes);
  app.use("/api/pipeline", pipelineRoutes);    // Legacy standalone pipeline
  app.use("/api/sections", sectionsRoutes);

  // Static serve for generated documents
  app.use("/output", express.static(env.OUTPUT_DIR));

  // ─── ERROR HANDLING ───────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  // ─── START SERVER ─────────────────────────────────────
  const server = app.listen(env.PORT, () => {
    log.info({ port: env.PORT, env: env.NODE_ENV }, `LexiMini server running on http://localhost:${env.PORT}`);
  });

  // ─── GRACEFUL SHUTDOWN ────────────────────────────────
  const shutdown = async (signal: string) => {
    log.info({ signal }, "Shutting down...");
    server.close();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Prevent single uncaught errors from crashing the server
  process.on("uncaughtException", (err) => {
    log.error({ err: err.message, stack: err.stack }, "uncaughtException — keeping server alive");
  });
  process.on("unhandledRejection", (reason) => {
    log.error({ reason: String(reason) }, "unhandledRejection — keeping server alive");
  });
}

bootstrap().catch((err) => {
  log.fatal({ err }, "Failed to start server");
  process.exit(1);
});
