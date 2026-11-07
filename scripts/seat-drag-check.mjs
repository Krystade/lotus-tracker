// Moving seats on the board with real touch: hold the handle, drag to the
// head / foot / a side / a centre disc, undo, facing picker, and that other
// players' taps keep working. Usage: node scripts/seat-drag-check.mjs <url>
import { chromium, webkit } from "@playwright/test";
import fs from "node:fs";
const url = process.argv[2] ?? "http://localhost:5188/lotus-tracker/";
const engine = process.argv[3] === "webkit" ? webkit : chromium;
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) fails++; };
const OUT = "screenshots/chromium/extras";
fs.mkdirSync(OUT, { recursive: true });
const b = await engine.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: engine === chromium });
const page = await ctx.newPage();
await page.goto(url); await page.waitForFunction(() => window.__store);
const S = (code) => page.evaluate((c) => new Function("s", c)(window.__store.getState()), code);
const sleep = (ms) => page.waitForTimeout(ms);

let cdp = null;
if (engine === chromium) cdp = await ctx.newCDPSession(page);
const touch = async (type, pts) => {
  if (cdp) return cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  // WebKit: synthesize pointer events (no CDP).
  const kind = { touchStart: "pointerdown", touchMove: "pointermove", touchEnd: "pointerup" }[type];
  const [x, y] = pts[0] ?? touch.last;
  touch.last = [x, y];
  await page.evaluate(([k, x, y]) => {
    const t = k === "pointerdown" ? document.elementFromPoint(x, y) : (window.__ptTarget ?? document.body);
    if (k === "pointerdown") window.__ptTarget = t;
    t.dispatchEvent(new PointerEvent(k, { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: "touch", clientX: x, clientY: y, isPrimary: true }));
  }, [kind, x, y]);
};

const handleOf = async (pid) => {
  const r = await page.locator(`.tile[data-pid="${pid}"] .tile__seat`).boundingBox();
  return [r.x + r.width / 2, r.y + r.height / 2];
};
const tileBox = (pid) => page.locator(`.tile[data-pid="${pid}"]`).boundingBox();
async function drag(pid, path, { hold = 420, shot, release = true } = {}) {
  const [x, y] = await handleOf(pid);
  await touch("touchStart", [[x, y]]);
  await sleep(hold);
  let last = [x, y];
  for (const [tx, ty] of path) {
    for (let i = 1; i <= 8; i++) {
      const p = [last[0] + ((tx - last[0]) * i) / 8, last[1] + ((ty - last[1]) * i) / 8];
      await touch("touchMove", [p]);
    }
    last = [tx, ty];
  }
  await sleep(60);
  if (shot) await page.screenshot({ path: `${OUT}/${shot}.png` });
  if (!release) return last;
  await touch("touchEnd", engine === chromium ? [] : [last]);
  await sleep(320);
  return last;
}
const lift = async (last) => { await touch("touchEnd", engine === chromium ? [] : [last]); await sleep(320); };
const dragging = () => page.evaluate(() => document.documentElement.hasAttribute("data-seat-drag") || !!document.querySelector(".seatchip, .seatghost, .seatrail"));
// A new game on the default preset for n seats (changing the pod size resets it).
const fresh = (n) => S(`s.newGame({ playerCount: ${n === 3 ? 4 : 3}, startingLife: 40 }); window.__store.getState().newGame({ playerCount: ${n}, startingLife: 40 })`);
const table = () => S(`const l = s.game.layout; return l.rows + "x" + l.cols + " " + l.placements.map(p => p.playerId + "@" + p.row + "," + p.col + "+" + p.rowSpan + "x" + p.colSpan + "r" + p.rotation).join(" ")`);

// ---- 4 players: Ana (p0) to the head
await S(`s.newGame({ playerCount: 4, startingLife: 40 }); s.updateSettings({ turnTimerEnabled: true, turnTimerPlacement: "corner" });`);
await sleep(200);
check((await page.locator(".tile__seat").count()) === 4, "every tile has a seat handle");
const lifeBefore = await S(`return s.game.players.map(p => p.life).join()`);
await drag("p0", [[180, 30], [180, 4]], { shot: "seat-1-head-preview" });
let p0 = await tileBox("p0");
check(p0.width > 340 && p0.y < 80, `Ana takes the whole head (${p0.width.toFixed(0)}x${p0.height.toFixed(0)} at y ${p0.y.toFixed(0)})`);
check((await S(`return s.game.layout.placements.find(p => p.playerId === "p0").rotation`)) === 180, "Ana now faces the head");
check((await S(`return s.game.players.map(p => p.life).join()`)) === lifeBefore, "no life changed while dragging");
check((await page.locator(".seatundo").count()) === 1, "undo shows after the move");
await page.screenshot({ path: `${OUT}/seat-2-after-head.png` });

