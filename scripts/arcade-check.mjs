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

// Seat 3 plays; seat 0 is left taking its turn, which is the arrangement the
// whole design is about.
const SEAT = "p3";
const openArcade = async (seat = SEAT) => {
  await page.click(".center__hex");
  await page.waitForTimeout(250);
  await page.getByText("Pass the time").click();
  await page.waitForSelector(".seatpick", { timeout: 5000 });
  await page
    .locator(".seatpick__seat")
    .nth(Number(seat.slice(1)))
    .click({ force: true });
  await page.getByText("Done").click();
  await page.waitForSelector(".arct", { timeout: 5000 });
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
      const body = el.closest(".arct");
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

const turnName = await page.locator(".arct__who").innerText();
check("the turn strip names the active player", /P1/.test(turnName), turnName);
await page.screenshot({ path: "screenshots/arcade-menu.png" });

// Passing a turn while the panel is open must move the strip on, or the strip
// is decoration rather than a way to keep track.
await page.evaluate(() => window.__store.getState().passTurn());
await page.waitForTimeout(200);
const afterPass = await page.locator(".arct__who").innerText();
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
await page.click(".arct__back");
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
await page.click(".arct__back");
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

// ---- the rest of the board is still a life tracker ---------------------
// This is the whole point of the games living in one tile. A panel over the
// middle of the board covered between a third and nearly all of every life
// total and its backdrop ate every tap, so the player whose turn it actually
// was could neither read the board nor use it.
console.log("the board while someone is playing");

const boardState = () =>
  page.evaluate((seat) => {
    const arc = document.querySelector(".arct");
    const a = arc.getBoundingClientRect();
    const out = [];
    for (const el of document.querySelectorAll(".tile__life")) {
      const tile = el.closest(".tile");
      const r = el.getBoundingClientRect();
      const w = Math.max(0, Math.min(r.right, a.right) - Math.max(r.left, a.left));
      const h = Math.max(0, Math.min(r.bottom, a.bottom) - Math.max(r.top, a.top));
      // What is actually painted on top of the middle of the number: the
      // overlay version passed a rectangle test while a backdrop sat over it.
      const hit = document.elementFromPoint(
        Math.round((r.left + r.right) / 2),
        Math.round((r.top + r.bottom) / 2),
      );
      out.push({
        seat: tile.querySelector(".tile__adj")?.getAttribute("aria-label") ?? "?",
        covered: (w * h) / (r.width * r.height || 1),
        ownTile: !!tile.querySelector(".arct"),
        blocked: !!(hit && hit.closest(".arct")),
      });
    }
    return out;
  }, SEAT);

const tiles = await boardState();
const others = tiles.filter((t) => !t.ownTile);
check(
  "the games cover exactly one tile",
  tiles.filter((t) => t.ownTile).length === 1 && others.length === 3,
  `${tiles.filter((t) => t.ownTile).length} own, ${others.length} others`,
);
check(
  "every other life total is completely unobstructed",
  others.length === 3 && others.every((t) => t.covered === 0 && !t.blocked),
  others.map((t) => `${Math.round(t.covered * 100)}%`).join(" "),
);

// The tile clips its own children, so "nothing else is covered" is nearly
// guaranteed by where this renders -- which makes the measurement itself the
// thing to distrust. Put a known cover over the board, confirm it is seen,
// take it away again. Without this the two checks above would read the same
// whether they worked or not.
const withCover = await page.evaluate(async () => {
  const d = document.createElement("div");
  d.id = "cover-control";
  d.style.cssText =
    "position:fixed;inset:0;z-index:99;background:rgba(0,0,0,.62)";
  document.body.appendChild(d);
  await new Promise((r) => requestAnimationFrame(r));
  const out = [];
  for (const el of document.querySelectorAll(".tile__life")) {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      Math.round((r.left + r.right) / 2),
      Math.round((r.top + r.bottom) / 2),
    );
    out.push(hit ? hit.id : "none");
  }
  d.remove();
  return out;
});
check(
  "the measurement can actually see something covering the board",
  withCover.length === 4 && withCover.every((id) => id === "cover-control"),
  withCover.join(","),
);

// The two things the panel covers that its owner still needs: their own life,
// and a way out. Both were missing on the first in-tile build -- the life not
// at all, and the close glyph sat under the centre hex and game clock, which
// every tile's inner corner runs into because tiles face outward.
const barLife = () => page.locator(".arct__lifenum").innerText();
const storedLife = () =>
  page.evaluate((seat) => {
    const st = window.__store.getState();
    return String(st.game.players.find((p) => p.id === seat).life);
  }, SEAT);
