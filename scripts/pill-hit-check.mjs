// Is the turn pill actually tappable? For every layout, seat, placement mode
// and with stickers/counters on the tile, hit-test points across the pill and
// report any that land on something else. DEV-only (window.__store).
//
// Then corner mode, with real taps: on the active seat's + / − glyph centre
// (it must change life by one and leave the turn alone) and on the disc's
// readout (it must pass the turn), presets 2-6 and a custom layout, timer at
// 1x and 3x -- a big disc slides a glyph well clear of its usual tap zone.
// Controls: with the zone put back to its usual width, the slid glyph's tap
// is caught missing; with the disc made untappable, the pass is caught.
//
// And the zones a slid glyph grows (timer 1x-3x) stay off the life number's
// ink: points across the number's ink box are hit-tested, and any that lands
// on a grown zone, or on a glyph's own hit box away from that glyph's ink +
// 5px, is a FAIL. (A zone at its usual 32% is only counted: on a wide tile it
// has always reached the number's outer edge.) Control: the + zone put back to
// its old uncapped width is caught on the number.
// Usage: node scripts/pill-hit-check.mjs [baseUrl]
import { chromium } from "@playwright/test";
const BASE = process.argv[2] || "http://localhost:5180/";
const b = await chromium.launch({ args: ["--mute-audio"] });
const page = await (await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__store);
let bad = 0, total = 0;
for (const mode of ["drag", "corner"])
  for (const extras of ["none", "sticker", "sticker+counters"])
    for (const count of [2, 3, 4, 5, 6])
      for (let seat = 0; seat < count; seat++) {
        const r = await page.evaluate(([mode, extras, count, seat]) => {
          const s = window.__store.getState();
          s.newGame({ playerCount: count, startingLife: 40 });
          s.updateSettings({ turnTimerEnabled: true, turnTimerPlacement: mode, turnTimerScale: 1 });
          const st = window.__store.getState();
          st.setActivePlayer(`p${seat}`);
          if (extras !== "none") { st.giveSticker("monarch", `p${seat}`); st.giveSticker("initiative", `p${seat}`); }
          if (extras === "sticker+counters") { st.adjustCounter(`p${seat}`, "poison", 2); st.bumpTax(`p${seat}`, 1); st.adjustCounter(`p${seat}`, "energy", 3); }
          return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
            const pill = document.querySelector(".tile__pill");
            if (!pill) return res({ missing: true });
            // A corner timer is a quarter/half disc: its box's far corner is
            // empty by design. Probe the face the player actually taps.
            const faceEls = pill.classList.contains("tile__pill--corner")
              ? [...pill.querySelectorAll(".tile__pill-turn, .tile__pill-time")]
              : [pill];
            const rs = faceEls.map((e) => e.getBoundingClientRect());
            const b = { left: Math.min(...rs.map((q) => q.left)), top: Math.min(...rs.map((q) => q.top)),
              width: Math.max(...rs.map((q) => q.right)) - Math.min(...rs.map((q) => q.left)),
              height: Math.max(...rs.map((q) => q.bottom)) - Math.min(...rs.map((q) => q.top)) };
            const blockers = new Set();
            let miss = 0, n = 0;
            for (const fx of [0.15, 0.5, 0.85]) for (const fy of [0.15, 0.5, 0.85]) {
              n++;
              const el = document.elementFromPoint(b.left + b.width * fx, b.top + b.height * fy);
              if (!el || !pill.contains(el)) { miss++; blockers.add(el ? el.className || el.tagName : "nothing"); }
            }
            res({ miss, n, blockers: [...blockers] });
          })));
        }, [mode, extras, count, seat]);
        total++;
        if (r.missing || r.miss) { bad++; console.log(`${mode} ${extras} ${count}p seat ${seat}: ${r.missing ? "NO PILL" : `${r.miss}/${r.n} points blocked by ${r.blockers.join(", ")}`}`); }
      }
console.log(`\n${bad} of ${total} cases have a blocked pill`);

