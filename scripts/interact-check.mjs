// Checks life +/- taps (tap = ±1) and tap-to-pass-turn on the timer pill.
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
  page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("lotus-tracker")).state;
    return s.game.players[0].life;
  });
const turn = () =>
  page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("lotus-tracker")).state;
    return { active: s.game.turn.activePlayerId, n: s.game.turn.turnNumber };
  });

const l0 = await life();
await page.locator(".tile__adj--minus").first().click();
await page.waitForTimeout(120);
const l1 = await life();
await page.locator(".tile__adj--plus").first().click();
await page.locator(".tile__adj--plus").first().click();
await page.waitForTimeout(120);
const l2 = await life();

const t0 = await turn();
// tap (no drag) the pill to pass the turn
const pill = page.locator(".tile__pill").first();
const box = await pill.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(150);
const t1 = await turn();

console.log(`life: ${l0} --(-1 tap)--> ${l1} --(+1 +1)--> ${l2}`);
console.log(`turn: ${JSON.stringify(t0)} --(tap pill)--> ${JSON.stringify(t1)}`);
const tapMinus = l1 === l0 - 1;
const tapPlus = l2 === l1 + 2;
const passed = t1.active !== t0.active && t1.n === t0.n + 1;
console.log(
  `tap -1: ${tapMinus} | tap +1: ${tapPlus} | pass turn: ${passed}`,
);
console.log(tapMinus && tapPlus && passed ? "PASS ✅" : "FAIL ❌");
await b.close();
