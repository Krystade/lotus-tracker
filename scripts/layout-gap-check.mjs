// Verifies a custom layout with an empty cell (dead space) is rejected.
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

// Default grid is 2x2 (all filled). Add a row -> 3x2 with an empty bottom row.
await page.locator(".stepper").nth(0).locator("button").last().click(); // rows +
await page.waitForTimeout(120);
await page.getByRole("button", { name: "Apply", exact: true }).click();
await page.waitForTimeout(150);

const errorShown = await page.locator(".editor__error").isVisible().catch(() => false);
const after = await layoutId();

console.log(`empty-cell layout -> error shown: ${errorShown}`);
console.log(`layout unchanged: ${before === after} (${before} -> ${after})`);
console.log(errorShown && before === after ? "PASS ✅" : "FAIL ❌");
await b.close();
