import { domainRegistry } from "./domain-registry.js";
import { drafterRegistry } from "./drafter-registry.js";
import { actRegistry } from "./act-registry.js";
import { prisma } from "../services/database.service.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("bootstrap");

/**
 * Plugin bootstrap.
 *
 *   1. Load all domain plugins from src/domains/
 *   2. Load all drafter plugins from src/domains/<domain>/drafters/
 *   3. Load all act configs from src/acts/<domain>/*.act.json
 *   4. Sync everything to DB so the API can serve it to the frontend
 */
export async function bootstrapPlugins(): Promise<void> {
  log.info("Loading plugins from filesystem...");

  await Promise.all([
    domainRegistry.loadAll(),
    drafterRegistry.loadAll(),
    actRegistry.loadAll(),
  ]);

  await syncToDatabase();

  log.info({
    domains: domainRegistry.all().length,
    drafters: drafterRegistry.all().length,
    acts: actRegistry.all().length,
  }, "Plugin bootstrap complete");
}

async function syncToDatabase(): Promise<void> {
  for (const domain of domainRegistry.all()) {
    // Upsert domain
    const dbDomain = await prisma.legalDomain.upsert({
      where: { code: domain.code },
      update: {
        name: domain.name,
        description: domain.description,
        iconName: domain.iconName,
        colorHex: domain.colorHex,
        sortOrder: domain.sortOrder,
        enabled: true,
      },
      create: {
        code: domain.code,
        name: domain.name,
        description: domain.description,
        iconName: domain.iconName,
        colorHex: domain.colorHex,
        sortOrder: domain.sortOrder,
        enabled: true,
      },
    });

    // Upsert document types
    for (const docType of domain.documentTypes) {
      await prisma.registeredDocumentType.upsert({
        where: { code: docType.code },
        update: {
          name: docType.name,
          description: docType.description,
          category: docType.category,
          iconName: docType.iconName,
          colorHex: docType.colorHex,
          requiredSourceTypes: docType.requiredSourceTypes,
          primarySectionCodes: docType.primarySectionCodes,
          drafterPluginId: docType.drafterId,
          templateConfig: docType.templateConfig as any,
          command: docType.command,
          sortOrder: docType.sortOrder ?? 0,
          domainId: dbDomain.id,
        },
        create: {
          code: docType.code,
          name: docType.name,
          description: docType.description,
          domainId: dbDomain.id,
          category: docType.category,
          iconName: docType.iconName,
          colorHex: docType.colorHex,
          requiredSourceTypes: docType.requiredSourceTypes,
          primarySectionCodes: docType.primarySectionCodes,
          drafterPluginId: docType.drafterId,
          templateConfig: docType.templateConfig as any,
          command: docType.command,
          sortOrder: docType.sortOrder ?? 0,
        },
      });

      // Mirror as a StudioAction so the frontend studio panel shows it
      await prisma.studioAction.upsert({
        where: { code: docType.code },
        update: {
          label: docType.name,
          description: docType.description,
          iconName: docType.iconName,
          colorHex: docType.colorHex,
          category: docType.category,
          command: docType.command,
          requiredSourceTypes: docType.requiredSourceTypes,
          sortOrder: docType.sortOrder ?? 0,
          domainId: dbDomain.id,
        },
        create: {
          code: docType.code,
          label: docType.name,
          description: docType.description,
          iconName: docType.iconName,
          colorHex: docType.colorHex,
          category: docType.category,
          command: docType.command,
          requiredSourceTypes: docType.requiredSourceTypes,
          sortOrder: docType.sortOrder ?? 0,
          domainId: dbDomain.id,
        },
      });

      // Register chat command if provided
      if (docType.command) {
        await prisma.chatCommand.upsert({
          where: { cmd: docType.command },
          update: {
            label: docType.name,
            description: docType.description,
            domainId: dbDomain.id,
            documentTypeCode: docType.code,
          },
          create: {
            cmd: docType.command,
            label: docType.name,
            description: docType.description,
            domainId: dbDomain.id,
            documentTypeCode: docType.code,
          },
        });
      }
    }
  }

  log.info("DB sync complete");
}
