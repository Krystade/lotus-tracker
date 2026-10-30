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
check(JSON.stringify(holders) === '[{"id":"monarch","holder":"p0"}]', `menu adds monarch to active player (${JSON.stringify(holders)})`);
check(await page.locator('.tile[data-pid="p0"] .tile__sticker').count() === 1, "monarch badge drawn on p0's tile");

// --- drag p0 -> p3 (diagonal, different rotation), with real pointer moves
async function drag(fromPid, toPid) {
  const badge = page.locator(`.tile[data-pid="${fromPid}"] .tile__sticker`).first();
  const a = await badge.boundingBox();
  const t = await page.locator(`.tile[data-pid="${toPid}"]`).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  const tx = t.x + t.width / 2, ty = t.y + t.height / 2;
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(a.x + a.width / 2 + ((tx - a.x - a.width / 2) * i) / 12, a.y + a.height / 2 + ((ty - a.y - a.height / 2) * i) / 12);
  }
  await page.waitForTimeout(50);
  const glow = await page.locator(".sticker-drop").count();
  if (fromPid === "p0") await page.screenshot({ path: `${OUT}/sticker-drag.png` });
  await page.mouse.up();
  await page.waitForTimeout(80);
  return glow;
}
const glow = await drag("p0", "p3");
holders = await st(`return s.game.stickers`);
check(holders[0]?.holder === "p3", `drag hands monarch p0 -> p3 (${holders[0]?.holder})`);
check(glow === 1, "target tile glows during the drag");
check(await page.locator(".sticker-ghost").count() === 0, "ghost cleared after drop");

// A tap (no movement) must not move it, and must not change life.
const lifeBefore = await st(`return s.game.players.map(p => p.life).join()`);
await page.locator('.tile[data-pid="p3"] .tile__sticker').click();
holders = await st(`return s.game.stickers`);
check(holders[0]?.holder === "p3" && (await st(`return s.game.players.map(p => p.life).join()`)) === lifeBefore, "tapping a sticker does nothing");

// Dropping off every tile (on the hex) leaves it where it was.
{
  const badge = await page.locator('.tile[data-pid="p3"] .tile__sticker').boundingBox();
  const hex = await page.locator(".center__hex").boundingBox();
  await page.mouse.move(badge.x + 20, badge.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(badge.x + 20 + ((hex.x + 27 - badge.x - 20) * i) / 8, badge.y + 20 + ((hex.y + 27 - badge.y - 20) * i) / 8);
  await page.mouse.up();
  holders = await st(`return s.game.stickers`);
  check(holders[0]?.holder === "p3", "dropping on the hex keeps it with its holder");
}

// Two stickers + counters on one tile: everything still inside the tile.
await st(`s.giveSticker("initiative", "p3"); s.adjustCounter("p3", "poison", 3); s.bumpTax("p3", 1);`);
await page.waitForTimeout(80);
const fit = await page.evaluate(() => {
  const t = document.querySelector('.tile[data-pid="p3"]').getBoundingClientRect();
  return [...document.querySelectorAll('.tile[data-pid="p3"] .tile__sticker, .tile[data-pid="p3"] .tile__chip')].every((e) => {
    const r = e.getBoundingClientRect();
    return r.left >= t.left - 0.5 && r.right <= t.right + 0.5 && r.top >= t.top - 0.5 && r.bottom <= t.bottom + 0.5;
  });
});
check(fit, "stickers + chips stay inside the tile");
await page.screenshot({ path: `${OUT}/stickers-on-tile.png` });

// --- warning ring
await st(`s.setActivePlayer("p1"); s.updateSettings({ turnTimerPlacement: "corner" }); s.tick(s.game.turn.remainingSec - 25);`);
await page.waitForTimeout(80);
check(await page.locator(".tile__pill--warn").count() === 1, "amber ring at 0:25");
await st(`s.tick(17)`);
await page.waitForTimeout(80);
check(await page.locator(".tile__pill--urgent").count() === 1, "red ring at 0:08");
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
