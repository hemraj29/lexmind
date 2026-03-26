/**
 * Ingestion script for case precedents.
 *
 * Usage: npm run ingest:precedents
 *
 * Expected JSON format in src/data/precedents/landmark-cases.json:
 * [
 *   {
 *     "caseTitle": "Arnesh Kumar v. State of Bihar",
 *     "citation": "(2014) 8 SCC 273",
 *     "court": "Supreme Court of India",
 *     "bench": "Justice C.K. Prasad, Justice Pinaki Chandra Ghose",
 *     "year": 2014,
 *     "relevantSections": ["BNS 303", "BNSS 35"],
 *     "ratio": "Arrest should be the last resort...",
 *     "summary": "The Supreme Court laid down guidelines...",
 *     "tags": ["bail", "arrest", "guidelines"],
 *     "bailRelevant": true
 *   }
 * ]
 */

import { PrismaClient } from "@prisma/client";
import { readFile } from "fs/promises";
import { join } from "path";
import OpenAI from "openai";
import { config } from "dotenv";

config();

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

interface RawPrecedent {
  caseTitle: string;
  citation: string;
  court: string;
  bench?: string;
  year: number;
  relevantSections: string[];
  ratio: string;
  summary: string;
  headnotes?: string;
  tags?: string[];
  bailRelevant?: boolean;
}

async function main() {
  console.log("=== Precedent Ingestion Pipeline ===\n");

  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);

  const filePath = join(process.cwd(), "src/data/precedents/landmark-cases.json");

  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    console.log("No landmark-cases.json found. Create it at:");
    console.log(`  ${filePath}`);
    return;
  }

  const precedents: RawPrecedent[] = JSON.parse(raw);
  console.log(`Found ${precedents.length} precedents`);

  // Generate embeddings
  console.log("Generating embeddings...");
  const texts = precedents.map(
    (p) => `${p.caseTitle} (${p.citation}). ${p.ratio}. ${p.summary}. Sections: ${p.relevantSections.join(", ")}`
  );

  const embeddings: number[][] = [];
  const BATCH = 100;
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const resp = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: batch });
    embeddings.push(...resp.data.map((d) => d.embedding));
    console.log(`  Embedded ${Math.min(i + BATCH, texts.length)}/${texts.length}`);
  }

  // Upsert precedents
  console.log("Upserting precedents...");
  for (let i = 0; i < precedents.length; i++) {
    const p = precedents[i]!;

    const record = await prisma.precedent.upsert({
      where: { citation: p.citation },
      update: {
        caseTitle: p.caseTitle,
        court: p.court,
        bench: p.bench || null,
        year: p.year,
        ratio: p.ratio,
        summary: p.summary,
        headnotes: p.headnotes || null,
        tags: p.tags || [],
        bailRelevant: p.bailRelevant ?? false,
      },
      create: {
        caseTitle: p.caseTitle,
        citation: p.citation,
        court: p.court,
        bench: p.bench || null,
        year: p.year,
        ratio: p.ratio,
        summary: p.summary,
        headnotes: p.headnotes || null,
        tags: p.tags || [],
        bailRelevant: p.bailRelevant ?? false,
      },
    });

    // Store embedding
    const vectorStr = `[${embeddings[i]!.join(",")}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE precedents SET embedding = $1::vector WHERE id = $2`,
      vectorStr,
      record.id
    );

    // Link to statute sections
    for (const sectionRef of p.relevantSections) {
      const parts = sectionRef.split(" ");
      if (parts.length >= 2) {
        const sectionNum = parts.slice(1).join(" ");
        const section = await prisma.statuteSection.findFirst({
          where: { sectionNumber: sectionNum },
        });

        if (section) {
          await prisma.precedentSection.upsert({
            where: {
              precedentId_sectionId: {
                precedentId: record.id,
                sectionId: section.id,
              },
            },
            update: {},
            create: {
              precedentId: record.id,
              sectionId: section.id,
              relevance: p.ratio.slice(0, 200),
            },
          });
        }
      }
    }
  }

  console.log(`\n${precedents.length} precedents ingested with embeddings and section links`);
  console.log("=== Ingestion complete ===");
}

main()
  .catch((e) => {
    console.error("Ingestion failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
