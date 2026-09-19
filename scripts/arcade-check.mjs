// The pass-the-time games, driven the way a bored player drives them.
//
// Every game here keeps its state inside its component, so the store cannot be
// used to shortcut a win. The match board is therefore solved for real (tap,
// read what turned over, remember it, pair it up) and the colour sequence is
// read back off the pads as they light. Anything less would check that the
// panel opens, not that the games work.
import { chromium, webkit } from "@playwright/test";

const engine = process.env.BROWSER === "webkit" ? webkit : chromium;
const BASE = process.argv[2] || "http://localhost:5183/lotus-tracker/";

let bad = 0;
const check = (name, ok, detail = "") => {
  if (!ok) bad++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const b = await engine.launch();
const ctx = await b.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector(".tile__life", { timeout: 20000 });
await page.evaluate(() =>
  window.__store.getState().newGame({ playerCount: 4, startingLife: 40 }),
);

const openArcade = async () => {
  await page.click(".center__hex");
  await page.waitForTimeout(250);
  await page.getByText("Pass the time").click();
  await page.waitForSelector(".panel--arcade", { timeout: 5000 });
  await page.waitForTimeout(250);
};

console.log("menu");
await openArcade();
check("all three games are listed", (await page.locator(".arc__pick").count()) === 3);
check(
  "no records before anything is played",
  (await page.locator(".arc__pick-best").allInnerTexts()).every((t) =>
    t.includes("no record"),
  ),
);
// A square panel looked tidy and cut the third game in half. Measure it:
// every row of the menu must sit inside the scroll box, not merely exist.
const clipped = async (sel) =>
  page.$$eval(sel, (els) => {
    const out = [];
    for (const el of els) {
      // Measure against the PANEL, which is what actually clips (overflow
      // hidden + rounded corners). Measuring against the scrolling body called
      // a button that hung off the panel edge "fine".
      const body = el.closest(".panel");
      const a = el.getBoundingClientRect();
      const b = body.getBoundingClientRect();
      // Rotation means screen-space top/bottom is not the panel's own axis, so
      // compare areas of the intersection instead of edges.
      const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const shown = (w * h) / (a.width * a.height || 1);
      if (shown < 0.98) out.push(`${el.className}:${Math.round(shown * 100)}%`);
    }
    return out;
  });

const menuClip = await clipped(".arc__pick");
check(
  "no game is cut off the menu",
  menuClip.length === 0 && (await page.locator(".arc__pick").count()) === 3,
  menuClip.join(", "),
);

const menuWidth = (await page.locator(".panel--arcade").boundingBox()).width;
const turnName = await page.locator(".arc__turn-name").innerText();
check("the turn strip names the active player", /P1/.test(turnName), turnName);
await page.screenshot({ path: "screenshots/arcade-menu.png" });

// Passing a turn while the panel is open must move the strip on, or the strip
// is decoration rather than a way to keep track.
await page.evaluate(() => window.__store.getState().passTurn());
await page.waitForTimeout(200);
const afterPass = await page.locator(".arc__turn-name").innerText();
check("the strip follows the turn while a game is open", /P2/.test(afterPass), afterPass);

// ---- Mana Match ---------------------------------------------------------
console.log("mana match");
await page.getByText("Mana Match").click();
await page.waitForSelector(".mcard");
check("twelve cards are dealt", (await page.locator(".mcard").count()) === 12);

const faces = () =>
  page.$$eval(".mcard", (els) =>
    els.map((e) => ({
      label: e.getAttribute("aria-label"),
      text: e.textContent.trim(),
      up: e.classList.contains("is-up"),
    })),
  );
const start = await faces();
check(
  "face-down cards give nothing away",
  start.every((c) => !c.up && c.text === "✦" && c.label === "face down card"),
  `${start.filter((c) => c.up).length} showing`,
);
await page.screenshot({ path: "screenshots/arcade-match.png" });

// The menu and the board are the same panel; it must not change width when
// you pick a game (shrink-wrapping the grid made the board half as wide).
const boardWidth = (await page.locator(".panel--arcade").boundingBox()).width;
check(
  "the panel keeps its width from the menu into a game",
  Math.abs(boardWidth - menuWidth) < 2,
  `menu ${Math.round(menuWidth)} vs board ${Math.round(boardWidth)}`,
);

const tap = async (i) => {
  await page.locator(".mcard").nth(i).click({ force: true });
  await page.waitForTimeout(120);
};
const glyphAt = async (i) => {
  const f = await faces();
  return f[i].up ? f[i].text : null;
};

// Solve it: turn cards over, remember what was underneath, pair up what is
// known. Mismatches are given time to flip back, as a player would.
const known = new Map(); // index -> glyph
const matched = new Set();
let taps = 0;
while (matched.size < 12 && taps < 200) {
  const byGlyph = new Map();
  for (const [i, g] of known) {
    if (matched.has(i)) continue;
    byGlyph.set(g, [...(byGlyph.get(g) ?? []), i]);
  }
  const pair = [...byGlyph.values()].find((v) => v.length === 2);
  if (pair) {
    await tap(pair[0]);
    await tap(pair[1]);
    taps += 2;
    matched.add(pair[0]);
    matched.add(pair[1]);
    continue;
  }
  const unknown = [...Array(12).keys()].filter(
    (i) => !known.has(i) && !matched.has(i),
  );
  if (unknown.length === 0) break;
  const a = unknown[0];
  await tap(a);
  taps++;
  known.set(a, await glyphAt(a));
  const b2 = unknown[1];
  if (b2 === undefined) break;
  await tap(b2);
  taps++;
  known.set(b2, await glyphAt(b2));
  if (known.get(a) === known.get(b2)) {
    matched.add(a);
    matched.add(b2);
  } else {
    await page.waitForTimeout(950); // let the mismatch turn back over
  }
}

const done = await page.locator(".arc__status strong").innerText();
check("the board can actually be cleared", /Cleared in \d+/.test(done), done);
const allUp = (await faces()).every((c) => c.up);
check("every card finishes face up", allUp);
await page.screenshot({ path: "screenshots/arcade-match-won.png" });

const matchBest = await page.evaluate(
  () => window.__store.getState().arcadeBests.match,
);
check(
  "the win is recorded as a best score",
  typeof matchBest === "number" && matchBest >= 6,
  `best=${matchBest}`,
);
check(
  "the record is shown under the game",
  (await page.locator(".arc__best").innerText()).includes("tries"),
);

// A worse deal must not overwrite a better record.
await page.getByText("Deal again").click();
await page.waitForTimeout(200);
await page.evaluate(() => window.__store.getState().recordArcadeScore("match", 99));
check(
  "a worse result leaves the record alone",
  (await page.evaluate(() => window.__store.getState().arcadeBests.match)) ===
    matchBest,
);

// ---- Chant --------------------------------------------------------------
console.log("chant");
await page.click(".arc__back");
await page.waitForTimeout(200);
await page.getByText("Chant", { exact: true }).click();
await page.waitForSelector(".pad");
check("five colour pads", (await page.locator(".pad").count()) === 5);

// Watch which pads light, in order, by recording class changes.
await page.evaluate(() => {
  window.__lit = [];
  if (window.__obs) window.__obs.disconnect();
  window.__obs = new MutationObserver((records) => {
    for (const r of records) {
      const el = r.target;
      if (el.classList.contains("is-lit")) {
        window.__lit.push(el.getAttribute("aria-label"));
      }
    }
  });
  for (const pad of document.querySelectorAll(".pad")) {
    window.__obs.observe(pad, { attributes: true, attributeFilter: ["class"] });
  }
});

await page.getByText("Start", { exact: true }).click();
await page.waitForFunction(
  () => document.querySelector(".pad:not([disabled])") !== null,
  null,
  { timeout: 8000 },
);
const shown = await page.evaluate(() => window.__lit.slice());
check(
  "the sequence is played to the player before their turn",
  shown.length === 1 && ["W", "U", "B", "R", "G"].includes(shown[0]),
  `lit: ${shown.join(",") || "(nothing)"}`,
);
await page.screenshot({ path: "screenshots/arcade-chant.png" });

// Play three rounds back correctly, reading each new sequence off the pads.
let rounds = 0;
for (let round = 1; round <= 3; round++) {
  const seq = await page.evaluate(() => window.__lit.slice());
  for (const pad of seq) {
    await page.locator(`.pad[aria-label="${pad}"]`).click({ force: true });
    await page.waitForTimeout(90);
  }
  rounds = round;
  const status = await page.locator(".arc__status").innerText();
  if (round < 3) {
    await page.evaluate(() => {
      window.__lit = [];
    });
    await page.waitForFunction(
      () => document.querySelector(".pad:not([disabled])") !== null,
      null,
      { timeout: 10000 },
    );
    check(
      `round ${round + 1} plays a longer sequence`,
      (await page.evaluate(() => window.__lit.length)) === round + 1,
      status,
    );
  }
}
check("three rounds can be played back", rounds === 3);
const chantBest = await page.evaluate(
  () => window.__store.getState().arcadeBests.chant,
);
check("nothing is recorded until the run ends", chantBest === undefined, `${chantBest}`);

// Round 4 is being played back now. The pads must be dead while the machine
// is talking, or a player drumming their fingers loses the run to their own
// hand -- and the harness would then be pressing into a void.
check(
  "pads are dead during playback",
  (await page.locator(".pad:disabled").count()) === 5,
);

// Now get it wrong on purpose: press a pad that is not next.
await page.evaluate(() => {
  window.__lit = [];
});
await page.waitForFunction(
  () => document.querySelector(".pad:not([disabled])") !== null,
  null,
  { timeout: 10000 },
);
const seqNow = await page.evaluate(() => window.__lit.slice());
const wrong = ["W", "U", "B", "R", "G"].find((p) => p !== seqNow[0]);
await page.locator(`.pad[aria-label="${wrong}"]`).click({ force: true });
await page.waitForTimeout(250);
const over = await page.locator(".arc__status strong").innerText();
check("a wrong colour ends the run", /Broken at round/.test(over), over);
check(
  "the wrong pad is marked",
  (await page.locator(".pad.is-wrong").count()) === 1,
);
const chantScore = await page.evaluate(
  () => window.__store.getState().arcadeBests.chant,
);
check("the rounds survived are recorded", chantScore === 3, `${chantScore}`);
await page.screenshot({ path: "screenshots/arcade-chant-over.png" });

// ---- Quick Draw ---------------------------------------------------------
console.log("quick draw");
await page.click(".arc__back");
await page.waitForTimeout(200);
await page.getByText("Quick Draw").click();
await page.waitForSelector(".draw");

await page.locator(".draw").click({ force: true }); // arm
await page.waitForTimeout(300);
check(
  "it waits before flipping",
  (await page.locator(".draw--waiting").count()) === 1,
);
await page.locator(".draw").click({ force: true }); // far too early
await page.waitForTimeout(150);
check(
  "a tap before the flip is a false start",
  (await page.locator(".draw__big").innerText()) === "Too soon",
);
check(
  "a false start records no time",
  (await page.evaluate(() => window.__store.getState().arcadeBests.draw)) ===
    undefined,
);
await page.screenshot({ path: "screenshots/arcade-draw-early.png" });

await page.locator(".draw").click({ force: true }); // arm again
await page.waitForSelector(".draw--go", { timeout: 10000 });
await page.screenshot({ path: "screenshots/arcade-draw-go.png" });
await page.locator(".draw").click({ force: true });
await page.waitForTimeout(200);
const drawText = await page.locator(".draw__big").innerText();
check("a real tap is timed", /^\d+ ms$/.test(drawText), drawText);
const drawBest = await page.evaluate(
  () => window.__store.getState().arcadeBests.draw,
);
check(
  "the time is recorded and is not absurd",
  typeof drawBest === "number" && drawBest >= 0 && drawBest < 5000,
  `${drawBest}ms`,
);
await page.screenshot({ path: "screenshots/arcade-draw-result.png" });

// ---- facing another seat, and persistence -------------------------------
console.log("seat rotation and persistence");
const transform = () =>
  page.$eval(".panel--arcade", (el) =>
    getComputedStyle(el.parentElement).transform,
  );
const flat = await transform();
await page.locator('[aria-label="turn to face another seat"]').click();
await page.waitForTimeout(250);
const turned = await transform();
check("the panel can be turned to face another seat", flat !== turned, `${flat} -> ${turned}`);
// A 90 degree turn must still fit the screen, or it is unusable from that seat.
const box = await page.locator(".panel--arcade").boundingBox();
const vp = page.viewportSize();
check(
  "it still fits the screen when turned",
  box.x >= -1 && box.y >= -1 && box.width <= vp.width + 2 && box.height <= vp.height + 2,
  `${Math.round(box.width)}x${Math.round(box.height)} at ${Math.round(box.x)},${Math.round(box.y)} in ${vp.width}x${vp.height}`,
);
await page.screenshot({ path: "screenshots/arcade-rotated.png" });

// The same measurement again, turned: this is the facing the square layout
// broke, so it is the one worth re-checking rather than assuming.
await page.click(".arc__back");
await page.waitForTimeout(300);
const turnedClip = await clipped(".arc__pick");
check(
  "no game is cut off when the panel is turned",
  turnedClip.length === 0 && (await page.locator(".arc__pick").count()) === 3,
  turnedClip.join(", "),
);
await page.getByText("Mana Match").click();
await page.waitForTimeout(300);
// Not just the cards: the button under them is what actually fell off the
// edge, and a cards-only measurement called that layout fine.
const chromeClip = await clipped(".arc__status, .bigbtn");
check(
  "the status and button are whole when turned",
  chromeClip.length === 0 && (await page.locator(".bigbtn").count()) === 1,
  chromeClip.join(", "),
);
const cardClip = await clipped(".mcard");
const cardCount = await page.locator(".mcard").count();
check(
  "the whole board is visible when turned",
  cardClip.length === 0 && cardCount === 12,
  `${cardClip.length} of ${cardCount} clipped`,
);
await page.screenshot({ path: "screenshots/arcade-rotated-match.png" });

// Walking out mid-run must not strand anything: closing during a countdown
// and reopening should land back on the menu with nothing still ticking.
await page.locator(".arc__back").click();
await page.waitForTimeout(200);
await page.getByText("Quick Draw").click();
await page.locator(".draw").click({ force: true }); // arm, then walk away
await page.waitForTimeout(200);
await page.keyboard.press("Escape");
await page.waitForTimeout(1200);
check(
  "closing mid-round leaves no panel behind",
  (await page.locator(".panel--arcade").count()) === 0,
);
await openArcade();
check(
  "reopening starts at the menu, not mid-game",
  (await page.locator(".arc__pick").count()) === 3 &&
    (await page.locator(".draw").count()) === 0,
);
check(
  "nothing left running while the panel was closed",
  errors.length === 0,
  errors.slice(0, 2).join(" | "),
);

await page.reload();
await page.waitForSelector(".tile__life", { timeout: 20000 });
const kept = await page.evaluate(() => ({
  bests: window.__store.getState().arcadeBests,
  rot: window.__store.getState().settings.arcadeRotation,
}));
check(
  "records survive a reload",
  kept.bests.match === matchBest && kept.bests.chant === 3,
  JSON.stringify(kept.bests),
);
check("the chosen facing is remembered", kept.rot === 90, `${kept.rot}`);

// The board underneath must be untouched by any of this.
const life = await page.evaluate(() =>
  window.__store.getState().game.players.map((p) => p.life).join(","),
);
check("the game itself is untouched", life === "40,40,40,40", life);

check("no console errors anywhere", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(bad === 0 ? "\nPASS ✅" : `\nFAIL ❌ (${bad})`);
await b.close();
process.exit(bad === 0 ? 0 : 1);
