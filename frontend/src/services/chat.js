import {
  createChat,
  getChats,
  updateChat,
} from "./storage";

export function getConversations() {
  return getChats();
}

export function startConversation() {
  return createChat();
}

export function saveConversation(chat) {
  updateChat(chat);
}

export function createMessage(role, content, metadata = {}) {
  return {
    id: Date.now().toString(),
    role,
    content,
    createdAt: new Date().toISOString(),
    ...metadata,
  };
}

export function createAssistantMessage(response) {
  if (response?.type === "shopping_results") {
    return createMessage("assistant", response.message || "", {
      type: "shopping_results",
      shopping: {
        query: response.query || {},
        results: Array.isArray(response.results) ? response.results : [],
        sourceSummary: response.sourceSummary || {},
      },
    });
  }

  return createMessage("assistant", response?.content || "", {
    type: "chat",
  });
}