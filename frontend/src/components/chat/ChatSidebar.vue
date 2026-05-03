<script setup lang="ts">
import type { CaseItem } from "@/stores/cases.store";

defineProps<{
  cases: CaseItem[];
  activeCaseId: string | null;
}>();

const emit = defineEmits<{
  "new-case": [];
  "select-case": [id: string];
}>();

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
</script>

<template>
  <div class="w-72 bg-gray-950 border-r border-gray-800 flex flex-col">
    <!-- Header -->
    <div class="p-4 border-b border-gray-800">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span class="text-white font-bold text-xs">LM</span>
          </div>
          <span class="text-white font-semibold">LexiMini</span>
        </div>
      </div>

      <button
        @click="emit('new-case')"
        class="w-full px-3 py-2.5 border border-gray-700 rounded-lg text-gray-300 text-sm hover:bg-gray-800 transition flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        New Case
      </button>
    </div>

    <!-- Case list -->
    <div class="flex-1 overflow-y-auto py-2">
      <div
        v-for="c in cases"
        :key="c.id"
        @click="emit('select-case', c.id)"
        :class="[
          'mx-2 px-3 py-2.5 rounded-lg cursor-pointer transition mb-0.5',
          activeCaseId === c.id ? 'bg-gray-800' : 'hover:bg-gray-800/50',
        ]"
      >
        <p :class="['text-sm truncate', activeCaseId === c.id ? 'text-white' : 'text-gray-300']">
          {{ c.title }}
        </p>
        <div class="flex items-center gap-2 mt-1">
          <span class="text-xs text-gray-500">{{ timeAgo(c.updatedAt) }}</span>
          <span v-if="c._count?.documents" class="text-xs text-gray-600">
            {{ c._count.documents }} docs
          </span>
        </div>
      </div>

      <div v-if="cases.length === 0" class="px-4 py-8 text-center">
        <p class="text-gray-500 text-sm">No cases yet</p>
        <p class="text-gray-600 text-xs mt-1">Click "New Case" to start</p>
      </div>
    </div>
  </div>
</template>
