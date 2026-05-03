/**
 * Enrich extracted BNS/BNSS/BSA data:
 * 1. Link definition sections to their punishment sections
 * 2. Fill missing titles
 * 3. Reverse-map IPC equivalents from ipc-to-bns.json
 * 4. Fix empty fields
 *
 * Usage: npx tsx scripts/enrich-data.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { config } from "dotenv";

config();

const DATA_DIR = join(process.cwd(), "src/data");
const MODEL_ID = "openai.gpt-oss-120b-1:0";

const bedrock = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

function loadJson(path: string): any[] {
  return JSON.parse(readFileSync(join(DATA_DIR, path), "utf-8"));
}

function saveJson(path: string, data: unknown) {
  writeFileSync(join(DATA_DIR, path), JSON.stringify(data, null, 2), "utf-8");
  console.log(`  Saved: ${path}`);
}

async function callLLM(prompt: string): Promise<string> {
  try {
    const cmd = new ConverseCommand({
      modelId: MODEL_ID,
      messages: [{ role: "user", content: [{ text: prompt }] }],
      system: [{ text: "Respond with valid JSON only. No explanation." }],
      inferenceConfig: { temperature: 0.05, maxTokens: 4000 },
    });
    const resp = await bedrock.send(cmd);
    const blocks = resp.output?.message?.content || [];
    for (const b of blocks) {
      if ("text" in b && typeof b.text === "string") {
        const match = b.text.match(/\{[\s\S]*\}/);
        return match ? match[0] : "{}";
      }
    }
  } catch (err: any) {
    console.log(`  LLM error: ${err.message}`);
  }
  return "{}";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── 1. LINK PUNISHMENTS ────────────────────────────────

async function linkPunishments(sections: any[]): Promise<number> {
  console.log("\n--- Linking punishment sections to definition sections ---");

  // Build a quick map
  const byNum = new Map(sections.map((s) => [s.sectionNumber, s]));
  let fixed = 0;

  // Find sections with empty punishment
  const noPunishment = sections.filter(
    (s) => !s.punishment || s.punishment === "" || s.punishment === "EMPTY"
  );
  console.log(`  ${noPunishment.length} sections missing punishment`);

  if (noPunishment.length === 0) return 0;

  // Strategy: For each section missing punishment, check the NEXT few sections
  // for a punishment clause. Common patterns:
  //   Section N = definition → Section N+1 or N+2 = "Punishment for [offence]"
  for (const s of noPunishment) {
    const num = parseInt(s.sectionNumber);
    if (isNaN(num)) continue;

    // Check next 3 sections for a punishment
    for (let offset = 1; offset <= 3; offset++) {
      const nextNum = String(num + offset);
      const next = byNum.get(nextNum);
      if (!next) continue;

      const nextDesc = (next.description || "").toLowerCase();
      const nextTitle = (next.title || "").toLowerCase();

      // Does the next section contain "shall be punished" or is titled "Punishment for..."?
      if (
        nextDesc.includes("shall be punished") ||
        nextDesc.includes("punishable with") ||
        nextTitle.includes("punishment")
      ) {
        // Extract the punishment text from the next section
        const punishmentMatch = next.description?.match(
          /(?:shall be punished with|punishable with|punished with)([\s\S]*?)(?:\.|$)/i
        );
        if (punishmentMatch) {
          const punishmentText = punishmentMatch[0].trim();
          s.punishment = punishmentText;
          s.punishmentSection = nextNum; // Reference to which section has the punishment
          fixed++;
          break;
        } else if (next.punishment) {
          // Next section already has punishment extracted
          s.punishment = next.punishment;
          s.punishmentSection = nextNum;
          fixed++;
          break;
        }
      }
    }
  }

  console.log(`  Linked ${fixed} punishments from adjacent sections`);

  // For remaining unfixed, use LLM to find punishment from surrounding context
  const stillMissing = sections.filter(
    (s) =>
      (!s.punishment || s.punishment === "" || s.punishment === "EMPTY") &&
      s.description?.length > 100
  );

  if (stillMissing.length > 0 && stillMissing.length <= 50) {
    console.log(`  ${stillMissing.length} still missing — using LLM to extract from description...`);

    const BATCH = 10;
    for (let i = 0; i < stillMissing.length; i += BATCH) {
      const batch = stillMissing.slice(i, i + BATCH);

      const prompt = `For each of the following Indian law sections, extract the PUNISHMENT if it exists within the text. If no punishment is mentioned in the text, return "definition_only" (meaning this section only defines the offence, punishment is in another section).

${batch.map((s, idx) => `[${idx}] Section ${s.sectionNumber}: ${s.description?.slice(0, 500)}`).join("\n\n")}

Return JSON: { "punishments": [ { "index": 0, "punishment": "imprisonment for life and fine" or "definition_only" }, ... ] }`;

      const raw = await callLLM(prompt);
      try {
        const parsed = JSON.parse(raw);
        for (const p of parsed.punishments || []) {
          if (p.punishment && p.punishment !== "definition_only" && p.index < batch.length) {
            batch[p.index].punishment = p.punishment;
            fixed++;
          }
        }
      } catch {}
      await sleep(500);
    }
  }

  console.log(`  Total punishments fixed: ${fixed}`);
  return fixed;
}

// ─── 2. FILL MISSING TITLES ─────────────────────────────

function fillMissingTitles(sections: any[]): number {
  console.log("\n--- Filling missing titles ---");
  let fixed = 0;

  for (const s of sections) {
    if (s.title && s.title.trim() !== "") continue;

    // Try to extract title from description first line
    const desc = s.description || "";
    // Many BNS sections start with the section number and then a heading-like text
    // Or we can derive from the content
    const firstLine = desc.split(/[.\n]/)[0] || "";
    if (firstLine.length > 5 && firstLine.length < 100) {
      s.title = firstLine.replace(/^\d+\.\s*/, "").replace(/^[\(\d\)\s]+/, "").trim();
      if (s.title) fixed++;
    }
  }

  console.log(`  Fixed ${fixed} missing titles`);
  return fixed;
}

