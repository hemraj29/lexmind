import { defineStore } from "pinia";
import { ref } from "vue";

export interface CaseItem {
  id: string;
  title: string;
  clientName?: string;
  status: string;
  sectionsRaw: string[];
  updatedAt: string;
  _count?: { documents: number; messages: number; generatedDocs: number };
}

export const useCasesStore = defineStore("cases", () => {
  const cases = ref<CaseItem[]>([]);
  const loading = ref(false);

  async function fetchCases() {
    loading.value = true;
    try {
      const res = await fetch("/api/cases");
      const json = await res.json();
      if (json.success) cases.value = json.data;
    } finally {
      loading.value = false;
    }
  }

  async function createCase(data: { title?: string; clientName?: string } = {}) {
    const res = await fetch("/api/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (json.success) {
      await fetchCases();
      return json.data as CaseItem;
    }
    return null;
  }

  async function archiveCase(id: string) {
    await fetch(`/api/cases/${id}`, { method: "DELETE" });
    await fetchCases();
  }

  return { cases, loading, fetchCases, createCase, archiveCase };
});
