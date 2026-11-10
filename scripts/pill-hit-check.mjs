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
  await page.evaluate(() => { document.querySelector('.tile[data-pid="p0"] .tile__adj--plus').style.width = ""; });
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
if (bad || tapBad) process.exitCode = 1;
await b.close();
