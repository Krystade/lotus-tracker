// Verifies the "last player standing" WINS badge.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:5180/";
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const page = await ctx.newPage();
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(300);

const winnerVisibleBefore = await page
  .locator(".tile__winner")
  .count();

// Eliminate everyone except p0.
await page.evaluate(() => {
  const st = window.__store.getState();
  st.toggleEliminated("p1");
  st.toggleEliminated("p2");
  st.toggleEliminated("p3");
});
await page.waitForTimeout(200);
const winnerCount = await page.locator(".tile__winner").count();
const winnerText = (await page.locator(".tile__winner").first().innerText().catch(() => "")).trim();
mkdirSync("screenshots/chromium/13mini", { recursive: true });
await page.screenshot({ path: "screenshots/chromium/13mini/winner.png" });

console.log(`winner badges before: ${winnerVisibleBefore}`);
console.log(`after eliminating 3/4: count=${winnerCount} text="${winnerText}"`);
console.log(
  winnerVisibleBefore === 0 && winnerCount === 1 && winnerText.includes("WINS")
    ? "PASS ✅"
    : "FAIL ❌",
);
await b.close();
