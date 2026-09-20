import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearChatHistory } from "../services/storage";

const SETTINGS_KEY = "agentpay_settings";

const defaultSettings = {
  theme: "dark",
  language: "English",
  chatHistory: true,
  orderNotifications: true,
  generalNotifications: true,
  secureLogin: true,
};

function getSettings() {
  return {
    ...defaultSettings,
    ...JSON.parse(
      localStorage.getItem(SETTINGS_KEY) || "{}"
    ),
  };
}

function Settings() {
  const navigate = useNavigate();

  const [settings, setSettings] = useState(getSettings);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  function applyTheme(theme) {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (theme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;

      document.documentElement.classList.toggle(
        "dark",
        prefersDark
      );
    }
  }

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  function updateSetting(key, value) {
    const updated = {
      ...settings,
      [key]: value,
    };

    setSettings(updated);

    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify(updated)
    );
  }

  function handleClearHistory() {
    if (
      window.confirm(
        "Are you sure you want to clear all chat history?"
      )
    ) {
      clearChatHistory();
      alert("Chat history cleared.");
      navigate("/home");
    }
  }

  function handleChangePassword() {
    alert("Password changes are not available yet.");
  }

  function handleDeleteAccount() {
    const confirmed = window.confirm(
      "Delete your AgentPay account permanently?"
    );

    if (!confirmed) return;

    alert("Account deletion is not available yet.");
  }

  function showTerms() {
    alert(
      "AgentPay Terms & Conditions\n\n" +
        "Use AgentPay responsibly. All transactions and payment actions require appropriate user authorization."
    );
  }

  function showPrivacy() {
    alert(
      "AgentPay Privacy Policy\n\n" +
        "Your information is used to provide authentication, chat history and application functionality."
    );
  }

  function showAbout() {
    alert(
      "AgentPay\n\n" +
        "AI-powered conversational commerce assistant."
    );
  }

  return (
    <div className="settings-page">

      {/* HEADER */}
      <div className="settings-header">
        <button
          className="back-button"
          onClick={() => navigate("/home")}
        >
          ←
        </button>

        <div>
          <h1>Settings</h1>
          <p>Manage your AgentPay preferences</p>
        </div>
      </div>

      <div className="settings-content">

        {/* GENERAL */}
        <section className="settings-section">
          <h2>General</h2>

          <div className="setting-row">
            <div>
              <h3>Theme</h3>
              <p>Choose your preferred appearance</p>
            </div>

            <select
              value={settings.theme}
              onChange={(e) =>
                updateSetting("theme", e.target.value)
              }
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <div className="setting-row">
            <div>
              <h3>Language</h3>
              <p>Choose your language</p>
            </div>

            <select
              value={settings.language}
              onChange={(e) =>
                updateSetting(
                  "language",
                  e.target.value
                )
              }
            >
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
            </select>
          </div>
        </section>

        {/* CHAT */}
        <section className="settings-section">
          <h2>Chat</h2>

          <div className="setting-row">
            <div>
              <h3>Chat history</h3>
              <p>Save conversations in previous chats</p>
            </div>

            <button
              className={`toggle ${
                settings.chatHistory ? "active" : ""
              }`}
              onClick={() =>
                updateSetting(
                  "chatHistory",
                  !settings.chatHistory
                )
              }
            >
              <span />
            </button>
          </div>

          <div className="setting-row">
            <div>
              <h3>Clear chat history</h3>
              <p>Delete all saved conversations</p>
            </div>

            <button
              className="danger-button"
              onClick={handleClearHistory}
            >
              Clear
            </button>
          </div>
        </section>

        {/* NOTIFICATIONS */}
        <section className="settings-section">
          <h2>Notifications</h2>

          <div className="setting-row">
            <div>
              <h3>Order & payment notifications</h3>
              <p>Receive important transaction updates</p>
            </div>

            <button
              className={`toggle ${
                settings.orderNotifications
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                updateSetting(
                  "orderNotifications",
                  !settings.orderNotifications
                )
              }
            >
              <span />
            </button>
          </div>

          <div className="setting-row">
            <div>
              <h3>General notifications</h3>
              <p>Receive general AgentPay updates</p>
            </div>

            <button
              className={`toggle ${
                settings.generalNotifications
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                updateSetting(
                  "generalNotifications",
                  !settings.generalNotifications
                )
              }
            >
              <span />
            </button>
          </div>
        </section>

        {/* PRIVACY & SECURITY */}
        <section className="settings-section">
          <h2>Privacy & Security</h2>

          {/* SECURE LOGIN */}
          <div className="setting-row">
            <div>
              <h3>Secure login</h3>
              <p>Enable additional login protection</p>
            </div>

            <button
              className={`toggle ${
                settings.secureLogin ? "active" : ""
              }`}
              onClick={() =>
                updateSetting(
                  "secureLogin",
                  !settings.secureLogin
                )
              }
            >
              <span />
            </button>
          </div>

          {/* CHANGE PASSWORD */}
          <div className="password-box">
            <h3>Change password</h3>

            <div className="password-form">
              <input
                type="password"
                placeholder="Current password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
              />

              <input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(e) =>
                  setNewPassword(e.target.value)
                }
              />

              <button
                className="primary-button"
                onClick={handleChangePassword}
              >
                Change Password
              </button>
            </div>
          </div>

          {/* DELETE ACCOUNT */}
          <div className="setting-row delete-row">
            <div>
              <h3>Delete account</h3>
              <p>
                Permanently delete your AgentPay account
              </p>
            </div>

            <button
              className="danger-button"
              onClick={handleDeleteAccount}
            >
              Delete
            </button>
          </div>
        </section>

        {/* ABOUT */}
        <section className="settings-section">
          <h2>About</h2>

          <div className="about-buttons">
            <button
              className="link-button"
              onClick={showTerms}
            >
              Terms & Conditions
            </button>

            <button
              className="link-button"
              onClick={showPrivacy}
            >
              Privacy Policy
            </button>

            <button
              className="link-button"
              onClick={showAbout}
            >
              About AgentPay
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}

export default Settings;