<script setup lang="ts">
defineProps<{
  caseTitle: string;
  sourceCount: number;
  enabledSourceCount: number;
}>();
</script>

<template>
  <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
    <div class="flex items-center gap-3 min-w-0">
      <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 via-pink-400 to-orange-400 flex-shrink-0 flex items-center justify-center shadow-sm">
        <span class="text-white text-lg">📋</span>
      </div>
      <div class="min-w-0">
        <h2 class="font-medium text-gray-900 truncate">{{ caseTitle }}</h2>
        <p class="text-xs text-gray-500">
          {{ sourceCount }} {{ sourceCount === 1 ? "source" : "sources" }} ·
          {{ new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) }}
        </p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <button class="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-700 hover:bg-gray-50 transition">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
        Customize
      </button>
      <button class="p-1.5 hover:bg-gray-100 rounded transition">
        <svg class="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
    </div>
  </div>
</template>
