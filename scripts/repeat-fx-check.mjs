// Holding the minus button fires the same feedback repeatedly. React hands the
// tile identical attributes, an unchanged attribute is not rewritten, and a CSS
// animation only restarts when its element or animation property changes -- so
// the wash used to play once and then sit at opacity 0 while life kept
// dropping, exactly when a player most wants feedback.
//
// Samples the wash's real opacity across a sustained hold and asserts it keeps
// firing rather than going dark.
import { chromium, webkit } from "@playwright/test";

const engine = process.env.BROWSER === "webkit" ? webkit : chromium;
const BASE = process.argv[2] || "http://localhost:5180/lotus-tracker/";

let bad = 0;
const check = (name, ok, detail = "") => {
  if (!ok) bad++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const b = await engine.launch();
const page = await (
  await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })
).newPage();
await page.goto(BASE);
await page.waitForSelector(".tile__life", { timeout: 20000 });
await page.evaluate(() =>
  window.__store.getState().newGame({ playerCount: 4, startingLife: 400 }),
);
await page.waitForTimeout(250);

// Fire the same -10 every 200ms, the cadence the hold-repeat uses, and watch
// the wash. Sample faster than the effect so peaks are not missed.
const samples = await page.evaluate(async () => {
  const tile = document.querySelector(".tile");
  const out = [];
  const start = performance.now();
  const hit = setInterval(
    () => window.__store.getState().adjustLife("p0", -10),
    200,
  );
  await new Promise((resolve) => {
    const tick = setInterval(() => {
      const cs = getComputedStyle(tile, "::after");
      out.push({
        t: Math.round(performance.now() - start),
        fx: tile.dataset.fx ?? "-",
        o: Number(cs.opacity),
      });
      if (performance.now() - start > 2000) {
        clearInterval(tick);
        clearInterval(hit);
        resolve();
      }
    }, 40);
  });
  return out;
});

// Ignore the first 400ms: the question is whether it keeps firing after the
// first flash would have finished.
const later = samples.filter((s) => s.t > 500);
const peaks = later.filter((s) => s.o > 0.5).length;
const maxLate = Math.max(...later.map((s) => s.o));
console.log(
  `  samples after 500ms: ${later.length}, above 0.5 opacity: ${peaks}, max ${maxLate.toFixed(2)}`,
);
check(
  "the wash keeps firing through a sustained hold",
  peaks >= 3 && maxLate > 0.8,
  `${peaks} peaks, max opacity ${maxLate.toFixed(2)}`,
);

// It must also stop cleanly once the hold ends, not stick on.
await page.waitForTimeout(1200);
const stuck = await page.evaluate(
  () => document.querySelector(".tile").dataset.fx ?? null,
);
check("no tile is left stuck mid-effect after the hold", stuck === null, `data-fx=${stuck}`);

console.log(bad === 0 ? "\nPASS ✅" : `\nFAIL ❌ (${bad})`);
await b.close();
process.exit(bad === 0 ? 0 : 1);
