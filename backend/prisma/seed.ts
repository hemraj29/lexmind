import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Enable pgvector
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);

  // ─── SEED ACTS ──────────────────────────────────────────

  const bns = await prisma.act.upsert({
    where: { code: "BNS" },
    update: {},
    create: {
      code: "BNS",
      fullName: "Bhartiya Nyaya Sanhita",
      year: 2023,
      description: "Replaced the Indian Penal Code (IPC) with effect from 1st July 2024",
      replacedAct: "Indian Penal Code, 1860",
    },
  });

  const bnss = await prisma.act.upsert({
    where: { code: "BNSS" },
    update: {},
    create: {
      code: "BNSS",
      fullName: "Bhartiya Nagarik Suraksha Sanhita",
      year: 2023,
      description: "Replaced the Code of Criminal Procedure (CrPC) with effect from 1st July 2024",
      replacedAct: "Code of Criminal Procedure, 1973",
    },
  });

  const bsa = await prisma.act.upsert({
    where: { code: "BSA" },
    update: {},
    create: {
      code: "BSA",
      fullName: "Bhartiya Sakshya Adhiniyam",
      year: 2023,
      description: "Replaced the Indian Evidence Act with effect from 1st July 2024",
      replacedAct: "Indian Evidence Act, 1872",
    },
  });

  console.log(`Acts seeded: ${bns.code}, ${bnss.code}, ${bsa.code}`);

  // ─── SEED SAMPLE BNS CHAPTERS ─────────────────────────

  const chapters = [
    { actId: bns.id, number: 1, title: "Preliminary" },
    { actId: bns.id, number: 2, title: "General Explanations" },
    { actId: bns.id, number: 3, title: "Punishments" },
    { actId: bns.id, number: 5, title: "Of Abetment and Criminal Conspiracy" },
    { actId: bns.id, number: 6, title: "Of Offences Against the State" },
    { actId: bns.id, number: 7, title: "Of Offences Relating to the Army, Navy, and Air Force" },
    { actId: bns.id, number: 8, title: "Of Offences Against the Public Tranquillity" },
    { actId: bns.id, number: 9, title: "Of Offences by or Relating to Public Servants" },
    { actId: bns.id, number: 11, title: "Of False Evidence and Offences Against Public Justice" },
    { actId: bns.id, number: 13, title: "Of Offences Affecting the Human Body" },
    { actId: bns.id, number: 17, title: "Of Offences Against Property" },
  ];

  for (const ch of chapters) {
    await prisma.chapter.upsert({
      where: { actId_number: { actId: ch.actId, number: ch.number } },
      update: {},
      create: ch,
    });
  }

  console.log(`Chapters seeded: ${chapters.length}`);

  // ─── NOTE ─────────────────────────────────────────────
  // Full statute sections, IPC mappings, and precedents should be
  // seeded via the ingestion scripts (npm run ingest:statutes).
  // This seed only creates the foundational Act + Chapter structure.

  console.log("\nSeed complete! Now run:");
  console.log("  npm run ingest:statutes   — to load all BNS/BNSS/BSA sections");
  console.log("  npm run ingest:precedents — to load landmark case precedents");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
