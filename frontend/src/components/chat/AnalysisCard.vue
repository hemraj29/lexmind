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
</script>

<template>
  <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 max-w-lg">
    <!-- Document Analysis Card -->
    <template v-if="isDocAnalysis">
      <div class="flex items-center gap-2 mb-3">
        <div class="w-8 h-8 bg-blue-900/50 rounded-lg flex items-center justify-center">
          <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <span class="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 uppercase">
            {{ (data.docType as string)?.replace(/_/g, ' ') }}
          </span>
          <span v-if="data.confidence" class="text-xs text-gray-500 ml-2">
            {{ Math.round((data.confidence as number) * 100) }}% confidence
          </span>
        </div>
      </div>

      <div class="space-y-1.5 text-sm">
        <div v-for="(value, key) in extractedData" :key="key as string" class="flex gap-2">
          <template v-if="typeof value === 'string' && value && !['rawText', 'confidence'].includes(key as string)">
            <span class="text-gray-500 capitalize min-w-[100px]">{{ (key as string).replace(/([A-Z])/g, ' $1').trim() }}:</span>
            <span class="text-gray-300">{{ (value as string).slice(0, 200) }}{{ (value as string).length > 200 ? '...' : '' }}</span>
          </template>
          <template v-else-if="Array.isArray(value) && value.length > 0 && key !== 'rawText'">
            <span class="text-gray-500 capitalize min-w-[100px]">{{ (key as string).replace(/([A-Z])/g, ' $1').trim() }}:</span>
            <span class="text-gray-300">{{ value.join(', ') }}</span>
          </template>
        </div>
      </div>
    </template>

    <!-- Case Analysis Card -->
    <template v-else-if="isCaseAnalysis">
      <h3 class="text-white font-semibold mb-3 flex items-center gap-2">
        <svg class="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        Case Strategy Analysis
      </h3>

      <!-- Bail Prospect -->
      <div v-if="(data as any).bailProspect" class="mb-3 p-2 rounded-lg"
        :class="{
          'bg-green-900/30': (data as any).bailProspect.overall === 'likely',
          'bg-yellow-900/30': (data as any).bailProspect.overall === 'uncertain',
          'bg-red-900/30': (data as any).bailProspect.overall === 'unlikely',
        }"
      >
        <span class="text-xs font-medium"
          :class="{
            'text-green-400': (data as any).bailProspect.overall === 'likely',
            'text-yellow-400': (data as any).bailProspect.overall === 'uncertain',
            'text-red-400': (data as any).bailProspect.overall === 'unlikely',
          }"
        >
          Bail Prospect: {{ ((data as any).bailProspect.overall as string).toUpperCase() }}
        </span>
      </div>

      <!-- Strengths -->
      <div v-if="(data as any).strengths?.length" class="mb-2">
        <p class="text-green-400 text-xs font-medium mb-1">Strengths</p>
        <div v-for="s in (data as any).strengths.slice(0, 3)" :key="s.point" class="text-xs text-gray-300 mb-1">
          <span :class="{ 'text-green-300': s.significance === 'high', 'text-yellow-300': s.significance === 'medium' }">
            {{ s.significance === 'high' ? '++' : '+' }}
          </span> {{ s.point }}
        </div>
      </div>

      <!-- Weaknesses -->
      <div v-if="(data as any).weaknesses?.length" class="mb-2">
        <p class="text-red-400 text-xs font-medium mb-1">Weaknesses</p>
        <div v-for="w in (data as any).weaknesses.slice(0, 3)" :key="w.point" class="text-xs text-gray-300 mb-1">
          <span class="text-red-300">-</span> {{ w.point }}
        </div>
      </div>

      <!-- Recommendations -->
      <div v-if="(data as any).recommendedPetitions?.length" class="mt-2 pt-2 border-t border-gray-700">
        <p class="text-indigo-400 text-xs font-medium mb-1">Recommended Actions</p>
        <div v-for="r in (data as any).recommendedPetitions" :key="r.type" class="text-xs text-gray-300 mb-1">
          {{ r.priority }}. <strong>{{ r.type.replace(/_/g, ' ') }}</strong> — {{ r.reasoning?.slice(0, 80) }}
        </div>
      </div>
    </template>
  </div>
</template>
