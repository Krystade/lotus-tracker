// Verifies the accumulating life-swing chip and tap-to-undo.
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

const life = () =>
  page.evaluate(() => window.__store.getState().game.players[0].life);

const start = await life();
const minus = page.locator(".tile__adj--minus").first();
await minus.click();
await minus.click();
await minus.click();
await page.waitForTimeout(120);
const afterTaps = await life();
const chip = page.locator(".tile__swing").first();
const chipText = (await chip.innerText().catch(() => "")).replace(/\s+/g, " ");
mkdirSync("screenshots/chromium/13mini", { recursive: true });
await page.screenshot({ path: "screenshots/chromium/13mini/swing.png" });

// Tap chip to undo.
await chip.click();
await page.waitForTimeout(120);
const afterUndo = await life();
const chipGone = !(await chip.isVisible().catch(() => false));

console.log(`life ${start} --(-1 x3)--> ${afterTaps}  chip="${chipText}"`);
console.log(`undo --> ${afterUndo}  chip gone: ${chipGone}`);
const ok =
  afterTaps === start - 3 &&
  chipText.includes("-3") &&
  afterUndo === start &&
  chipGone;
console.log(ok ? "PASS ✅" : "FAIL ❌");
await b.close();
