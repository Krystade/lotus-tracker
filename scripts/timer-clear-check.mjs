// The auto-placed turn timer on grid tiles stays clear of the tile's own
// controls: life number, + / − glyphs, ⋯, seat handle ✥, counter row, and
// the hub hexagon + game clock. Presets 2–6 and a custom layout, every seat
// active in turn, drag and corner modes; the timer must still take a tap.
// A user-dragged position still wins. In corner mode the disc also stays
// clear of the + / − glyphs' ink (each slides along its tile away from the
// disc), and a slid glyph stays off the number. Run twice: with the Baloo 2 face, and
// with it blocked -- the fallback face (first paint, a font that failed to
// load) is taller and is where the old fixed spot sat on the number.
// DEV-only (drives window.__store).
// Usage: node scripts/timer-clear-check.mjs [baseUrl] [shotDir]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:5180/";
const OUT = process.argv[3] || "screenshots/chromium/timer-clear";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ["--mute-audio"] });
let page;
async function open(blockFont) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  if (blockFont) await ctx.route(/\.(woff2?|ttf)(\?.*)?$/, (r) => r.abort());
  page = await ctx.newPage();
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__store);
  await page.evaluate(() => document.fonts.ready);
  const face = await page.evaluate(() => document.fonts.check('800 40px "Baloo 2"') && [...document.fonts].some((f) => f.family.includes("Baloo") && f.status === "loaded"));
  check(face === !blockFont, `${blockFont ? "fallback" : "Baloo 2"} face in use (Baloo loaded: ${face})`);
}

let fails = 0;
const check = (ok, msg) => {
  if (!ok) fails++;
  if (!ok || process.env.VERBOSE) console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  return ok;
};

const custom = {
  id: "clear-custom", name: "Clear", playerCount: 3, rows: 2, cols: 2, builtIn: false,
  placements: [
    { playerId: "p0", row: 1, col: 1, rowSpan: 1, colSpan: 2, rotation: 180 },
    { playerId: "p1", row: 2, col: 1, rowSpan: 1, colSpan: 1, rotation: 90 },
    { playerId: "p2", row: 2, col: 2, rowSpan: 1, colSpan: 1, rotation: 270 },
  ],
};

const setup = (name, mode, seat, pos) =>
  page.evaluate(
    ([name, mode, seat, pos, custom]) => {
      const n = name === "custom" ? 3 : Number(name);
      const s = window.__store.getState();
      s.newGame({ playerCount: n, startingLife: 40 });
      if (name === "custom") window.__store.getState().applyLayout(custom);
      const st = window.__store.getState();
      st.updateSettings({ turnTimerEnabled: true, turnTimerPlacement: mode, turnTimerScale: 1 });
      st.setActivePlayer(`p${seat}`);
      if (pos) st.setTimerPos(`p${seat}`, pos);
      return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(res, 150))));
    },
    [name, mode, seat, pos, custom],
  );

