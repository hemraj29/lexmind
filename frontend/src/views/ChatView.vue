<script setup lang="ts">
import { onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useCasesStore } from "@/stores/cases.store";
import { useChatStore } from "@/stores/chat.store";
import ChatSidebar from "@/components/chat/ChatSidebar.vue";
import ChatArea from "@/components/chat/ChatArea.vue";
import ChatInput from "@/components/chat/ChatInput.vue";

const route = useRoute();
const router = useRouter();
const casesStore = useCasesStore();
const chatStore = useChatStore();

onMounted(() => {
  casesStore.fetchCases();
  if (route.params.id) {
    chatStore.loadMessages(route.params.id as string);
  }
});

watch(() => route.params.id, (newId) => {
  if (newId) chatStore.loadMessages(newId as string);
  else chatStore.clearMessages();
});

async function handleNewCase() {
  const newCase = await casesStore.createCase({ title: "New Case" });
  if (newCase) {
    router.push({ name: "case-chat", params: { id: newCase.id } });
  }
}

function handleSelectCase(id: string) {
  router.push({ name: "case-chat", params: { id } });
}

async function handleSend(content: string, file?: File) {
  if (!chatStore.activeCaseId) {
    // Auto-create case on first message
    const newCase = await casesStore.createCase({ title: content.slice(0, 60) || "New Case" });
    if (newCase) {
      router.push({ name: "case-chat", params: { id: newCase.id } });
      await chatStore.loadMessages(newCase.id);
    }
  }
  await chatStore.sendMessage(content, file);
  await casesStore.fetchCases(); // Refresh sidebar
}
</script>

<template>
  <div class="flex h-screen bg-gray-900">
    <!-- Sidebar -->
    <ChatSidebar
      :cases="casesStore.cases"
      :active-case-id="chatStore.activeCaseId"
      @new-case="handleNewCase"
      @select-case="handleSelectCase"
    />

    <!-- Main chat area -->
    <div class="flex-1 flex flex-col">
      <!-- Chat messages -->
      <ChatArea
        :messages="chatStore.messages"
        :loading="chatStore.loading"
        :active-case-id="chatStore.activeCaseId"
      />

      <!-- Input -->
      <ChatInput
        :disabled="chatStore.sending"
        :sending="chatStore.sending"
        @send="handleSend"
      />
    </div>
  </div>
</template>
