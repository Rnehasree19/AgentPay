import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./style.css";

const savedSettings = JSON.parse(
  localStorage.getItem("agentpay_settings") || "{}"
);

document.documentElement.classList.toggle(
  "dark",
  savedSettings.theme !== "light"
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);