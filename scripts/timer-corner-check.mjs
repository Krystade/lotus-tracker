// Corner-timer placement and tile-relative sizing. DEV-only (drives
// window.__store). Usage: node scripts/timer-corner-check.mjs [baseUrl]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:5180/";
const OUT = "screenshots/chromium/timer";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ["--mute-audio"] });
let fails = 0;
const check = (ok, msg) => {
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
};

async function open(viewport) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__store);
  return page;
}

// A Customize layout: the 3p preset upside down, the big seat on top.
const CUSTOM = {
  id: "custom-3top", name: "3 top", builtIn: false, playerCount: 3, rows: 2, cols: 2,
  placements: [
    { playerId: "p0", row: 1, col: 1, rowSpan: 1, colSpan: 2, rotation: 180 },
    { playerId: "p1", row: 2, col: 1, rowSpan: 1, colSpan: 1, rotation: 90 },
    { playerId: "p2", row: 2, col: 2, rowSpan: 1, colSpan: 1, rotation: 270 },
  ],
};

const setup = (page, count, seat, settings, layout) =>
  page.evaluate(
    ([count, seat, settings, layout]) => {
      const st = window.__store.getState();
      st.newGame({ playerCount: count, startingLife: 40 });
      if (layout) st.applyLayout(layout);
      st.updateSettings({ turnTimerEnabled: true, ...settings });
      window.__store.getState().setActivePlayer(`p${seat}`);
    },
    [count, seat, settings, layout ?? null],
  );

// Screen rects of the pill, its tile, and the centre hexagon + clock.
const measure = (page) =>
  page.evaluate(async () => {
    const J = await import("/lotus-tracker/src/layout/junction.ts");
    const st = window.__store.getState();
    const junction = J.junctionFor(st.game.layout, st.game.turn.activePlayerId);
    const r = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom };
    };
    const pill = document.querySelector(".tile__pill:not(.tile__pill--preview)");
    return {
      pill: r(pill),
      face: pill ? (() => { const rs = [...pill.querySelectorAll(".tile__pill-turn, .tile__pill-time")].map((e) => e.getBoundingClientRect());
        return { x0: Math.min(...rs.map((q) => q.left)), y0: Math.min(...rs.map((q) => q.top)), x1: Math.max(...rs.map((q) => q.right)), y1: Math.max(...rs.map((q) => q.bottom)) }; })() : null,
      // The disc's centre on screen: a probe at (--cx, --cy) inside the
      // pill, through the tile's rotation. The hub: the hexagon-and-clock
      // column is centred on it.
      centre: pill?.classList.contains("tile__pill--corner") ? (() => {
        const p = document.createElement("i");
        p.style.cssText = "position:absolute;left:var(--cx);top:var(--cy);width:0;height:0";
        pill.appendChild(p);
        const q = p.getBoundingClientRect();
        p.remove();
        return { x: q.left, y: q.top };
      })() : null,
      hub: (() => { const c = document.querySelector(".center").getBoundingClientRect(); return { x: (c.left + c.right) / 2, y: (c.top + c.bottom) / 2 }; })(),
      gap: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gap")),
      junction,
      corner: pill?.classList.contains("tile__pill--quarter") ? "quarter" : pill?.classList.contains("tile__pill--half") ? "half" : null,
      tile: r(pill?.closest(".tile")),
      hex: r(document.querySelector(".center__hex")),
      clock: r(document.querySelector(".center__clock")),
      font: pill ? parseFloat(getComputedStyle(pill).fontSize) : 0,
      adj: [...(pill?.closest(".tile")?.querySelectorAll(".tile__adj") ?? [])].map(r),
    };
  });

const overlap = (a, c) => a && c && a.x0 < c.x1 && c.x0 < a.x1 && a.y0 < c.y1 && c.y0 < a.y1;
const inside = (a, t) => a.x0 >= t.x0 - 0.5 && a.y0 >= t.y0 - 0.5 && a.x1 <= t.x1 + 0.5 && a.y1 <= t.y1 + 0.5;
const dist = (a, x, y) => Math.hypot(Math.max(a.x0 - x, 0, x - a.x1), Math.max(a.y0 - y, 0, y - a.y1));

