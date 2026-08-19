/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "node:child_process";

// Stamped into the bundle so the running app can say which build it is. The
// question "is my home-screen copy actually the new one?" is otherwise
// unanswerable from the device.
const buildId = (() => {
  try {
    const sha = execSync("git rev-parse --short HEAD").toString().trim();
    const dirty = execSync("git status --porcelain").toString().trim() !== "";
    return `${sha}${dirty ? "+" : ""}`;
  } catch {
    return "unknown";
  }
})();
const buildTime = new Date().toISOString().slice(0, 16).replace("T", " ");

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  base: "/lotus-tracker/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // We register the worker ourselves in main.tsx so the failure path has a
      // .catch(); the generated snippet does not.
      injectRegister: false,
      includeAssets: ["apple-touch-icon.png", "icon.svg"],
      manifest: {
        name: "Lotus Tracker",
        short_name: "Lotus",
        description: "MTG Commander life & turn tracker",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        orientation: "portrait",
        start_url: "/lotus-tracker/",
        scope: "/lotus-tracker/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // Set explicitly: with injectRegister disabled the plugin no longer
        // supplies clientsClaim, and without it the worker does not control
        // the very first page load — so a first visit would not be offline
        // capable until the next reload.
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  server: {
    host: true,
    port: 5180,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
