import { defineStore } from "pinia";
import { ref, computed } from "vue";

export type SourceType = "fir" | "chargesheet" | "court_order" | "witness_statement" | "evidence" | "previous_petition" | "web" | "other";

export interface Source {
  id: string;
  caseId: string;
  type: SourceType;
  title: string;
  fileName?: string;
  url?: string;
  pageCount?: number;
  enabled: boolean;
  confidence?: number;
  excerpt?: string;
  createdAt: string;
}

export const useSourcesStore = defineStore("sources", () => {
  const sources = ref<Source[]>([]);
  const loading = ref(false);
  const uploading = ref(false);
  const searching = ref(false);

  const enabledSources = computed(() => sources.value.filter((s) => s.enabled));
  const sourceCount = computed(() => sources.value.length);

  async function fetchSources(caseId: string) {
    loading.value = true;
    try {
      const res = await fetch(`/api/cases/${caseId}/sources`);
      const json = await res.json();
      if (json.success) sources.value = json.data;
    } catch (err) {
      console.error("Failed to fetch sources", err);
    } finally {
      loading.value = false;
    }
  }

  async function uploadSource(caseId: string, file: File): Promise<Source | null> {
    uploading.value = true;
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/cases/${caseId}/sources/upload`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (json.success) {
        sources.value.unshift(json.data);
        return json.data;
      }
      return null;
    } finally {
      uploading.value = false;
    }
  }

  async function searchWeb(caseId: string, query: string): Promise<Source[]> {
    searching.value = true;
    try {
      const res = await fetch(`/api/cases/${caseId}/sources/web-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const json = await res.json();
      if (json.success) {
        sources.value.unshift(...json.data);
        return json.data;
      }
      return [];
    } finally {
      searching.value = false;
    }
  }

  async function toggleSource(caseId: string, sourceId: string, enabled: boolean) {
    const source = sources.value.find((s) => s.id === sourceId);
    if (source) source.enabled = enabled;

    try {
      await fetch(`/api/cases/${caseId}/sources/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
    } catch {
      // revert on failure
      if (source) source.enabled = !enabled;
    }
  }

  async function removeSource(caseId: string, sourceId: string) {
    sources.value = sources.value.filter((s) => s.id !== sourceId);
    try {
      await fetch(`/api/cases/${caseId}/sources/${sourceId}`, { method: "DELETE" });
    } catch (err) {
      console.error("Failed to remove source", err);
    }
  }

  function clear() {
    sources.value = [];
  }

  return {
    sources,
    loading,
    uploading,
    searching,
    enabledSources,
    sourceCount,
    fetchSources,
    uploadSource,
    searchWeb,
    toggleSource,
    removeSource,
    clear,
  };
});
