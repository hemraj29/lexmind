<script setup lang="ts">
import { onMounted, ref } from "vue";

const emit = defineEmits<{ command: [cmd: string] }>();

interface ChipCmd {
  cmd: string;
  label: string;
  color: string;
}

const commands = ref<ChipCmd[]>([
  { cmd: "@bail", label: "Bail", color: "border-emerald-200 text-emerald-700 hover:bg-emerald-50" },
  { cmd: "@anticipatory", label: "Anticipatory Bail", color: "border-blue-200 text-blue-700 hover:bg-blue-50" },
  { cmd: "@quashing", label: "Quashing", color: "border-purple-200 text-purple-700 hover:bg-purple-50" },
  { cmd: "@discharge", label: "Discharge", color: "border-orange-200 text-orange-700 hover:bg-orange-50" },
  { cmd: "@analyze", label: "Analyze Case", color: "border-amber-200 text-amber-700 hover:bg-amber-50" },
  { cmd: "@cross_exam", label: "Cross-Exam", color: "border-pink-200 text-pink-700 hover:bg-pink-50" },
  { cmd: "@missing", label: "Missing Info", color: "border-gray-200 text-gray-700 hover:bg-gray-50" },
]);

onMounted(async () => {
  // Try to load dynamic commands from backend; fall back to defaults silently
  try {
    const res = await fetch("/api/commands");
    const json = await res.json();
    if (json.success && Array.isArray(json.data) && json.data.length > 0) {
      commands.value = json.data;
    }
  } catch {
    // Use defaults
  }
});
</script>

<template>
  <div class="flex flex-wrap gap-1.5 mt-2">
    <button
      v-for="c in commands"
      :key="c.cmd"
      @click="emit('command', c.cmd)"
      :class="['text-xs px-2.5 py-1 rounded-full border bg-white transition', c.color]"
    >
      {{ c.label }}
    </button>
  </div>
</template>
