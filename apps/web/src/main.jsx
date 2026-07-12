import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { initPwaUpdates } from "@/lib/pwa-register.js";
import { ensureAuthSyncBridge, initSessionResumeProbe } from "@/lib/session-api.js";
import "./styles/globals.css";
import "./styles/html-theme.css";
import "./styles/saas-overrides.css";

initPwaUpdates();
ensureAuthSyncBridge();
initSessionResumeProbe();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
