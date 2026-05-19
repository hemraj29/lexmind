import { createChildLogger } from "../../utils/logger.js";

const log = createChildLogger("citation-validator");

/**
 * Strict validator that ensures every legal claim in AI output
 * has a corresponding [^cite_N] token AND the token is in the
 * pre-fetched availableCitations list (no hallucination).
 */

export interface ValidationResult {
  cleanedText: string;
  flagged: { sentence: string; reason: string }[];
  isValid: boolean;
  usedCitationIds: string[];
}

const LEGAL_CLAIM_PATTERNS = [
  /section\s+\d+/i,
  /under\s+(the\s+)?(bns|bnss|bsa|cpc|ipc|crpc)/i,
  /supreme\s+court\s+(held|ruled|observed)/i,
  /high\s+court\s+(held|ruled|observed)/i,
  /shall\s+be\s+(punished|punishable)/i,
  /is\s+(cognizable|non-cognizable|bailable|non-bailable)/i,
  /\(\d{4}\)\s*\d+\s*scc/i,
  /v\.\s+state\s+of\s+\w+/i,
];

const HEDGING_PATTERNS = [
  /\b(generally|usually|typically|courts\s+have)\s+(held|ruled|observed|stated)/i,
  /\bit\s+is\s+well[-\s]established\b/i,
  /\bthe\s+law\s+(states|says|provides|requires)\b/i,
];

const CONVERSATIONAL_PATTERNS = [
  /^(let\s+me\s+know|please|sure|of\s+course|i\s+can\s+help|here\s+(are|is))/i,
  /^(would\s+you\s+like|do\s+you\s+want|shall\s+i|should\s+i)/i,
  /^(based\s+on)/i,
  /^(to\s+(summarize|summarise)|in\s+(summary|conclusion))/i,
  /^(type\s+@)/i,
];

export function validateCitations(text: string, availableCitationIds: Set<string>): ValidationResult {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const flagged: { sentence: string; reason: string }[] = [];
  const cleanedSentences: string[] = [];
  const usedCitationIds = new Set<string>();

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;

    if (CONVERSATIONAL_PATTERNS.some((p) => p.test(sentence))) {
      cleanedSentences.push(sentence);
      continue;
    }

    if (sentence.startsWith("[OPINION]")) {
      cleanedSentences.push(sentence);
      continue;
    }

    const citationMatches = [...sentence.matchAll(/\[\^(cite_\d+)\]/g)];
    const sentenceCitationIds = citationMatches.map((m) => m[1]!);

    // Strip hallucinated cite_X
    const invalid = sentenceCitationIds.filter((id) => !availableCitationIds.has(id));
    let cleanedSentence = sentence;
    if (invalid.length > 0) {
      for (const bad of invalid) {
        cleanedSentence = cleanedSentence.replaceAll(`[^${bad}]`, "");
      }
      flagged.push({ sentence, reason: `Hallucinated citation IDs: ${invalid.join(", ")}` });
    }

    const validIds = sentenceCitationIds.filter((id) => availableCitationIds.has(id));
    validIds.forEach((id) => usedCitationIds.add(id));

    const hasLegalClaim = LEGAL_CLAIM_PATTERNS.some((p) => p.test(cleanedSentence));
    const hasHedging = HEDGING_PATTERNS.some((p) => p.test(cleanedSentence));

    if ((hasLegalClaim || hasHedging) && validIds.length === 0) {
      // Drop the sentence — unsupported legal claim
      flagged.push({ sentence: cleanedSentence, reason: "Legal claim without citation" });
      continue;
    }

    cleanedSentences.push(cleanedSentence);
  }

  if (flagged.length > 0) {
    log.warn({ flaggedCount: flagged.length, samples: flagged.slice(0, 3) }, "Citation validation removed claims");
  }

  return {
    cleanedText: cleanedSentences.join(" ").trim(),
    flagged,
    isValid: flagged.length === 0,
    usedCitationIds: Array.from(usedCitationIds),
  };
}
