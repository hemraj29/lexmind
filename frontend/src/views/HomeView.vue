<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useUpload } from "@/composables/useUpload";
import { usePipeline } from "@/composables/usePipeline";
import FileUploader from "@/components/FileUploader.vue";
import StepProgress from "@/components/StepProgress.vue";

const router = useRouter();
const upload = useUpload();
const pipeline = usePipeline();
const isProcessing = ref(false);

async function handleGenerate() {
  if (!upload.file.value) return;
  isProcessing.value = true;

  const runId = await pipeline.start(upload.file.value);
  if (runId) {
    router.push({ name: "pipeline", params: { id: runId } });
  }

  isProcessing.value = false;
}
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <!-- Header -->
    <div class="text-center mb-10">
      <h1 class="text-3xl font-bold text-gray-900 mb-2">
        Generate Bail Application
      </h1>
      <p class="text-gray-500">
        Upload an FIR document and get a court-ready bail application in seconds.
      </p>
    </div>

    <!-- Upload Area -->
    <FileUploader
      :file="upload.file.value"
      :preview="upload.preview.value"
      :error="upload.error.value"
      :is-dragging="upload.isDragging.value"
      @drop="upload.handleDrop"
      @input="upload.handleInput"
      @clear="upload.clear"
      @dragover.prevent="upload.isDragging.value = true"
      @dragleave="upload.isDragging.value = false"
    />

    <!-- Generate Button -->
    <div class="mt-6 text-center" v-if="upload.file.value">
      <button
        @click="handleGenerate"
        :disabled="isProcessing"
        class="px-8 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {{ isProcessing ? "Starting Pipeline..." : "Generate Bail Application" }}
      </button>
    </div>

    <!-- Pipeline Progress (if running on this page) -->
    <div class="mt-8" v-if="pipeline.status.value === 'running'">
      <StepProgress :steps="pipeline.steps.value" :progress="pipeline.progress.value" />
    </div>

    <!-- How it works -->
    <div class="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-white rounded-xl p-6 border border-gray-100">
        <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
          <span class="text-blue-600 font-bold">1</span>
        </div>
        <h3 class="font-semibold text-gray-900 mb-1">Upload FIR</h3>
        <p class="text-sm text-gray-500">Upload a scanned FIR as PDF or image. Our AI reads even handwritten documents.</p>
      </div>

      <div class="bg-white rounded-xl p-6 border border-gray-100">
        <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-3">
          <span class="text-purple-600 font-bold">2</span>
        </div>
        <h3 class="font-semibold text-gray-900 mb-1">AI Research</h3>
        <p class="text-sm text-gray-500">The system maps IPC to BNS, finds applicable sections, and retrieves relevant precedents.</p>
      </div>

      <div class="bg-white rounded-xl p-6 border border-gray-100">
        <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-3">
          <span class="text-green-600 font-bold">3</span>
        </div>
        <h3 class="font-semibold text-gray-900 mb-1">Download Draft</h3>
        <p class="text-sm text-gray-500">Get a court-ready bail application as .docx with proper legal formatting.</p>
      </div>
    </div>
  </div>
</template>
