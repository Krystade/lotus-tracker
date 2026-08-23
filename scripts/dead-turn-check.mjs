// Commander games end by damage, not by anyone pressing "Mark eliminated".
// Turn passing used to check only that flag, so once players started dying the
// active-turn ring and a fresh countdown kept landing on corpses -- three
// passes out of four in a four-player game with one survivor.
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

const active = () =>
  page.evaluate(() => window.__store.getState().game.turn.activePlayerId);

const setup = async (kill) => {
  await page.evaluate((ids) => {
    const st = window.__store.getState();
    st.newGame({ playerCount: 4, startingLife: 40 });
    const s2 = window.__store.getState();
    for (const id of ids) s2.setLife(id, -1);
    s2.setActivePlayer("p0");
  }, kill);
  await page.waitForTimeout(250);
};

// --- one survivor: every pass must stay on them --------------------------
await setup(["p1", "p2", "p3"]);
const landed = [];
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => window.__store.getState().passTurn());
  await page.waitForTimeout(80);
  landed.push(await active());
}
const onCorpse = landed.filter((id) => id !== "p0");
check(
  "with one player alive, every pass stays on them",
  onCorpse.length === 0,
  `landed on ${landed.join(",")}`,
);

// --- two alive: passes must alternate between exactly those two ----------
await setup(["p1", "p3"]);
const two = [];
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => window.__store.getState().passTurn());
  await page.waitForTimeout(80);
  two.push(await active());
}
check(
  "with two alive, turns alternate between only those two",
  two.every((id) => id === "p0" || id === "p2"),
  `landed on ${two.join(",")}`,
);

// --- death by poison and by commander damage, not just life --------------
await page.evaluate(() => {
  const st = window.__store.getState();
  st.newGame({ playerCount: 4, startingLife: 40 });
  const s = window.__store.getState();
  s.adjustCounter("p1", "poison", 10);
  s.adjustCommanderDamage("p2", "p0", 21);
  s.setLife("p3", 0);
  s.setActivePlayer("p0");
});
await page.waitForTimeout(250);
await page.evaluate(() => window.__store.getState().passTurn());
await page.waitForTimeout(80);
check(
  "poison and commander-damage deaths are skipped too",
  (await active()) === "p0",
  `landed on ${await active()}`,
);

// --- reviving puts a player back in the rotation -------------------------
// Revive p3, who was killed by life alone. Reviving p2 would not work: their
// death is 21 commander damage, and giving life back does not clear that --
// which is correct behaviour, and was a bug in this check rather than the app.
await page.evaluate(() => window.__store.getState().setLife("p3", 12));
await page.waitForTimeout(120);
await page.evaluate(() => window.__store.getState().passTurn());
await page.waitForTimeout(80);
check(
  "a revived player rejoins the rotation",
  (await active()) === "p3",
  `landed on ${await active()}`,
);

// And a player whose death was commander damage stays out even after healing,
// because the 21 damage is still on them.
await page.evaluate(() => window.__store.getState().setLife("p2", 30));
await page.waitForTimeout(120);
await page.evaluate(() => window.__store.getState().passTurn());
await page.waitForTimeout(80);
check(
  "healing does not revive a player killed by commander damage",
  (await active()) !== "p2",
  `landed on ${await active()}`,
);

// --- everyone dead: passing must not hang or blank -----------------------
await setup(["p0", "p1", "p2", "p3"]);
await page.evaluate(() => window.__store.getState().passTurn());
await page.waitForTimeout(120);
const tiles = await page.locator(".tile__life").count();
check("passing with nobody alive still renders", tiles === 4, `${tiles} tiles`);

console.log(bad === 0 ? "\nPASS ✅" : `\nFAIL ❌ (${bad})`);
await b.close();
process.exit(bad === 0 ? 0 : 1);
