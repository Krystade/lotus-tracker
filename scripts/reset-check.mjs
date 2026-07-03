// Verifies "Reset life" requires a confirming second tap.
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

// Bring a player low so we can see the reset take effect.
await page.evaluate(() => window.__store.getState().setLife("p0", 12));
const lifeBefore = await page.evaluate(
  () => window.__store.getState().game.players[0].life,
);

await page.click(".center__hex");
await page.waitForTimeout(150);
// First tap arms the confirm; life must NOT change yet.
await page.getByText("Reset life").first().click();
await page.waitForTimeout(150);
const lifeAfterFirst = await page.evaluate(
  () => window.__store.getState().game.players[0].life,
);
const confirmShown = await page
  .getByText("Tap again to reset life")
  .isVisible()
  .catch(() => false);

// Second tap confirms.
await page.getByText("Tap again to reset life").first().click();
await page.waitForTimeout(150);
const lifeAfterSecond = await page.evaluate(
  () => window.__store.getState().game.players[0].life,
);

console.log(
  `life ${lifeBefore} -> tap1 ${lifeAfterFirst} (confirm shown: ${confirmShown}) -> tap2 ${lifeAfterSecond}`,
);
const ok =
  lifeAfterFirst === 12 && confirmShown && lifeAfterSecond === 40;
console.log(ok ? "PASS ✅" : "FAIL ❌");
await b.close();
