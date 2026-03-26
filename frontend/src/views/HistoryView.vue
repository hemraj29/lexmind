<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { usePipelineStore } from "@/stores/pipeline.store";

const router = useRouter();
const store = usePipelineStore();

onMounted(() => {
  store.fetchHistory();
});

function statusColor(status: string) {
  switch (status) {
    case "completed": return "bg-green-100 text-green-700";
    case "running": return "bg-blue-100 text-blue-700";
    case "failed": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleString();
}
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">Pipeline History</h1>

    <div v-if="store.loading" class="text-center py-10 text-gray-500">Loading...</div>

    <div v-else-if="store.runs.length === 0" class="text-center py-10 text-gray-400">
      No pipeline runs yet. Generate your first bail application!
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="run in store.runs"
        :key="run.id"
        @click="router.push({ name: 'draft', params: { id: run.id } })"
        class="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between cursor-pointer hover:border-indigo-300 transition"
      >
        <div class="flex items-center gap-4">
          <span :class="['px-2.5 py-1 rounded-full text-xs font-medium', statusColor(run.status)]">
            {{ run.status }}
          </span>
          <div>
            <p class="font-medium text-gray-900">{{ run.fileName }}</p>
            <p class="text-xs text-gray-400">{{ formatDate(run.createdAt) }}</p>
          </div>
        </div>
        <div class="text-sm text-gray-500">
          {{ run.totalDurationMs ? `${(run.totalDurationMs / 1000).toFixed(1)}s` : "—" }}
        </div>
      </div>
    </div>
  </div>
</template>
