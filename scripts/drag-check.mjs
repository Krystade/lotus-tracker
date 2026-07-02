// Verifies the turn timer can be dragged and that the position persists.
import { chromium } from "@playwright/test";

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

const pill = page.locator(".tile__pill").first();
const b1 = await pill.boundingBox();
const cx = b1.x + b1.width / 2;
const cy = b1.y + b1.height / 2;

await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 70, cy + 90, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(150);
const b2 = await pill.boundingBox();

// persisted?
const stored = await page.evaluate(() => {
  const raw = localStorage.getItem("lotus-tracker");
  const s = JSON.parse(raw);
  return s.state.game.players[0].timerPos;
});

await page.reload();
await page.waitForTimeout(300);
const b3 = await page.locator(".tile__pill").first().boundingBox();

const moved = Math.abs(b2.x - b1.x) > 10 || Math.abs(b2.y - b1.y) > 10;
const persistedAcrossReload =
  b3 && Math.abs(b3.x - b2.x) < 6 && Math.abs(b3.y - b2.y) < 6;

console.log("before drag:", Math.round(b1.x), Math.round(b1.y));
console.log("after drag: ", Math.round(b2.x), Math.round(b2.y), "→ moved:", moved);
console.log("stored timerPos:", stored);
console.log("after reload: ", b3 && [Math.round(b3.x), Math.round(b3.y)], "→ persisted:", persistedAcrossReload);
console.log(moved && stored && persistedAcrossReload ? "PASS ✅" : "FAIL ❌");

await b.close();
