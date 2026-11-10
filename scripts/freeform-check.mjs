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
//
// A sign is measured by its ink, not its box: the text's own box (a Range on
// it) trimmed by the font's metrics -- side bearings along the baseline,
// ascent/descent padding across it -- with each trim applied to whichever
// screen side the tile's 0/90/180/270 turn puts it on. A sign's span or line
// box is mostly empty font padding, and on a turned tile that padding lies
// along the screen's x, where it reported ⋯ "on" a + it was nowhere near.
const measureSeat = (id) =>
  page.evaluate((id) => {
    const tile = document.querySelector(`.tile[data-pid="${id}"]`);
    const box = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
    const lifeEl = tile.querySelector(".tile__life");
    const range = document.createRange();
    range.selectNodeContents(lifeEl);
    const life = box(range);
    const rot = Number(/rotate\((\d+)deg\)/.exec(tile.querySelector(".tile__content").style.transform)?.[1] ?? 0);
    const ctx = document.createElement("canvas").getContext("2d");
    const signs = [...tile.querySelectorAll(".tile__sign")].map((el) => {
      const rg = document.createRange();
      rg.selectNodeContents(el);
      const q = rg.getBoundingClientRect();
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = ctx.measureText(el.textContent);
      // Insets from the text box to the ink, in the text's own frame.
      const l = -m.actualBoundingBoxLeft, r = m.width - m.actualBoundingBoxRight;
      const t = m.fontBoundingBoxAscent - m.actualBoundingBoxAscent, bt = m.fontBoundingBoxDescent - m.actualBoundingBoxDescent;
      let x0 = q.left, y0 = q.top, x1 = q.right, y1 = q.bottom;
      if (rot === 0) { x0 += l; x1 -= r; y0 += t; y1 -= bt; }
      else if (rot === 90) { y0 += l; y1 -= r; x1 -= t; x0 += bt; }
      else if (rot === 180) { x1 -= l; x0 += r; y1 -= t; y0 += bt; }
      else { y1 -= l; y0 += r; x0 += t; x1 -= bt; }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    });
    const more = box(tile.querySelector(".tile__more"));
    const pillEl = tile.querySelector(".tile__pill");
    const pill = pillEl ? box(pillEl) : null;
    const hub = [".center__hex", ".center__clock"].map((q) => document.querySelector(q)).filter(Boolean).map(box);
    const hits = (b, el) => { const e = document.elementFromPoint(b.x + b.w / 2, b.y + b.h / 2); return !!e && (e === el || el.contains(e)); };
    return { rot, life, signs, more, pill, hub, moreHit: hits(more, tile.querySelector(".tile__more")), pillHit: pill ? hits(pill, pillEl) : null };
  }, id);

const ov = (a, b) => a.x < b.x + b.w - 0.5 && a.x + a.w > b.x + 0.5 && a.y < b.y + b.h - 0.5 && a.y + a.h > b.y + 0.5;
function problems(r) {
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
  return bad;
}

const settle = () => page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));

async function overlapCheck(label, shotSeat) {
  const s0 = await state();
  for (const p of s0.game.players) {
    await page.evaluate((id) => window.__store.getState().setActivePlayer(id), p.id);
    await settle();
    const bad = problems(await measureSeat(p.id));
    check(bad.length === 0, `${label} ${p.name}: ⋯ and timer clear${bad.length ? " -- " + bad.join(", ") : ""}`);
    if (p.id === shotSeat) await page.screenshot({ path: `${OUT}/${label}-active-${p.id}.png` });
  }
}

