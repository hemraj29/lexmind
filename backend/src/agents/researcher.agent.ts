import { openaiService } from "../services/openai.service.js";
import { hybridSearchService } from "../services/hybrid-search.service.js";
import {
  vectorSearchPrecedents,
  findIPCMapping,
  prisma,
} from "../services/database.service.js";
import { createChildLogger } from "../utils/logger.js";
import type { ExtractedFIR } from "../types/fir.types.js";
import type {
  LegalMemo,
  StatuteSection,
  IPCToBNSMapping,
  CasePrecedent,
  BailabilityStatus,
} from "../types/legal.types.js";

const log = createChildLogger("agent:researcher");

const IPC_PATTERN = /(?:ipc|indian penal code)\s*(?:section|sec\.?)?\s*(\d+[a-z]?)/gi;

class ResearcherAgent {
  async research(fir: ExtractedFIR): Promise<LegalMemo> {
    log.info({ firNumber: fir.firNumber, sections: fir.sectionsRaw }, "Starting legal research");

    // Step 1: Map any IPC references to BNS using Postgres
    const mappedSections = await this.mapIPCToBNS(fir.sectionsRaw);

    // Step 2: Search for applicable sections via hybrid RAG (pgvector + BM25)
    const searchResults = await this.searchApplicableSections(fir);

    // Step 3: Merge + deduplicate
    const allSections = this.deduplicateSections(searchResults);

    // Step 4: Fetch relevant precedents from Postgres (pgvector)
    const precedents = await this.fetchPrecedents(fir.briefFacts, allSections);

    // Step 5: Synthesize the legal memo via GPT-4o
    const memo = await this.synthesizeMemo(fir, allSections, mappedSections, precedents);

    // Step 6: Validate — no hallucinated sections
    this.validateMemo(memo, allSections);

    log.info(
      {
        applicableSections: memo.applicableSections.length,
        precedents: memo.precedents.length,
        bailability: memo.bailability,
      },
      "Legal research complete"
    );

    return memo;
  }

  private async mapIPCToBNS(sectionsRaw: string[]): Promise<IPCToBNSMapping[]> {
    const mapped: IPCToBNSMapping[] = [];

    for (const sectionRef of sectionsRaw) {
      IPC_PATTERN.lastIndex = 0;
      const match = IPC_PATTERN.exec(sectionRef);
      if (!match) continue;

      const ipcNum = match[1]!;
      const mapping = await findIPCMapping(ipcNum);

      if (mapping) {
        mapped.push({
          ipcSection: mapping.ipcSection,
          ipcTitle: mapping.ipcTitle,
          bnsSection: mapping.bnsSection,
          bnsTitle: mapping.bnsTitle,
          notes: mapping.notes ?? undefined,
        });
        log.info({ ipc: ipcNum, bns: mapping.bnsSection }, "IPC -> BNS mapping found");
      }
    }

    return mapped;
  }

  private async searchApplicableSections(fir: ExtractedFIR): Promise<StatuteSection[]> {
    // Search using brief facts for semantic relevance
    const factsResults = await hybridSearchService.search({
      query: fir.briefFacts,
      topK: 5,
      includeRerank: true,
    });

    // Also search for explicitly mentioned sections
    const explicitResults: StatuteSection[] = [];
    for (const sectionRef of fir.sectionsRaw) {
      const results = await hybridSearchService.search({
        query: sectionRef,
        topK: 1,
        includeRerank: false,
      });
      if (results.length > 0) {
        explicitResults.push(results[0]!.section);
      }
    }

    return [...explicitResults, ...factsResults.map((r) => r.section)];
  }

  private deduplicateSections(sections: StatuteSection[]): StatuteSection[] {
    const seen = new Map<string, StatuteSection>();
    for (const s of sections) {
      if (!seen.has(s.id)) seen.set(s.id, s);
    }
    return Array.from(seen.values());
  }

