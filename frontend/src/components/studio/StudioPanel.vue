<script setup lang="ts">
import { computed } from "vue";
import { useStudioStore } from "@/stores/studio.store";
import StudioGrid from "./StudioGrid.vue";

const props = defineProps<{ caseId: string | null }>();
const emit = defineEmits<{
  collapse: [];
  execute: [actionCode: string];
}>();

const studioStore = useStudioStore();

const draftActions = computed(() => studioStore.actionsByCategory.draft);
const analyzeActions = computed(() => studioStore.actionsByCategory.analyze);
const researchActions = computed(() => studioStore.actionsByCategory.research);

const featuredCategories = ["हिन्दी", "बांग्ला", "ગુજરાતી", "ಕನ್ನಡ", "മലയാളം", "मराठी", "ਪੰਜਾਬੀ", "தமிழ்", "తెలుగు"];

function handleExecute(code: string) {
  if (!props.caseId) return;
  emit("execute", code);
}
</script>

<template>
  <aside class="w-[340px] flex-shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
      <h2 class="font-medium text-gray-900">Studio</h2>
      <button
        @click="emit('collapse')"
        class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition"
        title="Collapse"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto px-4 py-4 space-y-5">
      <!-- Audio overview banner -->
      <div class="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-xl p-3.5 border border-purple-100">
        <p class="text-xs font-medium text-gray-700 mb-1.5">Create an Audio Overview in:</p>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="lang in featuredCategories"
            :key="lang"
            class="text-xs px-2 py-0.5 bg-white text-gray-700 rounded-md border border-purple-100 hover:border-purple-300 cursor-pointer transition"
          >
            {{ lang }}
          </span>
        </div>
      </div>

      <!-- New feature callout -->
      <div class="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-100 rounded-xl p-3 flex items-start gap-3">
        <span class="text-lg">🎉</span>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-medium text-gray-800">Try new Mind Map customizations!</p>
        </div>
        <button class="text-xs px-2.5 py-1 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition">
          Try it
        </button>
      </div>

      <!-- DRAFT documents -->
      <div v-if="draftActions.length">
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Draft Documents</h3>
        <StudioGrid
          :actions="draftActions"
          :executing="studioStore.executing"
          :disabled="!caseId"
          @execute="handleExecute"
        />
      </div>

      <!-- ANALYZE -->
      <div v-if="analyzeActions.length">
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Case Analysis</h3>
        <StudioGrid
          :actions="analyzeActions"
          :executing="studioStore.executing"
          :disabled="!caseId"
          @execute="handleExecute"
        />
      </div>

      <!-- RESEARCH -->
      <div v-if="researchActions.length">
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Research</h3>
        <StudioGrid
          :actions="researchActions"
          :executing="studioStore.executing"
          :disabled="!caseId"
          @execute="handleExecute"
        />
      </div>

      <!-- Empty state -->
      <div v-if="!caseId" class="text-center mt-8">
        <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
          <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <p class="text-sm font-medium text-gray-700">Studio output will be saved here.</p>
        <p class="text-xs text-gray-400 mt-1 leading-relaxed">
          After adding sources, click to add Audio Overview, Study Guide, Mind Map, and more!
        </p>
      </div>
    </div>

    <!-- Add note -->
    <div v-if="caseId" class="border-t border-gray-100 p-3">
      <button class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm rounded-full transition">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Add note
      </button>
    </div>
  </aside>
</template>
