<script setup lang="ts">
import { nextTick, watch, ref } from "vue";
import type { ChatMessage } from "@/stores/chat.store";
import MessageBubble from "./MessageBubble.vue";

const props = defineProps<{
  messages: ChatMessage[];
  loading: boolean;
  activeCaseId: string | null;
}>();

const scrollContainer = ref<HTMLDivElement | null>(null);

watch(() => props.messages.length, async () => {
  await nextTick();
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
  }
});
</script>

<template>
  <div ref="scrollContainer" class="flex-1 overflow-y-auto bg-white">
    <!-- No active case -->
    <div v-if="!activeCaseId" class="h-full flex items-center justify-center px-8">
      <div class="text-center max-w-md">
        <div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
          <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h2 class="text-xl font-semibold text-gray-900 mb-2">Welcome to LexiMini</h2>
        <p class="text-sm text-gray-500 mb-6 leading-relaxed">
          Your AI legal assistant. Add sources from the left panel, or use Studio actions on the right to draft documents instantly.
        </p>
        <div class="grid grid-cols-2 gap-2.5 text-left">
          <div class="bg-white border border-gray-200 rounded-lg p-3">
            <div class="text-base mb-0.5">📄</div>
            <p class="text-xs font-medium text-gray-800">Upload FIR</p>
            <p class="text-[11px] text-gray-500 mt-0.5">AI extracts facts and sections</p>
          </div>
          <div class="bg-white border border-gray-200 rounded-lg p-3">
            <div class="text-base mb-0.5">⚖️</div>
            <p class="text-xs font-medium text-gray-800">Generate Bail</p>
            <p class="text-[11px] text-gray-500 mt-0.5">Court-ready bail application</p>
          </div>
          <div class="bg-white border border-gray-200 rounded-lg p-3">
            <div class="text-base mb-0.5">🔍</div>
            <p class="text-xs font-medium text-gray-800">Case Analysis</p>
            <p class="text-[11px] text-gray-500 mt-0.5">Strengths, weaknesses, strategy</p>
          </div>
          <div class="bg-white border border-gray-200 rounded-lg p-3">
            <div class="text-base mb-0.5">💬</div>
            <p class="text-xs font-medium text-gray-800">Ask anything</p>
            <p class="text-[11px] text-gray-500 mt-0.5">Grounded in your case docs</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty case (no messages yet) -->
    <div v-else-if="!loading && messages.length === 0" class="h-full flex items-center justify-center px-8">
      <div class="text-center max-w-md">
        <h3 class="text-base font-medium text-gray-900 mb-2">Start a conversation</h3>
        <p class="text-sm text-gray-500 leading-relaxed">
          Upload sources, or type a question below. You can also use Studio actions on the right.
        </p>
      </div>
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="h-full flex items-center justify-center">
      <div class="text-sm text-gray-500">Loading messages...</div>
    </div>

    <!-- Messages -->
    <div v-else class="max-w-3xl mx-auto py-6 px-6 space-y-4">
      <MessageBubble
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
      />
    </div>
  </div>
</template>
