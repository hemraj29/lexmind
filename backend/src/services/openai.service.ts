import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { env } from "../config/env.js";
import { createChildLogger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";

const log = createChildLogger("openai");

class OpenAIService {
  private client: OpenAI;
  private model: string;
  private embeddingModel: string;

  constructor() {
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    this.model = env.OPENAI_MODEL;
    this.embeddingModel = env.OPENAI_EMBEDDING_MODEL;
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    options: { temperature?: number; maxTokens?: number; jsonMode?: boolean } = {}
  ): Promise<string> {
    const { temperature = 0.2, maxTokens = 4096, jsonMode = false } = options;

    return withRetry(async () => {
      log.debug({ messageCount: messages.length, model: this.model }, "Sending chat request");

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(jsonMode && { response_format: { type: "json_object" } }),
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("Empty response from OpenAI");

      log.debug(
        { tokens: response.usage?.total_tokens },
        "Chat response received"
      );

      return content;
    });
  }

  async chatJSON<T>(
    messages: ChatCompletionMessageParam[],
    options: { temperature?: number; maxTokens?: number } = {}
  ): Promise<T> {
    const raw = await this.chat(messages, { ...options, jsonMode: true });
    try {
      return JSON.parse(raw) as T;
    } catch {
      log.error({ raw: raw.slice(0, 200) }, "Failed to parse JSON response");
      throw new Error("OpenAI returned invalid JSON");
    }
  }

  async vision(
    images: { base64: string; mimeType: string }[],
    prompt: string,
    options: { temperature?: number; maxTokens?: number; jsonMode?: boolean } = {}
  ): Promise<string> {
    const { temperature = 0.1, maxTokens = 4096, jsonMode = false } = options;

    const imageContents: OpenAI.Chat.Completions.ChatCompletionContentPart[] = images.map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
        detail: "high" as const,
      },
    }));

    return withRetry(async () => {
      log.debug({ imageCount: images.length }, "Sending vision request");

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...imageContents,
            ],
          },
        ],
        temperature,
        max_tokens: maxTokens,
        ...(jsonMode && { response_format: { type: "json_object" } }),
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("Empty vision response from OpenAI");

      return content;
    });
  }

  async visionJSON<T>(
    images: { base64: string; mimeType: string }[],
    prompt: string,
    options: { temperature?: number; maxTokens?: number } = {}
  ): Promise<T> {
    const raw = await this.vision(images, prompt, { ...options, jsonMode: true });
    try {
      return JSON.parse(raw) as T;
    } catch {
      log.error({ raw: raw.slice(0, 200) }, "Failed to parse vision JSON response");
      throw new Error("OpenAI Vision returned invalid JSON");
    }
  }

  async embed(text: string): Promise<number[]> {
    return withRetry(async () => {
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: text,
      });

      return response.data[0]!.embedding;
    });
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const BATCH_SIZE = 100;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);

      const response = await withRetry(async () => {
        return this.client.embeddings.create({
          model: this.embeddingModel,
          input: batch,
        });
      });

      allEmbeddings.push(...response.data.map((d) => d.embedding));
      log.info({ progress: `${Math.min(i + BATCH_SIZE, texts.length)}/${texts.length}` }, "Embedding batch done");
    }

    return allEmbeddings;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}

export const openaiService = new OpenAIService();
