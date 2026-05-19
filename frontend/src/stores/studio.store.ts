import { defineStore } from "pinia";
import { ref, computed } from "vue";

export type StudioActionCategory = "draft" | "analyze" | "research" | "extract";

export interface StudioAction {
  id: string;
  code: string; // e.g. "regular_bail", "anticipatory_bail", "analyze"
  label: string;
  description: string;
  iconName: string;
  category: StudioActionCategory;
  domainCode: string;
  requiredSourceTypes: string[]; // e.g. ["fir"]
  enabled: boolean;
  command?: string; // e.g. "@bail"
  colorHex?: string;
}

export const useStudioStore = defineStore("studio", () => {
  const actions = ref<StudioAction[]>([]);
  const loading = ref(false);
  const executing = ref<string | null>(null);

  const actionsByCategory = computed(() => {
    const grouped: Record<StudioActionCategory, StudioAction[]> = {
      draft: [],
      analyze: [],
      research: [],
      extract: [],
    };
    for (const a of actions.value) {
      if (grouped[a.category]) grouped[a.category].push(a);
    }
    return grouped;
  });

  async function fetchActions(domainCode?: string) {
    loading.value = true;
    try {
      const url = domainCode ? `/api/studio-actions?domain=${domainCode}` : "/api/studio-actions";
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        actions.value = json.data;
      } else {
        // Fallback to default actions if backend not yet wired
        actions.value = defaultActions();
      }
    } catch {
      actions.value = defaultActions();
    } finally {
      loading.value = false;
    }
  }

  async function executeAction(caseId: string, action: StudioAction): Promise<boolean> {
    executing.value = action.id;
    try {
      // Sends the command through the chat pipeline
      const res = await fetch(`/api/cases/${caseId}/messages`, {
        method: "POST",
        body: (() => {
          const fd = new FormData();
          fd.append("content", action.command || `@${action.code}`);
          return fd;
        })(),
      });
      const json = await res.json();
      return json.success;
    } finally {
      executing.value = null;
    }
  }

  function defaultActions(): StudioAction[] {
    return [
      // Draft
      { id: "1", code: "regular_bail", label: "Bail Application", description: "Generate Regular Bail under Sec 480 BNSS", iconName: "scale", category: "draft", domainCode: "criminal", requiredSourceTypes: ["fir"], enabled: true, command: "@bail", colorHex: "#10b981" },
      { id: "2", code: "anticipatory_bail", label: "Anticipatory Bail", description: "Pre-arrest bail under Sec 482 BNSS", iconName: "shield", category: "draft", domainCode: "criminal", requiredSourceTypes: ["fir"], enabled: true, command: "@anticipatory", colorHex: "#3b82f6" },
      { id: "3", code: "quashing_petition", label: "Quashing Petition", description: "Sec 528 BNSS - High Court petition", iconName: "x-circle", category: "draft", domainCode: "criminal", requiredSourceTypes: ["fir"], enabled: true, command: "@quashing", colorHex: "#a855f7" },
      { id: "4", code: "discharge_application", label: "Discharge Application", description: "Sec 250 BNSS discharge from charges", iconName: "file-x", category: "draft", domainCode: "criminal", requiredSourceTypes: ["chargesheet"], enabled: true, command: "@discharge", colorHex: "#f97316" },
      { id: "5", code: "criminal_appeal", label: "Criminal Appeal", description: "Appeal against conviction", iconName: "arrow-up-circle", category: "draft", domainCode: "criminal", requiredSourceTypes: [], enabled: true, command: "@appeal", colorHex: "#ef4444" },
      { id: "6", code: "default_bail", label: "Default Bail", description: "Sec 187 BNSS statutory bail", iconName: "clock", category: "draft", domainCode: "criminal", requiredSourceTypes: [], enabled: true, command: "@default_bail", colorHex: "#14b8a6" },
      // Analyze
      { id: "7", code: "analyze", label: "Case Analysis", description: "Strengths, weaknesses, prosecution arguments", iconName: "chart", category: "analyze", domainCode: "criminal", requiredSourceTypes: [], enabled: true, command: "@analyze", colorHex: "#eab308" },
      { id: "8", code: "summary", label: "Case Summary", description: "AI-generated case overview", iconName: "file-text", category: "analyze", domainCode: "criminal", requiredSourceTypes: [], enabled: true, command: "@summary", colorHex: "#6366f1" },
      { id: "9", code: "missing", label: "Missing Information", description: "What you still need to gather", iconName: "alert", category: "analyze", domainCode: "criminal", requiredSourceTypes: [], enabled: true, command: "@missing", colorHex: "#64748b" },
      { id: "10", code: "cross_exam", label: "Cross-Examination", description: "Generate cross-exam questions", iconName: "help-circle", category: "analyze", domainCode: "criminal", requiredSourceTypes: ["witness_statement"], enabled: true, command: "@cross_exam", colorHex: "#ec4899" },
      // Research
      { id: "11", code: "sections", label: "Applicable Sections", description: "List all relevant statute sections", iconName: "book", category: "research", domainCode: "criminal", requiredSourceTypes: [], enabled: true, command: "@sections", colorHex: "#0ea5e9" },
      { id: "12", code: "precedents", label: "Relevant Precedents", description: "Landmark case law for your case", iconName: "gavel", category: "research", domainCode: "criminal", requiredSourceTypes: [], enabled: true, command: "@precedents", colorHex: "#8b5cf6" },
    ];
  }

  return {
    actions,
    loading,
    executing,
    actionsByCategory,
    fetchActions,
    executeAction,
  };
});
