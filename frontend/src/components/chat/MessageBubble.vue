<script setup lang="ts">
import { computed } from "vue";
import type { ChatMessage } from "@/stores/chat.store";
import AnalysisCard from "./AnalysisCard.vue";
import GenerationCard from "./GenerationCard.vue";
import { useCitationStore } from "@/stores/citation.store";

const props = defineProps<{ message: ChatMessage }>();
const citationStore = useCitationStore();

function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.classList?.contains("cite-chip")) {
    const id = target.getAttribute("data-cite-id");
    if (id) citationStore.open(id);
  }
}

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

function formatMarkdown(text: string): string {
  if (!text) return "";
  return text
    .replace(/\[\^(cite_\d+)\]/g, '<sup class="cite-chip text-indigo-600 font-medium cursor-pointer" data-cite-id="$1">[$1]</sup>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, '<h4 class="font-semibold text-base mt-2 mb-1 text-gray-900">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="font-semibold text-lg mt-3 mb-1 text-gray-900">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="font-bold text-xl mt-4 mb-2 text-gray-900">$1</h2>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/^[-•]\s+(.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n/g, "<br>");
}
</script>

<template>
  <div :class="['flex gap-3', isUser ? 'justify-end' : 'justify-start']">
    <!-- AI avatar -->
    <div v-if="!isUser" class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
      <span class="text-white text-[10px] font-bold">AI</span>
    </div>

    <!-- Content -->
    <div :class="['max-w-[80%]', isUser ? 'order-first' : '']">
      <!-- Text -->
      <div
        v-if="message.type === 'TEXT' || message.type === 'FILE_UPLOAD' || message.type === 'COMMAND'"
        :class="[
          'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-800 border border-gray-100',
          isThinking ? 'animate-pulse' : '',
        ]"
        @click="handleClick"
      >
        <div class="whitespace-pre-wrap" v-html="formatMarkdown(message.content)" />
      </div>

      <!-- Cards -->
      <AnalysisCard v-else-if="message.type === 'ANALYSIS_CARD' && parsedCard" :data="parsedCard" />
      <GenerationCard v-else-if="message.type === 'GENERATION_CARD' && parsedCard" :data="parsedCard" />

      <p :class="['text-[11px] mt-1 px-1', isUser ? 'text-right text-gray-400' : 'text-gray-400']">
        {{ new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }}
      </p>
    </div>

    <!-- User avatar -->
    <div v-if="isUser" class="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0 mt-0.5">
      <span class="text-white text-[10px] font-bold">You</span>
    </div>
  </div>
</template>

<style>
.cite-chip {
  display: inline-block;
  padding: 0 3px;
  margin: 0 1px;
  border-radius: 3px;
  background: rgba(99, 102, 241, 0.08);
  font-size: 0.75em;
  vertical-align: super;
  transition: background 0.15s;
}
.cite-chip:hover {
  background: rgba(99, 102, 241, 0.18);
}
</style>
