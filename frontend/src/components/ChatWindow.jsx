import ProductResults from "./ProductResults";

function ChatWindow({ messages }) {
  if (!messages || messages.length === 0) {
    return (
      <div className="chat-window">
        <div className="welcome-message">
          <div>
            <h2>How can I help you?</h2>
            <p>
              Tell me what you are looking for and I'll help you find it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`message ${message.role}`}
        >
          {message.role === "assistant" && (
            <div className="message-avatar">
              AI
            </div>
          )}

          <div className="message-bubble">
            {message.type === "shopping_results" && message.shopping ? (
              <>
                {message.content && (
                  <p className="shopping-message">{message.content}</p>
                )}
                <ProductResults {...message.shopping} />
              </>
            ) : (
              message.content
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default ChatWindow;