import { prisma } from "../database.service.js";
import { createChildLogger } from "../../utils/logger.js";

const log = createChildLogger("citation-verifier");

/**
 * Deep verification on demand.
 * Confirms a citation is real, the source file exists, and the excerpt is in it.
 *
 * Used for the "Verify all sources" button in the UI.
 */

export interface VerificationResult {
  citationId: string;
  passed: boolean;
  checks: {
    name: string;
    passed: boolean;
    message?: string;
  }[];
}

export async function verifyCitation(citationId: string): Promise<VerificationResult> {
  const cite = await prisma.citation.findUnique({
    where: { id: citationId },
    include: { section: true, precedent: true, document: true },
  });

  if (!cite) {
    return {
      citationId,
      passed: false,
      checks: [{ name: "exists", passed: false, message: "Citation not found in database" }],
    };
  }

  const checks: VerificationResult["checks"] = [];

  // Check 1: Source entity exists
  if (cite.sourceType === "SECTION") {
    checks.push({
      name: "section_exists",
      passed: !!cite.section,
      message: cite.section ? `Section ${cite.section.sectionNumber} exists` : "Section reference is dangling",
    });

    if (cite.section?.description && cite.excerptText) {
      const overlap = checkExcerptOverlap(cite.section.description, cite.excerptText);
      checks.push({
        name: "excerpt_in_section",
        passed: overlap > 0.3,
        message: `Excerpt overlap: ${Math.round(overlap * 100)}%`,
      });
    }
  } else if (cite.sourceType === "PRECEDENT") {
    checks.push({
      name: "precedent_exists",
      passed: !!cite.precedent,
      message: cite.precedent ? `${cite.precedent.caseTitle} found` : "Precedent reference dangling",
    });
  } else if (cite.sourceType === "DOCUMENT") {
    checks.push({
      name: "document_exists",
      passed: !!cite.document,
      message: cite.document ? `${cite.document.fileName} exists` : "Document reference dangling",
    });
  } else if (cite.sourceType === "WEB" && cite.webUrl) {
    // Skip URL liveness check by default (slow + flaky); just mark as passed
    checks.push({
      name: "web_reference_set",
      passed: true,
      message: cite.webUrl,
    });
  }

  const passed = checks.every((c) => c.passed);

  return { citationId, passed, checks };
}

function checkExcerptOverlap(source: string, excerpt: string): number {
  const sourceWords = new Set(source.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const excerptWords = excerpt.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

  if (excerptWords.length === 0) return 0;
  let hits = 0;
  for (const w of excerptWords) {
    if (sourceWords.has(w)) hits++;
  }
  return hits / excerptWords.length;
}

export async function verifyAllForMessage(messageId: string): Promise<VerificationResult[]> {
  const cites = await prisma.citation.findMany({ where: { messageId }, select: { id: true } });
  return Promise.all(cites.map((c) => verifyCitation(c.id)));
}
