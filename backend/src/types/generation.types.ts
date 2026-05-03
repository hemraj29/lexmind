export type GenerationType =
  | "regular_bail"
  | "anticipatory_bail"
  | "default_bail"
  | "quashing_petition"
  | "discharge_application"
  | "criminal_appeal";

export interface AnticipatoryBailSections {
  courtName: string;
  caseTitle: string;
  introduction: string;
  apprehensionGrounds: string;
  briefFacts: string;
  groundsForBail: string[];
  legalArguments: string;
  conditionsOffered: string[];
  prayer: string;
  date: string;
  advocateName?: string;
}

export interface DefaultBailSections {
  courtName: string;
  caseTitle: string;
  introduction: string;
  chronology: string;
  statutoryProvision: string;
  briefFacts: string;
  groundsForBail: string[];
  legalArguments: string;
  prayer: string;
  date: string;
  advocateName?: string;
}

export interface QuashingPetitionSections {
  courtName: string;
  caseTitle: string;
  introduction: string;
  impugnedOrder: string;
  briefFacts: string;
  groundsForQuashing: string[];
  legalArguments: string;
  prayer: string;
  date: string;
  advocateName?: string;
}

export interface DischargeApplicationSections {
  courtName: string;
  caseTitle: string;
  introduction: string;
  briefFacts: string;
  chargesheetAnalysis: string;
  groundsForDischarge: string[];
  legalArguments: string;
  prayer: string;
  date: string;
  advocateName?: string;
}

export interface CriminalAppealSections {
  courtName: string;
  caseTitle: string;
  introduction: string;
  impugnedJudgment: string;
  briefFacts: string;
  groundsOfAppeal: string[];
  legalArguments: string;
  prayer: string;
  date: string;
  advocateName?: string;
}
