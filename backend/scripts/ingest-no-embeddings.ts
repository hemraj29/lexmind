/**
 * Minimal ingestion — loads BNS/BNSS/BSA sections + IPC mappings into Postgres
 * WITHOUT generating OpenAI embeddings. Useful for smoke-testing the chat flow
 * before paying for embedding generation.
 *
 * Once you have an OpenAI key, run `npm run ingest:statutes` to backfill
 * embeddings on these existing rows.
 */

import { PrismaClient } from "@prisma/client";
import { readFile } from "fs/promises";
import { join } from "path";
import { config } from "dotenv";

config();

const prisma = new PrismaClient();
const DATA_DIR = join(process.cwd(), "src/data");

interface RawSection {
  sectionNumber: string;
  title: string;
  description: string;
  offenceType?: string;
  bailable?: boolean;
  punishment?: string;
  ingredients?: string[];
  keywords?: string[];
  exceptions?: string[];
  explanation?: string;
  summary?: string;
  pageNumber?: number;
  sourceFile?: string;
  sourceReference?: string;
  chapterNumber?: number | string;
}

async function ingestAct(actCode: "BNS" | "BNSS" | "BSA", fileName: string) {
  const filePath = join(DATA_DIR, "statutes", fileName);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    console.log(`  ${actCode}: ${fileName} not found, skipping`);
    return 0;
  }

  const sections: RawSection[] = JSON.parse(raw);
  if (sections.length === 0) {
    console.log(`  ${actCode}: file is empty, skipping`);
    return 0;
  }

  const act = await prisma.act.findUnique({ where: { code: actCode } });
  if (!act) {
    console.error(`  ${actCode}: Act not found in DB. Run db:seed first.`);
    return 0;
  }

  let inserted = 0;
  let skipped = 0;
  for (const s of sections) {
    if (!s.sectionNumber) {
      skipped++;
      continue;
    }

    const offenceType =
      s.offenceType === "cognizable" ? "COGNIZABLE" : "NON_COGNIZABLE";

    let chapterId: string | undefined;
    if (s.chapterNumber !== undefined) {
      const num = typeof s.chapterNumber === "string"
        ? parseInt(s.chapterNumber.replace(/[^0-9]/g, ""), 10)
        : s.chapterNumber;
      if (num && !isNaN(num)) {
        const chapter = await prisma.chapter.findUnique({
          where: { actId_number: { actId: act.id, number: num } },
        });
        chapterId = chapter?.id;
      }
    }

    try {
      await prisma.statuteSection.upsert({
        where: {
          actType_sectionNumber: {
            actType: actCode,
            sectionNumber: s.sectionNumber,
          },
        },
        update: {
          title: s.title || `Section ${s.sectionNumber}`,
          description: s.description || "",
          summary: s.summary || null,
          offenceType,
          bailable: s.bailable ?? false,
          punishment: s.punishment || "N/A",
          ingredients: s.ingredients || [],
          keywords: s.keywords || [],
          exceptions: Array.isArray(s.exceptions) ? s.exceptions : [],
          explanation: typeof s.explanation === "string" ? s.explanation : null,
          pageNumber: s.pageNumber || null,
          sourceFile: s.sourceFile || null,
          sourceReference: s.sourceReference || null,
          chapterId,
        },
        create: {
          actId: act.id,
          actType: actCode,
          sectionNumber: s.sectionNumber,
          title: s.title || `Section ${s.sectionNumber}`,
          description: s.description || "",
          summary: s.summary || null,
          offenceType,
          bailable: s.bailable ?? false,
          punishment: s.punishment || "N/A",
          ingredients: s.ingredients || [],
          keywords: s.keywords || [],
          exceptions: Array.isArray(s.exceptions) ? s.exceptions : [],
          explanation: typeof s.explanation === "string" ? s.explanation : null,
          pageNumber: s.pageNumber || null,
          sourceFile: s.sourceFile || null,
          sourceReference: s.sourceReference || null,
          chapterId,
        },
      });
      inserted++;
    } catch (err: any) {
      skipped++;
      if (skipped < 5) {
        console.log(`  ${actCode} ${s.sectionNumber}: skipped - ${err.message.split("\n")[0]}`);
      }
    }
  }

  console.log(`  ${actCode}: ${inserted} sections ingested, ${skipped} skipped`);
  return inserted;
}

async function ingestIPCMappings() {
  const filePath = join(DATA_DIR, "mapper", "ipc-to-bns.json");
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    console.log("  IPC mappings: file not found, skipping");
    return 0;
  }

  const mappings: any[] = JSON.parse(raw);
  if (mappings.length === 0) return 0;

  let inserted = 0;
  for (const m of mappings) {
    if (!m.ipcSection || !m.bnsSection) continue;
    try {
      await prisma.iPCMapping.upsert({
        where: { ipcSection: String(m.ipcSection) },
        update: {
          ipcTitle: m.ipcTitle || "",
          bnsSection: String(m.bnsSection),
          bnsTitle: m.bnsTitle || "",
          changeType: (m.changeType?.toUpperCase() as any) || "RENAMED",
          notes: m.notes || null,
        },
        create: {
          ipcSection: String(m.ipcSection),
          ipcTitle: m.ipcTitle || "",
          bnsSection: String(m.bnsSection),
          bnsTitle: m.bnsTitle || "",
          changeType: (m.changeType?.toUpperCase() as any) || "RENAMED",
          notes: m.notes || null,
        },
      });
      inserted++;
    } catch {
      // skip on error
    }
  }
  console.log(`  IPC mappings: ${inserted} ingested`);
  return inserted;
}

async function main() {
  console.log("=== Minimal Ingestion (no embeddings) ===\n");

  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS vector;");

  console.log("Ingesting BNS...");
  await ingestAct("BNS", "bns.json");

  console.log("\nIngesting BNSS...");
  await ingestAct("BNSS", "bnss.json");

  console.log("\nIngesting BSA...");
  await ingestAct("BSA", "bsa.json");

  console.log("\nIngesting IPC mappings...");
  await ingestIPCMappings();

  // Final counts
  const [acts, sections, mappings] = await Promise.all([
    prisma.act.count(),
    prisma.statuteSection.count(),
    prisma.iPCMapping.count(),
  ]);

  console.log("\n=== Final DB state ===");
  console.log(`  Acts: ${acts}`);
  console.log(`  Statute sections: ${sections}`);
  console.log(`  IPC mappings: ${mappings}`);
  console.log("\nDone! Embeddings will be generated later via `npm run ingest:statutes` once OPENAI_API_KEY is set.");
}

main()
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
