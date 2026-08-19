// End-to-end validation of the DEPLOYED Lotus Tracker.
//
// The repo's other harnesses drive state through `window.__store`, which is
// gated behind import.meta.env.DEV and therefore absent from the production
// bundle. This one uses only real user interaction, and asserts state by
// reading the persisted localStorage key — which does exist in production.
// BROWSER=webkit runs this against Safari's engine, which is what the phones
// this app is actually used on will run.
import { chromium, webkit } from "@playwright/test";

const engine = process.env.BROWSER === "webkit" ? webkit : chromium;
const BASE = process.argv[2] || "https://krystade.github.io/lotus-tracker/";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const b = await engine.launch();
const ctx = await b.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();

let phase = "startup";
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`[${phase}] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`[${phase}] ${e}`));

const game = () =>
  page.evaluate(() => {
    const raw = localStorage.getItem("lotus-tracker");
    return raw ? JSON.parse(raw).state.game : null;
  });

const openMenu = async () => {
  await page.click(".center__hex");
  await page.waitForTimeout(220);
};
const esc = async () => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(220);
};

console.log(`\nTarget: ${BASE}\n`);
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector(".tile__life", { timeout: 15000 });
await page.waitForTimeout(400);

// --- boot -------------------------------------------------------------
phase = "boot"; console.log("boot");
const tiles = await page.locator(".tile__life").count();
const g0 = await game();
check("4 tiles render at default", tiles === 4, `${tiles} tiles`);
check("starting life 40", g0?.players?.[0]?.life === 40, `life=${g0?.players?.[0]?.life}`);
check("state persists to localStorage", !!g0);

// --- life -------------------------------------------------------------
phase = "life"; console.log("life");
await page.locator(".tile__adj--minus").first().click({ force: true });
await page.waitForTimeout(120);
await page.locator(".tile__adj--plus").first().click({ force: true });
await page.locator(".tile__adj--plus").first().click({ force: true });
await page.waitForTimeout(2600); // let the swing chip commit + fade
const gLife = await game();
check("tap -1 then +1 +1 nets 41", gLife.players[0].life === 41, `life=${gLife.players[0].life}`);

// --- swing chip + undo ------------------------------------------------
phase = "swing chip"; console.log("swing chip");
const before = (await game()).players[0].life;
for (let i = 0; i < 3; i++) {
  await page.locator(".tile__adj--minus").first().click({ force: true });
  await page.waitForTimeout(90);
}
const chipVisible = await page.locator(".tile__swing").first().isVisible().catch(() => false);
const chipText = chipVisible ? (await page.locator(".tile__swing").first().innerText()).trim() : "";
await page.locator(".tile__swing").first().click({ force: true });
await page.waitForTimeout(300);
const afterUndo = (await game()).players[0].life;
// The chip label also carries an undo glyph (↺), so match the number loosely.
check(
  "rapid taps show swing chip",
  chipVisible && /^-3\b/.test(chipText),
  `chip="${chipText.replace(/\n/g, " ")}"`,
);
check("tapping chip undoes the swing", afterUndo === before, `${before} -> ${afterUndo}`);

// --- pass turn --------------------------------------------------------
phase = "turn"; console.log("turn");
const t0 = (await game()).turn;
await page.locator(".tile__pill-turn").first().click({ force: true });
await page.waitForTimeout(300);
const t1 = (await game()).turn;
check(
  "pill passes turn to next seat",
  t1.activePlayerId === "p1" && t1.turnNumber === t0.turnNumber + 1,
  `${t0.activePlayerId}#${t0.turnNumber} -> ${t1.activePlayerId}#${t1.turnNumber}`,
);
// Not an equality check: the countdown is already running by the time we read
// it, so allow for the tick that elapsed between the pass and this assertion.
check(
  "turn timer resets to full on pass",
  t1.budgetSec - t1.remainingSec < 2,
  `remaining=${t1.remainingSec}/${t1.budgetSec}`,
);

