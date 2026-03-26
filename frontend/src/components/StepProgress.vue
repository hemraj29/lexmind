<script setup lang="ts">
defineProps<{
  steps: {
    name: string;
    label: string;
    status: "pending" | "running" | "success" | "failed";
    message?: string;
    durationMs?: number;
  }[];
  progress: number;
}>();

function statusIcon(status: string) {
  switch (status) {
    case "success": return "check";
    case "running": return "spinner";
    case "failed": return "x";
    default: return "dot";
  }
}

function statusColor(status: string) {
  switch (status) {
    case "success": return "bg-green-500";
    case "running": return "bg-blue-500";
    case "failed": return "bg-red-500";
    default: return "bg-gray-300";
  }
}
</script>

<template>
  <div class="bg-white rounded-xl border border-gray-200 p-6">
    <!-- Progress bar -->
    <div class="mb-6">
      <div class="flex justify-between text-sm mb-1">
        <span class="text-gray-500">Progress</span>
        <span class="font-medium text-gray-700">{{ progress }}%</span>
      </div>
      <div class="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          :style="{ width: `${progress}%` }"
          class="h-full bg-indigo-600 rounded-full transition-all duration-500"
        />
      </div>
    </div>

    <!-- Steps -->
    <div class="space-y-4">
      <div v-for="step in steps" :key="step.name" class="flex items-start gap-3">
        <!-- Status indicator -->
        <div class="mt-0.5">
          <div
            :class="[
              'w-6 h-6 rounded-full flex items-center justify-center text-white text-xs',
              statusColor(step.status),
            ]"
          >
            <template v-if="step.status === 'success'">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
              </svg>
            </template>
            <template v-else-if="step.status === 'running'">
              <div class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </template>
            <template v-else-if="step.status === 'failed'">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </template>
            <template v-else>
              <div class="w-2 h-2 bg-white rounded-full" />
            </template>
          </div>
        </div>

        <!-- Step info -->
        <div class="flex-1">
          <div class="flex items-center justify-between">
            <p
              :class="[
                'font-medium text-sm',
                step.status === 'pending' ? 'text-gray-400' : 'text-gray-900',
              ]"
            >
              {{ step.label }}
            </p>
            <span v-if="step.durationMs" class="text-xs text-gray-400">
              {{ (step.durationMs / 1000).toFixed(1) }}s
            </span>
          </div>
          <p v-if="step.message && step.status === 'running'" class="text-xs text-blue-500 mt-0.5">
            {{ step.message }}
          </p>
          <p v-if="step.message && step.status === 'failed'" class="text-xs text-red-500 mt-0.5">
            {{ step.message }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
