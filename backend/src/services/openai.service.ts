/**
 * LLM service backed by AWS Bedrock.
 *
 * File is named "openai.service.ts" for backward-compat imports, but this
 * service no longer talks to OpenAI directly. It uses:
 *   - Claude Opus 4.5 on Bedrock for chat, JSON, and vision
 *   - Amazon Titan Embed Text v1 on Bedrock for embeddings (1536 dim)
 *
 * Public method signatures are preserved so all agents/drafters/scripts
 * keep working without changes.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
  type Message,
  type ContentBlock,
} from "@aws-sdk/client-bedrock-runtime";
import { env } from "../config/env.js";
import { createChildLogger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";

const log = createChildLogger("llm");

// ─── Type compatibility shim ─────────────────────────────────────────

export type ChatRole = "system" | "user" | "assistant";

export interface OpenAICompatMessage {
  role: ChatRole;
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function extractTextFromResponse(content: ContentBlock[]): string {
  for (const block of content) {
    if ("text" in block && typeof block.text === "string") {
      return block.text;
    }
  }
  return "";
}

function parseDataUrl(
  dataUrl: string
): { format: "png" | "jpeg" | "gif" | "webp"; bytes: Buffer } | null {
  const m = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!m) return null;
  const fmt = m[1]!.toLowerCase();
  const allowed: Record<string, "png" | "jpeg" | "gif" | "webp"> = {
    png: "png",
    jpg: "jpeg",
    jpeg: "jpeg",
    gif: "gif",
    webp: "webp",
  };
  return { format: allowed[fmt] || "png", bytes: Buffer.from(m[2]!, "base64") };
}

function mimeToFormat(mimeType: string): "png" | "jpeg" | "gif" | "webp" {
  const m = mimeType.toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpeg";
  if (m.includes("gif")) return "gif";
  if (m.includes("webp")) return "webp";
  return "png";
}

function toBedrockMessages(messages: OpenAICompatMessage[]): {
  system: { text: string }[];
  messages: Message[];
} {
  const system: { text: string }[] = [];
  const out: Message[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      const text =
        typeof msg.content === "string"
          ? msg.content
          : msg.content.map((p) => ("text" in p ? p.text : "")).join("\n");
      system.push({ text });
      continue;
    }

    const role: "user" | "assistant" =
      msg.role === "assistant" ? "assistant" : "user";
    const content: ContentBlock[] = [];

    if (typeof msg.content === "string") {
      content.push({ text: msg.content });
    } else {
      for (const part of msg.content) {
        if (part.type === "text") {
          content.push({ text: part.text });
        } else if (part.type === "image_url") {
          const parsed = parseDataUrl(part.image_url.url);
          if (parsed) {
            content.push({
              image: { format: parsed.format, source: { bytes: parsed.bytes } },
            });
          }
        }
      }
    }

    out.push({ role, content });
  }

  return { system, messages: out };
}

function stripCodeFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

// ─── Service ─────────────────────────────────────────────────────────

class LlmService {
  private client: BedrockRuntimeClient;
  private chatModel: string;
  private embedModel: string;

  constructor() {
    this.client = new BedrockRuntimeClient({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
    this.chatModel = env.BEDROCK_CHAT_MODEL;
    this.embedModel = env.BEDROCK_EMBED_MODEL;
  }

  async chat(
    messages: OpenAICompatMessage[],
    options: { temperature?: number; maxTokens?: number; jsonMode?: boolean } = {}
  ): Promise<string> {
    const { temperature = 0.2, maxTokens = 4096, jsonMode = false } = options;

    const { system, messages: bedrockMessages } = toBedrockMessages(messages);

    if (jsonMode) {
      system.unshift({
        text: "You are responding with a JSON object only. Output ONLY valid JSON. No markdown code fences. No commentary. No preamble.",
      });
    }

    return withRetry(async () => {
      log.debug(
        { messages: bedrockMessages.length, model: this.chatModel },
        "Bedrock chat request"
      );

      const cmd = new ConverseCommand({
        modelId: this.chatModel,
        messages: bedrockMessages,
        ...(system.length > 0 && { system }),
        inferenceConfig: { temperature, maxTokens },
      });

      const response = await this.client.send(cmd);
      const blocks = response.output?.message?.content || [];
      const text = extractTextFromResponse(blocks);

      if (!text) {
        log.error(
          { blocks: JSON.stringify(blocks).slice(0, 300) },
          "Empty Bedrock response"
        );
        throw new Error("Empty response from Bedrock");
      }

      log.debug(
        { usage: response.usage, stopReason: response.stopReason },
        "Bedrock response received"
      );

      return text;
    });
  }

  async chatJSON<T>(
    messages: OpenAICompatMessage[],
    options: { temperature?: number; maxTokens?: number } = {}
  ): Promise<T> {
    const raw = await this.chat(messages, { ...options, jsonMode: true });
    const cleaned = stripCodeFences(raw);

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]) as T;
        } catch {
          // fall through
        }
      }
      log.error({ raw: cleaned.slice(0, 300) }, "Failed to parse JSON response");
      throw new Error("LLM returned invalid JSON");
    }
  }

  async vision(
    images: { base64: string; mimeType: string }[],
    prompt: string,
    options: { temperature?: number; maxTokens?: number; jsonMode?: boolean } = {}
  ): Promise<string> {
    const { temperature = 0.1, maxTokens = 4096, jsonMode = false } = options;

    const content: ContentBlock[] = [{ text: prompt }];
    for (const img of images) {
      content.push({
        image: {
          format: mimeToFormat(img.mimeType),
          source: { bytes: Buffer.from(img.base64, "base64") },
        },
      });
    }

    const system: { text: string }[] = jsonMode
      ? [
          {
            text: "You are responding with a JSON object only. Output ONLY valid JSON. No markdown code fences.",
          },
        ]
      : [];

    return withRetry(async () => {
      log.debug({ imageCount: images.length }, "Bedrock vision request");

      const cmd = new ConverseCommand({
        modelId: this.chatModel,
        messages: [{ role: "user", content }],
        ...(system.length > 0 && { system }),
        inferenceConfig: { temperature, maxTokens },
      });

      const response = await this.client.send(cmd);
      const text = extractTextFromResponse(response.output?.message?.content || []);

      if (!text) throw new Error("Empty vision response from Bedrock");
      return text;
    });
  }

  async visionJSON<T>(
    images: { base64: string; mimeType: string }[],
    prompt: string,
    options: { temperature?: number; maxTokens?: number } = {}
  ): Promise<T> {
    const raw = await this.vision(images, prompt, { ...options, jsonMode: true });
    const cleaned = stripCodeFences(raw);

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]) as T;
        } catch {
          // fall through
        }
      }
      log.error({ raw: cleaned.slice(0, 300) }, "Failed to parse vision JSON response");
      throw new Error("Vision LLM returned invalid JSON");
    }
  }

  async embed(text: string): Promise<number[]> {
    return withRetry(async () => {
      const cmd = new InvokeModelCommand({
        modelId: this.embedModel,
        body: JSON.stringify({ inputText: text.slice(0, 8000) }),
        contentType: "application/json",
        accept: "application/json",
      });
      const resp = await this.client.send(cmd);
      const result = JSON.parse(new TextDecoder().decode(resp.body));
      const emb: number[] = result.embedding;
      if (!emb || emb.length !== 1536) {
        throw new Error(`Bad embedding shape: ${emb?.length}`);
      }
      return emb;
    });
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Titan v1 doesn't support native batching; bounded concurrency.
    const CONCURRENCY = 4;
    const results: number[][] = new Array(texts.length);

    for (let i = 0; i < texts.length; i += CONCURRENCY) {
      const batch = texts.slice(i, i + CONCURRENCY);
      const embeddings = await Promise.all(batch.map((t) => this.embed(t)));
      for (let j = 0; j < embeddings.length; j++) {
        results[i + j] = embeddings[j]!;
      }
      log.info(
        { progress: `${Math.min(i + CONCURRENCY, texts.length)}/${texts.length}` },
        "Embedding batch done"
      );
    }

    return results;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const emb = await this.embed("test");
      return emb.length === 1536;
    } catch {
      return false;
    }
  }
}

// Exported as `openaiService` to keep import paths unchanged across the codebase
export const openaiService = new LlmService();
