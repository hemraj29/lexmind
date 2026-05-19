<script setup lang="ts">
import type { StudioAction } from "@/stores/studio.store";
import StudioCard from "./StudioCard.vue";

defineProps<{
  actions: StudioAction[];
  executing: string | null;
  disabled: boolean;
}>();

defineEmits<{ execute: [code: string] }>();
</script>

<template>
  <div class="grid grid-cols-2 gap-2">
    <StudioCard
      v-for="action in actions"
      :key="action.id"
      :action="action"
      :executing="executing === action.id"
      :disabled="disabled"
      @click="$emit('execute', action.code)"
    />
  </div>
</template>
