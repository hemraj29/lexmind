import type { DomainPlugin } from "../../core/plugin.types.js";

export const civilDomain: DomainPlugin = {
  code: "civil",
  name: "Civil Litigation",
  description: "Civil suits, plaints, written statements, injunctions, contracts",
  iconName: "gavel",
  colorHex: "#2563eb",
  sortOrder: 2,

  defaultActCodes: ["CPC", "CONTRACT_1872", "SPECIFIC_RELIEF_1963", "LIMITATION_1963", "TPA_1882"],

  routingHints: {
    keywords: [
      "plaint", "suit", "civil", "injunction", "decree", "specific performance",
      "damages", "contract", "breach", "agreement", "tort", "negligence",
      "easement", "trespass", "civil court",
    ],
    actReferences: ["CPC", "Contract Act", "Specific Relief", "TPA", "NI Act", "Limitation"],
    queryPatterns: [
      /order\s+\d+\s+rule\s+\d+/i,
      /\bcivil\s+suit/i,
      /\bplaint\b/i,
      /\bsection\s+\d+\s+(cpc|contract\s+act|specific\s+relief)/i,
    ],
  },

  documentTypes: [
    {
      code: "plaint",
      name: "Plaint",
      description: "Civil suit filing under Order VII CPC",
      category: "draft",
      iconName: "file-text",
      colorHex: "#2563eb",
      command: "@plaint",
      requiredSourceTypes: [],
      primarySectionCodes: ["CPC-O7", "CPC-26"],
      drafterId: "civil.plaint",
      sortOrder: 1,
    },
    {
      code: "written_statement",
      name: "Written Statement",
      description: "Defendant's reply under Order VIII CPC",
      category: "draft",
      iconName: "file",
      colorHex: "#0ea5e9",
      command: "@written_statement",
      requiredSourceTypes: ["plaint"],
      primarySectionCodes: ["CPC-O8"],
      drafterId: "civil.written_statement",
      sortOrder: 2,
    },
    {
      code: "temporary_injunction",
      name: "Temporary Injunction",
      description: "Application for temporary injunction under Order 39 CPC",
      category: "draft",
      iconName: "shield",
      colorHex: "#06b6d4",
      command: "@injunction",
      requiredSourceTypes: ["plaint"],
      primarySectionCodes: ["CPC-O39"],
      drafterId: "civil.temporary_injunction",
      sortOrder: 3,
    },
  ],
};