// undo
const u = await page.locator(".seatundo").boundingBox();
await touch("touchStart", [[u.x + u.width / 2, u.y + u.height / 2]]); await touch("touchEnd", engine === chromium ? [] : [[u.x + u.width / 2, u.y + u.height / 2]]);
await sleep(300);
check((await S(`return s.game.layout.id`)) === "builtin-4", "undo restores the 2x2 preset");

// redo the head, then Dee (p3) to the foot -> 1-2-1
await drag("p0", [[180, 30], [180, 4]]);
await drag("p3", [[190, 790], [190, 808]], { shot: "seat-3-foot-preview" });
const t121 = await table();
const hs = await Promise.all(["p0", "p1", "p2", "p3"].map(async (p) => Math.round((await tileBox(p)).height)));
check(new Set(hs).size === 1, `1-2-1: all four tiles the same height (${hs.join(",")}) — ${t121}`);
await page.screenshot({ path: `${OUT}/seat-4-one-two-one.png` });

// swap via a centre disc: Ben (p1) onto Cal (p2)
const c2 = await tileBox("p2");
await drag("p1", [[c2.x + c2.width / 2, c2.y + c2.height / 2]], { shot: "seat-5-swap-preview" });
const after = await table();
check(after.includes("p1@") && after !== t121, `swap exchanged Ben and Cal (${after})`);

// a too-quick drag does nothing
const beforeQuick = await table();
{
  const [x, y] = await handleOf("p1");
  await touch("touchStart", [[x, y]]);
  for (let i = 1; i <= 8; i++) await touch("touchMove", [[x, y + i * 20]]);
  await touch("touchEnd", engine === chromium ? [] : [[x, y + 160]]);
  await sleep(300);
}
check((await table()) === beforeQuick, "dragging without holding first changes nothing");

// release on own tile -> facing picker
await drag("p1", [], { hold: 420 });
check((await page.locator(".seatfacing").count()) === 1, "hold and let go at home opens the facing picker");
await page.screenshot({ path: `${OUT}/seat-6-facing.png` });
const left = await page.locator(".seatfacing__btn--left").boundingBox();
await touch("touchStart", [[left.x + 20, left.y + 20]]); await touch("touchEnd", engine === chromium ? [] : [[left.x + 20, left.y + 20]]);
await sleep(250);
check((await S(`return s.game.layout.placements.find(p => p.playerId === "p1").rotation`)) === 90, "facing picker turns the seat");
// The picker covers the tile, handle and all; holding the handle again must
// still lift the seat rather than feed the picker.
check((await page.locator(".seatfacing").count()) === 1, "the facing picker is still open");
await drag("p1", [[180, 30], [180, 4]]);
{
  const r = await tileBox("p1");
  const rot = await S(`return s.game.layout.placements.find(p => p.playerId === "p1").rotation`);
  check(rot === 180 && r.y < 80 && (await page.locator(".seatfacing").count()) === 0,
    `holding the handle under the facing picker still moves the seat (${await table()})`);
}

