// Turn timer gestures with real touch input: tap passes, one finger drags,
// two fingers pinch (resize) and twist (rotate); in corner mode pinch only
// resizes. Usage: node scripts/timer-pinch-check.mjs <url>
import { chromium } from "@playwright/test";
const url = process.argv[2] ?? "http://localhost:5188/lotus-tracker/";
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) fails++; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto(url); await page.waitForFunction(() => window.__store);
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const st = (body) => page.evaluate(new Function("s", body), null).catch(() => null);
const S = (code) => page.evaluate((c) => new Function("s", c)(window.__store.getState()), code);
const centre = async () => { const r = await page.locator(".tile__pill").boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };

await S(`s.newGame({ playerCount: 4, startingLife: 40 }); s.updateSettings({ turnTimerEnabled: true, turnTimerPlacement: "drag", turnTimerScale: 1 }); window.__store.getState().setActivePlayer("p0");`);
await page.waitForTimeout(150);
const life = () => S(`return s.game.players.map(p => p.life).join()`);
const lifeBefore = await life();

// pinch + twist: second finger lands on the tile beside the pill
let [x, y] = await centre();
await touch("touchStart", [[x, y]]);
await touch("touchStart", [[x, y], [x + 50, y]]);
for (let i = 1; i <= 12; i++) {
  const a = (i / 12) * (Math.PI / 4); // twist 45 degrees
  const d = 50 + i * 6; // spread 50 -> 122
  await touch("touchMove", [[x, y], [x + d * Math.cos(a), y + d * Math.sin(a)]]);
}
await touch("touchEnd", [[x, y]]);
await touch("touchEnd", []);
await page.waitForTimeout(300);
let pos = await S(`return s.game.players[0].timerPos`);
check(pos?.scale > 2, `pinch grows the timer (scale ${pos?.scale?.toFixed(2)})`);
check(Math.abs(((pos?.angle ?? 0) - 45 + 360) % 360) < 3, `twist turns it (angle ${pos?.angle?.toFixed(1)})`);
check((await S(`return s.game.turn.activePlayerId`)) === "p0", "pinching did not pass the turn");
check((await life()) === lifeBefore, "the second finger never reached the life buttons");
const tf = await page.locator(".tile__pill").evaluate((e) => e.style.transform);
check(/rotate\(4[0-9]/.test(tf), `drawn rotated (${tf})`);

// tap still passes
[x, y] = await centre();
await touch("touchStart", [[x, y]]); await touch("touchEnd", []);
await page.waitForTimeout(250);
check((await S(`return s.game.turn.activePlayerId`)) !== "p0", "a tap passes the turn");
// ...and the next player's tap straight after still counts. The details
// button acts on click, which the gesture used to swallow for 350ms.
const more = await page.locator('.tile[data-pid="p1"] .tile__more').boundingBox();
await touch("touchStart", [[more.x + more.width / 2, more.y + more.height / 2]]); await touch("touchEnd", []);
await page.waitForTimeout(250);
check((await page.locator(".crow").count()) > 0, "a tap on another tile's details right after passing still opens it");
await page.keyboard.press("Escape"); await page.waitForTimeout(200);

// corner mode: pinch resizes, never moves or turns
await S(`s.updateSettings({ turnTimerPlacement: "corner" }); window.__store.getState().setActivePlayer("p2");`);
await page.waitForTimeout(150);
const before = await page.locator(".tile__pill").boundingBox();
[x, y] = await centre();
await touch("touchStart", [[x, y]]);
await touch("touchStart", [[x, y], [x + 30, y + 30]]);
for (let i = 1; i <= 10; i++) await touch("touchMove", [[x - 2 * i, y], [x + 30 + 5 * i, y + 30 + 5 * i]]);
await touch("touchEnd", [[x, y]]); await touch("touchEnd", []);
await page.waitForTimeout(300);
pos = await S(`return s.game.players[2].timerPos`);
const after = await page.locator(".tile__pill").boundingBox();
check(after.width > before.width * 1.2, `corner timer grows (${before.width.toFixed(0)} -> ${after.width.toFixed(0)}px)`);
check(!pos?.angle, "corner timer is not turned");
const tile = await page.locator('.tile[data-pid="p2"]').boundingBox();
// The disc is centred where the seats meet, the middle of the gap, so its
// box reaches half a gap (4px) past the tile, which clips it.
const slack = 4 + 1;
check(after.x >= tile.x - slack && after.y >= tile.y - slack && after.x + after.width <= tile.x + tile.width + slack && after.y + after.height <= tile.y + tile.height + slack,
  `still within half a gap of its tile (${[after.x - tile.x, after.y - tile.y, tile.x + tile.width - after.x - after.width, tile.y + tile.height - after.y - after.height].map((v) => v.toFixed(1)).join(", ")})`);
await page.screenshot({ path: "screenshots/chromium/extras/timer-pinched.png" });
await b.close();
console.log(fails ? `${fails} FAILED` : "all ok");
process.exit(fails ? 1 : 0);
