<script setup lang="ts">
const props = defineProps<{
  data: {
    type: string;
    runId: string;
    status: string;
    downloadUrl?: string;
    markdown?: string;
  };
}>();

const docTypeLabels: Record<string, string> = {
  regular_bail: "Regular Bail Application",
  anticipatory_bail: "Anticipatory Bail Application",
  default_bail: "Default Bail Application",
  quashing_petition: "Quashing Petition",
  discharge_application: "Discharge Application",
  criminal_appeal: "Criminal Appeal",
};

function download() {
  if (props.data.downloadUrl) window.open(props.data.downloadUrl, "_blank");
}
</script>

<template>
  <div class="bg-white border border-gray-200 rounded-xl p-4 max-w-lg shadow-sm">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
        <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <div>
        <p class="font-medium text-sm text-gray-900">
          {{ docTypeLabels[data.type] || data.type }}
        </p>
        <p class="text-xs" :class="data.status === 'completed' ? 'text-emerald-600' : 'text-amber-600'">
          {{ data.status === "completed" ? "Generated successfully" : "Generating..." }}
        </p>
      </div>
    </div>

    <div v-if="data.markdown" class="bg-gray-50 border border-gray-100 rounded-lg p-3 mb-3 max-h-32 overflow-hidden">
      <p class="text-xs text-gray-600 leading-relaxed">{{ data.markdown }}</p>
    </div>

    <button
      v-if="data.downloadUrl && data.status === 'completed'"
      @click="download"
      class="w-full px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition flex items-center justify-center gap-2"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      Download .docx
    </button>
  </div>
</template>
