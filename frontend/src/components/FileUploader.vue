<script setup lang="ts">
defineProps<{
  file: File | null;
  preview: string | null;
  error: string | null;
  isDragging: boolean;
}>();

const emit = defineEmits<{
  drop: [e: DragEvent];
  input: [e: Event];
  clear: [];
}>();
</script>

<template>
  <div>
    <!-- Drop zone (when no file selected) -->
    <div
      v-if="!file"
      @drop.prevent="emit('drop', $event)"
      @dragover.prevent="$emit('dragover', $event)"
      @dragleave="$emit('dragleave', $event)"
      :class="[
        'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition',
        isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-indigo-300 hover:bg-gray-50',
      ]"
    >
      <label class="cursor-pointer">
        <div class="flex flex-col items-center">
          <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p class="text-gray-700 font-medium mb-1">
            {{ isDragging ? 'Drop your FIR here' : 'Upload FIR Document' }}
          </p>
          <p class="text-sm text-gray-400">PDF, JPG, or PNG (max 20MB)</p>
        </div>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          class="hidden"
          @change="emit('input', $event)"
        />
      </label>
    </div>

    <!-- Selected file -->
    <div v-else class="bg-white border border-gray-200 rounded-xl p-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p class="font-medium text-gray-900">{{ file.name }}</p>
            <p class="text-xs text-gray-400">{{ (file.size / 1024 / 1024).toFixed(2) }} MB</p>
          </div>
        </div>
        <button @click="emit('clear')" class="text-gray-400 hover:text-red-500 transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Image preview -->
      <div v-if="preview" class="mt-4">
        <img :src="preview" alt="FIR Preview" class="max-h-64 rounded-lg border border-gray-200" />
      </div>
    </div>

    <!-- Error -->
    <p v-if="error" class="mt-2 text-sm text-red-600">{{ error }}</p>
  </div>
</template>
