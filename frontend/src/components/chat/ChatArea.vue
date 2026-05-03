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
  <div ref="scrollContainer" class="flex-1 overflow-y-auto">
    <!-- Empty state -->
    <div v-if="!activeCaseId" class="h-full flex items-center justify-center">
      <div class="text-center max-w-md">
        <div class="w-16 h-16 bg-indigo-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span class="text-3xl font-bold text-indigo-400">LM</span>
        </div>
        <h2 class="text-2xl font-bold text-white mb-2">LexiMini</h2>
        <p class="text-gray-400 mb-6">
          Your AI defense lawyer assistant. Create a new case or select one from the sidebar to get started.
        </p>
        <div class="grid grid-cols-2 gap-3 text-left">
          <div class="bg-gray-800 rounded-lg p-3 border border-gray-700">
            <p class="text-sm text-gray-300 font-medium">Upload FIR</p>
            <p class="text-xs text-gray-500 mt-1">AI extracts facts, sections, accused details</p>
          </div>
          <div class="bg-gray-800 rounded-lg p-3 border border-gray-700">
            <p class="text-sm text-gray-300 font-medium">@bail</p>
            <p class="text-xs text-gray-500 mt-1">Generate court-ready bail application</p>
          </div>
          <div class="bg-gray-800 rounded-lg p-3 border border-gray-700">
            <p class="text-sm text-gray-300 font-medium">@analyze</p>
            <p class="text-xs text-gray-500 mt-1">Full case strategy analysis</p>
          </div>
          <div class="bg-gray-800 rounded-lg p-3 border border-gray-700">
            <p class="text-sm text-gray-300 font-medium">Ask anything</p>
            <p class="text-xs text-gray-500 mt-1">Chat about your case for legal advice</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="h-full flex items-center justify-center">
      <div class="text-gray-400">Loading messages...</div>
    </div>

    <!-- Messages -->
    <div v-else class="max-w-3xl mx-auto py-6 px-4 space-y-4">
      <MessageBubble
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
      />
    </div>
  </div>
</template>
