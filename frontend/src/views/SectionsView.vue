<script setup lang="ts">
import { ref } from "vue";
import { useApi } from "@/composables/useApi";

const { get, loading, error } = useApi();

const query = ref("");
const actFilter = ref("");
const results = ref<any[]>([]);

async function search() {
  if (query.value.length < 2) return;
  const params = new URLSearchParams({ q: query.value });
  if (actFilter.value) params.set("act", actFilter.value);
  results.value = (await get<any[]>(`/sections/search?${params}`)) || [];
}
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">Legal Sections</h1>

    <!-- Search bar -->
    <div class="flex gap-3 mb-6">
      <input
        v-model="query"
        @keyup.enter="search"
        placeholder="Search sections (e.g., 'murder', '302', 'theft')..."
        class="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
      />
      <select
        v-model="actFilter"
        class="px-3 py-2.5 border border-gray-300 rounded-lg bg-white"
      >
        <option value="">All Acts</option>
        <option value="BNS">BNS</option>
        <option value="BNSS">BNSS</option>
        <option value="BSA">BSA</option>
      </select>
      <button
        @click="search"
        class="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
      >
        Search
      </button>
    </div>

    <!-- Results -->
    <div v-if="loading" class="text-center py-10 text-gray-500">Searching...</div>

    <div v-else-if="error" class="text-red-600 text-sm">{{ error }}</div>

    <div v-else class="space-y-3">
      <div
        v-for="section in results"
        :key="section.id"
        class="bg-white rounded-lg border border-gray-200 p-5"
      >
        <div class="flex items-start justify-between mb-2">
          <div>
            <span class="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
              {{ section.actType }} Section {{ section.sectionNumber }}
            </span>
            <h3 class="font-semibold text-gray-900 mt-1">{{ section.title }}</h3>
          </div>
          <span
            :class="[
              'text-xs px-2 py-0.5 rounded-full',
              section.bailable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
            ]"
          >
            {{ section.bailable ? "Bailable" : "Non-Bailable" }}
          </span>
        </div>

        <p class="text-sm text-gray-600 mb-2">{{ section.description?.slice(0, 200) }}...</p>

        <div class="flex gap-4 text-xs text-gray-400">
          <span>Punishment: {{ section.punishment?.slice(0, 80) }}</span>
          <span>Type: {{ section.offenceType }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
