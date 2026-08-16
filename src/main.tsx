import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource/baloo-2/latin-500.css";
import "@fontsource/baloo-2/latin-700.css";
import "@fontsource/baloo-2/latin-800.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Registered by hand rather than via vite-plugin-pwa's generated snippet,
// which calls register() with no rejection handler. Safari rejects that
// promise when a reload lands while sw.js is still being fetched, surfacing as
// an uncaught error. A failed registration is not fatal — the app runs fine
// without the service worker and the next load retries — so swallow it.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .catch(() => undefined);
  });
}
