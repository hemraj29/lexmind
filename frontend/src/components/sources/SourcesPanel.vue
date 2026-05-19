<script setup lang="ts">
import { ref } from "vue";
import { useSourcesStore } from "@/stores/sources.store";
import AddSourceCard from "./AddSourceCard.vue";
import WebSearchBar from "./WebSearchBar.vue";
import SourceItem from "./SourceItem.vue";

const props = defineProps<{ caseId: string | null }>();
const emit = defineEmits<{ collapse: [] }>();

const sourcesStore = useSourcesStore();
const fileInputRef = ref<HTMLInputElement | null>(null);

async function handleFiles(files: FileList | null) {
  if (!files || !props.caseId) return;
  for (const file of Array.from(files)) {
    await sourcesStore.uploadSource(props.caseId, file);
  }
}

async function handleWebSearch(query: string) {
  if (!props.caseId) return;
  await sourcesStore.searchWeb(props.caseId, query);
}
</script>

<template>
  <aside class="w-[340px] flex-shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
      <div class="flex items-center gap-2">
        <h2 class="font-medium text-gray-900">Sources</h2>
        <span v-if="sourcesStore.sourceCount > 0" class="text-xs text-gray-500 px-1.5 py-0.5 bg-gray-100 rounded">
          {{ sourcesStore.sourceCount }}
        </span>
      </div>
      <button
        @click="emit('collapse')"
        class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition"
        title="Collapse"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </svg>
      </button>
    </div>

    <!-- Add Source -->
    <div class="px-4 pt-4">
      <AddSourceCard
        :uploading="sourcesStore.uploading"
        :disabled="!caseId"
        @click="fileInputRef?.click()"
      />
      <input
        ref="fileInputRef"
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.docx"
        class="hidden"
        @change="(e) => handleFiles((e.target as HTMLInputElement).files)"
      />
    </div>

    <!-- Web Search -->
    <div class="px-4 pt-3">
      <WebSearchBar
        :searching="sourcesStore.searching"
        :disabled="!caseId"
        @search="handleWebSearch"
      />
    </div>

    <!-- Sources list -->
    <div class="flex-1 overflow-y-auto px-2 py-3">
      <div v-if="sourcesStore.loading" class="text-center py-8 text-sm text-gray-400">
        Loading sources...
      </div>

      <div v-else-if="sourcesStore.sources.length === 0" class="px-4 py-12 text-center">
        <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p class="text-sm font-medium text-gray-700 mb-1">Saved sources will appear here</p>
        <p class="text-xs text-gray-400 leading-relaxed">
          Click Add source above to add PDFs, websites, text, videos, or audio files. Or import a file directly from Google Drive.
        </p>
      </div>

      <div v-else class="space-y-1">
        <SourceItem
          v-for="source in sourcesStore.sources"
          :key="source.id"
          :source="source"
          @toggle="(enabled) => caseId && sourcesStore.toggleSource(caseId, source.id, enabled)"
          @remove="caseId && sourcesStore.removeSource(caseId, source.id)"
        />
      </div>
    </div>

    <!-- Footer: Select all -->
    <div v-if="sourcesStore.sources.length > 0" class="border-t border-gray-100 px-4 py-2 flex items-center justify-between text-xs">
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          :checked="sourcesStore.enabledSources.length === sourcesStore.sourceCount"
          @change="(e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            sourcesStore.sources.forEach(s => caseId && sourcesStore.toggleSource(caseId, s.id, enabled));
          }"
          class="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <span class="text-gray-600">Select all sources</span>
      </label>
      <span class="text-gray-400">{{ sourcesStore.enabledSources.length }}/{{ sourcesStore.sourceCount }}</span>
    </div>
  </aside>
</template>