// ─── 3. REVERSE MAP IPC EQUIVALENTS ─────────────────────

function reverseMapIPC(sections: any[]): number {
  console.log("\n--- Reverse mapping IPC equivalents from ipc-to-bns.json ---");

  const mappings = loadJson("mapper/ipc-to-bns.json");
  let fixed = 0;

  // Build BNS→IPC reverse lookup
  const bnsToIpc = new Map<string, string>();
  for (const m of mappings) {
    const bnsNum = String(m.bnsSection);
    if (!bnsToIpc.has(bnsNum)) {
      bnsToIpc.set(bnsNum, String(m.ipcSection));
    }
  }

  console.log(`  ${bnsToIpc.size} BNS→IPC mappings available`);

  for (const s of sections) {
    if (s.ipcEquivalent && s.ipcEquivalent !== "") continue;

    const ipc = bnsToIpc.get(s.sectionNumber);
    if (ipc) {
      s.ipcEquivalent = ipc;
      fixed++;
    }
  }

  console.log(`  Mapped ${fixed} IPC equivalents`);
  return fixed;
}

// ─── 4. FIX BAILABLE/OFFENCE TYPE FROM PUNISHMENT ───────

function fixBailabilityFromPunishment(sections: any[]): number {
  console.log("\n--- Fixing bailability based on punishment text ---");
  let fixed = 0;

  for (const s of sections) {
    const punishment = (s.punishment || "").toLowerCase();
    if (!punishment || punishment === "definition_only") continue;

    // Determine from punishment text
    if (
      punishment.includes("death") ||
      punishment.includes("imprisonment for life") ||
      punishment.includes("ten years") ||
      punishment.includes("fourteen years") ||
      punishment.includes("twenty years")
    ) {
      if (s.bailable !== false) {
        s.bailable = false;
        s.offenceType = "cognizable";
        fixed++;
      }
    } else if (
      punishment.includes("seven years") ||
      punishment.includes("five years")
    ) {
      if (s.bailable !== false) {
        s.bailable = false;
        s.offenceType = "cognizable";
        fixed++;
      }
    } else if (
      punishment.includes("three years") ||
      punishment.includes("two years") ||
      punishment.includes("one year") ||
      punishment.includes("six months") ||
      punishment.includes("fine only")
    ) {
      // These are typically bailable
      if (s.bailable !== true) {
        s.bailable = true;
        fixed++;
      }
    }
  }

  console.log(`  Fixed ${fixed} bailability values`);
  return fixed;
}

// ─── MAIN ───────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  LexiMini — Data Enrichment Pipeline        ║");
  console.log("╚══════════════════════════════════════════════╝");

  for (const file of ["statutes/bns.json", "statutes/bnss.json", "statutes/bsa.json"]) {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`Processing: ${file}`);
    console.log("=".repeat(50));

    const sections = loadJson(file);
    console.log(`  Loaded ${sections.length} sections`);

    if (sections.length === 0) {
      console.log("  Empty file, skipping");
      continue;
    }

    const fixes = {
      punishments: await linkPunishments(sections),
      titles: fillMissingTitles(sections),
      ipc: reverseMapIPC(sections),
      bailability: fixBailabilityFromPunishment(sections),
    };

    console.log(`\n  Summary: ${JSON.stringify(fixes)}`);
    saveJson(file, sections);
  }

  // Final report
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  Enrichment complete!                        ║");
  console.log("╚══════════════════════════════════════════════╝");

  for (const file of ["statutes/bns.json", "statutes/bnss.json", "statutes/bsa.json"]) {
    const sections = loadJson(file);
    const empty = (f: string) => sections.filter((s: any) => !s[f] || s[f] === "" || (Array.isArray(s[f]) && s[f].length === 0)).length;
    console.log(`\n${file}: ${sections.length} sections`);
    console.log(`  punishment empty: ${empty("punishment")}`);
    console.log(`  title empty: ${empty("title")}`);
    console.log(`  ipcEquivalent empty: ${empty("ipcEquivalent")}`);
    console.log(`  description empty: ${empty("description")}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
