// Verifies the rotated (side-seat) detail panel fits within a short viewport
// (mimicking Safari with its URL bar) and isn't clipped off-screen.
import { chromium } from "@playwright/test";

const BASE = process.argv[2] || "http://localhost:5180/";
const b = await chromium.launch();
// Short viewport ~ iPhone 13 mini visible area with Safari chrome.
const H = 640;
const ctx = await b.newContext({
  viewport: { width: 375, height: H },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const page = await ctx.newPage();
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(300);

// 6-player pod, populate p0 so the panel is content-heavy, open its detail.
await page.evaluate(() => {
  const st = window.__store.getState();
  st.newGame({ playerCount: 6, startingLife: 40 });
  st.adjustCounter("p0", "poison", 3);
  st.adjustCommanderDamage("p0", "p1", 4);
  st.adjustCommanderDamage("p0", "p2", 7);
});
await page.waitForTimeout(150);
await page.locator(".tile__more").nth(0).click({ force: true }); // seat 0 = rot 90
await page.waitForTimeout(300);

await page.screenshot({ path: "screenshots/chromium/13mini/rot-fit.png" });
const box = await page.locator(".rot-wrap").boundingBox();
const withinTop = box.y >= -1;
const withinBottom = box.y + box.height <= H + 1;
// eliminate button reachable (visible or scrollable-to within the fitted panel)
const elimExists = (await page.locator(".panel__elim").count()) === 1;

console.log(`viewport height=${H}`);
console.log(`panel box: y=${Math.round(box.y)} h=${Math.round(box.height)} bottom=${Math.round(box.y + box.height)}`);
console.log(`fits top: ${withinTop} | fits bottom: ${withinBottom} | eliminate present: ${elimExists}`);
console.log(withinTop && withinBottom && elimExists ? "PASS ✅" : "FAIL ❌");
await b.close();
