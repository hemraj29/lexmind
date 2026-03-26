import { ref, computed } from "vue";
import { useApi } from "./useApi.js";

export interface PipelineEvent {
  type: string;
  step?: string;
  data?: any;
  message?: string;
  timestamp: number;
}

export interface PipelineStepState {
  name: string;
  label: string;
  status: "pending" | "running" | "success" | "failed";
  message?: string;
  durationMs?: number;
}

const STEP_LABELS: Record<string, string> = {
  upload: "Upload & Validate",
  extract: "Extract FIR Data",
  research: "Legal Research",
  draft: "Generate Draft",
  "save-output": "Save Document",
};

export function usePipeline() {
  const { uploadFile } = useApi();

  const runId = ref<string | null>(null);
  const status = ref<"idle" | "running" | "completed" | "failed">("idle");
  const events = ref<PipelineEvent[]>([]);
  const errorMessage = ref<string | null>(null);

  const steps = ref<PipelineStepState[]>([
    { name: "upload", label: STEP_LABELS.upload!, status: "pending" },
    { name: "extract", label: STEP_LABELS.extract!, status: "pending" },
    { name: "research", label: STEP_LABELS.research!, status: "pending" },
    { name: "draft", label: STEP_LABELS.draft!, status: "pending" },
    { name: "save-output", label: STEP_LABELS["save-output"]!, status: "pending" },
  ]);

  const currentStep = computed(() => steps.value.find((s) => s.status === "running"));
  const progress = computed(() => {
    const completed = steps.value.filter((s) => s.status === "success").length;
    return Math.round((completed / steps.value.length) * 100);
  });

  function resetSteps() {
    steps.value.forEach((s) => {
      s.status = "pending";
      s.message = undefined;
      s.durationMs = undefined;
    });
  }

  async function start(file: File): Promise<string | null> {
    resetSteps();
    status.value = "running";
    events.value = [];
    errorMessage.value = null;

    const result = await uploadFile<{ runId: string; streamUrl: string }>("/pipeline/run", file);

    if (!result) {
      status.value = "failed";
      errorMessage.value = "Failed to start pipeline";
      return null;
    }

    runId.value = result.runId;

    // Connect to SSE stream
    connectSSE(result.runId);

    return result.runId;
  }

  function connectSSE(id: string) {
    const eventSource = new EventSource(`/api/pipeline/${id}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data: PipelineEvent = JSON.parse(event.data);
        events.value.push(data);
        handleEvent(data);
      } catch {
        // ignore parse errors
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      if (status.value === "running") {
        status.value = "failed";
        errorMessage.value = "Connection to pipeline lost";
      }
    };
  }

  function handleEvent(event: PipelineEvent) {
    const step = event.step ? steps.value.find((s) => s.name === event.step) : null;

    switch (event.type) {
      case "step:start":
        if (step) {
          step.status = "running";
          step.message = event.message;
        }
        break;

      case "step:progress":
        if (step) {
          step.message = event.message;
        }
        break;

      case "step:complete":
        if (step) {
          step.status = "success";
          step.durationMs = event.data?.durationMs;
          step.message = event.message;
        }
        break;

      case "step:error":
        if (step) {
          step.status = "failed";
          step.message = event.data?.error || event.message;
        }
        break;

      case "pipeline:complete":
        status.value = "completed";
        break;

      case "pipeline:error":
        status.value = "failed";
        errorMessage.value = event.data?.error || "Pipeline failed";
        break;
    }
  }

  return {
    runId,
    status,
    steps,
    events,
    errorMessage,
    currentStep,
    progress,
    start,
  };
}
