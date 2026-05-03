<script setup lang="ts">
const emit = defineEmits<{ command: [cmd: string] }>();

const commands = [
  { cmd: "@bail", label: "Bail", color: "bg-green-900/40 text-green-400 border-green-800" },
  { cmd: "@anticipatory", label: "Anticipatory Bail", color: "bg-blue-900/40 text-blue-400 border-blue-800" },
  { cmd: "@quashing", label: "Quashing", color: "bg-purple-900/40 text-purple-400 border-purple-800" },
  { cmd: "@discharge", label: "Discharge", color: "bg-orange-900/40 text-orange-400 border-orange-800" },
  { cmd: "@appeal", label: "Appeal", color: "bg-red-900/40 text-red-400 border-red-800" },
  { cmd: "@analyze", label: "Analyze Case", color: "bg-yellow-900/40 text-yellow-400 border-yellow-800" },
  { cmd: "@cross_exam", label: "Cross-Exam", color: "bg-pink-900/40 text-pink-400 border-pink-800" },
  { cmd: "@missing", label: "Missing Info", color: "bg-gray-800 text-gray-400 border-gray-700" },
];
</script>

<template>
  <div class="flex flex-wrap gap-1.5 mt-2">
    <button
      v-for="c in commands"
      :key="c.cmd"
      @click="emit('command', c.cmd)"
      :class="['text-xs px-2.5 py-1 rounded-full border transition hover:brightness-125', c.color]"
    >
      {{ c.label }}
    </button>
  </div>
</template>