// other players can tap during a drag
await S(`s.newGame({ playerCount: 3, startingLife: 40 }); window.__store.getState().newGame({ playerCount: 4, startingLife: 40 })`);
await sleep(200);
if (cdp) {
  const [x, y] = await handleOf("p0");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 0 }] });
  await sleep(420);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + 60, id: 0 }] });
  const d = await tileBox("p3");
  const plus = [d.x + d.width * 0.5, d.y + d.height * 0.15];
  const lifeD = await S(`return s.game.players[3].life`);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y + 60, id: 0 }, { x: plus[0], y: plus[1], id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [{ x, y: y + 60, id: 0 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(300);
  const lifeAfter = await S(`return s.game.players[3].life`);
  check(lifeAfter !== lifeD, `another player's life tap still works mid-drag (${lifeD} -> ${lifeAfter})`);
}

// A new game while Undo shows: the pill goes, and nothing from the last game
// (its seats, its monarch) can come back through it.
// (The release at home just above left a facing picker on Ana; the drags
// below must work through it.)
await fresh(4);
await S(`s.giveSticker("monarch", "p1")`);
await sleep(200);
await drag("p0", [[180, 30], [180, 4]]);
const movedTable = await table();
check(movedTable.startsWith("3x2 p0@1,1+1x2r180"), `Ana moved to the head (${movedTable})`);
await S(`s.newGame({ playerCount: 4, startingLife: 40 })`);
await sleep(200);
check((await page.locator(".seatundo").count()) === 0, "a new game takes the Undo pill away");
for (const u of await page.locator(".seatundo").all()) {
  const r = await u.boundingBox();
  await touch("touchStart", [[r.x + r.width / 2, r.y + r.height / 2]]); await touch("touchEnd", engine === chromium ? [] : [[r.x + r.width / 2, r.y + r.height / 2]]);
  await sleep(300);
}
check((await table()) === movedTable && (await S(`return s.game.stickers.length`)) === 0, "nothing from the last game comes back: same seats, no old monarch");

// Someone uses the layout picker while a seat is held: the drag ends and the
// drop does nothing (it was planned for the old board).
await fresh(4);
await sleep(200);
{
  const last = await drag("p0", [[180, 30], [180, 4]], { release: false });
  check(await dragging(), "Ana is held over the head");
  await S(`s.applyLayout({ id: "custom-col", name: "column", builtIn: false, playerCount: 4, rows: 4, cols: 1,
    placements: [0, 1, 2, 3].map((i) => ({ playerId: "p" + i, row: i + 1, col: 1, rowSpan: 1, colSpan: 1, rotation: 0 })) })`);
  await sleep(150);
  check(!(await dragging()), "a layout change mid-drag ends the drag");
  await lift(last);
  check((await S(`return s.game.layout.id`)) === "custom-col" && (await page.locator(".seatundo").count()) === 0,
    `...and letting go does not overwrite it (${await table()})`);
}

// A new game with another pod size mid-drag: no Undo for a move that never happened.
await fresh(4);
await sleep(200);
{
  const last = await drag("p0", [[180, 30], [180, 4]], { release: false });
  check(await dragging(), "Ana is held over the head again");
  await S(`s.newGame({ playerCount: 5, startingLife: 40 })`);
  await sleep(150);
  await lift(last);
  check((await S(`return s.game.layout.id`)) === "builtin-5" && (await page.locator(".seatundo").count()) === 0 && !(await dragging()),
    "a new game mid-drag leaves the new board alone, with no Undo pill");
}

// A seat let go mid-swipe (no pause before lifting): the very next tap
// anywhere must still click. Chrome used to turn the swipe into a fling and
// spend the next tap stopping it.
if (cdp) {
  await fresh(5);
  await sleep(200);
  const before = await table();
  const [x, y] = await handleOf("p4");
  await touch("touchStart", [[x, y]]);
  await sleep(420);
  let last = [x, y];
  for (const [tx, ty] of [[60, 300], [60, 420]]) {
    for (let i = 1; i <= 6; i++) await touch("touchMove", [[last[0] + ((tx - last[0]) * i) / 6, last[1] + ((ty - last[1]) * i) / 6]]);
    last = [tx, ty];
  }
  await touch("touchEnd", []);
  await sleep(1000);
  const moved = await table();
  const m = await page.locator(`.tile[data-pid="p1"] .tile__more`).boundingBox();
  await touch("touchStart", [[m.x + m.width / 2, m.y + m.height / 2]]);
  await touch("touchEnd", []);
  await sleep(400);
  const opened = await page.locator(".overlay").count();
  check(moved !== before && opened > 0, `the first tap after a swiped drop opens Ben's ⋯ (${opened} open, ${moved})`);
  await page.keyboard.press("Escape");
  await sleep(200);
  check((await page.locator(".overlay").count()) === 0, "...and Escape closes it again");
}

// 3 players: Cal (p2, bottom) joins the left side
await S(`s.newGame({ playerCount: 3, startingLife: 40 })`);
await sleep(200);
await drag("p2", [[90, 520], [96, 560]], { shot: "seat-7-three-left" });
const b1 = await tileBox("p1");
check(b1.height > 650, `3p: Ben gets the whole right side (${b1.height.toFixed(0)}px tall) — ${await table()}`);

// 6 players: head then foot
await S(`s.newGame({ playerCount: 6, startingLife: 40 })`);
await sleep(200);
await drag("p0", [[180, 30], [180, 4]]);
await drag("p5", [[190, 790], [190, 808]], { shot: "seat-8-six-foot" });
await page.screenshot({ path: `${OUT}/seat-9-six-done.png` });
check(/^4x2 /.test(await table()), `6p: one at each end, two-two down the sides (${await table()})`);

// Customize layout: a 3x3 with a centre seat keeps its shape
await S(`s.applyLayout({ id: "custom-x", name: "ring", builtIn: false, playerCount: 5, rows: 3, cols: 3, placements: [
  { playerId: "p0", row: 1, col: 1, rowSpan: 1, colSpan: 3, rotation: 180 },
  { playerId: "p1", row: 2, col: 1, rowSpan: 1, colSpan: 1, rotation: 90 },
  { playerId: "p2", row: 2, col: 2, rowSpan: 1, colSpan: 1, rotation: 0 },
  { playerId: "p3", row: 2, col: 3, rowSpan: 1, colSpan: 1, rotation: 270 },
  { playerId: "p4", row: 3, col: 1, rowSpan: 1, colSpan: 3, rotation: 0 }] })`);
await sleep(250);
const before1 = await tileBox("p1");
const t0 = await tileBox("p0");
await drag("p4", [[t0.x + t0.width * 0.85, t0.y + t0.height / 2 + 20]], { shot: "seat-10-custom-split" });
const after1 = await tileBox("p1");
check(Math.abs(before1.width - after1.width) < 2 && Math.abs(before1.x - after1.x) < 2, `Customize: untouched seats keep their columns — ${await table()}`);

// Where the handle sits: for every preset and every layout one or two moves
// away, with the corner timer on each seat in turn and counters on every
// tile, the handle box must not overlap the life +/- zones, ⋯, the counter
// row, the timer face or the game clock, and none of a 3x3 grid of points on
// it may be covered by anything (the menu hexagon above all).
{
  const r = await page.evaluate(async () => {
    const T = await import("/lotus-tracker/src/layout/table.ts");
    const P = await import("/lotus-tracker/src/layout/presets.ts");
    const st = () => window.__store.getState();
    const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const meet = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
    const name = (el) => (el?.className?.baseVal ?? el?.className ?? String(el)).toString().split(" ")[0];
    const bad = [];
    const worst = [];
    let layouts = 0;
    for (let n = 2; n <= 6; n++) {
      st().newGame({ playerCount: 3, startingLife: 40 });
      st().newGame({ playerCount: n, startingLife: 40 });
      st().updateSettings({ turnTimerEnabled: true, turnTimerPlacement: "corner", turnTimerScale: 1 });
      for (let i = 0; i < n; i++) { st().adjustCounter(`p${i}`, "poison", 2); st().bumpTax(`p${i}`, 1); }
      await frame();
      const board = document.querySelector(".board");
      const box = board.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(board).rowGap) || 8;
      const preset = P.defaultLayoutFor(n);
      const all = new Map([[T.geomKey(preset, true), preset]]);
      let edge = [preset];
      for (let depth = 0; depth < 2; depth++) {
        const next = [];
        for (const L0 of edge)
          for (const p of L0.placements)
            for (const m of T.planMoves(L0, p.playerId, box.width, box.height, gap).moves) {
              const k = T.geomKey(m.grid, true);
              if (all.has(k)) continue;
              const L = T.asLayout(m.grid, n);
              all.set(k, L);
              next.push(L);
            }
        edge = next;
      }
      for (const L of all.values()) {
        layouts++;
        st().applyLayout(L);
        const desc = `${n}p ${L.rows}x${L.cols} ${L.placements.map((p) => `${p.playerId}@${p.row},${p.col}+${p.rowSpan}x${p.colSpan}r${p.rotation}`).join(" ")}`;
        for (let a = 0; a < n; a++) {
          st().setActivePlayer(`p${a}`);
          await frame();
          for (const tile of document.querySelectorAll(".tile[data-pid]")) {
            const pid = tile.dataset.pid;
            if (a > 0 && pid !== `p${a}`) continue; // the timer face only moves with the active seat
            const h = tile.querySelector(".tile__seat");
            if (!h) { bad.push("no handle"); worst.push(`${desc} :: ${pid}: no handle`); continue; }
            const hr = h.getBoundingClientRect();
            const hits = [];
            for (const sel of [".tile__adj--minus", ".tile__adj--plus", ".tile__more", ".tcount-row", ".tile__pill"]) {
              const el = tile.querySelector(sel);
              if (el && meet(hr, el.getBoundingClientRect())) hits.push(sel);
            }
            const clock = document.querySelector(".center__clock");
            if (clock && meet(hr, clock.getBoundingClientRect())) hits.push(".center__clock");
            let covered = 0;
            const by = new Set();
            for (const fx of [0.2, 0.5, 0.8])
              for (const fy of [0.2, 0.5, 0.8]) {
                const el = document.elementFromPoint(hr.left + hr.width * fx, hr.top + hr.height * fy);
                if (!el || !h.contains(el)) { covered++; by.add(name(el)); }
              }
            if (covered) hits.push(`points covered by ${[...by].join("+")}`);
            if (hits.length) { bad.push(hits.join(", ")); worst.push(`${desc} :: ${pid} (p${a} active): ${hits.join(", ")}`); }
          }
        }
      }
    }
    return { bad, worst, layouts };
  });
  const kinds = [...new Set(r.bad)];
  check(r.bad.length === 0, `the handle clears life +/-, ⋯, counters, the timer face, the hexagon and the clock in ${r.layouts} layouts${r.bad.length ? ` — ${r.bad.length} problems: ${kinds.slice(0, 6).join("; ")} (all in ${OUT}/seat-handle-problems.txt)` : ""}`);
  fs.writeFileSync(`${OUT}/seat-handle-problems.txt`, r.worst.join("\n") + "\n");
}

await b.close();
console.log(fails ? `${fails} FAILED` : "all ok");
process.exit(fails ? 1 : 0);
