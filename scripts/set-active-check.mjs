// Verifies long-pressing a tile makes it the active player, and the active ring.
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

const activeId = () =>
  page.evaluate(() => window.__store.getState().game.turn.activePlayerId);

const before = await activeId();
const p1 = page.locator(".tile").nth(1); // second placement = p1
const box = await p1.boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

// Long press on the tile body (the number area is pointer-transparent).
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.waitForTimeout(680);
await page.mouse.up();
await page.waitForTimeout(120);

const after = await activeId();
const p1Active = await p1.evaluate((el) => el.classList.contains("tile--active"));

console.log(`active ${before} --(long-press p1)--> ${after}`);
console.log(`p1 has active ring: ${p1Active}`);
console.log(before === "p0" && after === "p1" && p1Active ? "PASS ✅" : "FAIL ❌");
await b.close();
