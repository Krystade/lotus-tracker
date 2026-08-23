// Boots the app with deliberately corrupted persisted state.
//
// Two shapes used to blank the whole app, because React unmounts the tree on an
// uncaught render error and there was no boundary: counters.custom as a string
// (crashes the board on first paint) and a settings number as null (crashes
// when the Settings panel opens, mid-game, with no way to fix it in-app).
import { chromium, webkit } from "@playwright/test";

const engine = process.env.BROWSER === "webkit" ? webkit : chromium;
const BASE = process.argv[2] || "http://localhost:5180/lotus-tracker/";

let bad = 0;
const check = (name, ok, detail = "") => {
  if (!ok) bad++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const b = await engine.launch();
const ctx = await b.newContext({
  viewport: { width: 412, height: 915 },
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();

// Seed a real save, then corrupt one field of it.
await page.goto(BASE);
await page.waitForSelector(".tile__life", { timeout: 20000 });
// persist only writes after a state change, so nudge it and wait for the key.
await page.evaluate(() =>
  window.__store.getState().newGame({ playerCount: 4, startingLife: 40 }),
);
await page.waitForFunction(() => !!localStorage.getItem("lotus-tracker"), null, {
  timeout: 5000,
});
const good = await page.evaluate(() => localStorage.getItem("lotus-tracker"));
if (!good) throw new Error("no persisted state to corrupt");

const boot = async (mutate, label) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.evaluate(
    ([raw, fn]) => {
      const o = JSON.parse(raw);
      // eslint-disable-next-line no-new-func
      new Function("s", fn)(o.state);
      localStorage.setItem("lotus-tracker", JSON.stringify(o));
    },
    [good, mutate],
  );
  await page.reload();
  await page.waitForTimeout(1200);
  const tiles = await page.locator(".tile__life").count();
  const crashed = await page.locator(".crash").count();
  const rootEmpty = await page.evaluate(
    () => (document.getElementById("root")?.innerHTML.length ?? 0) === 0,
  );
  console.log(
    `${label}: tiles=${tiles} crashScreen=${crashed} blank=${rootEmpty} pageerrors=${errors.length}`,
  );
  return { tiles, crashed, rootEmpty };
};

console.log("corrupt persisted state");

// 1. counters.custom is not an array -> used to crash the board at first paint.
let r = await boot(
  "s.game.players[0].counters.custom = 'not-an-array'",
  "  custom counters as a string",
);
check(
  "board still renders with a non-array custom counter list",
  r.tiles > 0 && !r.rootEmpty,
);

// 2. A custom counter whose name is not a string.
r = await boot(
  "s.game.players[0].counters.custom = [{id:'a', name:123, value:'x'}]",
  "  custom counter with a numeric name",
);
// Note: this one did NOT crash before the fix either -- a numeric name is
// stringified by React, not thrown on. Kept because sanitising it is still
// right, but it is not evidence the fix works; the two below are.
check("board still renders with a mistyped counter entry", r.tiles > 0 && !r.rootEmpty);

// 3. settings.effectStrength is null -> used to crash when Settings opened.
r = await boot("s.settings.effectStrength = null", "  effectStrength null");
check("board still renders with a null settings number", r.tiles > 0 && !r.rootEmpty);

await page.click(".center__hex");
await page.waitForTimeout(300);
await page.getByText(/Settings/).first().click();
await page.waitForTimeout(600);
const sliderCount = await page
  .locator('input[aria-label="damage and heal effect strength"]')
  .count();
const blankAfter = await page.evaluate(
  () => (document.getElementById("root")?.innerHTML.length ?? 0) === 0,
);
check(
  "Settings opens rather than blanking the app",
  sliderCount === 1 && !blankAfter,
  `slider=${sliderCount} blank=${blankAfter}`,
);
await page.keyboard.press("Escape");

// 4. Several bad types at once.
r = await boot(
  "s.settings.lookSpeed='bogus'; s.settings.turnTimerScale=null; s.settings.effectsOn='yes'; s.game.players[1].counters.custom={};",
  "  several bad types at once",
);
check("board survives several corrupt fields together", r.tiles > 0 && !r.rootEmpty);

// Restore, so a later run starts from a sane state.
await page.evaluate((raw) => localStorage.setItem("lotus-tracker", raw), good);

console.log(bad === 0 ? "\nPASS ✅" : `\nFAIL ❌ (${bad})`);
await b.close();
process.exit(bad === 0 ? 0 : 1);
