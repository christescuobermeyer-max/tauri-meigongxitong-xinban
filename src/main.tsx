import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";
import "./styles/brand-story.css";
import { recordClientError } from "./lib/client-error-log";
import { installDevtoolsGuard } from "./lib/devtools-guard";
import { applyTheme, getStoredTheme } from "./lib/theme";

installDevtoolsGuard();
applyTheme(getStoredTheme());

window.addEventListener("error", (event) => {
  recordClientError("window-error", event.error?.stack || event.message || "未知错误");
});

window.addEventListener("unhandledrejection", (event) => {
  const reason =
    typeof event.reason === "string"
      ? event.reason
      : event.reason instanceof Error
        ? event.reason.stack || event.reason.message
        : JSON.stringify(event.reason);
  recordClientError("unhandled-rejection", reason);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