// Screen rects. The pill's box in drag mode; in corner mode its disc (centre
// + radius) as well, since a quarter disc's far box corner is empty.
const measure = (seat) =>
  page.evaluate((seat) => {
    const r = (el) => {
      if (!el) return null;
      const q = el.getBoundingClientRect();
      return q.width > 0 && q.height > 0 ? { x0: q.left, y0: q.top, x1: q.right, y1: q.bottom } : null;
    };
    const tile = document.querySelector(`.tile[data-pid="p${seat}"]`);
    const pill = document.querySelector(".tile__pill");
    // A text element's ink, not its line box: trim the font's ascent and
    // descent padding along the text's own vertical, whichever screen axis
    // that is (the content box is turned 0/90/180/270).
    const rot = Number(/rotate\((\d+)deg\)/.exec(tile.querySelector(".tile__content").style.transform)?.[1] ?? 0);
    const ctx = document.createElement("canvas").getContext("2d");
    const ink = (el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const q = range.getBoundingClientRect();
      if (!(q.width > 0)) return null;
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const tm = ctx.measureText(el.textContent);
      const top = tm.fontBoundingBoxAscent - tm.actualBoundingBoxAscent;
      const bot = tm.fontBoundingBoxDescent - tm.actualBoundingBoxDescent;
      const b = { x0: q.left, y0: q.top, x1: q.right, y1: q.bottom };
      if (rot === 0) { b.y0 += top; b.y1 -= bot; }
      else if (rot === 180) { b.y1 -= top; b.y0 += bot; }
      else if (rot === 90) { b.x1 -= top; b.x0 += bot; }
      else { b.x0 += top; b.x1 -= bot; }
      return b;
    };
    const blocks = {
      number: ink(tile.querySelector(".tile__life")),
      signs: [...tile.querySelectorAll(".tile__sign")].map(ink),
      more: r(tile.querySelector(".tile__more")),
      seat: r(tile.querySelector(".tile__seat")),
      counters: [...tile.querySelectorAll(".tcount")].map(r),
      hex: r(document.querySelector(".center__hex")),
      clock: r(document.querySelector(".center__clock")),
    };
    // A tap on each glyph's ink still lands in its own + / − zone (a slid
    // glyph moves; its zone does not).
    const signTaps = [...tile.querySelectorAll(".tile__sign")].map((g) => {
      const q = ink(g);
      const hit = q && document.elementFromPoint((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2);
      return !!hit && hit.closest(".tile__adj") === g.parentElement;
    });
    const faceEls = pill ? [...pill.querySelectorAll(".tile__pill-turn, .tile__pill-time")].map((e) => e.getBoundingClientRect()) : [];
    const face = faceEls.length
      ? {
          x0: Math.min(...faceEls.map((q) => q.left)), y0: Math.min(...faceEls.map((q) => q.top)),
          x1: Math.max(...faceEls.map((q) => q.right)), y1: Math.max(...faceEls.map((q) => q.bottom)),
        }
      : null;
    const kind = pill?.classList.contains("tile__pill--quarter") ? "quarter" : pill?.classList.contains("tile__pill--half") ? "half" : "pill";
    return { pill: r(pill), face, kind, tile: r(tile), blocks, signTaps, pillInTile: !!pill && tile.contains(pill) };
  }, seat);

const overlap = (a, c) => !!a && !!c && a.x0 < c.x1 && c.x0 < a.x1 && a.y0 < c.y1 && c.y0 < a.y1;
// Disc (centre c, radius rad) against a rect.
const discHits = (c, rad, q) => {
  const dx = Math.max(q.x0 - c.x, 0, c.x - q.x1);
  const dy = Math.max(q.y0 - c.y, 0, c.y - q.y1);
  return Math.hypot(dx, dy) < rad;
};
// The corner timer's disc, from which of its box edges are flush with the tile.
function disc(m) {
  const p = m.pill, t = m.tile;
  const fl = { l: Math.abs(p.x0 - t.x0) < 1.5, r: Math.abs(p.x1 - t.x1) < 1.5, t: Math.abs(p.y0 - t.y0) < 1.5, b: Math.abs(p.y1 - t.y1) < 1.5 };
  const w = p.x1 - p.x0, h = p.y1 - p.y0;
  if (m.kind === "quarter") return { c: { x: fl.l ? p.x0 : p.x1, y: fl.t ? p.y0 : p.y1 }, rad: Math.max(w, h) };
  // Half disc: centre on the middle of its flush edge.
  if (w >= h) return { c: { x: (p.x0 + p.x1) / 2, y: fl.t ? p.y0 : p.y1 }, rad: w / 2 };
  return { c: { x: fl.l ? p.x0 : p.x1, y: (p.y0 + p.y1) / 2 }, rad: h / 2 };
}
const GAP = 3;
function hits(m) {
  const out = [];
  const list = [];
  for (const [k, v] of Object.entries(m.blocks)) (Array.isArray(v) ? v : [v]).forEach((q) => q && list.push([k, q]));
  for (const [k, q0] of list) {
    // Touching is not clear: the number's ink needs a few px of air (its
    // text-shadow alone spreads further), everything else must not overlap.
    const g = k === "number" ? GAP : 0;
    const q = { x0: q0.x0 - g, y0: q0.y0 - g, x1: q0.x1 + g, y1: q0.y1 + g };
    let hit;
    if (m.kind === "pill") hit = overlap(m.pill, q);
    // A corner disc wraps the hexagon and clock by design (its hole); there
    // the readout itself must stay clear of them. The + / − glyphs are held
    // to the disc itself: the glyph slides out from under the rim.
    else if (k === "hex" || k === "clock") hit = overlap(m.face, q);
    else {
      const d = disc(m);
      hit = overlap(m.pill, q) && discHits(d.c, d.rad, q);
    }
    if (hit) out.push(k);
  }
  // A glyph slid clear of the disc must not land on the number instead.
  if (m.blocks.number && m.blocks.signs.some((q) => overlap(q, m.blocks.number))) out.push("sign-on-number");
  if (!m.signTaps.every(Boolean)) out.push(`sign-off-its-zone(${m.signTaps})`);
  return out;
}

// Control: with each glyph's slide stripped, the 4p seat-0 disc covers its
// glyph (the screenshot that started this) -- so a clean corner pass below
// means the slide cleared it, not that the test cannot see it.
async function unslidControl(F) {
  await setup("4", "corner", 0);
  const slid = await page.evaluate(() => [...document.querySelectorAll('.tile[data-pid="p0"] .tile__sign')].map((g) => g.style.translate));
  check(slid.some(Boolean), `${F} control: 4p corner seat 0 has a slid glyph (${JSON.stringify(slid)})`);
  await page.evaluate(() => document.querySelectorAll('.tile[data-pid="p0"] .tile__sign').forEach((g) => { g.dataset.slid = g.style.translate; g.style.translate = ""; }));
  const m = await measure(0);
  check(hits(m).includes("signs"), `${F} control: unslid, the disc covers a glyph (${hits(m).join(",") || "nothing"} hit)`);
  await page.evaluate(() => document.querySelectorAll('.tile[data-pid="p0"] .tile__sign').forEach((g) => { g.style.translate = g.dataset.slid; delete g.dataset.slid; }));
  // And in drag mode nothing slides.
  await setup("4", "drag", 0);
  const still = await page.evaluate(() => [...document.querySelectorAll(".tile__sign")].map((g) => g.style.translate).filter(Boolean));
  check(still.length === 0, `${F} drag mode: no glyph slid (${JSON.stringify(still)})`);
}

const tapPasses = async (seat, m) => {
  const target = m.kind === "pill" ? m.pill : m.face;
  const x = (target.x0 + target.x1) / 2, y = (target.y0 + target.y1) / 2;
  const onPill = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest(".tile__pill"), [x, y]);
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(60);
  const active = await page.evaluate(() => window.__store.getState().game.turn.activePlayerId);
  return onPill && active !== `p${seat}`;
};