const mini = await open({ width: 375, height: 812 });

// Control: a pill dragged onto the middle must register as covering the hex,
// or the overlap checks below prove nothing.
await setup(mini, 4, 0, { turnTimerPlacement: "drag" });
await mini.evaluate(() => window.__store.getState().setTimerPos("p0", { x: 92, y: 8 }));
await mini.waitForTimeout(100);
{
  const m = await measure(mini);
  check(overlap(m.pill, m.hex) || overlap(m.pill, m.clock), "control: a pill dragged to the middle is seen covering the hex");
}
// Control: a pill dragged onto the + zone must register as covering it.
await mini.evaluate(() => window.__store.getState().setTimerPos("p0", { x: 88, y: 50 }));
await mini.waitForTimeout(100);
{
  const m = await measure(mini);
  check(m.adj.some((a) => overlap(m.pill, a)), "control: a pill dragged onto + is seen covering it");
}

const grow = (t, d) => ({ x0: t.x0 - d, y0: t.y0 - d, x1: t.x1 + d, y1: t.y1 + d });
const onBorder = (t, p, d) => inside({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }, grow(t, d)) &&
  [p.x - t.x0, t.x1 - p.x, p.y - t.y0, t.y1 - p.y].some((v) => Math.abs(v) <= d);
for (const count of [2, 3, 4, 5, 6, "custom"]) {
  const n = count === "custom" ? CUSTOM.playerCount : count;
  for (let seat = 0; seat < n; seat++) {
    await setup(mini, n, seat, { turnTimerPlacement: "corner", turnTimerScale: 1 }, count === "custom" ? CUSTOM : null);
    await mini.waitForTimeout(80);
    const m = await measure(mini);
    const tag = count === "custom" ? `custom seat ${seat}` : `${count}p seat ${seat}`;
    check(!!m.pill, `${tag}: pill shown`);
    if (!m.pill) continue;
    // The disc is centred on the point where the seats meet -- the middle
    // of the gap -- so its box reaches half a gap past the tile's edge;
    // the tile clips that. Where the tile touches the hub, that point IS
    // the hub, under the hexagon.
    const half = m.gap / 2;
    check(inside(m.pill, grow(m.tile, half)), `${tag}: pill within half a gap of its own tile`);
    check(!!m.centre && onBorder(m.tile, m.centre, half + 0.5), `${tag}: ${m.corner} centred on the tile's border (${m.centre?.x.toFixed(1)}, ${m.centre?.y.toFixed(1)})`);
    // Exactly on the intersection (junctionFor's point, in the gap's
    // middle) -- and where that is the hub, exactly on the hub.
    const j = m.junction;
    const want = { x: m.tile.x0 + j.fx * (m.tile.x1 - m.tile.x0) + j.gx * m.gap, y: m.tile.y0 + j.fy * (m.tile.y1 - m.tile.y0) + j.gy * m.gap };
    const offJ = Math.hypot(m.centre.x - want.x, m.centre.y - want.y);
    check(offJ <= 1, `${tag}: ${m.corner} centre on the intersection (${offJ.toFixed(2)}px off)`);
    const touchesHub = inside({ x0: m.hub.x, y0: m.hub.y, x1: m.hub.x, y1: m.hub.y }, grow(m.tile, half + 0.5));
    if (j.atCenter) {
      const off = Math.hypot(m.centre.x - m.hub.x, m.centre.y - m.hub.y);
      check(off <= 1, `${tag}: ${m.corner} centre on the hub (${off.toFixed(2)}px off)`);
    } else if (touchesHub) console.log(`     ${tag}: touches the hub mid-edge but its seats meet at a ${j.touching}-way corner; the quarter stays there`);
    check(inside(m.face, m.tile), `${tag}: face inside its tile`);
    check(!overlap(m.face, m.hex) && !overlap(m.face, m.clock), `${tag}: face clear of hex and clock`);
    check(m.font >= 12, `${tag}: face font ${m.font.toFixed(1)}px`);
    // Near the middle of the board: within a third of the board's short side.
    const cx = 375 / 2, cy = 812 / 2;
    if (n <= 4) check(dist(m.pill, cx, cy) < 70, `${tag}: hugs the middle (${dist(m.pill, cx, cy).toFixed(0)}px away)`);
    if (seat === 0 || (count === 3 && seat === 2) || (count === 2 && seat === 1))
      await mini.screenshot({ path: `${OUT}/corner-${count === "custom" ? "custom" : count + "p"}-seat${seat}.png` });
  }
}

