import { defineStore } from "pinia";
import { ref } from "vue";

export interface CitationPreview {
  id: string;
  sourceType: "section" | "precedent" | "document" | "web";
  title: string;
  reference?: string;
  excerptText: string;
  pageNumber?: number;
  paragraphRef?: string;
  sourceUrl?: string;
  pdfUrl?: string;
  documentUrl?: string;
}

export const useCitationStore = defineStore("citation", () => {
  const isOpen = ref(false);
  const loading = ref(false);
  const preview = ref<CitationPreview | null>(null);

  async function open(citationId: string) {
    isOpen.value = true;
    loading.value = true;

    try {
      const res = await fetch(`/api/citations/${citationId}/preview`);
      const json = await res.json();
      if (json.success) {
        preview.value = json.data;
      } else {
        // Mock preview for demo until backend is wired
        preview.value = mockPreview(citationId);
      }
    } catch {
      preview.value = mockPreview(citationId);
    } finally {
      loading.value = false;
    }
  }

  function close() {
    isOpen.value = false;
    setTimeout(() => {
      preview.value = null;
    }, 250);
  }

  function mockPreview(id: string): CitationPreview {
    return {
      id,
      sourceType: "section",
      title: "Section Reference",
      reference: `Citation ${id}`,
      excerptText: "The full excerpt text would appear here once the backend is wired. This is a placeholder showing how the cited passage will be displayed in the side panel.",
      pageNumber: 1,
    };
  }

  return { isOpen, loading, preview, open, close };
});
