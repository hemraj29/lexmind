export interface CaseAnalysis {
  strengths: AnalysisPoint[];
  weaknesses: AnalysisPoint[];
  prosecutionArguments: CounterArgument[];
  defenseStrategy: StrategyRecommendation;
  recommendedPetitions: PetitionRecommendation[];
  bailProspect: BailProspectAnalysis;
  missingInfo: string[];
}

export interface AnalysisPoint {
  point: string;
  basis: string;
  significance: "high" | "medium" | "low";
}

export interface CounterArgument {
  prosecutionArgument: string;
  counterStrategy: string;
  supportingLaw: string;
}

export interface StrategyRecommendation {
  primaryStrategy: string;
  alternativeStrategies: string[];
  timeline: string;
  risks: string[];
}

export interface PetitionRecommendation {
  type: string;
  priority: number;
  reasoning: string;
  prerequisites: string[];
  estimatedSuccess: "high" | "medium" | "low";
}

export interface BailProspectAnalysis {
  overall: "likely" | "uncertain" | "unlikely";
  favorableFactors: string[];
  adverseFactors: string[];
  recommendation: string;
}

export interface CaseContext {
  caseId: string;
  title: string;
  clientName: string;
  documents: {
    docType: string;
    extractedData: unknown;
    rawText?: string;
  }[];
  sectionsRaw: string[];
  applicableSections: {
    id?: string;
    act: string;
    sectionNumber: string;
    title: string;
    bailable: boolean;
    punishment: string;
    ingredients: string[];
    description?: string;
  }[];
  precedents: {
    caseTitle: string;
    citation: string;
    ratio: string;
  }[];
  chatHistory: {
    role: string;
    content: string;
  }[];
}
