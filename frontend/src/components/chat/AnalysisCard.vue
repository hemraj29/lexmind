<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ data: Record<string, unknown> }>();

const isDocAnalysis = computed(() => !!props.data.docType);
const isCaseAnalysis = computed(() => !!props.data.strengths);

const extractedData = computed(() => {
  if (isDocAnalysis.value) {
    const inner = (props.data.extractedData as any)?.data || props.data.extractedData;
    return inner || {};
  }
  return {};
});

function humanLabel(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim();
}
</script>

<template>
  <div class="bg-white border border-gray-200 rounded-xl p-4 max-w-lg shadow-sm">
    <!-- Document Analysis Card -->
    <template v-if="isDocAnalysis">
      <div class="flex items-center gap-2.5 mb-3">
        <div class="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
          <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <span class="text-xs font-semibold uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700">
            {{ (data.docType as string)?.replace(/_/g, " ") }}
          </span>
          <span v-if="data.confidence" class="text-xs text-gray-400 ml-2">
            {{ Math.round((data.confidence as number) * 100) }}% confidence
          </span>
        </div>
      </div>

      <div class="space-y-1.5 text-sm divide-y divide-gray-100">
        <template v-for="(value, key) in extractedData" :key="key">
          <div v-if="typeof value === 'string' && value && !['rawText', 'confidence'].includes(key as string)" class="flex gap-3 py-1.5">
            <span class="text-gray-500 min-w-[110px] text-xs">{{ humanLabel(key as string) }}</span>
            <span class="text-gray-800 flex-1">{{ (value as string).slice(0, 200) }}{{ (value as string).length > 200 ? '...' : '' }}</span>
          </div>
          <div v-else-if="Array.isArray(value) && value.length > 0 && key !== 'rawText'" class="flex gap-3 py-1.5">
            <span class="text-gray-500 min-w-[110px] text-xs">{{ humanLabel(key as string) }}</span>
            <span class="text-gray-800 flex-1">{{ value.join(", ") }}</span>
          </div>
        </template>
      </div>
    </template>

    <!-- Case Analysis Card -->
    <template v-else-if="isCaseAnalysis">
      <h3 class="text-gray-900 font-semibold mb-3 flex items-center gap-2">
        <span class="w-7 h-7 rounded-lg bg-yellow-50 flex items-center justify-center">
          <svg class="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </span>
        Case Strategy Analysis
      </h3>

      <!-- Bail Prospect -->
      <div v-if="(data as any).bailProspect" class="mb-3 p-2.5 rounded-lg border"
        :class="{
          'bg-emerald-50 border-emerald-200': (data as any).bailProspect.overall === 'likely',
          'bg-amber-50 border-amber-200': (data as any).bailProspect.overall === 'uncertain',
          'bg-red-50 border-red-200': (data as any).bailProspect.overall === 'unlikely',
        }"
      >
        <span class="text-xs font-semibold uppercase tracking-wider"
          :class="{
            'text-emerald-700': (data as any).bailProspect.overall === 'likely',
            'text-amber-700': (data as any).bailProspect.overall === 'uncertain',
            'text-red-700': (data as any).bailProspect.overall === 'unlikely',
          }"
        >
          Bail Prospect: {{ (data as any).bailProspect.overall }}
        </span>
      </div>

      <!-- Strengths -->
      <div v-if="(data as any).strengths?.length" class="mb-3">
        <p class="text-emerald-700 text-xs font-semibold uppercase tracking-wider mb-1.5">Strengths</p>
        <div v-for="s in (data as any).strengths.slice(0, 3)" :key="s.point" class="text-xs text-gray-700 mb-1 flex gap-1.5">
          <span class="text-emerald-500">+</span>
          <span>{{ s.point }}</span>
        </div>
      </div>

      <!-- Weaknesses -->
      <div v-if="(data as any).weaknesses?.length" class="mb-3">
        <p class="text-red-700 text-xs font-semibold uppercase tracking-wider mb-1.5">Weaknesses</p>
        <div v-for="w in (data as any).weaknesses.slice(0, 3)" :key="w.point" class="text-xs text-gray-700 mb-1 flex gap-1.5">
          <span class="text-red-500">-</span>
          <span>{{ w.point }}</span>
        </div>
      </div>

      <!-- Recommendations -->
      <div v-if="(data as any).recommendedPetitions?.length" class="mt-3 pt-3 border-t border-gray-100">
        <p class="text-indigo-700 text-xs font-semibold uppercase tracking-wider mb-1.5">Recommended Actions</p>
        <div v-for="r in (data as any).recommendedPetitions" :key="r.type" class="text-xs text-gray-700 mb-1">
          <span class="font-medium">{{ r.priority }}.</span>
          <span class="font-medium ml-1">{{ r.type.replace(/_/g, " ") }}</span>
          <span class="text-gray-500"> — {{ r.reasoning?.slice(0, 80) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
