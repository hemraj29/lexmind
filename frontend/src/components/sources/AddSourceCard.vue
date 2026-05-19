<script setup lang="ts">
defineProps<{ uploading: boolean; disabled: boolean }>();
defineEmits<{ click: [] }>();
</script>

<template>
  <button
    @click="$emit('click')"
    :disabled="disabled || uploading"
    class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 rounded-full hover:bg-gray-50 hover:border-gray-400 transition disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-gray-700"
  >
    <svg v-if="!uploading" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
    </svg>
    <div v-else class="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
    <span>{{ uploading ? "Uploading..." : "Add sources" }}</span>
  </button>
</template>
