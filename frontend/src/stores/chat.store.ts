import { defineStore } from "pinia";
import { ref, computed } from "vue";

export interface ChatMessage {
  id: string;
  caseId: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  type: "TEXT" | "FILE_UPLOAD" | "COMMAND" | "ANALYSIS_CARD" | "GENERATION_CARD";
  content: string;
  documentId?: string;
  pipelineRunId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export const useChatStore = defineStore("chat", () => {
  const activeCaseId = ref<string | null>(null);
  const messages = ref<ChatMessage[]>([]);
  const loading = ref(false);
  const sending = ref(false);

  const sortedMessages = computed(() =>
    [...messages.value].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  );

  async function loadMessages(caseId: string) {
    activeCaseId.value = caseId;
    loading.value = true;
    try {
      const res = await fetch(`/api/cases/${caseId}/messages?limit=100`);
      const json = await res.json();
      if (json.success) messages.value = json.data;
    } finally {
      loading.value = false;
    }
  }

  async function sendMessage(content: string, file?: File): Promise<ChatMessage | null> {
    if (!activeCaseId.value) return null;
    sending.value = true;

    try {
      const formData = new FormData();
      formData.append("content", content);
      if (file) formData.append("file", file);

      // Optimistically add user message
      const userMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        caseId: activeCaseId.value,
        role: "USER",
        type: file ? "FILE_UPLOAD" : "TEXT",
        content: file ? `${content}\n📎 ${file.name}` : content,
        createdAt: new Date().toISOString(),
      };
      messages.value.push(userMsg);

      // Add "thinking" indicator
      const thinkingMsg: ChatMessage = {
        id: `thinking-${Date.now()}`,
        caseId: activeCaseId.value,
        role: "ASSISTANT",
        type: "TEXT",
        content: "Thinking...",
        createdAt: new Date().toISOString(),
      };
      messages.value.push(thinkingMsg);

      const res = await fetch(`/api/cases/${activeCaseId.value}/messages`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();

      // Remove thinking indicator
      messages.value = messages.value.filter((m) => m.id !== thinkingMsg.id);

      if (json.success) {
        // Reload messages to get the full server response
        await loadMessages(activeCaseId.value);
        return json.data;
      }

      return null;
    } finally {
      sending.value = false;
    }
  }

  function clearMessages() {
    messages.value = [];
    activeCaseId.value = null;
  }

  return { activeCaseId, messages: sortedMessages, loading, sending, loadMessages, sendMessage, clearMessages };
});
