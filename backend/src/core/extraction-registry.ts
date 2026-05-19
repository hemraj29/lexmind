import { createChildLogger } from "../utils/logger.js";
import type { ExtractionPlugin, ExtractionOutput } from "./plugin.types.js";

const log = createChildLogger("extraction-registry");

class ExtractionRegistry {
  private extractors = new Map<string, ExtractionPlugin>();
  private fallback?: ExtractionPlugin;

  register(plugin: ExtractionPlugin): void {
    this.extractors.set(`${plugin.domainCode}.${plugin.documentTypeCode}`, plugin);
    log.info({ id: plugin.id }, "Extraction plugin registered");
  }

  setFallback(plugin: ExtractionPlugin): void {
    this.fallback = plugin;
  }

  async extract(
    domainCode: string,
    documentTypeCode: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<ExtractionOutput> {
    const key = `${domainCode}.${documentTypeCode}`;
    const plugin = this.extractors.get(key) || this.fallback;

    if (!plugin) {
      throw new Error(`No extractor for ${key}, no fallback registered`);
    }

    return plugin.extract({ buffer, mimeType });
  }

  all(): ExtractionPlugin[] {
    return Array.from(this.extractors.values());
  }
}

export const extractionRegistry = new ExtractionRegistry();