  private async fetchPrecedents(
    briefFacts: string,
    sections: StatuteSection[]
  ): Promise<CasePrecedent[]> {
    try {
      const sectionContext = sections
        .map((s) => `${s.act} Section ${s.sectionNumber} (${s.title})`)
        .join(", ");
      const query = `Bail precedent for: ${sectionContext}. Facts: ${briefFacts.slice(0, 500)}`;

      const embedding = await openaiService.embed(query);
      const matches = await vectorSearchPrecedents(embedding, 5, true);

      return matches.map((m) => ({
        caseTitle: m.case_title,
        citation: m.citation,
        relevance: m.summary,
        ratio: m.ratio,
      }));
    } catch (err) {
      log.warn({ err }, "Failed to fetch precedents, continuing without them");
      return [];
    }
  }

  private async synthesizeMemo(
    fir: ExtractedFIR,
    sections: StatuteSection[],
    mappedSections: IPCToBNSMapping[],
    precedents: CasePrecedent[]
  ): Promise<LegalMemo> {
    const sectionsContext = sections
      .map(
        (s) =>
          `${s.act} Section ${s.sectionNumber} - ${s.title}\nDescription: ${s.description}\nPunishment: ${s.punishment}\nBailable: ${s.bailable}\nIngredients: ${s.ingredients.join("; ")}`
      )
      .join("\n\n");

    const precedentsContext =
      precedents.length > 0
        ? precedents.map((p) => `${p.caseTitle} (${p.citation}): ${p.ratio}`).join("\n")
        : "No specific precedents found.";

    const prompt = `You are a senior Indian criminal lawyer preparing a legal research memo for a bail application.

FIR FACTS:
${fir.briefFacts}

SECTIONS INVOLVED:
${sectionsContext}

IPC TO BNS MAPPINGS:
${mappedSections.map((m) => `IPC ${m.ipcSection} (${m.ipcTitle}) -> BNS ${m.bnsSection} (${m.bnsTitle})`).join("\n") || "None"}

RELEVANT PRECEDENTS:
${precedentsContext}

TASK: Generate a structured legal research memo as JSON:

{
  "ingredients": [
    { "section": "BNS 101", "elements": ["element 1 prosecution must prove", "element 2", ...] }
  ],
  "bailability": "bailable" | "non-bailable" | "mixed",
  "riskAssessment": "Brief assessment of bail prospects based on facts and sections"
}

CRITICAL RULES:
1. ONLY reference sections from SECTIONS INVOLVED above
2. ONLY reference precedents from RELEVANT PRECEDENTS above
3. Do NOT invent any case laws, citations, or sections
4. The ingredients must be specific legal elements prosecution needs to prove`;

    const result = await openaiService.chatJSON<{
      ingredients: { section: string; elements: string[] }[];
      bailability: BailabilityStatus;
      riskAssessment: string;
    }>([{ role: "user", content: prompt }], { temperature: 0.1, maxTokens: 4096 });

    // Build the final memo with actual data from DB, not LLM hallucinations
    return {
      applicableSections: sections,
      mappedSections,
      ingredients: result.ingredients,
      precedents,
      bailability: this.determineBailability(sections),
      riskAssessment: result.riskAssessment,
    };
  }

  private determineBailability(sections: StatuteSection[]): BailabilityStatus {
    if (sections.length === 0) return "bailable";
    const hasBailable = sections.some((s) => s.bailable);
    const hasNonBailable = sections.some((s) => !s.bailable);
    if (hasBailable && hasNonBailable) return "mixed";
    return hasBailable ? "bailable" : "non-bailable";
  }

  private validateMemo(memo: LegalMemo, knownSections: StatuteSection[]): void {
    const knownIds = new Set(knownSections.map((s) => s.id));
    memo.applicableSections = memo.applicableSections.filter((s) => knownIds.has(s.id));
  }
}

export const researcherAgent = new ResearcherAgent();