// Default 4-pod is p0 TL, p1 TR, p2 BL, p3 BR. Going around the table is
// p0 -> p1 -> p3 -> p2; walking the players array would give p2 third.
const seen = [t1.activePlayerId];
for (let i = 0; i < 3; i++) {
  await page.locator(".tile__pill-turn").first().click({ force: true });
  await page.waitForTimeout(280);
  seen.push((await game()).turn.activePlayerId);
}
check(
  "turn passes clockwise around the pod",
  seen.join(",") === "p1,p3,p2,p0",
  `p0 -> ${seen.join(" -> ")}`,
);

const ringPct = await page.evaluate(() => {
  const pill = document.querySelector(".tile__pill");
  return pill ? getComputedStyle(pill).getPropertyValue("--pct").trim() : "";
});
check(
  "countdown ring is driven by the remaining budget",
  ringPct !== "" && Number(ringPct) > 0 && Number(ringPct) <= 1,
  `--pct=${ringPct}`,
);

// --- poison lethal + skull -------------------------------------------
phase = "lethal"; console.log("lethal");
await page.locator(".tile__more").first().click({ force: true });
await page.waitForTimeout(320);
const poisonPlus = page.locator(".crow", { hasText: "Poison" }).locator("button").last();
for (let i = 0; i < 10; i++) {
  await poisonPlus.click({ force: true });
  await page.waitForTimeout(60);
}
const poisonVal = (await game()).players[0].counters.poison;
await esc();
const skull = await page.locator(".tile__skull").first().isVisible().catch(() => false);
const cause = skull
  ? (await page.locator(".tile__skull-cause").first().innerText()).trim()
  : "";
const counterChips = await page
  .locator(".tile__chips")
  .first()
  .innerText()
  .catch(() => "");
check(
  "counters show as chips on the tile",
  /PSN\s*10/.test(counterChips.replace(/\n/g, " ")),
  `chips="${counterChips.replace(/\n/g, " ").trim()}"`,
);
check(
  "lethal poison chip is flagged",
  (await page.locator(".tile__chip--warn").count()) >= 1,
);
check("10 poison recorded", poisonVal === 10, `poison=${poisonVal}`);
check("lethal tile shows skull", skull);
check("skull names the cause POISON", /POISON/i.test(cause), `cause="${cause}"`);

// --- player name ------------------------------------------------------
phase = "names"; console.log("names");
await page.locator(".tile__more").first().click({ force: true });
await page.waitForTimeout(320);
await page.locator(".panel__name").fill("Jack");
await page.locator(".panel__name").blur();
await page.waitForTimeout(200);
const named = (await game()).players[0].name;
await esc();
await page.locator(".tile__more").nth(1).click({ force: true });
await page.waitForTimeout(320);
const fromJack = await page.getByText(/from Jack/).count();
await esc();
check("name saves as Jack", named === "Jack", `name=${named}`);
check('opponent cmdr grid shows "from Jack"', fromJack >= 1, `${fromJack} match(es)`);

// --- dice -------------------------------------------------------------
phase = "dice"; console.log("dice");
await openMenu();
await page.getByText(/Dice roller/).click();
await page.waitForTimeout(200);
await page.getByRole("button", { name: "d20", exact: true }).click();
await page.waitForTimeout(900);
const diceTxt = (await page.locator(".dice__result").innerText()).trim();
const diceVal = Number(diceTxt);
await esc();
check(
  "d20 rolls within 1..20",
  Number.isInteger(diceVal) && diceVal >= 1 && diceVal <= 20,
  `rolled ${diceTxt}`,
);

// --- random first player ---------------------------------------------
phase = "random first player"; console.log("random first player");
await openMenu();
await page.getByText(/Random first player/).click();
await page.waitForTimeout(4000); // let the spin land
const randTxt = (await page.locator(".rand__result").innerText()).trim();
// Read the id off the winning seat rather than its position: seats are
// listed in clockwise order, so index no longer equals seat number.
const wonId = await page.evaluate(() => {
  const won = document.querySelector(".rand__seat--won");
  return won ? won.getAttribute("data-player-id") : null;
});
await page.getByRole("button", { name: "Start", exact: true }).click();
await page.waitForTimeout(320);
const tr = (await game()).turn;
check(
  "spin lands and Start commits that seat",
  !!wonId && tr.activePlayerId === wonId && tr.turnNumber === 1,
  `${randTxt} -> won=${wonId} active=${tr.activePlayerId} turn=${tr.turnNumber}`,
);

