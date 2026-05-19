import { readdirSync, existsSync, statSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { createChildLogger } from "../utils/logger.js";
import type { DrafterPlugin } from "./plugin.types.js";

const log = createChildLogger("drafter-registry");

class DrafterRegistry {
  private drafters = new Map<string, DrafterPlugin>();
  private loaded = false;

  async loadAll(): Promise<void> {
    if (this.loaded) return;

    const domainsDir = join(process.cwd(), "src", "domains");
    if (!existsSync(domainsDir)) {
      log.warn("domains/ not found");
      this.loaded = true;
      return;
    }

    // Walk: src/domains/<domain>/drafters/*.drafter.ts
    const domainFolders = readdirSync(domainsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("_"));

    for (const domainFolder of domainFolders) {
      const draftersDir = join(domainsDir, domainFolder.name, "drafters");
      if (!existsSync(draftersDir)) continue;

      const drafterFiles = readdirSync(draftersDir).filter((f) => f.endsWith(".drafter.ts") || f.endsWith(".drafter.js"));

      for (const file of drafterFiles) {
        const filePath = join(draftersDir, file);
        try {
          const mod = await import(pathToFileURL(filePath).href);
          const plugin = this.findDrafterExport(mod);

          if (plugin) {
            this.drafters.set(plugin.id, plugin);
            log.info({ id: plugin.id }, "Drafter plugin loaded");
          } else {
            log.warn({ file: filePath }, "No DrafterPlugin export found");
          }
        } catch (err: any) {
          log.error({ file: filePath, err: err.message }, "Failed to load drafter");
        }
      }
    }

    this.loaded = true;
    log.info({ count: this.drafters.size }, "Drafter registry ready");
  }

  private findDrafterExport(mod: Record<string, unknown>): DrafterPlugin | undefined {
    for (const v of Object.values(mod)) {
      if (
        v &&
        typeof v === "object" &&
        "id" in v &&
        "domainCode" in v &&
        "documentTypeCode" in v &&
        "draft" in v &&
        typeof (v as any).draft === "function"
      ) {
        return v as DrafterPlugin;
      }
    }
    return undefined;
  }

  get(id: string): DrafterPlugin | undefined {
    return this.drafters.get(id);
  }

  getByDocumentTypeCode(domainCode: string, documentTypeCode: string): DrafterPlugin | undefined {
    for (const d of this.drafters.values()) {
      if (d.domainCode === domainCode && d.documentTypeCode === documentTypeCode) {
        return d;
      }
    }
    // Also try by id pattern "<domain>.<documentType>"
    return this.drafters.get(`${domainCode}.${documentTypeCode}`);
  }

  all(): DrafterPlugin[] {
    return Array.from(this.drafters.values());
  }
}

export const drafterRegistry = new DrafterRegistry();
