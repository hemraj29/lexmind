<script setup lang="ts">
import { onMounted, ref } from "vue";
import { usePipelineStore } from "@/stores/pipeline.store";

const props = defineProps<{ id: string }>();
const store = usePipelineStore();
const activeTab = ref<"draft" | "fir" | "memo">("draft");

onMounted(() => {
  store.fetchResult(props.id);
});

function downloadDocx() {
  window.open(`/api/pipeline/${props.id}/download`, "_blank");
}
</script>

<template>
  <div class="max-w-5xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Bail Application Draft</h1>
        <p class="text-gray-500 text-sm">Run: {{ id }}</p>
      </div>
      <button
        @click="downloadDocx"
        class="px-6 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition flex items-center gap-2"
      >
        Download .docx
      </button>
    </div>

    <!-- Loading -->
    <div v-if="store.loading" class="text-center py-20 text-gray-500">
      Loading result...
    </div>

    <div v-else-if="store.currentResult">
      <!-- Tabs -->
      <div class="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          v-for="tab in ['draft', 'fir', 'memo'] as const"
          :key="tab"
          @click="activeTab = tab"
          :class="[
            'px-4 py-2 rounded-md text-sm font-medium transition',
            activeTab === tab
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          ]"
        >
          {{ tab === 'draft' ? 'Draft Preview' : tab === 'fir' ? 'Extracted FIR' : 'Legal Memo' }}
        </button>
      </div>

      <!-- Draft Preview -->
      <div v-if="activeTab === 'draft'" class="bg-white rounded-xl border border-gray-200 p-8">
        <div
          class="prose max-w-none"
          v-html="markdownToHtml(store.currentResult.draftMarkdown)"
        />
      </div>

      <!-- FIR Data -->
      <div v-if="activeTab === 'fir'" class="bg-white rounded-xl border border-gray-200 p-6">
        <pre class="text-sm text-gray-700 overflow-auto">{{ JSON.stringify(store.currentResult.fir, null, 2) }}</pre>
      </div>

      <!-- Legal Memo -->
      <div v-if="activeTab === 'memo'" class="bg-white rounded-xl border border-gray-200 p-6">
        <pre class="text-sm text-gray-700 overflow-auto">{{ JSON.stringify(store.currentResult.memo, null, 2) }}</pre>
      </div>

      <!-- Step timings -->
      <div class="mt-6 bg-gray-50 rounded-lg p-4">
        <p class="text-xs text-gray-400 mb-2">Pipeline steps</p>
        <div class="flex gap-4 flex-wrap">
          <div
            v-for="step in (store.currentResult.steps as any[])"
            :key="step.step"
            class="text-xs text-gray-600"
          >
            <span class="font-medium">{{ step.step }}</span>:
            {{ step.durationMs ? `${(step.durationMs / 1000).toFixed(1)}s` : '—' }}
          </div>
        </div>
        <p class="text-xs text-gray-400 mt-2">
          Total: {{ store.currentResult.totalDurationMs ? `${(store.currentResult.totalDurationMs / 1000).toFixed(1)}s` : '—' }}
        </p>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
// Simple markdown to HTML (headings, bold, lists, paragraphs)
function markdownToHtml(md: string): string {
  if (!md) return "";
  return md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^---$/gm, "<hr>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
}
</script>
