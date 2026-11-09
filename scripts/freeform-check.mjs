// Freeform "Edit layout": build an X from the template chip, confirm, and the
// board draws four polygon cells whose + and − really change life. Also: turn
// order runs clockwise round the cells, the menu hexagon sits on the junction,
// the seat-move handle is gone, and the layout survives a reload.
// DEV-only (reads window.__store). Usage: node scripts/freeform-check.mjs [baseUrl]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:5193/lotus-tracker/";
const OUT = "screenshots/chromium/freeform";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ["--mute-audio"] });
let fails = 0;
const check = (ok, msg) => {
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
};
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__store);
const state = () => page.evaluate(() => window.__store.getState());

// Narrow cells: ⋯ and the turn timer move to a clear spot in the cell. With
// each seat active in turn, neither may overlap the life number, a + / − sign,
// the menu hexagon or clock, or each other, and each must take its own tap.
async function overlapCheck(label, shotSeat) {
  const s0 = await state();
  for (const p of s0.game.players) {
    await page.evaluate((id) => window.__store.getState().setActivePlayer(id), p.id);
    const r = await page.evaluate((id) => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const tile = document.querySelector(`.tile[data-pid="${id}"]`);
      const box = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
      const lifeEl = tile.querySelector(".tile__life");
      const range = document.createRange();
      range.selectNodeContents(lifeEl);
      const life = box(range);
      // A sign's span box is its line box; the glyph is the middle of it.
      const signs = [...tile.querySelectorAll(".tile__sign")].map((el) => {
        const b = box(el), fs = parseFloat(getComputedStyle(el).fontSize);
        const tall = b.h > b.w;
        return tall ? { x: b.x, y: b.y, w: b.w, h: b.h } : { x: b.x, y: b.y + (b.h - fs) / 2, w: b.w, h: fs };
      });
      const more = box(tile.querySelector(".tile__more"));
      const pillEl = tile.querySelector(".tile__pill");
      const pill = pillEl ? box(pillEl) : null;
      const hub = [".center__hex", ".center__clock"].map((q) => document.querySelector(q)).filter(Boolean).map(box);
      const hits = (b, el) => { const e = document.elementFromPoint(b.x + b.w / 2, b.y + b.h / 2); return !!e && (e === el || el.contains(e)); };
      res({ life, signs, more, pill, hub, moreHit: hits(more, tile.querySelector(".tile__more")), pillHit: pill ? hits(pill, pillEl) : null });
    }))), p.id);
    const ov = (a, b) => a.x < b.x + b.w - 0.5 && a.x + a.w > b.x + 0.5 && a.y < b.y + b.h - 0.5 && a.y + a.h > b.y + 0.5;
    const bad = [];
    for (const [name, el] of [["⋯", r.more], ["timer", r.pill]]) {
      if (!el) continue;
      if (ov(el, r.life)) bad.push(`${name}/number`);
      r.signs.forEach((g, i) => ov(el, g) && bad.push(`${name}/${i ? "+" : "−"}`));
      r.hub.forEach((h, i) => ov(el, h) && bad.push(`${name}/${i ? "clock" : "hexagon"}`));
    }
    if (r.pill && ov(r.pill, r.more)) bad.push("timer/⋯");
    if (!r.moreHit) bad.push("⋯ not tappable");
    if (r.pill && !r.pillHit) bad.push("timer not tappable");
    if (!r.pill) bad.push("no timer");
    check(bad.length === 0, `${label} ${p.name}: ⋯ and timer clear${bad.length ? " -- " + bad.join(", ") : ""}`);
    if (p.id === shotSeat) await page.screenshot({ path: `${OUT}/${label}-active-${p.id}.png` });
  }
}

async function openEditor() {
  await page.locator(".center__hex").tap();
  await page.getByRole("button", { name: "✥ Edit layout" }).tap();
  await page.locator(".fe").waitFor();
}

// ---- build an X ----
await openEditor();
check((await page.locator(".fe-seat").count()) === 4, "editor opens with 4 seats");
check((await page.locator(".center__hex").count()) === 0, "menu hexagon hidden while editing");
await page.getByRole("button", { name: "template X" }).tap();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/01-edit-x.png` });
await page.getByRole("button", { name: "confirm layout" }).tap();
await page.locator(".fe").waitFor({ state: "detached" });
let s = await state();
check(Array.isArray(s.game.layout.cells) && s.game.layout.cells.length === 4, "confirm bakes 4 cells");
check(s.freeTemplates.length === 0, `X is a built-in, not saved twice (saved ${s.freeTemplates.length})`);
check((await page.locator(".tile--poly").count()) === 4, "board draws 4 polygon tiles");
check((await page.locator(".tile__seat").count()) === 0, "no seat-move handle on a polygon layout");
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/02-board-x.png` });
await overlapCheck("02x", "p3");

// X: cells meet at the board's middle, so that is where the hub goes (the
// hexagon-and-clock column is centred on it as a whole).
const hex = await page.locator(".center").boundingBox();
const board = await page.locator(".board").boundingBox();
const dx = Math.abs(hex.x + hex.width / 2 - (board.x + board.width / 2));
const dy = Math.abs(hex.y + hex.height / 2 - (board.y + board.height / 2));
check(dx < 3 && dy < 3, `hexagon on the X junction (off by ${dx.toFixed(1)}, ${dy.toFixed(1)}px)`);