check(
  "the player can still see their own life",
  (await barLife()) === (await storedLife()),
  `${await barLife()} vs ${await storedLife()}`,
);

await page.locator('[aria-label="decrease your life"]').click({ force: true });
await page.waitForTimeout(600);
check(
  "and change it without leaving the game",
  (await barLife()) === (await storedLife()) && (await barLife()) === "39",
  await barLife(),
);
await page.locator('[aria-label="increase your life"]').click({ force: true });
await page.waitForTimeout(600);
check("both directions work", (await barLife()) === "40", await barLife());

// Hittable, not merely present: the first one was drawn underneath the board's
// centre furniture, so tapping it opened the game clock instead.
const closeHit = await page.evaluate(() => {
  const btn = document.querySelector(".arct__close");
  const r = btn.getBoundingClientRect();
  const pts = [
    [r.left + r.width / 2, r.top + r.height / 2],
    [r.left + 4, r.top + 4],
    [r.right - 4, r.bottom - 4],
  ];
  return pts.map((p) => {
    const hit = document.elementFromPoint(Math.round(p[0]), Math.round(p[1]));
    return hit && hit.closest(".arct__close") ? "ok" : (hit?.className ?? "none");
  });
});
check(
  "nothing is drawn on top of the way out",
  closeHit.every((h) => h === "ok"),
  closeHit.join(" | "),
);

// And it has to be big enough to hit on a phone.
const closeBox = await page.locator(".arct__close").boundingBox();
check(
  "the way out is a real target",
  Math.min(closeBox.width, closeBox.height) >= 44,
  `${Math.round(closeBox.width)}x${Math.round(closeBox.height)}`,
);

// "some formats it's on the top of the phone screen, too close to the charge
// or time" -- the tiles that touch the edge of the screen used to put this
// button flush against it.
const vp0 = page.viewportSize();
const edge = Math.min(
  closeBox.x,
  closeBox.y,
  vp0.width - (closeBox.x + closeBox.width),
  vp0.height - (closeBox.y + closeBox.height),
);
check(
  "the way out is not jammed against the edge of the screen",
  edge >= 10,
  `${Math.round(edge)}px clear`,
);

// Prominent, not merely present: this stands in for the tile's own number.
const lifeSize = await page.evaluate(() =>
  parseFloat(getComputedStyle(document.querySelector(".arct__lifenum")).fontSize),
);
check(
  "the life total is big enough to read across a table",
  lifeSize >= 26,
  `${Math.round(lifeSize)}px`,
);

// Reading it is half of it; the active player has to be able to use it.
const lifeOf = (i) =>
  page.evaluate((n) => window.__store.getState().game.players[n].life, i);
const beforeLife = await lifeOf(0);
await page.locator('[aria-label="P1 increase life"]').click({ force: true });
await page.waitForTimeout(500);
const afterLife = await lifeOf(0);
check(
  "the active player can still change their life",
  afterLife === beforeLife + 1,
  `${beforeLife} -> ${afterLife}`,
);
check(
  "and the games survive them doing it",
  (await page.locator(".arct").count()) === 1,
);

// Passing the turn is the other thing that cannot wait for someone to finish
// a game of pairs.
const turnBefore = await page.evaluate(
  () => window.__store.getState().game.turn.activePlayerId,
);
await page.click(".center__hex");
await page.waitForTimeout(250);
await page.getByText("Pass turn").click();
await page.waitForTimeout(350);
const turnAfter = await page.evaluate(
  () => window.__store.getState().game.turn.activePlayerId,
);
check(
  "the turn can still be passed from the centre menu",
  turnAfter !== turnBefore,
  `${turnBefore} -> ${turnAfter}`,
);

// And the seat playing sees its own turn arrive without leaving the game.
await page.evaluate((seat) => {
  window.__store.getState().setActivePlayer(seat);
}, SEAT);
await page.waitForTimeout(250);
const yours = await page.locator(".arct__bar.is-yours").count();
check("the playing seat is told when its own turn arrives", yours === 1);
await page.screenshot({ path: "screenshots/arcade-in-tile.png" });

