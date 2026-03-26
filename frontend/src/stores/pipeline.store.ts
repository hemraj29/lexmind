import { defineStore } from "pinia";
import { ref } from "vue";

export interface PipelineRunSummary {
  id: string;
  status: string;
  fileName: string;
  steps: unknown[];
  totalDurationMs?: number;
  createdAt: string;
}

export interface PipelineResult {
  runId: string;
  status: string;
  fir: Record<string, unknown>;
  memo: Record<string, unknown>;
  draftMarkdown: string;
  downloadUrl: string | null;
  steps: unknown[];
  totalDurationMs: number;
}

export const usePipelineStore = defineStore("pipeline", () => {
  const runs = ref<PipelineRunSummary[]>([]);
  const currentResult = ref<PipelineResult | null>(null);
  const loading = ref(false);

  async function fetchHistory(limit = 20) {
    loading.value = true;
    try {
      const res = await fetch(`/api/pipeline?limit=${limit}`);
      const json = await res.json();
      if (json.success) runs.value = json.data;
    } finally {
      loading.value = false;
    }
  }

  async function fetchResult(runId: string) {
    loading.value = true;
    try {
      const res = await fetch(`/api/pipeline/${runId}/result`);
      const json = await res.json();
      if (json.success) currentResult.value = json.data;
    } finally {
      loading.value = false;
    }
  }

  return { runs, currentResult, loading, fetchHistory, fetchResult };
});
