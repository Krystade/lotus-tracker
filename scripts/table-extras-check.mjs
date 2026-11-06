// Stickers (drag between tiles), the 0:30/0:10 warning ring, the game log and
// saved groups, driven through the real UI. DEV-only (uses window.__store for
// setup). Usage: node scripts/table-extras-check.mjs [baseUrl]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:5180/";
const OUT = "screenshots/chromium/extras";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ["--mute-audio"] });
let fails = 0;
const check = (ok, msg) => {
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
};
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage();
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__store);
const st = (fn, arg) => page.evaluate(([f, a]) => new Function("s", "a", f)(window.__store.getState(), a), [fn, arg]);

await st(`s.newGame({ playerCount: 4, startingLife: 40 }); s.updateSettings({ turnTimerEnabled: true });`);

// --- stickers: add from the menu -> lands on the active player (p0)
await page.locator(".center__hex").click();
await page.getByText("👑 Stickers…").click();
await page.getByText("👑 Add Monarch").click();
await page.waitForTimeout(100);
let holders = await st(`return s.game.stickers`);
check(holders.length === 1 && holders[0].holder === "p0", `menu adds monarch to active player (${JSON.stringify(holders)})`);
check(await page.locator('[data-sticker="monarch"]').count() === 1, "monarch drawn on the board");

// --- real multi-touch through CDP: one finger drags, two fingers pinch
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) =>
  cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const centre = async (sel) => {
  const r = await page.locator(sel).boundingBox();
  return [r.x + r.width / 2, r.y + r.height / 2];
};
const life = () => st(`return s.game.players.map(p => p.life).join()`);

const lifeBefore = await life();
let [sx, sy] = await centre('[data-sticker="monarch"]');
const [tx, ty] = await centre('.tile[data-pid="p3"]');
await touch("touchStart", [[sx, sy]]);
for (let i = 1; i <= 10; i++) await touch("touchMove", [[sx + ((tx - sx) * i) / 10, sy + ((ty - sy) * i) / 10]]);
await page.screenshot({ path: `${OUT}/sticker-drag.png` });
await touch("touchEnd", []);
await page.waitForTimeout(400);
holders = await st(`return s.game.stickers`);
check(holders[0]?.holder === "p3", `one-finger drag hands monarch p0 -> p3 (${holders[0]?.holder})`);
check((await life()) === lifeBefore, "dragging changed nobody's life");

// Pinch: one finger on the sticker, the second on the tile beside it.
[sx, sy] = await centre('[data-sticker="monarch"]');
await touch("touchStart", [[sx, sy]]);
await touch("touchStart", [[sx, sy], [sx + 40, sy + 40]]);
for (let i = 1; i <= 10; i++) await touch("touchMove", [[sx - 4 * i, sy - 4 * i], [sx + 40 + 6 * i, sy + 40 + 6 * i]]);
await touch("touchEnd", [[sx - 40, sy - 40]]);
await touch("touchEnd", []);
await page.waitForTimeout(400);
holders = await st(`return s.game.stickers`);
check(holders[0]?.scale > 2, `two-finger pinch grows it (scale ${holders[0]?.scale?.toFixed(2)})`);
check((await life()) === lifeBefore, "the second finger never reached the tile under it");
await page.screenshot({ path: `${OUT}/sticker-pinched.png` });

// A plain tap on a sticker changes nothing.
const snap = JSON.stringify(await st(`return s.game.stickers`));
[sx, sy] = await centre('[data-sticker="monarch"]');
await touch("touchStart", [[sx, sy]]);
await touch("touchEnd", []);
await page.waitForTimeout(300);
check(JSON.stringify(await st(`return s.game.stickers`)) === snap && (await life()) === lifeBefore, "tapping a sticker does nothing");