// Control for the ink measure: put ⋯ over a seat's + (in the tile's own
// frame, against the glyph from the font's ascent side, where the trimmed
// padding was) overlapping its ink by `by` px -- negative is a gap. Restores
// ⋯ (React does not know it moved) and returns that seat's ⋯ problems.
async function moreOnPlus(id, by) {
  await page.evaluate(([id, by]) => {
    const tile = document.querySelector(`.tile[data-pid="${id}"]`);
    const content = tile.querySelector(".tile__content");
    const rot = Number(/rotate\((\d+)deg\)/.exec(content.style.transform)?.[1] ?? 0);
    const cr = content.getBoundingClientRect();
    const toLocal = (X, Y) =>
      rot === 0 ? [X - cr.left, Y - cr.top] : rot === 90 ? [Y - cr.top, cr.right - X] : rot === 180 ? [cr.right - X, cr.bottom - Y] : [cr.bottom - Y, X - cr.left];
    const g = tile.querySelectorAll(".tile__sign")[1];
    const rg = document.createRange();
    rg.selectNodeContents(g);
    const q = rg.getBoundingClientRect();
    const cs = getComputedStyle(g);
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = ctx.measureText(g.textContent);
    // The text box's top-left in local space, then the ink from there.
    const c4 = [toLocal(q.left, q.top), toLocal(q.right, q.top), toLocal(q.left, q.bottom), toLocal(q.right, q.bottom)];
    const lx = Math.min(...c4.map((c) => c[0])), ly = Math.min(...c4.map((c) => c[1]));
    const inkTop = ly + m.fontBoundingBoxAscent - m.actualBoundingBoxAscent;
    const inkCx = lx + (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
    const more = tile.querySelector(".tile__more");
    more.dataset.style = more.getAttribute("style") ?? "";
    more.style.left = `${inkCx - more.offsetWidth / 2}px`;
    more.style.top = `${inkTop - more.offsetHeight + by}px`;
    more.style.right = "auto";
    more.style.bottom = "auto";
  }, [id, by]);
  const r = await measureSeat(id);
  await page.evaluate((id) => {
    const more = document.querySelector(`.tile[data-pid="${id}"] .tile__more`);
    more.setAttribute("style", more.dataset.style);
    delete more.dataset.style;
  }, id);
  return { rot: r.rot, bad: problems(r).filter((b) => b.startsWith("⋯/")) };
}

async function inkControl(label, id) {
  await page.evaluate((id) => window.__store.getState().setActivePlayer(id), id);
  await settle();
  const on = await moreOnPlus(id, 3);
  check(on.bad.includes("⋯/+"), `${label} control: ⋯ moved 3px onto ${id}'s + ink (turned ${on.rot}) is caught (${on.bad.join(",") || "nothing"})`);
  const near = await moreOnPlus(id, -3);
  check(!near.bad.includes("⋯/+"), `${label} control: ⋯ 3px short of ${id}'s + ink is clear of it (${near.bad.join(",") || "nothing"})`);
  const back = problems(await measureSeat(id));
  check(back.length === 0, `${label} control: ⋯ restored on ${id} (${back.join(",") || "clear"})`);
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
await inkControl("02x", "p1");

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

// ---- stickers and the timer sit in the actual cell ----
// A cell's outline is its tile's clip-path, in screen px. A new sticker
// (added from the menu to whoever's turn it is) must lie wholly inside its
// holder's polygon, clear of that tile's number, signs, ⋯ and timer, of the
// hexagon and clock, and of the other stickers, facing its holder's way. The
// timer (drag and corner mode) must lie inside the active cell too.
const sheetRect = (sel) => page.evaluate((sel) => {
  const out = {};
  for (const t of document.querySelectorAll(".tile--poly")) {
    const r = t.getBoundingClientRect();
    const m = /polygon\((.*)\)/.exec(t.style.clipPath);
    out[t.dataset.pid] = m ? m[1].split(",").map((p) => { const [x, y] = p.trim().split(/\s+/).map(parseFloat); return [r.left + x, r.top + y]; }) : [];
  }
  return out;
}, sel);
const inPoly = (poly, x, y) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const boxIn = (poly, b) => [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].every(([x, y]) => inPoly(poly, x, y));
// What a sticker of `id` overlaps, and where it is.
const stickerProblems = async (id) => {
  const polys = await sheetRect();
  const r = await page.evaluate((id) => {
    const box = (el) => { const q = el.getBoundingClientRect(); return { x: q.left, y: q.top, w: q.width, h: q.height }; };
    const text = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); return box(rg); };
    const g = window.__store.getState().game;
    const st = g.stickers.find((s) => s.id === id);
    const el = document.querySelector(`.sticker[data-sticker="${id}"]`);
    const tile = document.querySelector(`.tile[data-pid="${st.holder}"]`);
    const cell = g.layout.cells.find((c) => c.playerId === st.holder);
    const rot = Number(/rotate\((\d+)deg\)/.exec(el.style.transform)?.[1] ?? 0);
    const blocks = [
      ["number", text(tile.querySelector(".tile__life"))],
      ...[...tile.querySelectorAll(".tile__sign")].map((s) => [s.textContent, text(s)]),
      ["⋯", box(tile.querySelector(".tile__more"))],
      ...[...tile.querySelectorAll(".tile__pill")].map((p) => ["timer", box(p)]),
      ...[".center__hex", ".center__clock"].map((q) => document.querySelector(q)).filter(Boolean).map((e) => [e.className, box(e)]),
      ...[...document.querySelectorAll(".sticker")].filter((s) => s !== el).map((s) => [s.dataset.sticker, box(s)]),
    ];
    return { holder: st.holder, me: box(el), rot, cellRot: cell.rotation, blocks };
  }, id);
  const bad = [];
  if (!boxIn(polys[r.holder], r.me)) bad.push(`outside ${r.holder}'s cell`);
  if (r.rot !== r.cellRot) bad.push(`faces ${r.rot}, cell ${r.cellRot}`);
  for (const [name, b] of r.blocks) if (ov(r.me, b)) bad.push(`on ${name}`);
  return { holder: r.holder, bad };
};
const STICKER_NAMES = { monarch: "Monarch", initiative: "Initiative", blessing: "City's Blessing", ring: "The Ring" };
async function addStickerFromMenu(id) {
  await page.locator(".center__hex").tap();
  await page.getByRole("button", { name: "👑 Stickers…" }).tap();
  await page.getByRole("button", { name: `Add ${STICKER_NAMES[id]}` }).tap();
  await settle();
}
async function stickerCheck(label) {
  const ids = Object.keys(STICKER_NAMES);
  await page.evaluate((ids) => { const st = window.__store.getState(); ids.forEach((id) => st.giveSticker(id, null)); }, ids);
  const seats = (await state()).game.players.map((p) => p.id);
  for (const mode of ["drag", "corner"]) {
    await page.evaluate((mode) => window.__store.getState().updateSettings({ turnTimerEnabled: true, turnTimerPlacement: mode }), mode);
    for (const id of seats) {
      await page.evaluate((id) => window.__store.getState().setActivePlayer(id), id);
      await settle();
      const polys = await sheetRect();
      const pill = await page.evaluate(() => { const q = document.querySelector(".tile__pill")?.getBoundingClientRect(); return q && { x: q.left, y: q.top, w: q.width, h: q.height }; });
      check(!!pill && boxIn(polys[id], pill), `${label} ${mode}: ${id}'s timer inside its cell`);
    }
  }
  for (let i = 0; i < Math.min(ids.length, seats.length); i++) {
    await page.evaluate((id) => window.__store.getState().setActivePlayer(id), seats[i]);
    await settle();
    await addStickerFromMenu(ids[i]);
    const r = await stickerProblems(ids[i]);
    check(r.holder === seats[i] && r.bad.length === 0, `${label} ${ids[i]} added for ${seats[i]}: held by ${r.holder}, ${r.bad.join(", ") || "inside its cell, clear"}`);
  }
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${label}-stickers.png` });
  // All four, once every one is on the board: still clear of each other.
  const all = [];
  for (const id of ids.slice(0, seats.length)) all.push(...(await stickerProblems(id)).bad.filter((b) => ids.some((q) => b === `on ${q}`)));
  check(all.length === 0, `${label} stickers clear of each other${all.length ? ": " + all.join(", ") : ""}`);
}
await stickerCheck("03x");
// Control: the store's own start spot (the cell's grid stand-in, what every
// sticker used before) lands one on its seat's number or outside its cell.
{
  const ids = Object.keys(STICKER_NAMES);
  await page.evaluate((ids) => { const st = window.__store.getState(); ids.forEach((id) => st.giveSticker(id, null)); ids.forEach((id, i) => st.giveSticker(id, `p${i}`)); }, ids);
  await settle();
  const caught = [];
  for (const id of ids) { const r = await stickerProblems(id); if (r.bad.length) caught.push(`${id}: ${r.bad.join("/")}`); }
  check(caught.length > 0, `03x control: stand-in start spots are caught (${caught.join("; ") || "none"})`);
}
// Dragged onto the part of a cell its stand-in misses (the X's top cell runs
// down to the hub, its face is up top), a sticker changes hands and faces
// its new holder. Old seatAt: no tile there, so it stayed put with p1.
{
  const r = await page.evaluate(() => {
    const st = window.__store.getState();
    st.giveSticker("monarch", "p1");
    st.placeSticker("monarch", { x: 0.5, y: 0.4, scale: 1 });
    const g = window.__store.getState().game;
    const p0 = g.layout.placements.find((p) => p.playerId === "p0");
    const inStandIn = 0.5 * g.layout.cols >= p0.col - 1 && 0.5 * g.layout.cols < p0.col - 1 + p0.colSpan && 0.4 * g.layout.rows >= p0.row - 1 && 0.4 * g.layout.rows < p0.row - 1 + p0.rowSpan;
    return { holder: g.stickers.find((s) => s.id === "monarch").holder, inStandIn };
  });
  await settle();
  const rot = await page.evaluate(() => Number(/rotate\((\d+)deg\)/.exec(document.querySelector('.sticker[data-sticker="monarch"]').style.transform)?.[1] ?? 0));
  const want = (await state()).game.layout.cells.find((c) => c.playerId === "p0").rotation;
  check(!r.inStandIn && r.holder === "p0" && rot === want, `03x sticker dropped by the hub in p0's cell (outside its stand-in: ${!r.inStandIn}) is p0's (${r.holder}) and faces ${rot} (cell ${want})`);
  await page.evaluate(() => { const st = window.__store.getState(); for (const id of ["monarch", "initiative", "blessing", "ring"]) st.giveSticker(id, null); });
}

// ---- Customize opens on the X's nearest grid, and says so ----
// The painter's squares are coloured by seat: read them back as seat
// numbers via the palette swatches' colours.
async function painterGrid() {
  return page.evaluate(() => {
    const sw = [...document.querySelectorAll(".palette__swatch:not(.palette__erase)")].slice(0, 6).map((b) => getComputedStyle(b).backgroundColor);
    const g = document.querySelector(".editor__grid");
    const cols = getComputedStyle(g).gridTemplateColumns.split(" ").length;
    const cells = [...g.querySelectorAll(".editor__cell")].map((c) => sw.indexOf(getComputedStyle(c).backgroundColor));
    const rows = [];
    for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols).join(""));
    return { rows: rows.join("/"), note: document.querySelector(".editor__note")?.textContent ?? null };
  });
}
await page.locator(".center__hex").tap();
await page.getByRole("button", { name: "▦ Layout" }).tap();
await page.getByRole("button", { name: "Customize" }).tap();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/03x-customize.png` });
let pg = await painterGrid();
check(pg.rows === "00/31/31/22", `Customize opens on the X's nearest grid, top / left+right / bottom (${pg.rows})`);
check(!!pg.note && /nearest grid/.test(pg.note), `and says it is the nearest grid (${pg.note})`);
await page.getByRole("button", { name: "close" }).tap();

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
await stickerCheck("05five");

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
// A grid layout: Customize opens on it as it is, with no note.
await page.evaluate(() => window.__store.getState().newGame({ playerCount: 4, startingLife: 40 }));
if (await page.locator(".overlay").count()) await page.getByRole("button", { name: "close" }).tap();
await page.locator(".center__hex").tap();
await page.getByRole("button", { name: "▦ Layout" }).tap();
await page.getByRole("button", { name: "Customize" }).tap();
pg = await painterGrid();
const want = await page.evaluate(() => {
  const l = window.__store.getState().game.layout;
  const g = Array.from({ length: l.rows }, () => Array(l.cols).fill(-1));
  for (const p of l.placements) for (let r = p.row - 1; r < p.row - 1 + p.rowSpan; r++) for (let c = p.col - 1; c < p.col - 1 + p.colSpan; c++) g[r][c] = Number(p.playerId.slice(1));
  return g.map((r) => r.join("")).join("/");
});
check(pg.rows === want && pg.note === null, `Customize on a grid layout opens on it, no note (${pg.rows} vs ${want}, note ${pg.note})`);
await page.getByRole("button", { name: "close" }).tap();
// ---- a layout change re-places only the stickers it left somewhere bad ----
// A template, Edit layout, a turned seat or a seat added / removed keeps
// each sticker's board spot (or moves it by its seat's grid stand-in), so on
// polygon cells one can end up outside its holder's cell or on its number.
// Two frames after each change (before the re-place runs) every sticker is
// classified as stickerProblems does, in the page; once settled, every one
// must be clear, and every one that was already clear must not have moved.
await page.evaluate(() => {
  window.__stickerBad = () => {
    const g = window.__store.getState().game;
    const box = (el) => { const q = el.getBoundingClientRect(); return { x: q.left, y: q.top, w: q.width, h: q.height }; };
    const text = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); return box(rg); };
    const ov = (a, b) => a.x < b.x + b.w - 0.5 && a.x + a.w > b.x + 0.5 && a.y < b.y + b.h - 0.5 && a.y + a.h > b.y + 0.5;
    const inPoly = (poly, x, y) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    const out = {};
    for (const st of g.stickers) {
      const el = document.querySelector(`.sticker[data-sticker="${st.id}"]`);
      const tile = document.querySelector(`.tile[data-pid="${st.holder}"]`);
      const me = box(el);
      const bad = [];
      const r = tile.getBoundingClientRect();
      const m = /polygon\((.*)\)/.exec(tile.style.clipPath);
      const poly = m ? m[1].split(",").map((p) => { const [x, y] = p.trim().split(/\s+/).map(parseFloat); return [r.left + x, r.top + y]; }) : [];
      if (![[me.x, me.y], [me.x + me.w, me.y], [me.x, me.y + me.h], [me.x + me.w, me.y + me.h]].every(([x, y]) => inPoly(poly, x, y)))
        bad.push(`outside ${st.holder}'s cell`);
      const blocks = [
        ["number", text(tile.querySelector(".tile__life"))],
        ...[...tile.querySelectorAll(".tile__sign")].map((q) => [q.textContent, text(q)]),
        ["⋯", box(tile.querySelector(".tile__more"))],
        ...[...tile.querySelectorAll(".tile__pill")].map((p) => ["timer", box(p)]),
        ...[".center__hex", ".center__clock"].map((q) => document.querySelector(q)).filter(Boolean).map((e) => [e.className, box(e)]),
        ...[...document.querySelectorAll(".sticker")].filter((q) => q !== el).map((q) => [q.dataset.sticker, box(q)]),
      ];
      for (const [name, b] of blocks) if (ov(me, b)) bad.push(`on ${name}`);
      out[st.id] = { holder: st.holder, x: st.x, y: st.y, bad };
    }
    return out;
  };
  window.__store.subscribe((s, prev) => {
    if (s.game.layout === prev.game.layout) return;
    requestAnimationFrame(() => requestAnimationFrame(() => { window.__preRefit = window.__stickerBad(); }));
  });
});
const layoutSrc = new URL("src/", BASE).pathname;
async function refitCase(label, change) {
  await page.evaluate(() => { window.__preRefit = null; });
  await change();
  await page.waitForFunction(() => window.__preRefit);
  await page.waitForTimeout(600);
  const pre = await page.evaluate(() => window.__preRefit);
  const post = await page.evaluate(() => window.__stickerBad());
  const badBefore = Object.entries(pre).filter(([, v]) => v.bad.length);
  const stillBad = Object.entries(post).filter(([, v]) => v.bad.length);
  const moved = Object.entries(pre).filter(([id, v]) => !v.bad.length && (post[id].x !== v.x || post[id].y !== v.y));
  const list = (es) => es.map(([id, v]) => `${id} ${v.bad.join("/")}`).join("; ");
  check(stillBad.length === 0, `${label}: every sticker inside its cell and clear after the re-place (left badly: ${list(badBefore) || "none"})${stillBad.length ? " -- still: " + list(stillBad) : ""}`);
  check(moved.length === 0, `${label}: the ${Object.keys(pre).length - badBefore.length} already clear stayed exactly put${moved.length ? " -- moved: " + moved.map(([id]) => id).join(", ") : ""}`);
  await page.screenshot({ path: `${OUT}/${label}.png` });
  return badBefore.length;
}
{
  // An X with a sticker per seat from the menu.
  await page.evaluate(async (src) => {
    const { BUILTIN_TEMPLATES, buildFreeLayout, templateSeats } = await import(`${src}layout/freeform.ts`);
    const st = window.__store.getState();
    st.newGame({ playerCount: 4, startingLife: 40 });
    st.updateSettings({ turnTimerEnabled: true, turnTimerPlacement: "drag" });
    st.applyFreeform(buildFreeLayout(templateSeats(BUILTIN_TEMPLATES.find((t) => t.id === "x"))), ["p0", "p1", "p2", "p3"]);
  }, layoutSrc);
  if (await page.locator(".overlay").count()) await page.getByRole("button", { name: "close" }).tap();
  await page.waitForTimeout(400);
  const ids = Object.keys(STICKER_NAMES);
  for (let i = 0; i < 4; i++) {
    await page.evaluate((id) => window.__store.getState().setActivePlayer(id), `p${i}`);
    await settle();
    await addStickerFromMenu(ids[i]);
  }
  await page.evaluate(() => window.__store.getState().setActivePlayer("p1"));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/08-refit-start.png` });
  let left = 0;
  const tpl = (id) => () => page.evaluate(async ([src, id]) => {
    const { BUILTIN_TEMPLATES, buildFreeLayout, templateSeats } = await import(`${src}layout/freeform.ts`);
    window.__store.getState().applyFreeform(buildFreeLayout(templateSeats(BUILTIN_TEMPLATES.find((t) => t.id === id))), ["p0", "p1", "p2", "p3"]);
  }, [layoutSrc, id]);
  left += await refitCase("08-refit-template-grid", tpl("grid"));
  left += await refitCase("08-refit-template-x", tpl("x"));
  left += await refitCase("08-refit-turn-p1", () => page.evaluate(() => {
    const st = window.__store.getState();
    const c = st.game.layout.cells.find((q) => q.playerId === "p1");
    st.setSeatRotation("p1", (c.rotation + 180) % 360);
  }));
  left += await refitCase("08-refit-edit-add", async () => {
    await openEditor();
    await page.locator(".fe-fab").tap();
    await page.getByRole("button", { name: "confirm layout" }).tap();
  });
  left += await refitCase("08-refit-edit-remove", async () => {
    await openEditor();
    await page.locator(".fe-badge--del").nth(1).tap();
    await page.getByRole("button", { name: "confirm layout" }).tap();
  });
  check(left > 0, `refit cases left ${left} stickers badly placed before the re-place (0 would prove nothing)`);
  // Control: a sticker dragged onto a number with no layout change is the
  // user's choice -- left there, and the classifier above calls it bad.
  const ctl = await page.evaluate(() => {
    const st = window.__store.getState();
    const s0 = st.game.stickers[0];
    const tile = document.querySelector(`.tile[data-pid="${s0.holder}"]`);
    const b = document.querySelector(".board").getBoundingClientRect();
    const rg = document.createRange();
    rg.selectNodeContents(tile.querySelector(".tile__life"));
    const q = rg.getBoundingClientRect();
    st.placeSticker(s0.id, { x: (q.left + q.width / 2 - b.left) / b.width, y: (q.top + q.height / 2 - b.top) / b.height, scale: 1 });
    const now = window.__store.getState().game.stickers.find((s) => s.id === s0.id);
    return { id: s0.id, x: now.x, y: now.y };
  });
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => window.__stickerBad());
  const c = after[ctl.id];
  check(c.x === ctl.x && c.y === ctl.y && c.bad.includes("on number"), `refit control: ${ctl.id} dragged onto its number with no layout change stays (${c.x === ctl.x && c.y === ctl.y}) and is caught (${c.bad.join("/") || "nothing"})`);
}
check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);

await b.close();
console.log(fails ? `\n${fails} FAILED` : "\nall ok");
process.exit(fails ? 1 : 0);