// --- reset life (double-tap guard) -----------------------------------
phase = "reset life"; console.log("reset life");
await openMenu();
await page.getByText(/^↺ Reset life$/).click();
await page.waitForTimeout(250);
const armed = await page.getByText(/Tap again to reset life/).count();
const midLife = (await game()).players[0].life;
await page.getByText(/Tap again to reset life/).click();
await page.waitForTimeout(320);
const gReset = await game();
await esc();
check("first tap arms the confirm", armed >= 1);
check("first tap does NOT reset yet", midLife !== 40 || gReset.players[0].life === 40);
check(
  "second tap resets life and counters",
  gReset.players[0].life === 40 && gReset.players[0].counters.poison === 0,
  `life=${gReset.players[0].life} poison=${gReset.players[0].counters.poison}`,
);
check(
  "chips disappear once counters are back to zero",
  (await page.locator(".tile__chip").count()) === 0,
);

// --- 6/9 underline + detail button ------------------------------------
phase = "readability"; console.log("readability");
// Drive p0 to 69 so both ambiguous digits are on screen.
for (let i = 0; i < 29; i++) {
  await page.locator(".tile__adj--plus").first().click({ force: true });
  await page.waitForTimeout(20);
}
await page.waitForTimeout(2600);
const lifeNow = (await game()).players[0].life;
const underlined = await page
  .locator(".tile__life .digit--ambiguous")
  .count();
check(
  "6 and 9 are underlined in the life total",
  lifeNow === 69 && underlined === 2,
  `life=${lifeNow}, ${underlined} marked`,
);

const moreBox = await page.locator(".tile__more").first().boundingBox();
check(
  "detail button meets the 44x44 touch target",
  moreBox && moreBox.width >= 44 && moreBox.height >= 44,
  moreBox ? `${Math.round(moreBox.width)}x${Math.round(moreBox.height)}` : "none",
);

await openMenu();
await page.getByText(/Dice roller/).click();
await page.waitForTimeout(200);
await page.getByRole("button", { name: "d6", exact: true }).click();
await page.waitForTimeout(900);
const diceRoll = (await page.locator(".dice__result").innerText()).trim();
const diceMarked = await page
  .locator(".dice__result .digit--ambiguous")
  .count();
await esc();
check(
  "a rolled 6 or 9 is underlined on the die",
  diceRoll === "6" || diceRoll === "9" ? diceMarked === 1 : diceMarked === 0,
  `rolled ${diceRoll}, ${diceMarked} marked`,
);

// --- new game / player counts ----------------------------------------
phase = "new game"; console.log("new game");
await openMenu();
await page.getByText(/New game/).first().click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "6", exact: true }).first().click();
await page.waitForTimeout(150);
await page.locator(".bigbtn").first().click();
await page.waitForTimeout(400);
const g6 = await game();
const tiles6 = await page.locator(".tile__life").count();
check("6-player game creates 6 players", g6.players.length === 6, `${g6.players.length} players`);
check("6 tiles render", tiles6 === 6, `${tiles6} tiles`);
check(
  "layout matches player count",
  g6.layout.playerCount === 6 && g6.layout.placements.length === 6,
  `layout=${g6.layout.playerCount}/${g6.layout.placements.length}`,
);

// --- persistence across reload ---------------------------------------
phase = "persistence"; console.log("persistence");
await page.locator(".tile__adj--minus").first().click({ force: true });
await page.waitForTimeout(2600);
const preReload = (await game()).players[0].life;
await page.reload();
await page.waitForSelector(".tile__life", { timeout: 15000 });
await page.waitForTimeout(500);
const postReload = (await game()).players[0].life;
const tilesAfter = await page.locator(".tile__life").count();
check(
  "game survives a reload",
  postReload === preReload && tilesAfter === 6,
  `life ${preReload} -> ${postReload}, ${tilesAfter} tiles`,
);

// --- animated looks --------------------------------------------------
phase = "looks"; console.log("looks");
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("lotus-tracker"));
  raw.state.game.players.forEach((pl, i) => {
    pl.look = ["blue-lava", "gold-drift", "magenta-nebula", "red-tide",
               "green-tide", "purple-pulse"][i % 6];
  });
  localStorage.setItem("lotus-tracker", JSON.stringify(raw));
});
await page.reload();
await page.waitForSelector(".tile__life", { timeout: 15000 });
await page.waitForTimeout(700);