// ---- corner mode: real taps on the glyphs and the disc ----
const custom = {
  id: "hit-custom", name: "Hit", playerCount: 3, rows: 2, cols: 2, builtIn: false,
  placements: [
    { playerId: "p0", row: 1, col: 1, rowSpan: 1, colSpan: 2, rotation: 180 },
    { playerId: "p1", row: 2, col: 1, rowSpan: 1, colSpan: 1, rotation: 90 },
    { playerId: "p2", row: 2, col: 2, rowSpan: 1, colSpan: 1, rotation: 270 },
  ],
};
await page.evaluate(() => document.fonts.ready);
const cornerSetup = (name, seat, scale) =>
  page.evaluate(([name, seat, scale, custom]) => {
    const n = name === "custom" ? 3 : Number(name);
    const s = window.__store.getState();
    s.newGame({ playerCount: n, startingLife: 40 });
    if (name === "custom") window.__store.getState().applyLayout(custom);
    const st = window.__store.getState();
    st.updateSettings({ turnTimerEnabled: true, turnTimerPlacement: "corner", turnTimerScale: scale });
    st.setActivePlayer(`p${seat}`);
    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
      const tile = document.querySelector(`.tile[data-pid="p${seat}"]`);
      const centre = (q) => ({ x: (q.left + q.right) / 2, y: (q.top + q.bottom) / 2 });
      const signs = [...tile.querySelectorAll(".tile__sign")].map((g) => {
        const rg = document.createRange();
        rg.selectNodeContents(g);
        return { sign: g.textContent === "+" ? "+" : "−", slid: !!g.style.translate, ...centre(rg.getBoundingClientRect()) };
      });
      const face = [...document.querySelectorAll(".tile__pill .tile__pill-turn, .tile__pill .tile__pill-time")].map((e) => e.getBoundingClientRect());
      const disc = face.length
        ? centre({ left: Math.min(...face.map((q) => q.left)), right: Math.max(...face.map((q) => q.right)),
            top: Math.min(...face.map((q) => q.top)), bottom: Math.max(...face.map((q) => q.bottom)) })
        : null;
      res({ signs, disc });
    }, 150))));
  }, [name, seat, scale, custom]);
const seatState = (seat) => page.evaluate((seat) => {
  const g = window.__store.getState().game;
  return { life: g.players.find((p) => p.id === `p${seat}`).life, active: g.turn.activePlayerId };
}, seat);
// One tap, then what it did: "+1" / "−1" / "pass" / "nothing" (or a mix).
async function tapAt(seat, x, y) {
  const before = await seatState(seat);
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(60);
  const after = await seatState(seat);
  const d = after.life - before.life;
  const did = [d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "", after.active !== before.active ? "pass" : ""].filter(Boolean).join("+");
  return did || "nothing";
}
let tapBad = 0, tapTotal = 0, slidCount = 0;
for (const scale of [1, 3])
  for (const name of ["2", "3", "4", "5", "6", "custom"]) {
    const n = name === "custom" ? 3 : Number(name);
    for (let seat = 0; seat < n; seat++) {
      const where = `corner ${scale}x ${name}${name === "custom" ? "" : "p"} seat ${seat}`;
      const { signs } = await cornerSetup(name, seat, scale);
      for (const g of signs) {
        await cornerSetup(name, seat, scale);
        const did = await tapAt(seat, g.x, g.y);
        tapTotal++;
        if (g.slid) slidCount++;
        if (did !== `${g.sign}1`) { tapBad++; console.log(`${where}: tap on ${g.slid ? "slid " : ""}${g.sign} glyph did ${did}`); }
      }
      const { disc } = await cornerSetup(name, seat, scale);
      tapTotal++;
      const did = disc ? await tapAt(seat, disc.x, disc.y) : "no disc";
      if (did !== "pass") { tapBad++; console.log(`${where}: tap on the disc did ${did}`); }
    }
  }
console.log(`${tapBad} of ${tapTotal} corner-mode taps went wrong (${slidCount} on slid glyphs)`);

