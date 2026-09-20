import { useState } from "react";

function ChatInput({ onSend }) {
  const [message, setMessage] = useState("");

  function sendMessage() {
    if (!message.trim()) return;

    onSend(message.trim());
    setMessage("");
  }

  function handleSubmit(e) {
    e.preventDefault();
    sendMessage();
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <form
      className="chat-input"
      onSubmit={handleSubmit}
    >
      <input
        value={message}
        onChange={(e) =>
          setMessage(e.target.value)
        }
        onKeyDown={handleKeyDown}
        placeholder="Message AgentPay..."
      />

      <button type="submit">↑</button>
    </form>
  );
}

export default ChatInput;