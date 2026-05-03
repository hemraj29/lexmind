import { openaiService } from "../services/openai.service.js";
import { createChildLogger } from "../utils/logger.js";
import type { CaseContext } from "../types/strategy.types.js";
import type { CaseAnalysis, BailProspectAnalysis } from "../types/strategy.types.js";
import type { CaseWithDocuments } from "../types/case.types.js";

const log = createChildLogger("agent:strategy-advisor");

class StrategyAdvisorAgent {
  async analyzeCase(context: CaseContext): Promise<CaseAnalysis> {
    log.info({ caseId: context.caseId, docCount: context.documents.length }, "Running full case analysis");

    const caseContextStr = this.buildContextString(context);

    const prompt = `You are a senior Indian criminal defense lawyer analyzing a case for defense strategy.

${caseContextStr}

TASK: Provide a comprehensive defense analysis as JSON:

{
  "strengths": [
    { "point": "...", "basis": "Which document/section this comes from", "significance": "high|medium|low" }
  ],
  "weaknesses": [
    { "point": "...", "basis": "...", "significance": "high|medium|low" }
  ],
  "prosecutionArguments": [
    { "prosecutionArgument": "What they will argue", "counterStrategy": "How to counter it", "supportingLaw": "Cite section or case law" }
  ],
  "defenseStrategy": {
    "primaryStrategy": "The main defense approach",
    "alternativeStrategies": ["Backup strategy 1", ...],
    "timeline": "Recommended sequence of actions",
    "risks": ["Risk 1", ...]
  },
  "recommendedPetitions": [
    { "type": "regular_bail|anticipatory_bail|default_bail|quashing_petition|discharge_application|criminal_appeal", "priority": 1, "reasoning": "Why file this", "prerequisites": ["What's needed first"], "estimatedSuccess": "high|medium|low" }
  ],
  "bailProspect": {
    "overall": "likely|uncertain|unlikely",
    "favorableFactors": ["Factor 1", ...],
    "adverseFactors": ["Factor 1", ...],
    "recommendation": "Specific bail recommendation"
  },
  "missingInfo": ["What information the lawyer should still gather"]
}

CRITICAL RULES:
1. ONLY reference sections and case law from the APPLICABLE SECTIONS and PRECEDENTS provided
2. Base ALL analysis on the actual case documents — do not invent facts
3. Be specific — cite document types and section numbers
4. Strengths and weaknesses must be from the DEFENSE perspective
5. recommendedPetitions should be in order of priority (1 = file first)`;

    const result = await openaiService.chatJSON<CaseAnalysis>(
      [{ role: "user", content: prompt }],
      { temperature: 0.2, maxTokens: 8192 }
    );

    log.info({
      strengths: result.strengths?.length,
      weaknesses: result.weaknesses?.length,
      petitions: result.recommendedPetitions?.length,
      bail: result.bailProspect?.overall,
    }, "Case analysis complete");

    return result;
  }

