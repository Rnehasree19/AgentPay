import { useState } from "react";
import Sidebar from "../components/Sidebar";
import ChatWindow from "../components/ChatWindow";
import ChatInput from "../components/ChatInput";
import {
  createMessage,
  createAssistantMessage,
  getConversations,
  saveConversation,
  startConversation,
} from "../services/chat";
import { deleteChat } from "../services/storage";
import { sendMessage } from "../services/ai";

const SETTINGS_KEY = "agentpay_settings";

const defaultSettings = {
  chatHistory: true,
};

function getChatSettings() {
  return {
    ...defaultSettings,
    ...JSON.parse(
      localStorage.getItem(SETTINGS_KEY) || "{}"
    ),
  };
}

function Home({ authUser, onLogout }) {
  const [chats, setChats] = useState(() =>
    getConversations()
  );

  const [activeChat, setActiveChat] = useState(null);
  const [settings] = useState(getChatSettings);

  function handleNewChat() {
    setActiveChat(startConversation());
  }

  function handleSelectChat(chatId) {
    const chat = chats.find(
      (item) => item.id === chatId
    );

    if (chat) {
      setActiveChat(chat);
    }
  }

  function handleDeleteChat(chatId) {
    deleteChat(chatId);

    setChats((prev) =>
      prev.filter((chat) => chat.id !== chatId)
    );

    if (activeChat?.id === chatId) {
      setActiveChat(null);
    }
  }

  async function handleSend(message) {
    let chat = activeChat;

    if (!chat) {
      chat = startConversation();
    }

    const userMessage = createMessage(
      "user",
      message
    );

    const updatedChat = {
      ...chat,
      messages: [
        ...chat.messages,
        userMessage,
      ],
      title:
        chat.messages.length === 0
          ? message.length > 30
            ? message.slice(0, 30) + "..."
            : message
          : chat.title,
    };

    setActiveChat(updatedChat);

    if (settings.chatHistory) {
      saveConversation(updatedChat);

      setChats((prev) => {
        const exists = prev.some(
          (item) => item.id === updatedChat.id
        );

        if (exists) {
          return prev.map((item) =>
            item.id === updatedChat.id
              ? updatedChat
              : item
          );
        }

        return [updatedChat, ...prev];
      });
    }

    try {
      const aiResponse = await sendMessage(
        updatedChat.messages.map((item) => ({
          role: item.role,
          content: item.content,
        }))
      );

      const assistantMessage = createAssistantMessage(aiResponse);

      const finalChat = {
        ...updatedChat,
        messages: [
          ...updatedChat.messages,
          assistantMessage,
        ],
      };

      setActiveChat(finalChat);

      if (settings.chatHistory) {
        saveConversation(finalChat);

        setChats((prev) =>
          prev.map((item) =>
            item.id === finalChat.id
              ? finalChat
              : item
          )
        );
      }
    } catch (error) {
      console.error("AI error:", error);

      const errorMessage = createMessage(
        "assistant",
        "Sorry, I couldn't connect to the AI service. Please try again."
      );

      setActiveChat({
        ...updatedChat,
        messages: [
          ...updatedChat.messages,
          errorMessage,
        ],
      });
    }
  }

  return (
    <div className="home">
      <Sidebar
        authUser={authUser}
        onLogout={onLogout}
        chats={chats}
        activeChatId={activeChat?.id}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
      />

      <main className="chat-area">
        <header className="chat-header">
          <div>
            <h1>AI Shopping Assistant</h1>
            <p>
              Your conversational shopping assistant
            </p>
          </div>

          <div className="online-status">
            <span></span>
            Online
          </div>
        </header>

        <ChatWindow
          messages={activeChat?.messages || []}
        />

        <ChatInput onSend={handleSend} />
      </main>
    </div>
  );
}

export default Home;