// Verifies the custom layout editor actually applies + saves layouts.
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
page.on("dialog", (d) => d.accept("Test Layout")); // Save-as prompt

await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(300);

const layout = () =>
  page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("lotus-tracker")).state;
    return {
      cols: s.game.layout.cols,
      rows: s.game.layout.rows,
      players: s.game.players.length,
      placements: s.game.layout.placements.length,
      customs: s.customLayouts.length,
    };
  });

const before = await layout();

// Open Layout -> Customize
await page.click(".center__hex");
await page.waitForTimeout(150);
await page.getByText("Layout").first().click();
await page.waitForTimeout(150);
await page.getByText("Customize").first().click();
await page.waitForTimeout(150);

// Collapse columns 2 -> 1 (keeps a single column of seats).
await page.locator(".stepper").nth(1).locator("button").first().click();
await page.waitForTimeout(120);

// Apply
await page.getByRole("button", { name: "Apply", exact: true }).click();
await page.waitForTimeout(200);
const afterApply = await layout();

// Re-open and Save as preset
await page.click(".center__hex");
await page.waitForTimeout(150);
await page.getByText("Layout").first().click();
await page.waitForTimeout(150);
await page.getByText("Customize").first().click();
await page.waitForTimeout(150);
await page.getByRole("button", { name: "Save as preset" }).click();
await page.waitForTimeout(250);
const afterSave = await layout();

console.log("before:     ", JSON.stringify(before));
console.log("after apply:", JSON.stringify(afterApply));
console.log("after save: ", JSON.stringify(afterSave));

const applied = afterApply.cols === 1 && afterApply.players === before.players / 2;
const placementsOk = afterApply.placements === afterApply.players;
const saved = afterSave.customs === 1;
console.log(
  `apply collapsed cols: ${applied} | placements==players: ${placementsOk} | saved preset: ${saved}`,
);
console.log(applied && placementsOk && saved ? "PASS ✅" : "FAIL ❌");
await b.close();
