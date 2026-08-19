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
// an uncaught error. A failed registration is not fatal - the app runs fine
// without the service worker and the next load retries - so swallow it.
//
// Because injectRegister is off, registerType: "autoUpdate" has no code of its
// own to run: the plugin's update-check-and-reload logic lives in exactly the
// snippet we are not using. Without the below, a home-screen install keeps
// serving whatever it cached until the OS happens to kill and cold-start it,
// which can be days.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // A page that was already controlled and then sees the controller change has
  // been handed new assets underneath it. A page that had no controller is just
  // completing its first install (clientsClaim) and must not reload.
  const hadController = !!navigator.serviceWorker.controller;
  let pendingReload = false;

  // Reload at a natural boundary. Swapping the page out from under a tap
  // mid-game would be worse than running a version-old for another few
  // seconds; game state is persisted either way.
  const reloadWhenSafe = () => {
    if (!pendingReload) return;
    if (document.visibilityState !== "visible") return;
    pendingReload = false;
    location.reload();
  };

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) return;
    pendingReload = true;
    // Coming back to the app is the safe moment; if we are already in the
    // background, wait for the return.
    if (document.visibilityState === "visible") location.reload();
  });

  window.addEventListener("load", () => {
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then((reg) => {
        const check = () => {
          if (document.visibilityState === "visible") {
            reg.update().catch(() => undefined);
            reloadWhenSafe();
          }
        };
        // On launch and every time the app is brought back to the foreground.
        // Deliberately not on a timer: a game runs for hours with the app in
        // the foreground the whole time, and the only thing a mid-game check
        // can do is reload the page out from under the table.
        check();
        document.addEventListener("visibilitychange", check);
      })
      .catch(() => undefined);
  });
}
