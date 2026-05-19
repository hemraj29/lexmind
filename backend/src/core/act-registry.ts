import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { createChildLogger } from "../utils/logger.js";
import type { ActPlugin } from "./plugin.types.js";

const log = createChildLogger("act-registry");

class ActRegistry {
  private acts = new Map<string, ActPlugin>();
  private loaded = false;

  async loadAll(): Promise<void> {
    if (this.loaded) return;

    const actsRoot = join(process.cwd(), "src", "acts");
    if (!existsSync(actsRoot)) {
      log.warn({ actsRoot }, "acts/ directory not found");
      this.loaded = true;
      return;
    }

    const domainFolders = readdirSync(actsRoot, { withFileTypes: true }).filter((d) => d.isDirectory());

    for (const folder of domainFolders) {
      const folderPath = join(actsRoot, folder.name);
      const files = readdirSync(folderPath).filter((f) => f.endsWith(".act.json"));

      for (const file of files) {
        try {
          const content = readFileSync(join(folderPath, file), "utf-8");
          const plugin: ActPlugin = JSON.parse(content);

          if (!plugin.code || !plugin.name) {
            log.warn({ file }, "Act config missing code or name");
            continue;
          }

          this.acts.set(plugin.code, plugin);
          log.info({ code: plugin.code, name: plugin.name }, "Act registered");
        } catch (err: any) {
          log.error({ file, err: err.message }, "Failed to load act config");
        }
      }
    }

    this.loaded = true;
    log.info({ count: this.acts.size }, "Act registry ready");
  }

  get(code: string): ActPlugin | undefined {
    return this.acts.get(code);
  }

  all(): ActPlugin[] {
    return Array.from(this.acts.values());
  }

  byDomain(domainCode: string): ActPlugin[] {
    return this.all().filter((a) => a.domainCode === domainCode);
  }
}

export const actRegistry = new ActRegistry();
