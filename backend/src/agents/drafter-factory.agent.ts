import { drafterRegistry } from "../core/drafter-registry.js";
import { domainRegistry } from "../core/domain-registry.js";
import { createChildLogger } from "../utils/logger.js";
import type { CaseWithDocuments } from "../types/case.types.js";
import type { LegalMemo } from "../types/legal.types.js";

const log = createChildLogger("agent:drafter-factory");

export interface DraftResult {
  markdown: string;
  sections: Record<string, unknown>;
  docxBuffer: Buffer;
  citationIds?: string[];
}

/**
 * DrafterFactory — registry-driven dispatcher.
 *
 * No more hardcoded switches. Looks up the right plugin by:
 *   1. Generation type code (e.g., "regular_bail")
 *   2. Optional domain hint (defaults to first matching domain)
 */
class DrafterFactory {
  async draft(
    documentTypeCode: string,
    caseData: CaseWithDocuments,
    memo: LegalMemo,
    options: { domainCode?: string; citations?: any[] } = {}
  ): Promise<DraftResult> {
    log.info({ type: documentTypeCode, caseId: caseData.id, domain: options.domainCode }, "Drafting document");

    // Find the right drafter via the registry
    let drafter = options.domainCode
      ? drafterRegistry.getByDocumentTypeCode(options.domainCode, documentTypeCode)
      : null;

    if (!drafter) {
      // Try any domain that has a drafter for this document type
      for (const domain of domainRegistry.all()) {
        const candidate = drafterRegistry.getByDocumentTypeCode(domain.code, documentTypeCode);
        if (candidate) {
          drafter = candidate;
          break;
        }
      }
    }

    if (!drafter) {
      // Fall back to id pattern match
      const allDrafters = drafterRegistry.all();
      drafter = allDrafters.find((d) => d.documentTypeCode === documentTypeCode) || null;
    }

    if (!drafter) {
      throw new Error(
        `No drafter registered for document type "${documentTypeCode}". ` +
          `Available: ${drafterRegistry.all().map((d) => d.id).join(", ")}`
      );
    }

    const result = await drafter.draft({
      caseData,
      memo,
      citations: options.citations,
    });

    return {
      markdown: result.markdown,
      sections: result.sections,
      docxBuffer: result.docxBuffer,
      citationIds: result.citationIds,
    };
  }

  listAvailable(): string[] {
    return drafterRegistry.all().map((d) => d.id);
  }
}

export const drafterFactory = new DrafterFactory();