// Sizing: 1x on a phone four-player tile stays near the old 15px; 3x fills
// but never spills; a tablet gets a bigger timer at the same setting.
await setup(mini, 4, 0, { turnTimerPlacement: "corner", turnTimerScale: 1 });
const phone1 = await measure(mini);
check(phone1.font > 12 && phone1.font < 19, `phone 4p @1x font ${phone1.font.toFixed(1)}px (was 15.2)`);
await setup(mini, 4, 0, { turnTimerPlacement: "drag", turnTimerScale: 3 });
await mini.evaluate(() => window.__store.getState().setTimerPos("p0", { x: 50, y: 50 }));
await mini.waitForTimeout(80);
const phone3 = await measure(mini);
check(inside(phone3.pill, phone3.tile), `phone 4p @3x fits its tile (font ${phone3.font.toFixed(1)}px)`);
const tileShort = Math.min(phone3.tile.x1 - phone3.tile.x0, phone3.tile.y1 - phone3.tile.y0);
const pillShort = Math.min(phone3.pill.x1 - phone3.pill.x0, phone3.pill.y1 - phone3.pill.y0);
check(pillShort > tileShort * 0.4, `phone 4p @3x is big (${pillShort.toFixed(0)} of ${tileShort.toFixed(0)}px)`);
await mini.screenshot({ path: `${OUT}/size-3x-4p.png` });

const pad = await open({ width: 820, height: 1180 });
await setup(pad, 4, 0, { turnTimerPlacement: "corner", turnTimerScale: 1 });
await pad.waitForTimeout(80);
const tablet1 = await measure(pad);
check(tablet1.font > phone1.font * 1.4, `tablet 4p @1x font ${tablet1.font.toFixed(1)}px > phone ${phone1.font.toFixed(1)}px`);
await pad.screenshot({ path: `${OUT}/tablet-corner-4p.png` });

// Settings panel preview renders at the chosen share of a tile.
await mini.evaluate(() => window.__store.getState().updateSettings({ turnTimerScale: 1 }));
await mini.locator(".center__hex").click();
await mini.getByText("⚙ Settings").click();
await mini.locator(".sizepreview").scrollIntoViewIfNeeded();
await mini.waitForTimeout(150);
await mini.screenshot({ path: `${OUT}/settings.png` });
{
  // The preview's text must sit on the black inner, not the white ring.
  const bg = await mini.evaluate(() => {
    const t = document.querySelector(".tile__pill--preview .tile__pill-time");
    let el = t;
    while (el) {
      const c = getComputedStyle(el).backgroundColor;
      if (c !== "rgba(0, 0, 0, 0)") return c;
      el = el.parentElement;
    }
    return null;
  });
  check(bg === "rgb(0, 0, 0)", `settings preview time sits on black (${bg})`);
}
await mini.getByLabel("alert volume").scrollIntoViewIfNeeded();
await mini.screenshot({ path: `${OUT}/settings-volume.png` });

await b.close();
console.log(fails ? `\n${fails} FAILED` : "\nall ok");
process.exit(fails ? 1 : 0);
