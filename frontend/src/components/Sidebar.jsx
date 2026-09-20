import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { logoutServer } from "../services/auth";

function Sidebar({
  chats,
  activeChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  authUser,
  onLogout,
}) {
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);

  async function handleLogout() {
    try {
      await logoutServer();
      onLogout();
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  }

  return (
    <aside className="sidebar">

      {/* BRAND */}
      <div className="logo-section">
        <div className="logo-box">A</div>

        <div>
          <h2>AgentPay</h2>
          <p>AI Commerce</p>
        </div>
      </div>

      {/* NEW CHAT */}
      <button
        className="new-chat-button"
        onClick={onNewChat}
      >
        + New Chat
      </button>

      {/* PREVIOUS CHATS */}
      <div className="previous-title">
        Previous Chats
      </div>

      <div className="chat-list">
        {chats.length === 0 ? (
          <p className="no-chats">
            No previous chats
          </p>
        ) : (
          chats.map((chat) => (
            <div
              key={chat.id}
              className={`chat-item ${
                activeChatId === chat.id ? "active" : ""
              }`}
            >
              <button
                className="chat-item-content"
                onClick={() => onSelectChat(chat.id)}
              >
                <span className="chat-icon">💬</span>

                <span className="chat-title">
                  {chat.title}
                </span>
              </button>

              <button
                className="delete-chat"
                onClick={() => onDeleteChat(chat.id)}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {/* SETTINGS */}
      <div className="sidebar-settings">
        <button onClick={() => navigate("/settings")}>
          ⚙ Settings
        </button>
      </div>

      {/* PROFILE */}
      <div className="profile-section">

        {profileOpen && (
          <div className="profile-menu">
            <button onClick={() => navigate("/settings")}>
              Settings
            </button>

            <button onClick={handleLogout}>
              Logout
            </button>
          </div>
        )}

        <button
          className="profile-button"
          onClick={() => setProfileOpen(!profileOpen)}
        >
          <div className="profile-avatar">
            {authUser?.name?.charAt(0).toUpperCase() || "A"}
          </div>

          <div className="profile-info">
            <strong>
              {authUser?.name || "User"}
            </strong>

            <span>
              {authUser?.email || ""}
            </span>
          </div>

          <span className="profile-arrow">
            {profileOpen ? "⌃" : "⌄"}
          </span>
        </button>

      </div>

    </aside>
  );
}

export default Sidebar;