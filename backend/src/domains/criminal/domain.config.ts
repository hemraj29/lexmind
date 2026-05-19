import type { DomainPlugin } from "../../core/plugin.types.js";

/**
 * CRIMINAL LAW DOMAIN
 *
 * Covers: BNS, BNSS, BSA + special acts (NDPS, POCSO, PMLA, UAPA, Arms, IT Act, MV Act, SC/ST, JJ Act).
 * Document types: bail, anticipatory bail, default bail, quashing, discharge, criminal appeal.
 */
export const criminalDomain: DomainPlugin = {
  code: "criminal",
  name: "Criminal Law",
  description: "Bail, defense, prosecution, criminal trials and appeals",
  iconName: "scale",
  colorHex: "#dc2626",
  sortOrder: 1,

  defaultActCodes: ["BNS", "BNSS", "BSA", "NDPS", "POCSO", "PMLA", "UAPA", "ARMS"],

  routingHints: {
    keywords: [
      "bail", "fir", "arrest", "accused", "criminal", "police", "remand",
      "chargesheet", "cognizable", "non-bailable", "custody", "anticipatory",
      "quashing", "discharge", "conviction", "acquittal", "evidence",
    ],
    actReferences: ["BNS", "BNSS", "BSA", "IPC", "CrPC", "NDPS", "POCSO", "PMLA", "UAPA"],
    queryPatterns: [
      /section\s+\d+\s+(bns|bnss|bsa|ipc|crpc)/i,
      /\bfir\s+(no|number)/i,
      /\bbail\s+(application|petition|matter)/i,
      /\barrested\s+under/i,
    ],
  },

  documentTypes: [
    {
      code: "regular_bail",
      name: "Regular Bail",
      description: "Regular bail application under Sec 480 BNSS",
      category: "draft",
      iconName: "scale",
      colorHex: "#10b981",
      command: "@bail",
      requiredSourceTypes: ["fir"],
      primarySectionCodes: ["BNSS-480", "BNSS-483"],
      drafterId: "criminal.regular_bail",
      sortOrder: 1,
    },
    {
      code: "anticipatory_bail",
      name: "Anticipatory Bail",
      description: "Pre-arrest bail under Sec 482 BNSS",
      category: "draft",
      iconName: "shield",
      colorHex: "#3b82f6",
      command: "@anticipatory",
      requiredSourceTypes: ["fir"],
      primarySectionCodes: ["BNSS-482"],
      drafterId: "criminal.anticipatory_bail",
      sortOrder: 2,
    },
    {
      code: "default_bail",
      name: "Default Bail",
      description: "Statutory bail under Sec 187 BNSS",
      category: "draft",
      iconName: "clock",
      colorHex: "#14b8a6",
      command: "@default_bail",
      requiredSourceTypes: [],
      primarySectionCodes: ["BNSS-187"],
      drafterId: "criminal.default_bail",
      sortOrder: 3,
    },
    {
      code: "quashing_petition",
      name: "Quashing Petition",
      description: "Quashing under Sec 528 BNSS (High Court)",
      category: "draft",
      iconName: "x-circle",
      colorHex: "#a855f7",
      command: "@quashing",
      requiredSourceTypes: ["fir"],
      primarySectionCodes: ["BNSS-528"],
      drafterId: "criminal.quashing_petition",
      sortOrder: 4,
    },
    {
      code: "discharge_application",
      name: "Discharge Application",
      description: "Discharge from charges under Sec 250 BNSS",
      category: "draft",
      iconName: "file-x",
      colorHex: "#f97316",
      command: "@discharge",
      requiredSourceTypes: ["chargesheet"],
      primarySectionCodes: ["BNSS-250"],
      drafterId: "criminal.discharge_application",
      sortOrder: 5,
    },
    {
      code: "criminal_appeal",
      name: "Criminal Appeal",
      description: "Appeal against conviction or sentence",
      category: "draft",
      iconName: "arrow-up-circle",
      colorHex: "#ef4444",
      command: "@appeal",
      requiredSourceTypes: [],
      primarySectionCodes: [],
      drafterId: "criminal.criminal_appeal",
      sortOrder: 6,
    },
  ],

  prerequisiteCheckers: {
    regular_bail: (caseData) => {
      const hasFir = caseData.documents.some((d) => d.docType?.toLowerCase() === "fir");
      return { ready: hasFir, missing: hasFir ? [] : ["FIR document"] };
    },
    discharge_application: (caseData) => {
      const hasCs = caseData.documents.some((d) => d.docType?.toLowerCase() === "chargesheet");
      return { ready: hasCs, missing: hasCs ? [] : ["Chargesheet"] };
    },
  },
};
