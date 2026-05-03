<script setup lang="ts">
import { computed } from "vue";
import type { ChatMessage } from "@/stores/chat.store";
import AnalysisCard from "./AnalysisCard.vue";
import GenerationCard from "./GenerationCard.vue";

const props = defineProps<{ message: ChatMessage }>();

const isUser = computed(() => props.message.role === "USER");
const isThinking = computed(() => props.message.content === "Thinking...");

const parsedCard = computed(() => {
  if (props.message.type === "ANALYSIS_CARD" || props.message.type === "GENERATION_CARD") {
    try {
      return JSON.parse(props.message.content);
    } catch {
      return null;
    }
  }
  return null;
});
</script>

<template>
  <div :class="['flex gap-3', isUser ? 'justify-end' : 'justify-start']">
    <!-- AI avatar -->
    <div v-if="!isUser" class="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-1">
      <span class="text-white text-xs font-bold">AI</span>
    </div>

    <!-- Message content -->
    <div :class="['max-w-[80%]', isUser ? 'order-first' : '']">
      <!-- Text message -->
      <div
        v-if="message.type === 'TEXT' || message.type === 'FILE_UPLOAD' || message.type === 'COMMAND'"
        :class="[
          'rounded-2xl px-4 py-2.5',
          isUser ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-200',
          isThinking ? 'animate-pulse' : '',
        ]"
      >
        <div class="text-sm whitespace-pre-wrap leading-relaxed" v-html="formatMarkdown(message.content)" />
      </div>

      <!-- Analysis card -->
      <AnalysisCard v-else-if="message.type === 'ANALYSIS_CARD' && parsedCard" :data="parsedCard" />

      <!-- Generation card -->
      <GenerationCard v-else-if="message.type === 'GENERATION_CARD' && parsedCard" :data="parsedCard" />

      <!-- Timestamp -->
      <p :class="['text-xs mt-1', isUser ? 'text-right text-gray-400' : 'text-gray-500']">
        {{ new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
      </p>
    </div>

    <!-- User avatar -->
    <div v-if="isUser" class="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0 mt-1">
      <span class="text-white text-xs font-bold">You</span>
    </div>
  </div>
</template>

<script lang="ts">
function formatMarkdown(text: string): string {
  if (!text) return "";
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, '<h4 class="font-semibold text-base mt-2 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="font-semibold text-lg mt-3 mb-1">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="font-bold text-xl mt-4 mb-2">$1</h2>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/^[-•]\s+(.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n/g, "<br>");
}
</script>
