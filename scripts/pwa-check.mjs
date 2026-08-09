// Verifies the built PWA: manifest + icons, service worker, and offline reload.
import { chromium } from "@playwright/test";

const BASE = process.argv[2] || "http://localhost:5190/";
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
await page.goto(BASE);

const manifestHref = await page.getAttribute('link[rel="manifest"]', "href");
const manifest = await page.evaluate(async (href) => {
  const r = await fetch(href);
  return r.ok ? await r.json() : null;
}, manifestHref);

const appleIcon = await page.evaluate(async () => {
  // Relative, not root-absolute: the app is served from a subpath on GitHub
  // Pages (/lotus-tracker/) and from the root under `preview`.
  const r = await fetch("./apple-touch-icon.png");
  return r.ok;
});

// Wait for the service worker to activate + control the page.
await page.evaluate(async () => {
  if (!("serviceWorker" in navigator)) return;
  await navigator.serviceWorker.ready;
});
await page.waitForTimeout(600);
const hasController = await page.evaluate(
  () => !!navigator.serviceWorker.controller,
);

// Kill the network and reload — the SW should serve the app from cache.
await ctx.setOffline(true);
let offlineOk = true;
try {
  await page.reload({ timeout: 8000 });
} catch {
  offlineOk = false;
}
await page.waitForTimeout(400);
const offlineLife = await page
  .locator(".tile__life")
  .first()
  .innerText()
  .catch(() => null);

console.log("manifest name:", manifest?.name, "| icons:", manifest?.icons?.length);
console.log("apple-touch-icon reachable:", appleIcon);
console.log("SW controlling page:", hasController);
console.log("offline reload ok:", offlineOk, "| life visible:", offlineLife);
const ok =
  manifest?.icons?.length >= 3 &&
  appleIcon &&
  hasController &&
  offlineOk &&
  !!offlineLife;
console.log(ok ? "PASS ✅" : "FAIL ❌");
await b.close();
process.exit(ok ? 0 : 1);
