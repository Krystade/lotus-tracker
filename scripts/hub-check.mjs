// The menu hexagon sits on the layout's hub, never on a life total, and the
// corner turn timer clears it. DEV-only (drives window.__store and imports
// layout modules through vite). Usage: node scripts/hub-check.mjs [baseUrl]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:5180/lotus-tracker/";
const OUT = "screenshots/chromium/extras";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ["--mute-audio"] });
let fails = 0;
const check = (ok, msg) => {
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
};

// Seat tables (built with derive in the page) or a default player count.
const SCENES = [
  { name: "2p", count: 2 },
  { name: "3p", count: 3 },
  { name: "4p", count: 4 },
  { name: "5p", count: 5 },
  { name: "6p", count: 6 },
  { name: "3p-bench-left", table: { top: [], right: [], bottom: [], left: ["p0", "p1", "p2"] } },
  { name: "3p-head-and-two-left", table: { top: ["p0"], right: [], bottom: [], left: ["p1", "p2"] } },
  { name: "2p-head-and-side", table: { top: ["p0"], right: [], bottom: [], left: ["p1"] } },
  { name: "4p-1-2-1", table: { top: ["p0"], right: ["p2"], bottom: ["p3"], left: ["p1"] } },
  { name: "6p-ends", table: { top: ["p0"], right: ["p3", "p4"], bottom: ["p5"], left: ["p1", "p2"] } },
  // iPhone-style uneven safe areas: the board is not centred in .app.
  { name: "3p-bench-left-notch", table: { top: [], right: [], bottom: [], left: ["p0", "p1", "p2"] }, pad: { t: 51, b: 38 } },
];

const ctx = await b.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const page = await ctx.newPage();
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__store);
const src = new URL("src/", BASE).pathname;

for (const sc of SCENES) {
  const seats = await page.evaluate(
    async ([sc, src]) => {
      const { derive, asLayout } = await import(`${src}layout/table.ts`);
      const { junctionFor } = await import(`${src}layout/junction.ts`);
      const st = window.__store.getState();
      const n = sc.count ?? Object.values(sc.table).flat().length;
      st.newGame({ playerCount: n, startingLife: 40 });
      st.updateSettings({ turnTimerEnabled: true, turnTimerPlacement: "corner" });
      if (sc.table) window.__store.getState().applyLayout(asLayout(derive(sc.table), n));
      const app = document.querySelector(".app");
      app.style.removeProperty("--pad-t");
      app.style.removeProperty("--pad-b");
      if (sc.pad) {
        app.style.setProperty("--pad-t", `${sc.pad.t}px`);
        app.style.setProperty("--pad-b", `${sc.pad.b}px`);
      }
      const layout = window.__store.getState().game.layout;
      return layout.placements.map((p) => ({ id: p.playerId, atCenter: junctionFor(layout, p.playerId).atCenter }));
    },
    [sc, src],
  );
  // Every seat that shares the hub gets a turn as the active player.
  const actives = seats.filter((s) => s.atCenter).map((s) => s.id);
  if (!actives.length) actives.push(seats[0].id);
  for (const [i, active] of actives.entries()) {
    await page.evaluate((id) => window.__store.getState().setActivePlayer(id), active);
    await page.waitForTimeout(150);
    const m = await page.evaluate(async (src) => {
      const { boardHub, gapShift } = await import(`${src}layout/junction.ts`);
      const r = (el) => {
        const q = el.getBoundingClientRect();
        return { x0: q.left, y0: q.top, x1: q.right, y1: q.bottom };
      };
      const board = document.querySelector(".board");
      const br = board.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(board).rowGap);
      const hub = boardHub(window.__store.getState().game.layout);
      const want = {
        x: br.left + hub.x * br.width + gap * gapShift(hub.x),
        y: br.top + hub.y * br.height + gap * gapShift(hub.y),
      };
      const center = document.querySelector(".center").getBoundingClientRect();
      const pill = document.querySelector(".tile__pill:not(.tile__pill--preview)");
      const faceEls = pill ? [...pill.querySelectorAll(".tile__pill-turn, .tile__pill-time")] : [];
      const fr = faceEls.map((e) => e.getBoundingClientRect());
      return {
        want,
        got: { x: center.left + center.width / 2, y: center.top + center.height / 2 },
        hex: r(document.querySelector(".center__hex")),
        clock: r(document.querySelector(".center__clock")),
        // The digits themselves; .tile__life fills the whole tile.
        lives: [...document.querySelectorAll(".tile__life")].map((el) => {
          const rg = document.createRange();
          rg.selectNodeContents(el);
          const q = rg.getBoundingClientRect();
          return { x0: q.left, y0: q.top, x1: q.right, y1: q.bottom };
        }),
        face: fr.length
          ? { x0: Math.min(...fr.map((q) => q.left)), y0: Math.min(...fr.map((q) => q.top)), x1: Math.max(...fr.map((q) => q.right)), y1: Math.max(...fr.map((q) => q.bottom)) }
          : null,
        corner: pill?.classList.contains("tile__pill--quarter") ? "quarter" : pill?.classList.contains("tile__pill--half") ? "half" : "none",
      };
    }, src);
    const overlap = (a, c) => a && c && a.x0 < c.x1 && c.x0 < a.x1 && a.y0 < c.y1 && c.y0 < a.y1;
    const tag = `${sc.name} active=${active}`;
    check(Math.abs(m.got.x - m.want.x) < 0.75 && Math.abs(m.got.y - m.want.y) < 0.75,
      `${tag}: menu centred on the hub (${m.got.x.toFixed(1)},${m.got.y.toFixed(1)} vs ${m.want.x.toFixed(1)},${m.want.y.toFixed(1)})`);
    check(!m.lives.some((l) => overlap(l, m.hex) || overlap(l, m.clock)), `${tag}: hexagon and clock clear of every life total`);
    check(m.face && !overlap(m.face, m.hex) && !overlap(m.face, m.clock), `${tag}: ${m.corner} timer face clear of the hexagon and clock`);
    const file = `${OUT}/hub-${sc.name}${actives.length > 1 ? `-${i}` : ""}.png`;
    await page.screenshot({ path: file });
  }
}

await b.close();
console.log(fails ? `${fails} failed` : "all ok");
process.exit(fails ? 1 : 0);