// Controls, 4p seat 0 at 3x (its + slides out of the usual zone): the zone
// at its usual width must lose the glyph's tap; a disc that takes no taps
// must lose the pass. Either reading as fine means the taps above prove nothing.
{
  const { signs, disc } = await cornerSetup("4", 0, 3);
  const plus = signs.find((g) => g.sign === "+");
  await page.evaluate(() => {
    const btn = document.querySelector('.tile[data-pid="p0"] .tile__adj--plus');
    btn.style.width = "";
    btn.querySelector(".tile__sign-hit")?.style.setProperty("pointer-events", "none");
  });
  const z = await tapAt(0, plus.x, plus.y);
  const zoneCaught = plus.slid && z !== "+1";
  console.log(`${zoneCaught ? "ok  " : "FAIL"} control: + zone at its usual width -> slid glyph tap did ${z} (caught: ${zoneCaught})`);
  await cornerSetup("4", 0, 3);
  await page.evaluate(() => { document.querySelector(".tile__pill").style.pointerEvents = "none"; });
  const d = await tapAt(0, disc.x, disc.y);
  const discCaught = d !== "pass";
  console.log(`${discCaught ? "ok  " : "FAIL"} control: untappable disc -> tap did ${d} (caught: ${discCaught})`);
  if (!zoneCaught || !discCaught) tapBad++;
}
// ---- corner mode: grown zones stay off the number's ink ----
// Hit-test a 13 x 13 grid over the active seat's number ink (the text box
// trimmed to the ink by the font's metrics, per turn of the tile). A point
// that lands in a grown zone (an inline width: signShifts sized it) is on
// the number; one on a .tile__sign-hit must be within its glyph's ink + 5px.
const zoneInk = (seat, sabotage) =>
  page.evaluate(([seat, sabotage]) => {
    const tile = document.querySelector(`.tile[data-pid="p${seat}"]`);
    const content = tile.querySelector(".tile__content");
    const rot = Number(/rotate\((\d+)deg\)/.exec(content.style.transform)?.[1] ?? 0);
    if (sabotage) {
      // The old cap: as far as the other zone's usual edge, whatever is there.
      const btn = tile.querySelector(".tile__adj--plus");
      btn.style.width = `${0.68 * content.offsetWidth}px`;
      btn.querySelector(".tile__sign-hit")?.style.setProperty("pointer-events", "none");
    }
    const ctx = document.createElement("canvas").getContext("2d");
    const ink = (el) => {
      const rg = document.createRange();
      rg.selectNodeContents(el);
      const q = rg.getBoundingClientRect();
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = ctx.measureText(el.textContent);
      const l = -m.actualBoundingBoxLeft, r = m.width - m.actualBoundingBoxRight;
      const t = m.fontBoundingBoxAscent - m.actualBoundingBoxAscent, bt = m.fontBoundingBoxDescent - m.actualBoundingBoxDescent;
      let x0 = q.left, y0 = q.top, x1 = q.right, y1 = q.bottom;
      if (rot === 0) { x0 += l; x1 -= r; y0 += t; y1 -= bt; }
      else if (rot === 90) { y0 += l; y1 -= r; x1 -= t; x0 += bt; }
      else if (rot === 180) { x1 -= l; x0 += r; y1 -= t; y0 += bt; }
      else { y1 -= l; y0 += r; x0 += t; x1 -= bt; }
      return { x0, y0, x1, y1 };
    };
    const num = ink(tile.querySelector(".tile__life"));
    const glyphs = [...tile.querySelectorAll(".tile__adj")].map((btn) => ({ btn, ink: ink(btn.querySelector(".tile__sign")) }));
    let onZone = 0, onHit = 0, usual = 0, n = 0;
    const N = 13;
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const x = num.x0 + ((num.x1 - num.x0) * (i + 0.5)) / N;
        const y = num.y0 + ((num.y1 - num.y0) * (j + 0.5)) / N;
        n++;
        const el = document.elementFromPoint(x, y);
        const btn = el?.closest(".tile__adj");
        if (!btn || !tile.contains(btn)) continue;
        if (el.classList.contains("tile__sign-hit")) {
          const g = glyphs.find((q) => q.btn === btn).ink;
          if (x < g.x0 - 5 || x > g.x1 + 5 || y < g.y0 - 5 || y > g.y1 + 5) onHit++;
        } else if (btn.style.width) onZone++;
        else usual++;
      }
    const hits = tile.querySelectorAll(".tile__sign-hit").length;
    const grown = glyphs.filter((q) => q.btn.style.width).length;
    return { onZone, onHit, usual, n, hits, grown };
  }, [seat, sabotage]);
let inkBad = 0, inkCases = 0, grownSeen = 0, hitSeen = 0, usualSeen = 0;
for (const scale of [1, 2, 3])
  for (const name of ["2", "3", "4", "5", "6", "custom"]) {
    const n = name === "custom" ? 3 : Number(name);
    for (let seat = 0; seat < n; seat++) {
      await cornerSetup(name, seat, scale);
      const r = await zoneInk(seat, false);
      inkCases++;
      grownSeen += r.grown;
      hitSeen += r.hits;
      if (r.usual) usualSeen++;
      if (r.onZone || r.onHit) {
        inkBad++;
        console.log(`corner ${scale}x ${name}${name === "custom" ? "" : "p"} seat ${seat}: ${r.onZone} of ${r.n} number-ink points on a grown zone, ${r.onHit} on a glyph hit box away from its glyph`);
      }
    }
  }
console.log(`${inkBad} of ${inkCases} corner-mode seats have a grown zone on the number (${grownSeen} grown zones, ${hitSeen} glyph hit boxes; ${usualSeen} seats where a usual-width 32% zone reaches the number's edge, unchanged)`);
{
  await cornerSetup("5", 0, 3);
  const r = await zoneInk(0, true);
  const caught = r.onZone > 0;
  console.log(`${caught ? "ok  " : "FAIL"} control: 5p seat 0 at 3x, + zone at the old uncapped width -> ${r.onZone} number-ink points on it (caught: ${caught})`);
  if (!caught) inkBad++;
}
if (bad || tapBad || inkBad) process.exitCode = 1;
await b.close();
