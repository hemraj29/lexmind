<script setup lang="ts">
import { computed, ref } from "vue";
import type { Source } from "@/stores/sources.store";

const props = defineProps<{ source: Source }>();
const emit = defineEmits<{
  toggle: [enabled: boolean];
  remove: [];
}>();

const showMenu = ref(false);

const typeConfig = computed(() => {
  const configs: Record<string, { icon: string; color: string; label: string }> = {
    fir: { icon: "shield", color: "text-red-600 bg-red-50", label: "FIR" },
    chargesheet: { icon: "file", color: "text-orange-600 bg-orange-50", label: "Chargesheet" },
    court_order: { icon: "gavel", color: "text-purple-600 bg-purple-50", label: "Court Order" },
    witness_statement: { icon: "user", color: "text-blue-600 bg-blue-50", label: "Witness" },
    evidence: { icon: "package", color: "text-amber-600 bg-amber-50", label: "Evidence" },
    previous_petition: { icon: "scale", color: "text-emerald-600 bg-emerald-50", label: "Petition" },
    web: { icon: "globe", color: "text-sky-600 bg-sky-50", label: "Web" },
    other: { icon: "file", color: "text-gray-600 bg-gray-50", label: "Other" },
  };
  return configs[props.source.type] || configs.other;
});
</script>

<template>
  <div
    :class="[
      'group flex items-start gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition',
      source.enabled ? 'hover:bg-gray-50' : 'opacity-60 hover:bg-gray-50',
    ]"
  >
    <!-- Checkbox -->
    <input
      type="checkbox"
      :checked="source.enabled"
      @change="emit('toggle', ($event.target as HTMLInputElement).checked)"
      class="mt-1.5 w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
    />

    <!-- Icon -->
    <div :class="['flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center', typeConfig.color]">
      <svg v-if="source.type === 'web'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>

    <!-- Name + meta -->
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium text-gray-900 truncate">
        {{ source.title }}
      </p>
      <div class="flex items-center gap-1.5 mt-0.5 text-xs text-gray-400">
        <span class="font-medium">{{ typeConfig.label }}</span>
        <span v-if="source.fileName">·</span>
        <span v-if="source.fileName" class="truncate">{{ source.fileName }}</span>
        <span v-if="source.confidence">·</span>
        <span v-if="source.confidence">{{ Math.round(source.confidence * 100) }}%</span>
      </div>
    </div>

    <!-- Menu -->
    <button
      @click.stop="showMenu = !showMenu"
      class="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition"
    >
      <svg class="w-3.5 h-3.5 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
        <circle cx="5" cy="12" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="19" cy="12" r="2" />
      </svg>
    </button>

    <!-- Dropdown menu -->
    <div
      v-if="showMenu"
      class="absolute right-2 mt-8 w-32 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1"
      @click.stop
    >
      <button
        @click="emit('remove'); showMenu = false"
        class="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition"
      >
        Remove
      </button>
    </div>
  </div>
</template>
