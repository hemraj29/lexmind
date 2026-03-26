<script setup lang="ts">
import { RouterView, RouterLink } from "vue-router";
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Navigation -->
    <nav class="bg-white border-b border-gray-200 px-6 py-3">
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        <RouterLink to="/" class="flex items-center gap-2">
          <div class="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span class="text-white font-bold text-sm">LM</span>
          </div>
          <span class="text-xl font-bold text-gray-900">LexiMini</span>
          <span class="text-xs text-gray-400 ml-1">by Buildio Legal</span>
        </RouterLink>

        <div class="flex items-center gap-6">
          <RouterLink to="/" class="text-sm text-gray-600 hover:text-indigo-600 transition">
            Generate
          </RouterLink>
          <RouterLink to="/sections" class="text-sm text-gray-600 hover:text-indigo-600 transition">
            Sections
          </RouterLink>
          <RouterLink to="/history" class="text-sm text-gray-600 hover:text-indigo-600 transition">
            History
          </RouterLink>
        </div>
      </div>
    </nav>

    <!-- Content -->
    <main class="max-w-7xl mx-auto px-6 py-8">
      <RouterView />
    </main>
  </div>
</template>