// Walking out mid-run must not strand anything: closing during a countdown
// and reopening should land back on the menu with nothing still ticking.
await page.locator(".arct__back").click();
await page.waitForTimeout(200);
await page.getByText("Quick Draw").click();
await page.locator(".draw").click({ force: true }); // arm, then walk away
await page.waitForTimeout(200);
await page.keyboard.press("Escape");
await page.waitForTimeout(1200);
check(
  "closing mid-round leaves no panel behind",
  (await page.locator(".arct").count()) === 0,
);

// The labelled button, not just the Escape key -- nobody at a table has one.
await openArcade();
await page.getByText("Mana Match").click();
await page.waitForSelector(".mcard");
await page.locator(".arct__close").click();
await page.waitForTimeout(300);
check(
  "the Close button closes it from inside a game",
  (await page.locator(".arct").count()) === 0,
);

// ---- more than one bored player --------------------------------------
// Four people waiting on the same long turn is the normal case; making them
// queue for one game on a shared phone is not.
console.log("several seats at once");
await page.click(".center__hex");
await page.waitForTimeout(250);
await page.getByText("Pass the time").click();
await page.waitForSelector(".seatpick");
await page.locator(".seatpick__seat").nth(1).click({ force: true });
await page.locator(".seatpick__seat").nth(3).click({ force: true });
await page.getByText("Done").click();
await page.waitForTimeout(400);
check("two seats can play at the same time", (await page.locator(".arct").count()) === 2);

// Different games in each, to prove the state is per seat and not shared.
await page.locator(".arct").nth(0).getByText("Mana Match").click();
await page.locator(".arct").nth(1).getByText("Chant").click();
await page.waitForTimeout(500);
const inEach = await page.$$eval(".arct", (els) =>
  els.map((e) => ({
    cards: e.querySelectorAll(".mcard").length,
    pads: e.querySelectorAll(".pad").length,
  })),
);
check(
  "each seat plays its own game, not a shared one",
  inEach.length === 2 &&
    inEach.some((p) => p.cards === 12 && p.pads === 0) &&
    inEach.some((p) => p.pads === 5 && p.cards === 0),
  JSON.stringify(inEach),
);

// One tile's cards must not turn over because the other seat tapped.
const facesIn = (i) =>
  page.evaluate((n) => {
    const arc = document.querySelectorAll(".arct")[n];
    return [...arc.querySelectorAll(".mcard")].filter((c) =>
      c.classList.contains("is-up"),
    ).length;
  }, i);
const matchPanel = inEach[0].cards === 12 ? 0 : 1;
await page.locator(".arct").nth(matchPanel).locator(".mcard").first().click({ force: true });
await page.waitForTimeout(250);
const before2 = await facesIn(matchPanel);
check(
  "a card really is showing before the isolation check",
  before2 === 1,
  `${before2} face up`,
);
await page
  .locator(".arct")
  .nth(matchPanel === 0 ? 1 : 0)
  .locator(".pad")
  .first()
  .click({ force: true });
await page.waitForTimeout(300);
check(
  "one seat's taps do not reach the other's game",
  (await facesIn(matchPanel)) === before2,
  `${before2} -> ${await facesIn(matchPanel)}`,
);

// Each has its own way out, and closing one leaves the other playing.
check(
  "every seat has its own close button",
  (await page.locator(".arct__close").count()) === 2,
);
await page.locator(".arct").nth(0).locator(".arct__close").click();
await page.waitForTimeout(300);
check(
  "closing one seat leaves the other playing",
  (await page.locator(".arct").count()) === 1,
);
await page.screenshot({ path: "screenshots/arcade-two-seats.png" });
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// A player starts one from their own tile, without the shared menu.
await page.locator(".tile__more").nth(2).click({ force: true });
await page.waitForTimeout(350);
await page.getByText("Pass the time").click();
await page.waitForTimeout(350);
check(
  "a player can start a game from their own tile",
  (await page.locator(".arct").count()) === 1,
);
await page.locator(".arct__close").click();
await page.waitForTimeout(250);
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
}));
check(
  "records survive a reload",
  kept.bests.match === matchBest && kept.bests.chant === 3,
  JSON.stringify(kept.bests),
);

// The board underneath must be untouched by any of this.
const life = await page.evaluate(() =>
  window.__store.getState().game.players.map((p) => p.life).join(","),
);
check("nothing but the one deliberate tap changed the game", life === "41,40,40,40", life);

check("no console errors anywhere", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(bad === 0 ? "\nPASS ✅" : `\nFAIL ❌ (${bad})`);
await b.close();
process.exit(bad === 0 ? 0 : 1);
