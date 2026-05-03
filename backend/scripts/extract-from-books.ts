/**
 * Extract structured section data from BNS/BNSS/BSA PDF books using Amazon Bedrock.
 *
 * Usage:
 *   1. Configure AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION in .env)
 *   2. Run: npx tsx scripts/extract-from-books.ts
 *
 * Outputs:
 *   src/data/statutes/bns.json
 *   src/data/statutes/bnss.json
 *   src/data/statutes/bsa.json
 *   src/data/mapper/ipc-to-bns.json
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { config } from "dotenv";
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
// @ts-ignore
import pdfParse from "pdf-parse";

config();

const bedrock = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const MODEL_ID = "openai.gpt-oss-120b-1:0"; // OpenAI GPT OSS 120B on Bedrock
const CONCURRENCY = 40; // Bedrock handles high parallelism
const DELAY_BETWEEN_REQUESTS_MS = 200; // Minimal delay
const BOOK_DIR = join(process.cwd(), "book");
const DATA_DIR = join(process.cwd(), "src/data");

interface ExtractedSection {
  sectionNumber: string;
  title: string;
  description: string;     // FULL legal text — word for word from the Act
  summary: string;          // 2-3 line plain English summary for AI context
  offenceType: "cognizable" | "non-cognizable";
  bailable: boolean;
  punishment: string;
  ingredients: string[];
  keywords: string[];
  chapterNumber?: number;
  exceptions: string[];
  explanation: string;
  ipcEquivalent?: string;
  sourceReference?: string; // Official gazette citation
  pageNumber?: number;      // Page number in the source PDF
  sourceFile?: string;      // PDF filename for reference
}

// Page-aware text structure
interface PageText {
  pageNumber: number;
  text: string;
  charOffset: number; // character offset in full text
}

// ─── HELPERS ─────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callLLM(prompt: string, retries = 3): Promise<string> {
  const systemPrompt = `You are a senior Indian legal data extraction expert working on a critical project: building a legal database for a tool that practicing Indian lawyers will use in court to draft bail applications, petitions, and legal arguments.

ACCURACY IS NON-NEGOTIABLE. A wrong section number, incorrect punishment, or fabricated definition can destroy a lawyer's case and harm their client's liberty. Every word you extract will be trusted by lawyers as authoritative legal text.

RULES YOU MUST FOLLOW:
1. Extract ONLY what is written in the source text. Do NOT invent, assume, or hallucinate ANY legal text, definitions, section numbers, or punishments.
2. If a definition or section is split across chunks and you only see a partial text, extract what you see accurately. Do NOT fabricate the missing parts.
3. If you are unsure about ANY field, leave it as an empty string "" or empty array [] — NEVER guess.
4. Section numbers must exactly match what appears in the Act (e.g., "101", "103A"). Do not renumber.
5. The "description" field must be the VERBATIM statutory text — copied word-for-word from the Act. Not paraphrased, not summarized.
6. The "punishment" field must be the EXACT punishment clause text. "Imprisonment for seven years" is NOT the same as "imprisonment which may extend to seven years".
7. For "bailable" and "offenceType" — if not explicitly stated in the text, use your expert knowledge of Indian criminal law, but mark these as best-effort.
8. Do NOT repeat the same definition multiple times. Each sub-definition (1), (2), (3) etc. should appear exactly once.

Always respond with valid JSON only. No markdown, no explanation, no preamble — just the JSON object.`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const messages: Message[] = [
        {
          role: "user",
          content: [{ text: prompt }],
        },
      ];

      const command = new ConverseCommand({
        modelId: MODEL_ID,
        messages,
        system: [{ text: systemPrompt }],
        inferenceConfig: {
          temperature: 0.05,
          maxTokens: 8000,
        },
      });

      const response = await bedrock.send(command);
      const contentBlocks = response.output?.message?.content || [];

      // Bedrock may return reasoningContent + text blocks — find the actual text
      let outputText = "";
      for (const block of contentBlocks) {
        if ("text" in block && typeof block.text === "string") {
          outputText = block.text;
          break;
        }
      }

      if (!outputText) {
        console.log(`  ⚠️ Empty response from Bedrock, content blocks: ${JSON.stringify(contentBlocks).slice(0, 200)}`);
        return "{}";
      }

      // Try to extract JSON from the response
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      return jsonMatch ? jsonMatch[0] : "{}";
    } catch (err: any) {
      if (err.name === "ThrottlingException" || err.message?.includes("throttl")) {
        const waitTime = (attempt + 1) * 10000;
        console.log(`  🚫 Throttled (attempt ${attempt + 1}/${retries}). Waiting ${waitTime / 1000}s...`);
        await sleep(waitTime);
        continue;
      }
      if (err.message?.includes("too long") || err.message?.includes("token") || err.message?.includes("length")) {
        console.log(`  ⚠️ Prompt too long, skipping this chunk`);
        return '{"sections": []}';
      }
      if (attempt === retries) throw err;
      console.log(`  Retry ${attempt + 1}/${retries}: ${err.message}`);
      await sleep(3000);
    }
  }
  return "{}";
}

// Cache for page data per file
const pageCache = new Map<string, PageText[]>();

async function extractPdfPages(fileName: string): Promise<PageText[]> {
  if (pageCache.has(fileName)) return pageCache.get(fileName)!;

  const filePath = join(BOOK_DIR, fileName);
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const buf = readFileSync(filePath);
  const pages: PageText[] = [];
  let charOffset = 0;

  // pdf-parse with custom page renderer to get per-page text
  await pdfParse(buf, {
    pagerender: async (pageData: any) => {
      const textContent = await pageData.getTextContent();
      const text = textContent.items.map((item: any) => item.str).join(" ");
      pages.push({ pageNumber: pages.length + 1, text, charOffset });
      charOffset += text.length + 1; // +1 for newline between pages
      return text;
    },
  });

  // Fallback if pagerender didn't work (some pdf-parse versions)
  if (pages.length === 0) {
    const data = await pdfParse(buf);
    pages.push({ pageNumber: 1, text: data.text, charOffset: 0 });
  }

  pageCache.set(fileName, pages);
  console.log(`  PDF loaded: ${pages.length} pages`);
  return pages;
}

async function extractPdfText(fileName: string): Promise<string> {
  const pages = await extractPdfPages(fileName);
  return pages.map((p) => p.text).join("\n");
}

function findPageForSection(fileName: string, sectionNumber: string): number | undefined {
  const pages = pageCache.get(fileName);
  if (!pages) return undefined;

  // Search for section pattern in each page
  const patterns = [
    new RegExp(`\\b${sectionNumber}\\.\\s+[A-Z(]`, "m"),     // "101. Murder" or "101. (1)"
    new RegExp(`\\bSection\\s+${sectionNumber}\\b`, "m"),      // "Section 101"
    new RegExp(`^${sectionNumber}\\.\\s`, "m"),                 // "101. " at start of line
  ];

  for (const page of pages) {
    for (const pattern of patterns) {
      if (pattern.test(page.text)) {
        return page.pageNumber;
      }
    }
  }

  return undefined;
}

function splitTextIntoChunks(text: string, maxChars: number = 8000): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }

    // Find a good split point (section boundary)
    let splitAt = maxChars;
    const sectionPattern = /\n\d+\.\s+[A-Z]/g;
    let lastGoodSplit = -1;
    let match;

    // Search for section boundaries within the chunk range
    const searchText = remaining.slice(Math.floor(maxChars * 0.7), maxChars + 500);
    const offset = Math.floor(maxChars * 0.7);

    sectionPattern.lastIndex = 0;
    while ((match = sectionPattern.exec(searchText)) !== null) {
      lastGoodSplit = offset + match.index;
    }

    if (lastGoodSplit > 0) {
      splitAt = lastGoodSplit;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  return chunks;
}

function saveJson(filePath: string, data: unknown) {
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`  Saved: ${filePath}`);
}

function detectHallucination(section: ExtractedSection): boolean {
  const desc = section.description || "";

  // Check for repeated phrases (hallucination signature)
  const sentences = desc.split(/[;\n]/).map((s) => s.trim()).filter((s) => s.length > 30);
  const seen = new Set<string>();
  let dupeCount = 0;
  for (const sentence of sentences) {
    if (seen.has(sentence)) dupeCount++;
    seen.add(sentence);
  }
  if (dupeCount >= 3) {
    console.log(`  ⚠️ Hallucination detected in Section ${section.sectionNumber}: ${dupeCount} repeated phrases`);
    return true;
  }

  // Check for definitions that don't belong in BNS Section 2
  // (model sometimes invents definitions like "affray", "bodily harm" etc.)
  if (section.sectionNumber === "2" && desc.includes('"affray"') && desc.includes('"bodily harm"')) {
    console.log(`  ⚠️ Hallucination detected in Section 2: fabricated definitions`);
    return true;
  }

  return false;
}

function mergeAndDedupe(allSections: ExtractedSection[]): ExtractedSection[] {
  const seen = new Map<string, ExtractedSection>();

  for (const s of allSections) {
    const key = s.sectionNumber.replace(/\s+/g, "");

    // Skip sub-section entries like 2(4), 2(5)
    if (/^\d+\(\d+\)$/.test(key)) continue;

    // Skip hallucinated sections
    if (detectHallucination(s)) continue;

    if (!seen.has(key)) {
      seen.set(key, s);
    } else {
      const existing = seen.get(key)!;

      // Pick the better extraction — prefer longer UNLESS it's hallucinated
      const newIsHallucinated = detectHallucination(s);
      const existingIsHallucinated = detectHallucination(existing);

      if (existingIsHallucinated && !newIsHallucinated) {
        seen.set(key, s);
      } else if (!existingIsHallucinated && !newIsHallucinated && s.description.length > existing.description.length) {
        // Both clean — keep longer
        seen.set(key, {
          ...s,
          ingredients: s.ingredients.length >= existing.ingredients.length ? s.ingredients : existing.ingredients,
          keywords: [...new Set([...(existing.keywords || []), ...(s.keywords || [])])].slice(0, 10),
          exceptions: (s.exceptions?.length || 0) >= (existing.exceptions?.length || 0) ? s.exceptions : existing.exceptions,
          explanation: (s.explanation?.length || 0) >= (existing.explanation?.length || 0) ? s.explanation : existing.explanation,
        });
      }
      // Otherwise keep existing (first clean extraction wins)
    }
  }

  return Array.from(seen.values()).sort((a, b) => {
    const numA = parseInt(a.sectionNumber) || 0;
    const numB = parseInt(b.sectionNumber) || 0;
    return numA - numB;
  });
}

// ─── BNS EXTRACTION ─────────────────────────────────────

const BNS_PROMPT = (chunk: string) => `CONTEXT: You are building a legal database for a tool that Indian criminal defense lawyers will use in court. The data you extract will be directly used in bail applications, petitions, and legal arguments filed before judges. ANY inaccuracy — a wrong section number, fabricated punishment, or invented definition — can lead to a lawyer's case being thrown out and an innocent person staying in jail.

SOURCE: Official Gazette notification of the Bharatiya Nyaya Sanhita (BNS), 2023 (No. 45 of 2023). This is the bare Act text. Ignore any Hindi/Devanagari formatting artifacts.

TASK: Extract ALL legal sections from the following text chunk.

For Section 2 (Definitions): Extract as ONE section with ALL definitions combined. Do NOT split into separate entries like 2(4), 2(5).

For EACH section, extract these fields:
- sectionNumber: Exact section number as printed (e.g., "101", "103A"). Do NOT renumber.
- title: Full section title/marginal heading
- description: THE VERBATIM STATUTORY TEXT — copied word-for-word from the Act. Include ALL sub-sections (1), (2), (3), ALL clauses (a), (b), (c), ALL provisos, ALL explanations, ALL illustrations. Do NOT paraphrase. Do NOT truncate. Do NOT add words not in the Act.
- summary: 2-3 sentence plain-English explanation for quick lawyer reference. Must accurately reflect the section.
- offenceType: "cognizable" or "non-cognizable". Use your expert knowledge of Indian criminal law. Most offences punishable with 3+ years are cognizable.
- bailable: true or false. Use your expert knowledge. Generally: max punishment ≤3 years = bailable, ≥7 years = non-bailable. If unsure, leave as true for procedural sections.
- punishment: EXACT punishment clause text as written in the Act. Copy verbatim. "May extend to seven years" is NOT the same as "seven years".
- ingredients: Array of specific legal elements prosecution must independently prove. Be precise. Example for theft: ["dishonest intention", "moveable property", "out of possession of any person", "without that person's consent", "moves that property"]. For non-offence sections, list key conditions/requirements.
- keywords: 5-8 search terms including: legal term, common name, layman term, section reference. Example: ["murder", "homicide", "killing", "culpable homicide", "Section 101 BNS", "death penalty"]
- chapterNumber: Chapter number this section belongs to (roman numeral or number as it appears)
- exceptions: VERBATIM text of each Exception. If Exception 1, 2, 3 exist — include each completely. If none, use empty array [].
- explanation: VERBATIM text of all Explanations and Illustrations. If none, use empty string "".
- ipcEquivalent: Old IPC section number if identifiable (e.g., "302"). If unknown, use "".

ACCURACY RULES:
1. ONLY extract text that EXISTS in the source. If you cannot see the full section text, extract what you see — do NOT fabricate the rest.
2. NEVER invent definitions, punishments, or section text. Empty string is better than wrong data.
3. Each section number must appear EXACTLY ONCE in your output.
4. The description must be the ACTUAL Act text, not your interpretation of it.
5. If a section continues beyond this text chunk (is cut off), extract what you have and note it's partial.

Return JSON: { "sections": [ ... ] }

TEXT:
${chunk}`;

// ─── BNSS EXTRACTION ────────────────────────────────────

const BNSS_PROMPT = (chunk: string) => `CONTEXT: You are building a legal database for Indian criminal defense lawyers. This data will be used in court proceedings. Accuracy is critical — lawyers will rely on this to cite procedural provisions before judges. A wrong section reference or misquoted provision can result in case dismissal.

SOURCE: Official text of the Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 — the criminal procedure code. Ignore Hindi/Devanagari formatting.

TASK: Extract ALL sections from the following text chunk.

CRITICAL SECTIONS for defense lawyers (extract with extra care):
- BAIL provisions (regular bail, anticipatory bail, default bail)
- ARREST powers and safeguards
- FIR registration procedure
- CHARGE framing
- TRIAL procedure
- APPEAL and REVISION provisions

For EACH section, extract:
- sectionNumber: Exact section/clause number as printed. Do NOT renumber.
- title: Full section title/marginal heading
- description: VERBATIM statutory text — word-for-word from the Act. ALL sub-sections, provisos, clauses. Do NOT paraphrase.
- summary: 2-3 sentence plain-English explanation for lawyer quick reference
- offenceType: "cognizable" if section relates to cognizable offence powers, otherwise "non-cognizable"
- bailable: true (BNSS is procedural) unless section specifically deals with non-bailable offence procedures
- punishment: Exact punishment text if prescribed, otherwise ""
- ingredients: Key conditions/requirements/procedures. For bail sections: list EACH condition for granting/refusing bail separately. Be thorough.
- keywords: 5-8 search terms including section reference (e.g., ["anticipatory bail", "pre-arrest bail", "Section 482 BNSS", "apprehension of arrest"])
- exceptions: VERBATIM text of exceptions/provisos. Empty array [] if none.
- explanation: VERBATIM text of explanations. Empty string "" if none.

ACCURACY: Extract ONLY what exists in the text. NEVER fabricate provisions. Empty string > wrong data.

Return JSON: { "sections": [ ... ] }

TEXT:
${chunk}`;

// ─── BSA EXTRACTION ─────────────────────────────────────

const BSA_PROMPT = (chunk: string) => `CONTEXT: You are building a legal database for Indian criminal defense lawyers. This data will be used to challenge evidence admissibility in court. A wrong provision reference can result in critical evidence being admitted or excluded incorrectly.

SOURCE: Official text of the Bharatiya Sakshya Adhiniyam (BSA), 2023 — the evidence law. Ignore Hindi/Devanagari formatting.

TASK: Extract ALL sections from the following text chunk.

CRITICAL SECTIONS for defense lawyers (extract with extra care):
- ELECTRONIC EVIDENCE admissibility (Sections 61-65)
- CONFESSIONS and admissions
- DYING DECLARATIONS
- BURDEN OF PROOF
- EXPERT OPINION
- EXAMINATION OF WITNESSES

For EACH section, extract:
- sectionNumber: Exact section number as printed. Do NOT renumber.
- title: Full section title/marginal heading
- description: VERBATIM statutory text — word-for-word from the Act. ALL sub-sections, provisos, illustrations. Do NOT paraphrase.
- summary: 2-3 sentence plain-English explanation for lawyer quick reference
- offenceType: "non-cognizable" (BSA is about evidence rules, not offences)
- bailable: true
- punishment: Exact punishment text if prescribed, otherwise ""
- ingredients: Key rules, conditions, requirements of this evidence provision. List each separately.
- keywords: 5-8 search terms including section reference (e.g., ["electronic evidence", "digital record", "Section 63 BSA", "computer output"])
- exceptions: VERBATIM text of exceptions. Empty array [] if none.
- explanation: VERBATIM text of explanations and illustrations. Empty string "" if none.

ACCURACY: Extract ONLY what exists in the text. NEVER fabricate provisions. Empty string > wrong data.

Return JSON: { "sections": [ ... ] }

TEXT:
${chunk}`;

// ─── IPC TO BNS MAPPING EXTRACTION ─────────────────────

const IPC_MAPPING_PROMPT = (chunk: string) => `From the following BNS text, extract ALL IPC-to-BNS section mappings mentioned. The text contains footnotes and comparisons like "Section 302, IPC, 1860" next to BNS sections.

For each mapping found, extract:
- ipcSection: the IPC section number (just the number, e.g., "302")
- ipcTitle: brief title of the IPC section
- bnsSection: the corresponding BNS section number
- bnsTitle: title of the BNS section
- changeType: "renamed" | "modified" | "merged" | "split" | "new" | "repealed"
- notes: brief note about what changed (if any)

Return JSON: { "mappings": [ ... ] }

Only include mappings you are confident about. Do not duplicate.

TEXT:
${chunk}`;

// ─── MAIN EXTRACTION PIPELINE ───────────────────────────

async function extractAct(
  fileName: string,
  actName: string,
  promptFn: (chunk: string) => string,
  outputFile: string
): Promise<ExtractedSection[]> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Extracting ${actName} from ${fileName}`);
  console.log(`${"=".repeat(60)}`);

  const text = await extractPdfText(fileName);
  console.log(`  PDF text: ${text.length} chars`);

  const chunks = splitTextIntoChunks(text, 8000);
  console.log(`  Split into ${chunks.length} chunks`);

  const allSections: ExtractedSection[] = [];

  // Check for existing progress
  const progressFile = join(DATA_DIR, `${outputFile}.progress.json`);
  let startChunk = 0;
  if (existsSync(progressFile)) {
    const progress = JSON.parse(readFileSync(progressFile, "utf-8"));
    allSections.push(...progress.sections);
    startChunk = progress.lastChunk + 1;
    console.log(`  Resuming from chunk ${startChunk} (${allSections.length} sections already extracted)`);
  }

  // Use global CONCURRENCY constant for free-tier rate limits

  for (let i = startChunk; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, Math.min(i + CONCURRENCY, chunks.length));
    const batchIndices = batch.map((_, idx) => i + idx);

    console.log(`  Processing chunks ${i + 1}-${Math.min(i + CONCURRENCY, chunks.length)}/${chunks.length} (${CONCURRENCY} parallel)...`);

    const results = await Promise.allSettled(
      batch.map(async (chunk, idx) => {
        const chunkIndex = batchIndices[idx]!;
        try {
          const raw = await callLLM(promptFn(chunk));
          const parsed = JSON.parse(raw);
          return { index: chunkIndex, sections: parsed.sections || [] };
        } catch (err: any) {
          console.error(`    Chunk ${chunkIndex + 1} failed: ${err.message}`);
          return { index: chunkIndex, sections: [], error: err.message };
        }
      })
    );

    // Collect results
    for (const result of results) {
      if (result.status === "fulfilled" && result.value.sections.length > 0) {
        allSections.push(...result.value.sections);
        console.log(`    Chunk ${result.value.index + 1}: ${result.value.sections.length} sections`);
      }
    }

    console.log(`    Batch done. Total sections: ${allSections.length}`);

    // Save progress after each batch
    saveJson(progressFile, { lastChunk: Math.min(i + CONCURRENCY - 1, chunks.length - 1), sections: allSections });

    // Retry failed chunks sequentially
    const failed = results.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && (r.value as any).error)
    );
    if (failed.length > 0) {
      console.log(`    Retrying ${failed.length} failed chunks...`);
      await sleep(5000);
      for (const f of failed) {
        const idx = f.status === "fulfilled" ? (f.value as any).index : 0;
        if (idx >= 0 && idx < chunks.length) {
          try {
            const raw = await callLLM(promptFn(chunks[idx]!));
            const parsed = JSON.parse(raw);
            if (parsed.sections?.length > 0) {
              allSections.push(...parsed.sections);
              console.log(`      Retry chunk ${idx + 1}: ${parsed.sections.length} sections`);
            }
            await sleep(DELAY_BETWEEN_REQUESTS_MS);
          } catch {
            console.log(`      Retry chunk ${idx + 1} failed again, skipping`);
          }
        }
      }
    }

    // Pause between batches for free-tier rate limits
    if (i + CONCURRENCY < chunks.length) {
      await sleep(DELAY_BETWEEN_REQUESTS_MS * CONCURRENCY);
    }
  }

  // Deduplicate and sort
  const deduped = mergeAndDedupe(allSections);
  console.log(`  Final: ${deduped.length} unique sections`);

  // ─── QUALITY CHECK: find sections with thin descriptions ───
  const thinSections = deduped.filter(
    (s) => s.description && s.description.length < 100 && !["1", "2", "3"].includes(s.sectionNumber)
  );

  if (thinSections.length > 0) {
    console.log(`\n  ⚠️  ${thinSections.length} sections have thin descriptions (<100 chars). Re-extracting in parallel...`);

    const fullText = await extractPdfText(fileName);
    const RE_CONCURRENCY = CONCURRENCY;

    // Build re-extraction tasks
    const reExtractTasks = thinSections.map((thin) => {
      const sectionNum = thin.sectionNumber;
      const sectionRegex = new RegExp(`${sectionNum}\\.\\s+[A-Z]`, "g");
      const match = sectionRegex.exec(fullText);

      if (!match) return null;

      const start = Math.max(0, match.index - 200);
      const end = Math.min(fullText.length, match.index + 4000);
      const sectionContext = fullText.slice(start, end);

      return {
        sectionNum,
        oldLen: thin.description.length,
        prompt: `Extract ONLY Section ${sectionNum} from the following text. Return its COMPLETE and FULL legal text as the description. Include ALL sub-sections, clauses, provisos, explanations, and illustrations word-for-word. Do NOT summarize. Also include a "summary" field with a 2-3 sentence plain English summary.

Return JSON: { "sections": [{ "sectionNumber": "${sectionNum}", "title": "...", "description": "FULL COMPLETE TEXT", "summary": "2-3 sentence summary", "offenceType": "...", "bailable": true/false, "punishment": "...", "ingredients": [...], "keywords": [...], "exceptions": [...], "explanation": "..." }] }

TEXT:
${sectionContext}`,
      };
    }).filter(Boolean) as { sectionNum: string; oldLen: number; prompt: string }[];

    // Process in parallel batches
    for (let i = 0; i < reExtractTasks.length; i += RE_CONCURRENCY) {
      const batch = reExtractTasks.slice(i, i + RE_CONCURRENCY);
      console.log(`    Re-extracting batch ${Math.floor(i / RE_CONCURRENCY) + 1}/${Math.ceil(reExtractTasks.length / RE_CONCURRENCY)} (${batch.length} sections)...`);

      const results = await Promise.allSettled(
        batch.map(async (task) => {
          const raw = await callLLM(task.prompt);
          const parsed = JSON.parse(raw);
          return { sectionNum: task.sectionNum, oldLen: task.oldLen, extracted: parsed.sections?.[0] };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value.extracted) {
          const { sectionNum, oldLen, extracted } = result.value;
          if (extracted.description && extracted.description.length > oldLen) {
            const idx = deduped.findIndex((s) => s.sectionNumber === sectionNum);
            if (idx >= 0) {
              deduped[idx] = { ...deduped[idx]!, ...extracted, sectionNumber: sectionNum };
              console.log(`      ✅ Section ${sectionNum}: ${oldLen} → ${extracted.description.length} chars`);
            }
          }
        }
      }

      if (i + RE_CONCURRENCY < reExtractTasks.length) await sleep(DELAY_BETWEEN_REQUESTS_MS * RE_CONCURRENCY);
    }
  }

  // Stamp source reference on every section
  const SOURCE_REFS: Record<string, string> = {
    "bns.json": "Bharatiya Nyaya Sanhita, 2023 (No. 45 of 2023), Gazette of India Extraordinary Part II Sec. 1, 25th December 2023",
    "bnss.json": "Bharatiya Nagarik Suraksha Sanhita, 2023 (No. 46 of 2023), Gazette of India Extraordinary Part II Sec. 1, 25th December 2023",
    "bsa.json": "Bharatiya Sakshya Adhiniyam, 2023 (No. 47 of 2023), Gazette of India Extraordinary Part II Sec. 1, 25th December 2023",
  };
  const sourceRef = SOURCE_REFS[outputFile] || actName;
  for (const s of deduped) {
    const page = findPageForSection(fileName, s.sectionNumber);
    s.pageNumber = page;
    s.sourceFile = fileName;
    s.sourceReference = page
      ? `${sourceRef}, Section ${s.sectionNumber}, Page ${page}`
      : `${sourceRef}, Section ${s.sectionNumber}`;
  }

  // Final stats
  const avgDescLen = Math.round(deduped.reduce((sum, s) => sum + (s.description?.length || 0), 0) / deduped.length);
  const shortCount = deduped.filter((s) => (s.description?.length || 0) < 100).length;
  const longCount = deduped.filter((s) => (s.description?.length || 0) > 500).length;
  console.log(`  📊 Description stats: avg=${avgDescLen} chars | <100 chars: ${shortCount} | >500 chars: ${longCount}`);

  // Save final output
  const outPath = join(DATA_DIR, "statutes", outputFile);
  saveJson(outPath, deduped);

  // Clean up progress file
  if (existsSync(progressFile)) {
    const { unlinkSync } = await import("fs");
    unlinkSync(progressFile);
  }

  return deduped;
}

async function extractIPCMappings() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("Extracting IPC-to-BNS mappings");
  console.log(`${"=".repeat(60)}`);

  const text = await extractPdfText("BNS Book_After Correction.pdf");
  const chunks = splitTextIntoChunks(text, 8000);
  console.log(`  Processing ${chunks.length} chunks for IPC mappings...`);

  const allMappings: any[] = [];
  // Use global CONCURRENCY

  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, Math.min(i + CONCURRENCY, chunks.length));
    console.log(`  Chunks ${i + 1}-${Math.min(i + CONCURRENCY, chunks.length)}/${chunks.length} (${batch.length} parallel)...`);

    const results = await Promise.allSettled(
      batch.map(async (chunk) => {
        const raw = await callLLM(IPC_MAPPING_PROMPT(chunk));
        const parsed = JSON.parse(raw);
        return parsed.mappings || [];
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.length > 0) {
        allMappings.push(...result.value);
      }
    }

    console.log(`    Batch done. Total mappings: ${allMappings.length}`);

    if (i + CONCURRENCY < chunks.length) {
      await sleep(DELAY_BETWEEN_REQUESTS_MS * CONCURRENCY);
    }
  }

  // Deduplicate by IPC section
  const seen = new Map<string, any>();
  for (const m of allMappings) {
    const key = String(m.ipcSection);
    if (!seen.has(key)) seen.set(key, m);
  }
  const deduped = Array.from(seen.values()).sort((a, b) => {
    const numA = parseInt(a.ipcSection) || 0;
    const numB = parseInt(b.ipcSection) || 0;
    return numA - numB;
  });

  console.log(`  Final: ${deduped.length} unique IPC-to-BNS mappings`);

  const outPath = join(DATA_DIR, "mapper", "ipc-to-bns.json");
  saveJson(outPath, deduped);
}

// ─── MAIN ───────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  LexiMini — Legal Data Extraction Pipeline  ║");
  console.log("╚══════════════════════════════════════════════╝");

  if (!process.env.GROQ_API_KEY) {
    console.error("\nERROR: GROQ_API_KEY not set in .env");
    console.error("Get a free key at https://console.groq.com/keys");
    process.exit(1);
  }

  // 1. Extract BNS (main criminal law — bare Act from Gazette)
  // Skip if already extracted (334 sections)
  const existingBns = existsSync(join(DATA_DIR, "statutes", "bns.json"))
    ? JSON.parse(readFileSync(join(DATA_DIR, "statutes", "bns.json"), "utf-8"))
    : [];
  if (existingBns.length > 300) {
    console.log(`\n  BNS already extracted: ${existingBns.length} sections — skipping`);
  } else {
    await extractAct(
      "250883_english_01042024.pdf",
      "Bharatiya Nyaya Sanhita (BNS)",
      BNS_PROMPT,
      "bns.json"
    );
  }

  // 2. Extract BNSS (criminal procedure)
  await extractAct(
    "Bharatiya_Nagarik_Suraksha_Sanhita,_2023.pdf",
    "Bharatiya Nagarik Suraksha Sanhita (BNSS)",
    BNSS_PROMPT,
    "bnss.json"
  );

  // 3. Extract BSA (evidence law)
  await extractAct(
    "250882_english_01042024_0.pdf",
    "Bharatiya Sakshya Adhiniyam (BSA)",
    BSA_PROMPT,
    "bsa.json"
  );

  // 4. Extract IPC-to-BNS mappings from BNS handbook (has comparison data)
  await extractIPCMappings();

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  Extraction complete!                        ║");
  console.log("║                                              ║");
  console.log("║  Next steps:                                 ║");
  console.log("║  1. Review the JSON files in src/data/       ║");
  console.log("║  2. Run: npm run ingest:statutes             ║");
  console.log("║     (loads into Postgres + generates vectors)║");
  console.log("╚══════════════════════════════════════════════╝");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
