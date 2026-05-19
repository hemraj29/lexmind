import { domainRegistry } from "../core/domain-registry.js";
import { openaiService } from "../services/openai.service.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("agent:domain-router");

/**
 * Routes a user query to one or more legal domains.
 *
 * Strategy:
 *   1. Cheap rule-based match against domain.routingHints (keywords/patterns)
 *   2. Section-reference based match (e.g., "BNS 303" → criminal)
 *   3. LLM fallback if rule-based gives nothing
 */
class DomainRouterAgent {
  async route(
    query: string,
    context?: { sectionsRaw?: string[]; documents?: { docType?: string }[] }
  ): Promise<string[]> {
    // 1. Rule-based by keywords
    const keywordMatch = domainRegistry.classifyByHints(query);
    if (keywordMatch) {
      log.debug({ query: query.slice(0, 60), domain: keywordMatch.code, via: "keyword" }, "Routed");
      return [keywordMatch.code];
    }

    // 2. Section-reference based
    if (context?.sectionsRaw && context.sectionsRaw.length > 0) {
      const matched = domainRegistry.classifyByActReference(context.sectionsRaw);
      if (matched.length > 0) {
        const codes = matched.map((d) => d.code);
        log.debug({ query: query.slice(0, 60), domains: codes, via: "section_refs" }, "Routed");
        return codes;
      }
    }

    // 3. LLM fallback
    return this.llmClassify(query);
  }

  private async llmClassify(query: string): Promise<string[]> {
    const allDomains = domainRegistry.all();
    if (allDomains.length === 0) return ["criminal"]; // fallback

    const prompt = `Classify this legal query into one or more legal practice domains.

Query: "${query}"

Available domains:
${allDomains.map((d) => `- ${d.code}: ${d.description}`).join("\n")}

Return JSON: { "domains": ["code1", "code2"] }  (1-3 domains, most relevant first)`;

    try {
      const result = await openaiService.chatJSON<{ domains: string[] }>(
        [{ role: "user", content: prompt }],
        { temperature: 0, maxTokens: 200 }
      );
      const valid = result.domains.filter((c) => domainRegistry.get(c));
      if (valid.length > 0) return valid;
    } catch (err) {
      log.warn({ err }, "LLM classification failed, falling back to default");
    }

    // Default fallback if everything fails
    return [allDomains[0]!.code];
  }
}

export const domainRouterAgent = new DomainRouterAgent();
