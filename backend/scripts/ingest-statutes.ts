/**
 * Ingestion script for statutory sections.
 *
 * Reads statute data from JSON files in src/data/statutes/,
 * inserts into PostgreSQL, and generates + stores pgvector embeddings.
 *
 * Usage: npm run ingest:statutes
 *
 * Expected JSON format in src/data/statutes/{bns,bnss,bsa}.json:
 * [
 *   {
 *     "sectionNumber": "101",
 *     "title": "Murder",
 *     "description": "Whoever causes death of any person...",
 *     "offenceType": "cognizable",
 *     "bailable": false,
 *     "punishment": "Death or imprisonment for life, and fine",
 *     "ingredients": ["Causing death", "Intention to cause death", ...],
 *     "keywords": ["murder", "homicide", "death"],
 *     "chapterNumber": 13,
 *     "exceptions": [],
 *     "explanation": ""
 *   }
 * ]
 */

import { PrismaClient, type ActType, type OffenceType } from "@prisma/client";
import { readFile } from "fs/promises";
import { join } from "path";
import OpenAI from "openai";
import { config } from "dotenv";

config();

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const DATA_DIR = join(process.cwd(), "src/data/statutes");

interface RawSection {
  sectionNumber: string;
  title: string;
  description: string;
  offenceType: string;
  bailable: boolean;
  punishment: string;
  ingredients: string[];
  keywords?: string[];
  chapterNumber?: number;
  exceptions?: string[];
  explanation?: string;
}

async function embedText(text: string): Promise<number[]> {
  const resp = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: text });
  return resp.data[0]!.embedding;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const BATCH = 100;
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const resp = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: batch });
    results.push(...resp.data.map((d) => d.embedding));
    console.log(`  Embedded ${Math.min(i + BATCH, texts.length)}/${texts.length}`);
  }
  return results;
}

async function ingestAct(actCode: ActType, fileName: string) {
  const filePath = join(DATA_DIR, fileName);

  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    console.log(`  Skipping ${actCode}: ${fileName} not found`);
    return;
  }

  const sections: RawSection[] = JSON.parse(raw);
  console.log(`  Found ${sections.length} sections in ${fileName}`);

  // Get the Act record
  const act = await prisma.act.findUnique({ where: { code: actCode } });
  if (!act) {
    console.error(`  Act ${actCode} not found in DB. Run db:seed first.`);
    return;
  }

  // Prepare embedding texts
  const embeddingTexts = sections.map(
    (s) =>
      `${actCode} Section ${s.sectionNumber} ${s.title}. ${s.description}. Ingredients: ${s.ingredients.join(", ")}. Punishment: ${s.punishment}`
  );

  console.log("  Generating embeddings...");
  const embeddings = await embedBatch(embeddingTexts);

  console.log("  Upserting sections...");
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]!;
    const offenceType: OffenceType = s.offenceType === "cognizable" ? "COGNIZABLE" : "NON_COGNIZABLE";

    // Find chapter if specified
    let chapterId: string | undefined;
    if (s.chapterNumber) {
      const chapter = await prisma.chapter.findUnique({
        where: { actId_number: { actId: act.id, number: s.chapterNumber } },
      });
      chapterId = chapter?.id;
    }

    const record = await prisma.statuteSection.upsert({
      where: { actType_sectionNumber: { actType: actCode, sectionNumber: s.sectionNumber } },
      update: {
        title: s.title,
        description: s.description,
        offenceType,
        bailable: s.bailable,
        punishment: s.punishment,
        ingredients: s.ingredients,
        keywords: s.keywords || [],
        exceptions: s.exceptions || [],
        explanation: s.explanation || null,
        chapterId,
      },
      create: {
        actId: act.id,
        actType: actCode,
        sectionNumber: s.sectionNumber,
        title: s.title,
        description: s.description,
        offenceType,
        bailable: s.bailable,
        punishment: s.punishment,
        ingredients: s.ingredients,
        keywords: s.keywords || [],
        exceptions: s.exceptions || [],
        explanation: s.explanation || null,
        chapterId,
      },
    });

    // Store embedding via raw SQL (Prisma doesn't support Unsupported types in create)
    const vectorStr = `[${embeddings[i]!.join(",")}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE statute_sections SET embedding = $1::vector WHERE id = $2`,
      vectorStr,
      record.id
    );
  }

  console.log(`  ${actCode}: ${sections.length} sections ingested with embeddings`);
}

async function ingestIPCMappings() {
  const filePath = join(process.cwd(), "src/data/mapper/ipc-to-bns.json");

  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    console.log("  Skipping IPC mappings: ipc-to-bns.json not found");
    return;
  }

  const mappings: {
    ipcSection: string;
    ipcTitle: string;
    bnsSection: string;
    bnsTitle: string;
    changeType?: string;
    notes?: string;
  }[] = JSON.parse(raw);

  console.log(`  Found ${mappings.length} IPC-to-BNS mappings`);

  for (const m of mappings) {
    // Try to link to the BNS section record
    const bnsRecord = await prisma.statuteSection.findFirst({
      where: { actType: "BNS", sectionNumber: m.bnsSection },
    });

    await prisma.iPCMapping.upsert({
      where: { ipcSection: m.ipcSection },
      update: {
        ipcTitle: m.ipcTitle,
        bnsSection: m.bnsSection,
        bnsTitle: m.bnsTitle,
        bnsSectionId: bnsRecord?.id || null,
        changeType: (m.changeType?.toUpperCase() as any) || "RENAMED",
        notes: m.notes || null,
      },
      create: {
        ipcSection: m.ipcSection,
        ipcTitle: m.ipcTitle,
        bnsSection: m.bnsSection,
        bnsTitle: m.bnsTitle,
        bnsSectionId: bnsRecord?.id || null,
        changeType: (m.changeType?.toUpperCase() as any) || "RENAMED",
        notes: m.notes || null,
      },
    });
  }

  console.log(`  ${mappings.length} IPC mappings ingested`);
}

async function main() {
  console.log("=== Statute Ingestion Pipeline ===\n");

  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);

  console.log("Ingesting BNS sections...");
  await ingestAct("BNS", "bns.json");

  console.log("\nIngesting BNSS sections...");
  await ingestAct("BNSS", "bnss.json");

  console.log("\nIngesting BSA sections...");
  await ingestAct("BSA", "bsa.json");

  console.log("\nIngesting IPC-to-BNS mappings...");
  await ingestIPCMappings();

  console.log("\n=== Ingestion complete ===");
}

main()
  .catch((e) => {
    console.error("Ingestion failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
