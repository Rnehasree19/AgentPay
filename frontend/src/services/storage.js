const CHATS_KEY = "agentpay_chats";

export function getChats() {
  return JSON.parse(
    localStorage.getItem(CHATS_KEY) || "[]"
  );
}

export function saveChats(chats) {
  localStorage.setItem(
    CHATS_KEY,
    JSON.stringify(chats)
  );
}

export function createChat() {
  return {
    id: Date.now().toString(),
    title: "New conversation",
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function updateChat(chat) {
  const chats = getChats();
  const exists = chats.some((item) => item.id === chat.id);

  const savedChat = {
    ...chat,
    updatedAt: new Date().toISOString(),
  };

  const updated = exists
    ? chats.map((item) => (item.id === chat.id ? savedChat : item))
    : [savedChat, ...chats];

  saveChats(updated);
}

export function deleteChat(chatId) {
  const chats = getChats();

  saveChats(
    chats.filter((chat) => chat.id !== chatId)
  );
}

export function clearChatHistory() {
  localStorage.removeItem(CHATS_KEY);
}