let n = 0;
for (const blockFont of [false, true]) {
await open(blockFont);
const F = blockFont ? "fallback" : "baloo";
// Control: a user-dragged timer on the number stays there, and the overlap
// test sees it (or a clean pass below would prove nothing).
await setup("4", "drag", 0, { x: 50, y: 50 });
{
  const m = await measure(0);
  check(hits(m).includes("number"), `control: user-dragged timer at 50/50 stays on the number (${hits(m)})`);
}
await setup("4", "drag", 0, { x: 30, y: 20 });
{
  const m = await measure(0);
  const t = m.tile;
  // p0 is rotated 90: local (30%, 20%) is screen (80% from left, 30% down).
  const cx = (m.pill.x0 + m.pill.x1) / 2, cy = (m.pill.y0 + m.pill.y1) / 2;
  const fx = (cx - t.x0) / (t.x1 - t.x0), fy = (cy - t.y0) / (t.y1 - t.y0);
  check(Math.abs(fx - 0.8) < 0.04 && Math.abs(fy - 0.3) < 0.04, `user-dragged position wins (at ${fx.toFixed(2)}, ${fy.toFixed(2)} of tile)`);
}

await unslidControl(F);

for (const name of ["2", "3", "4", "5", "6", "custom"]) {
  const count = name === "custom" ? 3 : Number(name);
  for (const mode of ["drag", "corner"])
    for (let seat = 0; seat < count; seat++) {
      await setup(name, mode, seat);
      const m = await measure(seat);
      const tag = `${F} ${name}p ${mode} seat ${seat}`;
      n++;
      if (!check(!!m.pill && m.pillInTile, `${tag}: timer shown in its tile`)) continue;
      const h = hits(m);
      if (!check(h.length === 0, `${tag}: ${m.kind} clear (${h.join(",") || "nothing"} hit)`) && process.env.SHOTFAIL)
        await page.screenshot({ path: `${OUT}/${F}-fail-${mode}-${name}p-seat${seat}.png` });
      if ((name === "4" || name === "5") && seat === 0 || mode === "corner" && ["3", "4", "custom"].includes(name)) await page.screenshot({ path: `${OUT}/${F}-${mode}-${name}p-seat${seat}.png` });
      if (name === "custom" && seat === 1 && mode === "drag") await page.screenshot({ path: `${OUT}/${F}-drag-custom-seat1.png` });
      check(await tapPasses(seat, m), `${tag}: a tap on the timer passes the turn`);
    }
}
await page.context().close();
}

await b.close();
console.log(fails ? `\n${fails} FAILED (${n} placements)` : `\nall ok (${n} placements)`);
process.exit(fails ? 1 : 0);
