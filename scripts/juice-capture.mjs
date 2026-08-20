// Fires real life changes and captures the tile at the hold frame of the wash,
// so the colour is judged from the app rather than from a mock.
// BROWSER=webkit captures on Safari's engine -- mix-blend-mode is the kind of
// property where engines diverge, and the phones are WebKit.
import { chromium, webkit } from "@playwright/test";

const engine = process.env.BROWSER === "webkit" ? webkit : chromium;

const BASE = process.argv[2] || "http://localhost:5180/lotus-tracker/";
const b = await engine.launch();
const ctx = await b.newContext({
  viewport: { width: 420, height: 780 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(400);

// Six seats, one per preset hue, so every seat colour is exercised at once.
await page.evaluate(() => {
  window.__store.getState().newGame({ playerCount: 6, startingLife: 40 });
  // Over real animated looks, which is where the wash actually lives -- a flat
  // seat colour hides whether the effect destroys the look underneath it.
  const st = window.__store.getState();
  const looks = ["gold-lava", "blue-drift", "magenta-nebula", "red-tide", "green-pulse", "purple-marble"];
  st.game.players.forEach((p, i) => st.setPlayerLook(p.id, looks[i]));
});
await page.waitForTimeout(250);

const cases = [
  ["damage-t1", -1],
  ["damage-t2", -5],
  ["damage-t3", -12],
  ["heal-t1", 1],
  ["heal-t2", 5],
  ["heal-t3", 12],
];

for (const [name, delta] of cases) {
  await page.evaluate((d) => {
    const st = window.__store.getState();
    for (const p of st.game.players) st.adjustLife(p.id, d);
  }, delta);
  // The wash ramps to peak at 10% and holds to 44%; 150ms lands inside the
  // hold for every tier (shortest is 300ms -> hold spans 30-132ms... use 90ms).
  await page.waitForTimeout(90);
  await page.screenshot({ path: `screenshots/juice-${process.env.BROWSER || "chromium"}-${name}.png` });

  const state = await page.evaluate(() =>
    [...document.querySelectorAll(".tile")]
      .map((t) => `${t.dataset.fx ?? "-"}/${t.dataset.fxLevel ?? "-"}`)
      .join(" "),
  );
  console.log(`${name.padEnd(11)} delta ${String(delta).padStart(3)} -> ${state}`);
  await page.waitForTimeout(900); // let it fully release before the next
}

await b.close();
