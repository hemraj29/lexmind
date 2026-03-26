import type { Request, Response, NextFunction } from "express";
import { createChildLogger } from "../utils/logger.js";
import type { ApiResponse } from "../types/api.types.js";

const log = createChildLogger("error-handler");

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    log.warn({ statusCode: err.statusCode, path: req.path, message: err.message }, "App error");
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse);
    return;
  }

  // Multer file size error
  if (err.message?.includes("File too large")) {
    res.status(413).json({
      success: false,
      error: "File too large. Maximum size is 20MB.",
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse);
    return;
  }

  log.error({ err, path: req.path }, "Unhandled error");
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse);
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse);
}
