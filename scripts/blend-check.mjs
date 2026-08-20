// The two blend sliders: the two-colour mix in the look picker, and the
// damage/heal strength in Settings.
//
// Both are checked by their EFFECT, not their presence -- a slider that moves
// but changes nothing would pass a presence check. The mix is read as the
// resolved highlight colour; the strength as the wash geometry it produces.
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
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector(".tile__life", { timeout: 15000 });

// ---- the two-colour mix ------------------------------------------------
console.log("look mix");
await page.evaluate(() => {
  window.__store.getState().newGame({ playerCount: 4, startingLife: 40 });
});
await page.waitForTimeout(200);

// A two-colour lava look on seat 0, so the mix control is applicable.
await page.evaluate(() => {
  window.__store.getState().setPlayerLook("p0", "blue~red-lava");
});
await page.waitForTimeout(150);

await page.locator(".tile__more").nth(0).click({ force: true });
await page.waitForTimeout(250);
await page.locator(".disclose").click({ force: true });
await page.waitForTimeout(400);

const mixSlider = page.locator(".slider--mix");
check("mix slider appears for a two-colour look", (await mixSlider.count()) === 1);

// Drag it across its range and read the highlight the tile actually paints.
const sample = async (value) => {
  await page.evaluate((v) => {
    const el = document.querySelector(".slider--mix");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await page.waitForTimeout(120);
  return page.evaluate(() => {
    const st = window.__store.getState();
    const look = document.querySelector(".look");
    return {
      id: st.game.players[0].look,
      hi: look ? getComputedStyle(look).getPropertyValue("--look-hi").trim() : "",
    };
  });
};

const at0 = await sample(0);
const at50 = await sample(0.5);
const at100 = await sample(1);

check(
  "moving the mix rewrites the stored look id",
  at0.id !== at100.id && at0.id.includes("@"),
  `${at0.id} | ${at50.id} | ${at100.id}`,
);
check(
  "moving the mix actually repaints the highlight",
  at0.hi !== at50.hi && at50.hi !== at100.hi,
  `${at0.hi} -> ${at50.hi} -> ${at100.hi}`,
);
// Mix 0 must land exactly on the single-colour look, not merely near it.
await page.evaluate(() => {
  window.__store.getState().setPlayerLook("p0", "blue-lava");
});
await page.waitForTimeout(150);
const single = await page.evaluate(() =>
  getComputedStyle(document.querySelector(".look"))
    .getPropertyValue("--look-hi")
    .trim(),
);
check(
  "mix 0 is exactly the single-colour look",
  single === at0.hi,
  `single ${single} vs mix0 ${at0.hi}`,
);

// The mix control must not appear where a second colour cannot go.
await page.evaluate(() => {
  window.__store.getState().setPlayerLook("p0", "blue-smoke");
});
await page.waitForTimeout(250);
check(
  "no mix slider on a single-layer style",
  (await page.locator(".slider--mix").count()) === 0,
);

await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// ---- the damage/heal strength -----------------------------------------
console.log("effect strength");

// Read the wash geometry the tile resolves at a given strength, at the
// heaviest tier.
//
// A custom property does NOT come back evaluated from getComputedStyle -- it
// returns the authored token with vars substituted, so comparing --fx-in
// strings compares arithmetic that was never performed. Measuring a probe
// whose width IS that expression makes the browser do the maths, which is the
// only reading that means anything.
const reach = async (strength) => {
  await page.evaluate((v) => {
    window.__store.getState().updateSettings({ effectStrength: v });
  }, strength);
  await page.waitForTimeout(120);
  return page.evaluate(() => {
    const t = document.querySelector(".tile");
    t.dataset.fx = "damage";
    t.dataset.fxLevel = "3";
    const mk = (prop) => {
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:absolute;top:0;left:0;height:1px;pointer-events:none;" +
        `width:var(${prop});`;
      t.appendChild(probe);
      const w = probe.getBoundingClientRect().width;
      probe.remove();
      return w;
    };
    const innerPx = mk("--fx-in");
    const outerPx = mk("--fx-out");
    const tilePx = t.getBoundingClientRect().width;
    const img = getComputedStyle(t, "::after").backgroundImage;
    delete t.dataset.fx;
    delete t.dataset.fxLevel;
    return {
      inner: innerPx,
      pct: (innerPx / tilePx) * 100,
      bandPct: ((outerPx - innerPx) / tilePx) * 100,
      img,
    };
  });
};

const weak = await reach(0.3);
const mid = await reach(1);
const strong = await reach(2);

const fmt = (r) => `${r.pct.toFixed(1)}%`;
check(
  "a weaker strength pulls the wash back toward the rim",
  weak.pct > mid.pct + 1,
  `0.3x inner edge ${fmt(weak)} vs 1x ${fmt(mid)}`,
);
check(
  "a stronger strength pushes the wash further in",
  strong.pct < mid.pct - 1,
  `2x inner edge ${fmt(strong)} vs 1x ${fmt(mid)}`,
);
check(
  "the inner edge never inverts past the tile",
  weak.pct <= 100.5 && strong.pct >= -0.5,
  `${fmt(weak)} .. ${fmt(strong)}`,
);
check(
  "the resolved gradient changes with it",
  weak.img !== mid.img && mid.img !== strong.img,
);
// Moving only the inner edge drove it into the fixed outer edge as strength
// fell, leaving no room to fade -- a hard-edged ring instead of a wash.
check(
  "the falloff never collapses into a hard ring",
  weak.bandPct > 15 && mid.bandPct > 15 && strong.bandPct > 15,
  `band 0.3x ${weak.bandPct.toFixed(0)}% | 1x ${mid.bandPct.toFixed(0)}% | 2x ${strong.bandPct.toFixed(0)}%`,
);
// Strength must not turn the hue blend back into a muted tint.
const blend = await page.evaluate(() => {
  const t = document.querySelector(".tile");
  t.dataset.fx = "damage";
  const m = getComputedStyle(t, "::after").mixBlendMode;
  delete t.dataset.fx;
  return m;
});
check("strength does not disturb the hue blend", blend === "color", blend);

await page.evaluate(() => {
  window.__store.getState().updateSettings({ effectStrength: 1 });
});

// ---- the Settings preview ---------------------------------------------
console.log("settings preview");
await page.click(".center__hex");
await page.waitForTimeout(300);
await page.getByText(/Settings/).first().click();
await page.waitForTimeout(400);

const pv = page.locator(".fxpreview");
check("preview tile is present", (await pv.count()) === 1);
await pv.click({ force: true });
await page.waitForTimeout(120);
const firing = await page.evaluate(() => {
  const el = document.querySelector(".fxpreview");
  return {
    fx: el?.dataset.fx ?? null,
    lvl: el?.dataset.fxLevel ?? null,
    anims: document.getAnimations().length,
  };
});
check(
  "tapping the preview fires the real effect",
  firing.fx === "damage" && firing.lvl === "3",
  `data-fx=${firing.fx} level=${firing.lvl}`,
);
await page.waitForTimeout(1100);
const cleared = await page.evaluate(
  () => document.querySelector(".fxpreview")?.dataset.fx ?? null,
);
check("the preview clears itself", cleared === null);

check("no console errors", errors.length === 0, errors.slice(0, 2).join(" | "));

console.log(bad === 0 ? "\nPASS ✅" : `\nFAIL ❌ (${bad})`);
await b.close();
process.exit(bad === 0 ? 0 : 1);
