// Verifies the custom editor rejects an invalid (non-rectangular/overlapping)
// painting instead of corrupting the board.
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

const layoutId = () =>
  page.evaluate(() => window.__store.getState().game.layout.id);
const before = await layoutId();

await page.click(".center__hex");
await page.waitForTimeout(150);
await page.getByText("Layout").first().click();
await page.waitForTimeout(150);
await page.getByText("Customize").first().click();
await page.waitForTimeout(150);

// Grid starts 2x2 (seats 0,1 / 2,3). Add a column -> 2x3, new cells empty.
await page.locator(".stepper").nth(1).locator("button").last().click(); // cols +
await page.waitForTimeout(120);
// Paint seat 0 into (0,2): its bbox now spans cols 0..2 and swallows seat 1 at (0,1).
await page.locator(".palette__swatch").nth(0).click(); // seat 0
await page.locator(".editor__cell").nth(2).click(); // row0 col2
await page.waitForTimeout(100);

await page.getByRole("button", { name: "Apply", exact: true }).click();
await page.waitForTimeout(150);

const errorShown = await page.locator(".editor__error").isVisible().catch(() => false);
const after = await layoutId();

console.log(`error shown: ${errorShown}`);
console.log(`layout id unchanged: ${before === after} (${before} -> ${after})`);
console.log(errorShown && before === after ? "PASS ✅" : "FAIL ❌");
await b.close();