// --- counters on the tile: + and - without a menu (sticker parked elsewhere)
await st(`s.placeSticker("monarch", { x: 0.25, y: 0.3, scale: 1 }); s.adjustCommanderDamage("p3", "p1", 2); s.adjustCounter("p3", "poison", 1); s.bumpTax("p3", 1);`);
await page.waitForTimeout(80);
await page.getByLabel("P4 poison up").click();
await page.getByLabel("P4 commander damage from P2 up").click();
await page.getByLabel("P4 commander tax down").click();
const p3 = await st(`const p = s.game.players[3]; return [p.counters.poison, p.commanderDamage.p1, p.counters.tax, p.life]`);
check(p3.join() === "2,3,0,37", `tile steppers adjust poison, commander damage (and life), tax (${p3})`);
check(await page.getByLabel("hide commander tax from P4's tile").count() === 1, "tax at 0 stays on the tile with a hide button");
const fit = await page.evaluate(() => {
  const t = document.querySelector('.tile[data-pid="p3"]').getBoundingClientRect();
  return [...document.querySelectorAll('.tile[data-pid="p3"] .stepper')].every((e) => {
    const r = e.getBoundingClientRect();
    return r.left >= t.left - 0.5 && r.right <= t.right + 0.5 && r.top >= t.top - 0.5 && r.bottom <= t.bottom + 0.5;
  });
});
check(fit, "steppers stay inside the tile");
await page.screenshot({ path: `${OUT}/steppers.png` });
await page.getByLabel("hide commander tax from P4's tile").click();
check(await page.getByLabel(/P4 commander tax/).count() === 0, "hiding removes it from the tile");

// --- warning ring
await st(`s.setActivePlayer("p1"); s.updateSettings({ turnTimerPlacement: "corner" });`);
await st(`s.tick(window.__store.getState().game.turn.remainingSec - 25);`);
await page.waitForTimeout(80);
check(await page.locator(".tile__pill--warn").count() === 1, "amber ring at 0:25");
await st(`s.tick(17)`);
await page.waitForTimeout(80);
const dbg = await st(`return [s.game.turn.remainingSec, s.game.turn.running, s.game.turn.activePlayerId]`); const cls = await page.locator(".tile__pill").getAttribute("class").catch(() => "none");
check(await page.locator(".tile__pill--urgent").count() === 1, `red ring at 0:08 (${dbg} | ${cls})`);
await page.screenshot({ path: `${OUT}/warn-urgent.png` });
await st(`s.updateSettings({ turnWarnOn: false })`);
await page.waitForTimeout(50);
check(await page.locator(".tile__pill--urgent, .tile__pill--warn").count() === 0, "no ring colour with warnings off");
await st(`s.updateSettings({ turnWarnOn: true }); s.passTurn();`);
await page.waitForTimeout(50);
check(await page.locator(".tile__pill--urgent, .tile__pill--warn").count() === 0, "passing the turn clears it");

// --- log: real taps on a tile's minus, then undo from the panel
await st(`s.newGame({ playerCount: 4, startingLife: 40 });`);
for (let i = 0; i < 3; i++) await page.getByLabel(/decrease life/).first().click();
await st(`s.adjustCommanderDamage("p2", "p0", 5); s.giveSticker("monarch", "p1");`);
await page.locator(".center__hex").click();
await page.getByText("☰ Game log").click();
await page.waitForTimeout(100);
const rows = await page.locator(".log__row").allInnerTexts();
check(rows.length === 3, `log shows 3 entries (${rows.length})`);
check(/-3 life → 37/.test(rows[2] ?? ""), `three taps fold into one -3 (${(rows[2] ?? "").replace(/\s+/g, " ")})`);
await page.screenshot({ path: `${OUT}/log.png` });
await page.locator(".log__row").nth(1).locator(".log__undo").click(); // the cmdr hit
const p2 = await st(`const p = s.game.players[2]; return [p.life, p.commanderDamage.p0]`);
check(p2[0] === 40 && p2[1] === 0, `undo commander hit restores life and damage (${p2})`);
await page.locator(".panel__x").click();

// --- saved group
await st(`s.setPlayerName("p0", "Jack"); s.setPlayerName("p1", "Sam");`);
await page.locator(".center__hex").click();
await page.getByText("✦ New game").click();
await page.getByLabel("setup name").fill("Friday");
await page.getByLabel("setup name").press("Enter");
await page.waitForTimeout(100);
let saved = await st(`return s.setups.length`);
if (saved === 0) {
  // Enter may not submit; use the save button next to the field.
  await page.locator('[aria-label="setup name"] ~ button').first().click();
  saved = await st(`return s.setups.length`);
}
check(saved === 1, "setup saved from the new-game screen");
await st(`s.newGame({ playerCount: 4, startingLife: 40 })`);
await page.locator(".panel__x").click();
await page.locator(".center__hex").click();
await page.getByText("✦ New game").click();
await page.screenshot({ path: `${OUT}/setups.png` });
await page.locator(".setup__load").first().click();
const names = await st(`return s.game.players.map(p => p.name).slice(0, 2).join()`);
check(names === "Jack,Sam", `loading the group seats Jack and Sam (${names})`);

await b.close();
console.log(fails ? `\n${fails} FAILED` : "\nall ok");
process.exit(fails ? 1 : 0);
