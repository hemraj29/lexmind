/**
 * Backfill pgvector embeddings on statute_sections rows using AWS Bedrock
 * Titan Embed Text v1 (1536-dimensional output, matches schema).
 *
 * Run after `ingest-no-embeddings.ts`. Skips rows that already have embeddings.
 */

import { PrismaClient } from "@prisma/client";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { config } from "dotenv";

config();

const prisma = new PrismaClient();
const bedrock = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const MODEL_ID = "amazon.titan-embed-text-v1"; // 1536 dimensions
const CONCURRENCY = 4;       // Bedrock free-tier is ~10 req/sec, stay safe
const DELAY_MS = 1500;       // 1.5s between batches (= ~2.5 req/sec sustained)
const MAX_RETRIES = 6;       // long retry chain for throttling

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function embedOne(text: string, retries = MAX_RETRIES): Promise<number[] | null> {
  const truncated = text.slice(0, 8000);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const cmd = new InvokeModelCommand({
        modelId: MODEL_ID,
        body: JSON.stringify({ inputText: truncated }),
        contentType: "application/json",
        accept: "application/json",
      });
      const resp = await bedrock.send(cmd);
      const result = JSON.parse(new TextDecoder().decode(resp.body));
      const emb: number[] = result.embedding;
      if (!emb || emb.length !== 1536) {
        throw new Error(`Bad embedding shape: ${emb?.length}`);
      }
      return emb;
    } catch (err: any) {
      const isThrottle =
        err.name === "ThrottlingException" ||
        err.message?.toLowerCase().includes("too many requests") ||
        err.message?.toLowerCase().includes("throttl");

      if (isThrottle && attempt < retries) {
        // Aggressive exponential backoff for throttling: 2s, 5s, 10s, 20s, 40s, 60s
        const waitMs = Math.min(2000 * Math.pow(2, attempt), 60_000);
        await sleep(waitMs);
        continue;
      }
      if (attempt === retries) {
        console.log(`  embed failed: ${err.message?.slice(0, 80)}`);
        return null;
      }
    }
  }
  return null;
}

function buildEmbeddingText(s: {
  actType: string;
  sectionNumber: string;
  title: string;
  summary: string | null;
  description: string;
  ingredients: string[];
  keywords: string[];
  punishment: string;
}): string {
  // Use summary + title + keywords + ingredients (better signal than full description)
  return [
    `${s.actType} Section ${s.sectionNumber} ${s.title}.`,
    s.summary || s.description.slice(0, 400),
    `Punishment: ${s.punishment}.`,
    `Ingredients: ${s.ingredients.join(", ")}.`,
    `Keywords: ${s.keywords.join(", ")}.`,
  ].filter(Boolean).join(" ");
}

async function main() {
  console.log("=== Bedrock Embedding Backfill (Titan v1, 1536-dim) ===\n");

  // Find rows missing embeddings
  const allRows: { id: string }[] = await prisma.$queryRawUnsafe(
    `SELECT id FROM statute_sections WHERE embedding IS NULL ORDER BY id`
  );
  console.log(`Found ${allRows.length} sections without embeddings\n`);

  if (allRows.length === 0) {
    console.log("All sections already have embeddings.");
    return;
  }

  let done = 0;
  let failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < allRows.length; i += CONCURRENCY) {
    const batch = allRows.slice(i, i + CONCURRENCY);

    // Fetch full section data for this batch
    const sections = await prisma.statuteSection.findMany({
      where: { id: { in: batch.map((r) => r.id) } },
      select: {
        id: true,
        actType: true,
        sectionNumber: true,
        title: true,
        summary: true,
        description: true,
        ingredients: true,
        keywords: true,
        punishment: true,
      },
    });

    // Embed in parallel
    const results = await Promise.allSettled(
      sections.map(async (s) => {
        const text = buildEmbeddingText(s);
        const emb = await embedOne(text);
        return { id: s.id, emb };
      })
    );

    // Persist
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.emb) {
        const vectorStr = `[${r.value.emb.join(",")}]`;
        await prisma.$executeRawUnsafe(
          `UPDATE statute_sections SET embedding = $1::vector WHERE id = $2`,
          vectorStr,
          r.value.id
        );
        done++;
      } else {
        failed++;
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = (done / Math.max(parseInt(elapsed), 1)).toFixed(1);
    // Print on every 5 batches to keep output flowing
    if (((i / CONCURRENCY) % 5) === 0 || i + CONCURRENCY >= allRows.length) {
      console.log(`  ${done}/${allRows.length} embedded (${rate}/sec, ${elapsed}s elapsed, ${failed} failed)`);
    }

    if (i + CONCURRENCY < allRows.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n\n=== Done ===`);
  console.log(`  Embedded: ${done}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Time:     ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
}

main()
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
