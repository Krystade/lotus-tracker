// Regression checks for the swing-undo fixes:
//  (1) an external life change (Set life) cancels the pending swing chip;
//  (2) undo is clamp-safe even after life floors at LIFE_MIN.
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

const life = () =>
  page.evaluate(() => window.__store.getState().game.players[0].life);
const plus = page.locator(".tile__adj--plus").first();
const minus = page.locator(".tile__adj--minus").first();
const chipCount = () => page.locator(".tile__swing").count();

// (1) External Set life cancels the swing chip.
await plus.click();
await plus.click();
await plus.click(); // swing +3, life 43
const chipBefore = await chipCount();
await page.evaluate(() => window.__store.getState().setLife("p0", 30));
await page.waitForTimeout(150);
const chipAfterExternal = await chipCount();
const test1 = chipBefore === 1 && chipAfterExternal === 0 && (await life()) === 30;

// (2) Clamp-safe undo. Start near the ceiling (non-lethal, no skull overlap),
// over-tap, then undo — must restore the exact start despite clamping.
await page.evaluate(() => window.__store.getState().setLife("p0", 9994));
await page.waitForTimeout(120);
for (let i = 0; i < 10; i++) await plus.click(); // 5 apply, 5 clamp to no-op
const cappedLife = await life();
await page.locator(".tile__swing").first().click(); // undo
await page.waitForTimeout(120);
const restored = await life();
const test2 = cappedLife === 9999 && restored === 9994;

console.log(`(1) external cancels swing: ${test1} (life=${await life()})`);
console.log(`(2) clamp-safe undo: capped=${cappedLife} restored=${restored} -> ${test2}`);
console.log(test1 && test2 ? "PASS ✅" : "FAIL ❌");
await b.close();
