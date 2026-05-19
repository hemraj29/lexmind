/**
 * TEMPLATE: copy this folder to start a new legal domain plugin.
 *
 * Steps:
 *   1. Copy `_template/` → `<your_domain>/` (e.g., `tax`, `corporate`, `family`)
 *   2. Update domain.config.ts below with your codes, keywords, document types
 *   3. Create one drafter file per documentType in `drafters/`
 *   4. Restart server — plugin auto-loads
 */

import type { DomainPlugin } from "../../core/plugin.types.js";

export const templateDomain: DomainPlugin = {
  code: "template",                          // unique code, lowercase
  name: "Template Domain",
  description: "Replace this with your domain description",
  iconName: "book",                          // any name; rendered as a Lucide-style SVG
  colorHex: "#6b7280",
  sortOrder: 99,                             // lower = appears first

  defaultActCodes: [],                       // act codes most relevant to this domain

  routingHints: {
    // The Domain Router uses these to classify incoming queries
    keywords: ["replace", "with", "your", "keywords"],
    actReferences: ["YOUR_ACT_CODE"],
    queryPatterns: [/your-pattern/i],
  },

  documentTypes: [
    {
      code: "example_doc",
      name: "Example Document",
      description: "Replace with your document type description",
      category: "draft",                     // "draft" | "analyze" | "research" | "extract"
      iconName: "file-text",
      colorHex: "#6366f1",
      command: "@example",                   // optional chat command
      requiredSourceTypes: [],               // e.g., ["fir"] means user must upload an FIR first
      primarySectionCodes: [],               // e.g., ["BNS-101"]
      drafterId: "template.example_doc",     // must match a DrafterPlugin.id in drafters/
      sortOrder: 1,
    },
  ],

  // Optional: per-document prerequisite checks (richer logic than requiredSourceTypes)
  prerequisiteCheckers: {
    // example_doc: (caseData) => ({ ready: true, missing: [] }),
  },
};
