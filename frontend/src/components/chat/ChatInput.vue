<script setup lang="ts">
import { ref } from "vue";
import CommandChips from "./CommandChips.vue";

const props = defineProps<{
  disabled: boolean;
  sending: boolean;
  sourceCount: number;
}>();
const emit = defineEmits<{ send: [content: string, file?: File] }>();

const content = ref("");
const file = ref<File | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

function handleSend() {
  const text = content.value.trim();
  if (!text && !file.value) return;
  emit("send", text, file.value || undefined);
  content.value = "";
  file.value = null;
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

function handleFileSelect(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) file.value = f;
}

function clearFile() {
  file.value = null;
  if (fileInputRef.value) fileInputRef.value.value = "";
}

function handleCommand(cmd: string) {
  // Send the command immediately on chip click
  emit("send", cmd);
}
</script>

<template>
  <div class="px-6 py-4 border-t border-gray-100 bg-white">
    <!-- File preview -->
    <div v-if="file" class="mb-2 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 max-w-sm">
      <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span class="text-sm text-gray-700 truncate flex-1">{{ file.name }}</span>
      <button @click="clearFile" class="text-gray-400 hover:text-red-500">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Input pill -->
    <div class="flex items-end gap-2 bg-white border border-gray-300 rounded-2xl px-4 py-2.5 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition">
      <button
        @click="fileInputRef?.click()"
        class="flex-shrink-0 text-gray-400 hover:text-gray-600 transition p-1"
        title="Attach file"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
      </button>
      <input
        ref="fileInputRef"
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.docx"
        class="hidden"
        @change="handleFileSelect"
      />

      <textarea
        v-model="content"
        @keydown="handleKeyDown"
        :disabled="disabled"
        :placeholder="sourceCount > 0 ? `Ask anything about your ${sourceCount} source${sourceCount > 1 ? 's' : ''}...` : 'Start typing...'"
        rows="1"
        class="flex-1 bg-transparent text-gray-800 placeholder-gray-400 text-sm resize-none outline-none max-h-32 py-1"
      />

      <div class="flex items-center gap-2 flex-shrink-0">
        <span v-if="sourceCount > 0" class="text-xs text-gray-400 hidden sm:inline">
          {{ sourceCount }} source{{ sourceCount > 1 ? 's' : '' }}
        </span>
        <button
          @click="handleSend"
          :disabled="disabled || (!content.trim() && !file)"
          :class="[
            'p-1.5 rounded-full transition',
            content.trim() || file ? 'bg-gray-900 text-white hover:bg-gray-700' : 'text-gray-300 bg-gray-100',
          ]"
        >
          <svg v-if="!sending" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
          <div v-else class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </button>
      </div>
    </div>

    <!-- Command chips below input -->
    <div class="mt-2">
      <CommandChips @command="handleCommand" />
    </div>

    <p class="text-[11px] text-gray-400 text-center mt-2">
      LexiMini may produce inaccurate answers. Always verify before filing.
    </p>
  </div>
</template>