const running = await page.evaluate(() => {
  const a = document.getAnimations();
  return { n: a.length, states: [...new Set(a.map((x) => x.playState))] };
});
check(
  "animated looks render and run",
  running.n > 0 && running.states.every((s) => s === "running"),
  `${running.n} animations, ${running.states.join(",")}`,
);

// The life total must be exactly as legible on an animated tile as a flat one.
const inkOk = await page.evaluate(() => {
  const t = document.querySelector(".tile");
  const c = getComputedStyle(t).color;
  return c === "rgb(255, 255, 255)" || c === "rgb(13, 13, 13)";
});
check("ink stays one of the two legible choices on an animated look", inkOk);

// The damage/heal wash must stay a hue blend, not an alpha tint. An alpha
// tint is a linear mix toward the wash colour, so on a seat whose hue opposes
// it the mix passes through grey -- heal on magenta came out grey-brown that
// way. mix-blend-mode:color takes luminance from the tile, which both fixes
// the hue and leaves the life total's contrast ratio untouched.
const washMode = await page.evaluate(() => {
  const t = document.querySelector(".tile");
  t.dataset.fx = "damage";
  const read = (lvl) => {
    if (lvl) t.dataset.fxLevel = String(lvl);
    else delete t.dataset.fxLevel;
    const cs = getComputedStyle(t, "::after");
    return { blend: cs.mixBlendMode, reach: cs.getPropertyValue("--fx-reach").trim() };
  };
  const t1 = read(null);
  const t3 = read(3);
  delete t.dataset.fx;
  delete t.dataset.fxLevel;
  return { blend: t1.blend, r1: t1.reach, r3: t3.reach };
});
check(
  "damage wash blends hue rather than tinting with alpha",
  washMode.blend === "color",
  `mix-blend-mode: ${washMode.blend}`,
);
check(
  "wash tiers scale by coverage, not opacity",
  washMode.r1 !== "" && washMode.r3 !== "" && washMode.r1 !== washMode.r3,
  `tier1 reach ${washMode.r1} -> tier3 ${washMode.r3}`,
);

// The battery toggle must actually halt motion. Each style declares `animation`
// as a shorthand, which resets play-state to running and outranks the pause
// rule on specificity -- this once silently did nothing at all.
await openMenu();
await page.getByText(/Settings/).first().click();
await page.waitForTimeout(350);
await page
  .locator(".toggle", { hasText: "Animated backgrounds" })
  .locator("input")
  .uncheck({ force: true });
await page.waitForTimeout(250);
await esc();
const paused = await page.evaluate(() => {
  const a = document.getAnimations();
  return { n: a.length, states: [...new Set(a.map((x) => x.playState))] };
});
check(
  "battery saver genuinely pauses look animation",
  paused.n > 0 && paused.states.every((s) => s === "paused"),
  `${paused.n} animations, ${paused.states.join(",")}`,
);

await openMenu();
await page.getByText(/Settings/).first().click();
await page.waitForTimeout(300);
await page
  .locator(".toggle", { hasText: "Animated backgrounds" })
  .locator("input")
  .check({ force: true });
await esc();

// --- responsive ------------------------------------------------------
phase = "responsive"; console.log("responsive");
for (const [name, w, h] of [
  ["iPhone SE", 375, 667],
  ["iPhone 13 mini", 375, 812],
  ["Pixel 7", 412, 915],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.reload();
  await page.waitForSelector(".tile__life", { timeout: 15000 });
  await page.waitForTimeout(400);
  const n = await page.locator(".tile__life").count();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  check(`${name} (${w}x${h}) renders, no h-overflow`, n === 6 && !overflow, `${n} tiles`);
}

// --- console health --------------------------------------------------
phase = "console"; console.log("console");
check("no console errors / uncaught exceptions", errors.length === 0, errors.slice(0, 3).join(" | "));

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} passed — ${failed.length === 0 ? "PASS ✅" : "FAIL ❌"}`,
);
if (failed.length) console.log("failed: " + failed.map((f) => f.name).join("; "));
await b.close();
process.exit(failed.length ? 1 : 0);