  async chat(
    message: string,
    context: CaseContext
  ): Promise<{ reply: string; metadata: { sources: { type: string; reference: string }[] } }> {
    log.info({ caseId: context.caseId, messageLen: message.length }, "Strategy chat message");

    const caseContextStr = this.buildContextString(context);
    const historyMessages = context.chatHistory.slice(-20).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const systemPrompt = `You are a senior Indian criminal defense lawyer acting as an AI legal advisor. You have access to the following case information:

${caseContextStr}

RULES:
1. Answer ONLY based on the case documents and legal data provided above
2. When citing sections, use exact section numbers from the applicable sections list
3. When citing precedents, use exact case titles and citations from the list above
4. If the lawyer shares new case information (dates, events, facts), acknowledge it and incorporate it
5. If asked to do something you cannot do (like file a petition), guide the lawyer on using @commands
6. Be practical, actionable, and specific — you are advising a practicing lawyer
7. If information is insufficient to answer, say what's missing
8. At the end of your response, include a JSON block with sources: { "sources": [{ "type": "document|section|precedent", "reference": "..." }] }

Available @commands you can suggest:
@bail — Generate Regular Bail Application
@anticipatory — Generate Anticipatory Bail
@quashing — Generate Quashing Petition
@discharge — Generate Discharge Application
@appeal — Generate Criminal Appeal
@analyze — Full case analysis
@cross_exam — Cross-examination questions`;

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: message },
    ];

    const raw = await openaiService.chat(
      messages,
      { temperature: 0.3, maxTokens: 4096 }
    );

    // Try to extract sources from the response
    let reply = raw;
    let sources: { type: string; reference: string }[] = [];

    const jsonMatch = raw.match(/\{[\s\S]*"sources"[\s\S]*\}\s*$/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        sources = parsed.sources || [];
        reply = raw.slice(0, raw.indexOf(jsonMatch[0])).trim();
      } catch {
        // Couldn't parse sources, use full reply
      }
    }

    return { reply, metadata: { sources } };
  }

  async assessBailProspects(context: CaseContext): Promise<BailProspectAnalysis> {
    const analysis = await this.analyzeCase(context);
    return analysis.bailProspect;
  }

  async generateCrossExamQuestions(
    witnessData: unknown,
    context: CaseContext
  ): Promise<string[]> {
    const caseContextStr = this.buildContextString(context);

    const prompt = `You are a senior criminal defense lawyer preparing cross-examination questions.

${caseContextStr}

WITNESS STATEMENT DATA:
${JSON.stringify(witnessData, null, 2)}

Generate 10-15 pointed cross-examination questions that:
1. Expose contradictions in the witness's statement
2. Challenge the witness's credibility
3. Establish facts favorable to the defense
4. Test the witness's knowledge of specific details
5. Create reasonable doubt

Return as JSON: { "questions": ["Question 1?", "Question 2?", ...] }`;

    const result = await openaiService.chatJSON<{ questions: string[] }>(
      [{ role: "user", content: prompt }],
      { temperature: 0.3, maxTokens: 4096 }
    );

    return result.questions || [];
  }

  async generateSummary(context: CaseContext): Promise<string> {
    const caseContextStr = this.buildContextString(context);

    const prompt = `Based on the following case information, generate a comprehensive case summary (3-5 paragraphs):

${caseContextStr}

The summary should cover: parties involved, key facts, sections charged, current status, and key observations.`;

    return openaiService.chat(
      [{ role: "user", content: prompt }],
      { temperature: 0.2, maxTokens: 2048 }
    );
  }

  async identifyMissingInfo(context: CaseContext): Promise<string[]> {
    const caseContextStr = this.buildContextString(context);

    const prompt = `You are a defense lawyer reviewing case completeness.

${caseContextStr}

What critical information is MISSING that the lawyer should gather? Consider:
- Documents not yet uploaded (chargesheet? court orders? witness statements?)
- Facts about the accused (employment, residence, family, health, prior record)
- Evidence gaps
- Procedural information (arrest date, remand dates, bail applications filed)

Return JSON: { "missingInfo": ["Item 1", "Item 2", ...] }`;

    const result = await openaiService.chatJSON<{ missingInfo: string[] }>(
      [{ role: "user", content: prompt }],
      { temperature: 0.2 }
    );

    return result.missingInfo || [];
  }

  private buildContextString(context: CaseContext): string {
    const parts: string[] = [];

    parts.push(`CASE: ${context.title}`);
    if (context.clientName) parts.push(`CLIENT: ${context.clientName}`);
    if (context.sectionsRaw.length > 0) parts.push(`SECTIONS: ${context.sectionsRaw.join(", ")}`);

    // Documents
    if (context.documents.length > 0) {
      parts.push("\n--- CASE DOCUMENTS ---");
      for (const doc of context.documents) {
        parts.push(`\n[${doc.docType.toUpperCase()}]`);
        if (doc.extractedData) {
          parts.push(JSON.stringify(doc.extractedData, null, 2));
        }
        if (doc.rawText) {
          parts.push(`Raw text excerpt: ${doc.rawText.slice(0, 1000)}`);
        }
      }
    }

    // Applicable sections
    if (context.applicableSections.length > 0) {
      parts.push("\n--- APPLICABLE SECTIONS ---");
      for (const s of context.applicableSections) {
        parts.push(`${s.act} Section ${s.sectionNumber} — ${s.title} | Bailable: ${s.bailable} | Punishment: ${s.punishment}`);
        if (s.ingredients.length > 0) {
          parts.push(`  Ingredients: ${s.ingredients.join("; ")}`);
        }
      }
    }

    // Precedents
    if (context.precedents.length > 0) {
      parts.push("\n--- RELEVANT PRECEDENTS ---");
      for (const p of context.precedents) {
        parts.push(`${p.caseTitle} (${p.citation}): ${p.ratio}`);
      }
    }

    return parts.join("\n");
  }
}

export const strategyAdvisorAgent = new StrategyAdvisorAgent();
