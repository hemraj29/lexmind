<script setup lang="ts">
import { useCitationStore } from "@/stores/citation.store";

const store = useCitationStore();

const sourceLabels: Record<string, { label: string; color: string }> = {
  section: { label: "STATUTE", color: "text-emerald-700 bg-emerald-50" },
  precedent: { label: "JUDGMENT", color: "text-blue-700 bg-blue-50" },
  document: { label: "CASE DOCUMENT", color: "text-amber-700 bg-amber-50" },
  web: { label: "WEB SOURCE", color: "text-purple-700 bg-purple-50" },
};

function openOriginal() {
  if (!store.preview) return;
  const url = store.preview.sourceUrl || store.preview.pdfUrl || store.preview.documentUrl;
  if (url) window.open(url, "_blank");
}
</script>

<template>
  <Transition name="slide">
    <div
      v-if="store.isOpen"
      class="fixed right-3 top-20 bottom-3 w-[42%] max-w-2xl bg-white border border-gray-200 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div class="flex items-center gap-2">
          <span
            v-if="store.preview"
            :class="['text-xs font-bold tracking-wider px-2 py-0.5 rounded', sourceLabels[store.preview.sourceType]?.color || 'bg-gray-100 text-gray-700']"
          >
            {{ sourceLabels[store.preview.sourceType]?.label || "SOURCE" }}
          </span>
          <span v-if="store.preview?.pageNumber" class="text-xs text-gray-500">
            Page {{ store.preview.pageNumber }}
            <span v-if="store.preview.paragraphRef">· {{ store.preview.paragraphRef }}</span>
          </span>
        </div>
        <button
          @click="store.close"
          class="p-1.5 hover:bg-gray-100 rounded transition"
          title="Close"
        >
          <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Loading -->
      <div v-if="store.loading" class="flex-1 flex items-center justify-center">
        <div class="text-sm text-gray-400">Loading source...</div>
      </div>

      <!-- Content -->
      <template v-else-if="store.preview">
        <div class="px-4 py-3 border-b border-gray-100">
          <h3 class="font-semibold text-gray-900">{{ store.preview.title }}</h3>
          <p v-if="store.preview.reference" class="text-xs text-gray-500 mt-1">{{ store.preview.reference }}</p>
        </div>

        <!-- Excerpt -->
        <div class="px-4 py-4 bg-yellow-50 border-b border-yellow-100">
          <p class="text-xs font-semibold text-yellow-800 uppercase tracking-wider mb-2">Cited Passage</p>
          <blockquote class="text-sm text-gray-800 leading-relaxed border-l-2 border-yellow-400 pl-3 italic">
            "{{ store.preview.excerptText }}"
          </blockquote>
        </div>

        <!-- Inline source viewer -->
        <div class="flex-1 overflow-hidden">
          <iframe
            v-if="store.preview.pdfUrl || store.preview.documentUrl"
            :src="store.preview.pdfUrl || store.preview.documentUrl"
            class="w-full h-full bg-gray-50"
            title="Source"
          />
          <iframe
            v-else-if="store.preview.sourceUrl"
            :src="store.preview.sourceUrl"
            class="w-full h-full bg-white"
            title="Source"
            sandbox="allow-same-origin allow-scripts allow-popups"
          />
          <div v-else class="flex items-center justify-center h-full text-gray-400 text-sm px-8 text-center">
            Inline preview not available for this source. Click "Open original" below to view.
          </div>
        </div>

        <!-- Footer -->
        <div class="border-t border-gray-100 p-3">
          <button
            @click="openOriginal"
            class="w-full py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition"
          >
            Open original in new tab
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        </div>
      </template>
    </div>
  </Transition>
</template>

<style scoped>
.slide-enter-active, .slide-leave-active { transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-enter-from, .slide-leave-to { transform: translateX(20px); opacity: 0; }
</style>
