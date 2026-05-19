<script setup lang="ts">
import { computed } from "vue";
import type { StudioAction } from "@/stores/studio.store";

const props = defineProps<{
  action: StudioAction;
  executing: boolean;
  disabled: boolean;
}>();

defineEmits<{ click: [] }>();

const iconPath = computed(() => {
  const icons: Record<string, string> = {
    scale: "M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3",
    shield: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    "x-circle": "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z",
    "file-x": "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    "arrow-up-circle": "M5 10l7-7m0 0l7 7m-7-7v18",
    clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    chart: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    "file-text": "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    alert: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
    "help-circle": "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    book: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    gavel: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  };
  return icons[props.action.iconName] || icons.book;
});

const bgStyle = computed(() => {
  if (!props.action.colorHex) return {};
  return { backgroundColor: `${props.action.colorHex}10` };
});

const iconStyle = computed(() => {
  if (!props.action.colorHex) return {};
  return { color: props.action.colorHex };
});
</script>

<template>
  <button
    @click="$emit('click')"
    :disabled="disabled || executing"
    class="group relative flex flex-col items-start gap-1.5 p-3 bg-gray-50 hover:bg-white border border-transparent hover:border-gray-200 hover:shadow-sm rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed text-left"
    :title="action.description"
  >
    <div
      :style="bgStyle"
      class="w-7 h-7 rounded-md flex items-center justify-center"
    >
      <div v-if="executing" class="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" :style="iconStyle" />
      <svg v-else class="w-4 h-4" :style="iconStyle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="iconPath" />
      </svg>
    </div>
    <span class="text-xs font-medium text-gray-800 leading-tight">{{ action.label }}</span>
  </button>
</template>
