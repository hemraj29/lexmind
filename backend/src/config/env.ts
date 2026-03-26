import { z } from "zod";
import { config } from "dotenv";

config();

const envSchema = z.object({
  // OpenAI
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),

  // PostgreSQL (pgvector handles both data + vectors)
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Server
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  UPLOAD_DIR: z.string().default("./uploads"),
  OUTPUT_DIR: z.string().default("./output"),
  MAX_FILE_SIZE_MB: z.coerce.number().default(20),

  // Logging
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    const missing = Object.entries(formatted)
      .filter(([key, val]) => key !== "_errors" && val && typeof val === "object" && "_errors" in val)
      .map(([key, val]) => `  ${key}: ${(val as { _errors: string[] })._errors.join(", ")}`)
      .join("\n");

    console.error(`\n❌ Environment validation failed:\n${missing}\n`);
    console.error("Copy .env.example to .env and fill in the required values.\n");
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