// ---- + and − on every cell ----
for (const p of s.game.players) {
  const before = (await state()).game.players.find((q) => q.id === p.id).life;
  await page.getByRole("button", { name: `${p.name} increase life` }).tap();
  const up = (await state()).game.players.find((q) => q.id === p.id).life;
  await page.getByRole("button", { name: `${p.name} decrease life` }).tap();
  await page.getByRole("button", { name: `${p.name} decrease life` }).tap();
  const down = (await state()).game.players.find((q) => q.id === p.id).life;
  check(up === before + 1 && down === before - 1, `${p.name}: + then −− gives ${before}→${up}→${down}`);
}
await page.screenshot({ path: `${OUT}/03-after-taps.png` });

// Every + / − centre lies inside its own clipped cell (the tap would land).
const hits = await page.evaluate(() =>
  [...document.querySelectorAll(".tile--poly .tile__adj")].map((btn) => {
    const r = btn.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!el && (el === btn || btn.contains(el));
  }),
);
check(hits.length === 8 && hits.every(Boolean), `all 8 life zones hit-testable (${hits.filter(Boolean).length}/8)`);

// ---- turn order: clockwise top → right → bottom → left ----
await page.evaluate(() => {
  const st = window.__store.getState();
  st.setActivePlayer("p0");
});
const order = ["p0"];
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => window.__store.getState().passTurn());
  order.push((await state()).game.turn.activePlayerId);
}
const cents = (await state()).game.layout.cells.map((c) => {
  const n = c.poly.length;
  return [c.playerId, c.poly.reduce((a, p) => a + p[0], 0) / n, c.poly.reduce((a, p) => a + p[1], 0) / n];
});
check(order.join(",") === "p0,p1,p2,p3", `turn order clockwise ${order.join(",")} (cells ${cents.map((c) => `${c[0]}@${c[1].toFixed(2)},${c[2].toFixed(2)}`).join(" ")})`);

// ---- persists ----
await page.reload();
await page.waitForFunction(() => window.__store);
s = await state();
check(Array.isArray(s.game.layout.cells) && s.game.layout.cells.length === 4, "polygon layout survives reload");
check((await page.locator(".tile--poly").count()) === 4, "and still draws as polygons");

// ---- edit again: remove a seat, then add one, confirm ----
await openEditor();
await page.locator(".fe-badge--del").first().tap();
check((await page.locator(".fe-seat").count()) === 3, "− removes a seat");
await page.locator(".fe-fab").tap();
await page.locator(".fe-fab").tap();
check((await page.locator(".fe-seat").count()) === 5, "+ adds seats (5)");
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/04-edit-5.png` });
await page.getByRole("button", { name: "confirm layout" }).tap();
await page.waitForTimeout(400);
s = await state();
const toast = await page.locator(".fe-toast").textContent().catch(() => null);
if (await page.locator(".fe").count()) console.log("     editor still open; toast:", toast);
check(s.game.players.length === 5 && s.game.layout.cells?.length === 5, `confirm gives 5 players / cells (${s.game.players.length})`);
check(s.freeTemplates.length === 1, `custom layout saved as a template (${s.freeTemplates.length})`);
await page.screenshot({ path: `${OUT}/05-board-5.png` });
await overlapCheck("05five", "p2");
for (const p of s.game.players) {
  const before = (await state()).game.players.find((q) => q.id === p.id).life;
  await page.getByRole("button", { name: `${p.name} increase life` }).tap();
  const up = (await state()).game.players.find((q) => q.id === p.id).life;
  check(up === before + 1, `5p ${p.name}: + gives ${before}→${up}`);
}

// ---- undo + cancel leave the board alone ----
await openEditor();
await page.locator(".fe-badge--rot").first().tap();
check(!(await page.getByRole("button", { name: "undo" }).isDisabled()), "turning a seat is undoable");
await page.getByRole("button", { name: "undo" }).tap();
await page.getByRole("button", { name: "cancel edits" }).tap();
const after = await state();
check(JSON.stringify(after.game.layout) === JSON.stringify(s.game.layout), "cancel leaves the layout as it was");

// ---- layout picker: templates listed, Grid applies ----
await page.locator(".center__hex").tap();
await page.getByRole("button", { name: "▦ Layout" }).tap();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/06-picker.png` });
await page.getByRole("button", { name: "apply template Grid" }).tap();
s = await state();
check(s.game.layout.cells?.length === 4 && s.game.players.length === 4, "picker's Grid template applies (4 cells)");
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/07-board-grid.png` });

// A grid preset still renders on the CSS grid.
await page.evaluate(async () => {
  const st = window.__store.getState();
  st.newGame({ playerCount: 4, startingLife: 40 });
});
await page.locator(".center__hex").tap();
await page.getByRole("button", { name: "▦ Layout" }).tap();
await page.locator(".preset").filter({ hasText: /4/ }).first().tap().catch(() => {});
s = await state();
check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);

await b.close();
console.log(fails ? `\n${fails} FAILED` : "\nall ok");
process.exit(fails ? 1 : 0);
