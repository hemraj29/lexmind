import { readdirSync, existsSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { createChildLogger } from "../utils/logger.js";
import type { DomainPlugin } from "./plugin.types.js";

const log = createChildLogger("domain-registry");

class DomainRegistry {
  private domains = new Map<string, DomainPlugin>();
  private loaded = false;

  async loadAll(): Promise<void> {
    if (this.loaded) return;

    const domainsDir = join(process.cwd(), "src", "domains");
    if (!existsSync(domainsDir)) {
      log.warn({ domainsDir }, "domains/ directory not found, skipping plugin discovery");
      this.loaded = true;
      return;
    }

    const entries = readdirSync(domainsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith("_")) continue; // skip _template

      const configPath = join(domainsDir, entry.name, "domain.config.ts");
      if (!existsSync(configPath)) {
        log.debug({ folder: entry.name }, "No domain.config.ts, skipping");
        continue;
      }

      try {
        const moduleUrl = pathToFileURL(configPath).href;
        const mod = await import(moduleUrl);
        const plugin = this.findDomainExport(mod);

        if (plugin) {
          this.domains.set(plugin.code, plugin);
          log.info({ code: plugin.code, name: plugin.name }, "Domain plugin loaded");
        } else {
          log.warn({ folder: entry.name }, "domain.config.ts has no exported DomainPlugin");
        }
      } catch (err: any) {
        log.error({ folder: entry.name, err: err.message }, "Failed to load domain plugin");
      }
    }

    this.loaded = true;
    log.info({ count: this.domains.size }, "Domain registry ready");
  }

  private findDomainExport(mod: Record<string, unknown>): DomainPlugin | undefined {
    for (const v of Object.values(mod)) {
      if (
        v &&
        typeof v === "object" &&
        "code" in v &&
        "documentTypes" in v &&
        "routingHints" in v
      ) {
        return v as DomainPlugin;
      }
    }
    return undefined;
  }

  get(code: string): DomainPlugin | undefined {
    return this.domains.get(code);
  }

  all(): DomainPlugin[] {
    return Array.from(this.domains.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /**
   * Quickly classify a query into a domain using rule-based hints.
   * Returns undefined if no rule matches — caller can then ask LLM.
   */
  classifyByHints(query: string): DomainPlugin | undefined {
    const lower = query.toLowerCase();
    for (const domain of this.domains.values()) {
      if (domain.routingHints.keywords.some((k) => lower.includes(k))) return domain;
      if (domain.routingHints.queryPatterns.some((p) => p.test(query))) return domain;
    }
    return undefined;
  }

  classifyByActReference(sectionRefs: string[]): DomainPlugin[] {
    const matched = new Set<DomainPlugin>();
    for (const ref of sectionRefs) {
      const refUpper = ref.toUpperCase();
      for (const domain of this.domains.values()) {
        if (domain.routingHints.actReferences.some((a) => refUpper.includes(a.toUpperCase()))) {
          matched.add(domain);
        }
      }
    }
    return Array.from(matched);
  }
}

export const domainRegistry = new DomainRegistry();
