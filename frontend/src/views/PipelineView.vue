<script setup lang="ts">
import { onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { usePipeline } from "@/composables/usePipeline";
import StepProgress from "@/components/StepProgress.vue";

const props = defineProps<{ id: string }>();
const router = useRouter();
const pipeline = usePipeline();

onMounted(() => {
  // If navigated directly, reconnect to SSE
  if (pipeline.status.value === "idle" && props.id) {
    pipeline.runId.value = props.id;
    // The SSE connection would need to be re-established
    // For now, redirect to result page after a delay
  }
});

watch(
  () => pipeline.status.value,
  (newStatus) => {
    if (newStatus === "completed") {
      setTimeout(() => {
        router.push({ name: "draft", params: { id: props.id } });
      }, 1500);
    }
  }
);
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <div class="text-center mb-8">
      <h1 class="text-2xl font-bold text-gray-900 mb-1">Processing FIR</h1>
      <p class="text-gray-500 text-sm">Run ID: {{ id }}</p>
    </div>

    <StepProgress :steps="pipeline.steps.value" :progress="pipeline.progress.value" />

    <!-- Error state -->
    <div
      v-if="pipeline.status.value === 'failed'"
      class="mt-6 bg-red-50 border border-red-200 rounded-lg p-4"
    >
      <p class="text-red-700 font-medium">Pipeline failed</p>
      <p class="text-red-600 text-sm mt-1">{{ pipeline.errorMessage.value }}</p>
      <button
        @click="router.push({ name: 'home' })"
        class="mt-3 text-sm text-red-600 underline"
      >
        Try again
      </button>
    </div>

    <!-- Completed state -->
    <div
      v-if="pipeline.status.value === 'completed'"
      class="mt-6 bg-green-50 border border-green-200 rounded-lg p-4 text-center"
    >
      <p class="text-green-700 font-medium">Bail application generated successfully!</p>
      <p class="text-green-600 text-sm mt-1">Redirecting to draft view...</p>
    </div>
  </div>
</template>
