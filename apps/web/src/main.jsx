import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { initPwaUpdates } from "@/lib/pwa-register.js";
import { redirectToCanonicalOrigin } from "@/lib/app-origin.js";
import { ensureFreshBuild, initEnsureFreshBuildWatchers } from "@/lib/ensure-fresh-build.js";
import { ensureAuthSyncBridge, initSessionResumeProbe } from "@/lib/session-api.js";
import { initSessionSync } from "@/lib/session-cross-device.js";
import "./styles/globals.css";
import "./styles/html-theme.css";
import "./styles/saas-overrides.css";

redirectToCanonicalOrigin();
initPwaUpdates();
initEnsureFreshBuildWatchers();
ensureAuthSyncBridge();
initSessionResumeProbe();
initSessionSync();

void ensureFreshBuild().then(() => {
  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
});
