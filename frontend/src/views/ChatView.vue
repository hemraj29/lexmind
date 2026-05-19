<script setup lang="ts">
import { onMounted, watch, ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useCasesStore } from "@/stores/cases.store";
import { useChatStore } from "@/stores/chat.store";
import { useSourcesStore } from "@/stores/sources.store";
import { useStudioStore } from "@/stores/studio.store";

import AppHeader from "@/components/AppHeader.vue";
import ChatHeader from "@/components/chat/ChatHeader.vue";
import ChatArea from "@/components/chat/ChatArea.vue";
import ChatInput from "@/components/chat/ChatInput.vue";
import SourcesPanel from "@/components/sources/SourcesPanel.vue";
import StudioPanel from "@/components/studio/StudioPanel.vue";
import CitationPreview from "@/components/CitationPreview.vue";

const route = useRoute();
const router = useRouter();
const casesStore = useCasesStore();
const chatStore = useChatStore();
const sourcesStore = useSourcesStore();
const studioStore = useStudioStore();

const showCasesNav = ref(false);
const sourcesPanelOpen = ref(true);
const studioPanelOpen = ref(true);

const activeCase = computed(() =>
  casesStore.cases.find((c) => c.id === chatStore.activeCaseId)
);

onMounted(async () => {
  await Promise.all([casesStore.fetchCases(), studioStore.fetchActions("criminal")]);
  if (route.params.id) {
    await loadCase(route.params.id as string);
  }
});

watch(
  () => route.params.id,
  async (newId) => {
    if (newId) await loadCase(newId as string);
    else {
      chatStore.clearMessages();
      sourcesStore.clear();
    }
  }
);

async function loadCase(caseId: string) {
  await Promise.all([
    chatStore.loadMessages(caseId),
    sourcesStore.fetchSources(caseId),
  ]);
}

async function handleNewCase() {
  const newCase = await casesStore.createCase({ title: "Untitled notebook" });
  if (newCase) router.push({ name: "case-chat", params: { id: newCase.id } });
}

function handleSelectCase(id: string) {
  router.push({ name: "case-chat", params: { id } });
  showCasesNav.value = false;
}

async function handleSend(content: string, file?: File) {
  if (!chatStore.activeCaseId) {
    const newCase = await casesStore.createCase({ title: content.slice(0, 60) || "New Case" });
    if (newCase) {
      router.push({ name: "case-chat", params: { id: newCase.id } });
      await loadCase(newCase.id);
    }
  }
  await chatStore.sendMessage(content, file);
  await casesStore.fetchCases();
}

async function handleStudioAction(actionCode: string) {
  if (!chatStore.activeCaseId) return;
  const action = studioStore.actions.find((a) => a.code === actionCode);
  if (action) {
    await chatStore.sendMessage(action.command || `@${action.code}`);
    await casesStore.fetchCases();
  }
}
</script>

<template>
  <div class="h-screen flex flex-col bg-[#fafaf9] text-gray-900">
    <!-- Top header -->
    <AppHeader
      :title="activeCase?.title || 'Untitled notebook'"
      :case-count="casesStore.cases.length"
      @new-case="handleNewCase"
      @toggle-cases="showCasesNav = !showCasesNav"
      @select-case="handleSelectCase"
      :cases="casesStore.cases"
      :active-case-id="chatStore.activeCaseId"
      :show-cases-nav="showCasesNav"
    />

    <!-- 3-pane layout -->
    <div class="flex-1 flex gap-3 px-3 pb-3 overflow-hidden">
      <!-- LEFT: Sources panel -->
      <Transition name="slide-left">
        <SourcesPanel
          v-if="sourcesPanelOpen"
          :case-id="chatStore.activeCaseId"
          @collapse="sourcesPanelOpen = false"
        />
      </Transition>
      <button
        v-if="!sourcesPanelOpen"
        @click="sourcesPanelOpen = true"
        class="self-start mt-3 p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition shadow-sm"
        title="Show sources"
      >
        <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <!-- MIDDLE: Chat -->
      <div class="flex-1 flex flex-col min-w-0 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <ChatHeader
          :case-title="activeCase?.title || 'Untitled notebook'"
          :source-count="sourcesStore.sourceCount"
          :enabled-source-count="sourcesStore.enabledSources.length"
        />

        <ChatArea
          :messages="chatStore.messages"
          :loading="chatStore.loading"
          :active-case-id="chatStore.activeCaseId"
        />

        <ChatInput
          :disabled="chatStore.sending"
          :sending="chatStore.sending"
          :source-count="sourcesStore.sourceCount"
          @send="handleSend"
        />
      </div>

      <!-- RIGHT: Studio panel -->
      <Transition name="slide-right">
        <StudioPanel
          v-if="studioPanelOpen"
          :case-id="chatStore.activeCaseId"
          @collapse="studioPanelOpen = false"
          @execute="handleStudioAction"
        />
      </Transition>
      <button
        v-if="!studioPanelOpen"
        @click="studioPanelOpen = true"
        class="self-start mt-3 p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition shadow-sm"
        title="Show studio"
      >
        <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
    </div>

    <!-- Citation source preview (slides in from right when chip clicked) -->
    <CitationPreview />
  </div>
</template>

<style scoped>
.slide-left-enter-active, .slide-left-leave-active { transition: all 0.25s ease; }
.slide-left-enter-from, .slide-left-leave-to { transform: translateX(-20px); opacity: 0; }

.slide-right-enter-active, .slide-right-leave-active { transition: all 0.25s ease; }
.slide-right-enter-from, .slide-right-leave-to { transform: translateX(20px); opacity: 0; }
</style>
