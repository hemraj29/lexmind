<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{ searching: boolean; disabled: boolean }>();
const emit = defineEmits<{ search: [query: string] }>();

const query = ref("");
const sourceType = ref<"web" | "research">("web");

function handleSearch() {
  const q = query.value.trim();
  if (!q || props.disabled || props.searching) return;
  emit("search", q);
  query.value = "";
}
</script>

<template>
  <div class="bg-white border border-gray-200 rounded-xl p-3">
    <p class="text-xs font-medium text-gray-700 mb-2">Search the web for new sources</p>

    <!-- Query input + send -->
    <div class="flex items-center gap-2">
      <div class="flex items-center gap-1 px-2 py-1 bg-gray-50 border border-gray-200 rounded-md">
        <svg class="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <select
          v-model="sourceType"
          class="text-xs bg-transparent outline-none cursor-pointer"
        >
          <option value="web">Web</option>
          <option value="research">Fast Research</option>
        </select>
        <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>

    <!-- Search input -->
    <div class="mt-2 flex items-center gap-2">
      <input
        v-model="query"
        @keyup.enter="handleSearch"
        :disabled="disabled"
        placeholder="Search legal precedents, articles..."
        class="flex-1 text-sm bg-transparent outline-none placeholder-gray-400 disabled:opacity-50"
      />
      <button
        @click="handleSearch"
        :disabled="disabled || searching || !query.trim()"
        class="p-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
      >
        <svg v-if="!searching" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
        <div v-else class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </button>
    </div>
  </div>
</template>
