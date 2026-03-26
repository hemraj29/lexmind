import { PrismaClient, type ActType, type OffenceType } from "@prisma/client";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("database");

const prisma = new PrismaClient({
  log: [
    { emit: "event", level: "error" },
    { emit: "event", level: "warn" },
  ],
});

prisma.$on("error", (e) => log.error(e, "Prisma error"));
prisma.$on("warn", (e) => log.warn(e, "Prisma warning"));

// ─── INITIALIZATION ─────────────────────────────────────

export async function initDatabase(): Promise<void> {
  await prisma.$connect();
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
  log.info("PostgreSQL + pgvector connected");
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  log.info("PostgreSQL disconnected");
}

export async function healthCheck(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

// ─── VECTOR SEARCH (pgvector cosine distance) ──────────

interface VectorStatuteResult {
  id: string;
  act_type: string;
  section_number: string;
  title: string;
  description: string;
  offence_type: string;
  bailable: boolean;
  punishment: string;
  ingredients: string[];
  distance: number;
}

export async function vectorSearchStatutes(
  embedding: number[],
  topK: number = 10,
  actFilter?: ActType
): Promise<VectorStatuteResult[]> {
  const vectorStr = `[${embedding.join(",")}]`;

  if (actFilter) {
    return prisma.$queryRawUnsafe(
      `SELECT id, act_type, section_number, title, description,
              offence_type, bailable, punishment, ingredients,
              embedding <=> $1::vector AS distance
       FROM statute_sections
       WHERE embedding IS NOT NULL AND act_type = $2::\"ActType\"
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      vectorStr,
      actFilter,
      topK
    );
  }

  return prisma.$queryRawUnsafe(
    `SELECT id, act_type, section_number, title, description,
            offence_type, bailable, punishment, ingredients,
            embedding <=> $1::vector AS distance
     FROM statute_sections
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    vectorStr,
    topK
  );
}

export async function vectorSearchPrecedents(
  embedding: number[],
  topK: number = 5,
  bailOnly: boolean = false
): Promise<
  {
    id: string;
    case_title: string;
    citation: string;
    court: string;
    year: number;
    ratio: string;
    summary: string;
    distance: number;
  }[]
> {
  const vectorStr = `[${embedding.join(",")}]`;

  if (bailOnly) {
    return prisma.$queryRawUnsafe(
      `SELECT id, case_title, citation, court, year, ratio, summary,
              embedding <=> $1::vector AS distance
       FROM precedents
       WHERE embedding IS NOT NULL AND bail_relevant = true
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      vectorStr,
      topK
    );
  }

  return prisma.$queryRawUnsafe(
    `SELECT id, case_title, citation, court, year, ratio, summary,
            embedding <=> $1::vector AS distance
     FROM precedents
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    vectorStr,
    topK
  );
}

// ─── EMBEDDING UPSERTS ──────────────────────────────────

export async function updateStatuteEmbedding(id: string, embedding: number[]): Promise<void> {
  const vectorStr = `[${embedding.join(",")}]`;
  await prisma.$executeRawUnsafe(
    `UPDATE statute_sections SET embedding = $1::vector WHERE id = $2`,
    vectorStr,
    id
  );
}

export async function updatePrecedentEmbedding(id: string, embedding: number[]): Promise<void> {
  const vectorStr = `[${embedding.join(",")}]`;
  await prisma.$executeRawUnsafe(
    `UPDATE precedents SET embedding = $1::vector WHERE id = $2`,
    vectorStr,
    id
  );
}

// ─── SECTION LOOKUPS ────────────────────────────────────

export async function findSectionByNumber(sectionNumber: string, actType?: ActType) {
  return prisma.statuteSection.findFirst({
    where: {
      sectionNumber,
      ...(actType && { actType }),
    },
    include: {
      act: true,
      chapter: true,
      ipcMappingsAsBNS: true,
      precedentLinks: {
        include: { precedent: true },
      },
    },
  });
}

export async function findIPCMapping(ipcSection: string) {
  return prisma.iPCMapping.findUnique({
    where: { ipcSection },
    include: {
      bnsSectionRef: {
        include: { act: true },
      },
    },
  });
}

export async function searchSections(query: string, actType?: ActType, limit: number = 20) {
  return prisma.statuteSection.findMany({
    where: {
      ...(actType && { actType }),
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { sectionNumber: { contains: query } },
        { keywords: { hasSome: [query.toLowerCase()] } },
      ],
    },
    include: {
      act: true,
      chapter: true,
    },
    take: limit,
    orderBy: { sectionNumber: "asc" },
  });
}

// ─── PIPELINE RUNS ──────────────────────────────────────

export async function createPipelineRun(data: {
  fileName: string;
  mimeType: string;
  uploadPath: string;
}) {
  return prisma.pipelineRun.create({ data });
}

export async function updatePipelineRun(id: string, data: Record<string, unknown>) {
  return prisma.pipelineRun.update({
    where: { id },
    data: data as any,
  });
}

export async function getPipelineRun(id: string) {
  return prisma.pipelineRun.findUnique({
    where: { id },
    include: { documents: true },
  });
}

export async function listPipelineRuns(limit: number = 20, offset: number = 0) {
  return prisma.pipelineRun.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    include: { documents: true },
  });
}

export async function createGeneratedDocument(data: {
  pipelineRunId: string;
  docType: "BAIL_APPLICATION" | "LEGAL_MEMO" | "FIR_EXTRACT";
  filePath: string;
  fileSize: number;
  mimeType: string;
}) {
  return prisma.generatedDocument.create({ data });
}

export { prisma };
