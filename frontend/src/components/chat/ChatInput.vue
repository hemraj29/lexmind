<script setup lang="ts">
import { ref } from "vue";
import CommandChips from "./CommandChips.vue";

defineProps<{ disabled: boolean; sending: boolean }>();
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
  const target = e.target as HTMLInputElement;
  const f = target.files?.[0];
  if (f) file.value = f;
}

function clearFile() {
  file.value = null;
  if (fileInputRef.value) fileInputRef.value.value = "";
}

function handleCommand(cmd: string) {
  content.value = cmd;
  handleSend();
}
</script>

<template>
  <div class="border-t border-gray-800 bg-gray-900 px-4 py-3">
    <!-- File preview -->
    <div v-if="file" class="mb-2 flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 max-w-xs">
      <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span class="text-sm text-gray-300 truncate">{{ file.name }}</span>
      <button @click="clearFile" class="text-gray-500 hover:text-red-400 ml-auto">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Input row -->
    <div class="max-w-3xl mx-auto">
      <div class="flex items-end gap-2 bg-gray-800 rounded-xl border border-gray-700 px-3 py-2">
        <!-- File upload button -->
        <button
          @click="fileInputRef?.click()"
          class="text-gray-400 hover:text-white transition p-1"
          title="Upload document"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>
        <input
          ref="fileInputRef"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          class="hidden"
          @change="handleFileSelect"
        />

        <!-- Text input -->
        <textarea
          v-model="content"
          @keydown="handleKeyDown"
          :disabled="disabled"
          placeholder="Type a message, upload a document, or use @commands..."
          rows="1"
          class="flex-1 bg-transparent text-white placeholder-gray-500 text-sm resize-none outline-none max-h-32"
        />

        <!-- Send button -->
        <button
          @click="handleSend"
          :disabled="disabled || (!content.trim() && !file)"
          :class="[
            'p-1.5 rounded-lg transition',
            content.trim() || file ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'text-gray-500',
          ]"
        >
          <svg v-if="!sending" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19V5m0 0l-7 7m7-7l7 7" />
          </svg>
          <div v-else class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </button>
      </div>

      <!-- Command chips -->
      <CommandChips @command="handleCommand" />
    </div>
  </div>
</template>
