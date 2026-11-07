// Is the turn pill actually tappable? For every layout, seat, placement mode
// and with stickers/counters on the tile, hit-test points across the pill and
// report any that land on something else. DEV-only (window.__store).
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
await b.close();
