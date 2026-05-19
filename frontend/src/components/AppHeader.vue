<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import type { CaseItem } from "@/stores/cases.store";

const props = defineProps<{
  title: string;
  caseCount: number;
  cases: CaseItem[];
  activeCaseId: string | null;
  showCasesNav: boolean;
}>();

const emit = defineEmits<{
  "new-case": [];
  "toggle-cases": [];
  "select-case": [id: string];
}>();

const dropdownRef = ref<HTMLDivElement | null>(null);

function handleClickOutside(e: MouseEvent) {
  if (props.showCasesNav && dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    emit("toggle-cases");
  }
}

onMounted(() => document.addEventListener("click", handleClickOutside));
onUnmounted(() => document.removeEventListener("click", handleClickOutside));

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
</script>

<template>
  <header class="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200">
    <!-- Left: logo + title + dropdown -->
    <div class="flex items-center gap-3" ref="dropdownRef">
      <div class="flex items-center gap-2">
        <div class="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
      </div>

      <button
        @click.stop="emit('toggle-cases')"
        class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 rounded-lg transition group"
      >
        <h1 class="text-lg font-medium text-gray-900 truncate max-w-md">{{ title }}</h1>
        <svg class="w-4 h-4 text-gray-500 group-hover:text-gray-700 transition" :class="{ 'rotate-180': showCasesNav }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <!-- Cases dropdown -->
      <Transition name="fade-down">
        <div
          v-if="showCasesNav"
          class="absolute top-16 left-16 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-[70vh] overflow-y-auto"
        >
          <div class="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
            <span class="text-sm font-medium text-gray-700">Your Notebooks ({{ caseCount }})</span>
            <button
              @click="emit('new-case')"
              class="text-xs px-2.5 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition"
            >
              + New
            </button>
          </div>
          <div v-if="cases.length === 0" class="px-4 py-8 text-center text-sm text-gray-400">
            No notebooks yet
          </div>
          <button
            v-for="c in cases"
            :key="c.id"
            @click="emit('select-case', c.id)"
            :class="[
              'w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition border-b border-gray-100 last:border-0',
              activeCaseId === c.id ? 'bg-indigo-50' : '',
            ]"
          >
            <div class="w-8 h-8 rounded-md bg-gradient-to-br from-indigo-100 to-purple-100 flex-shrink-0 flex items-center justify-center mt-0.5">
              <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2" />
              </svg>
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-gray-900 truncate">{{ c.title }}</p>
              <div class="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                <span>{{ timeAgo(c.updatedAt) }} ago</span>
                <span v-if="c._count?.documents">·</span>
                <span v-if="c._count?.documents">{{ c._count.documents }} sources</span>
              </div>
            </div>
          </button>
        </div>
      </Transition>
    </div>

    <!-- Right: actions -->
    <div class="flex items-center gap-2">
      <button
        @click="emit('new-case')"
        class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-full hover:bg-gray-800 transition"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
        </svg>
        Create notebook
      </button>

      <button class="p-2 hover:bg-gray-100 rounded-full transition" title="Share">
        <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
      </button>

      <button class="p-2 hover:bg-gray-100 rounded-full transition" title="Settings">
        <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      <div class="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-sm font-medium ml-2">
        L
      </div>
    </div>
  </header>
</template>

<style scoped>
.fade-down-enter-active, .fade-down-leave-active { transition: all 0.15s ease; }
.fade-down-enter-from, .fade-down-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
