// Does opening the Appearance disclosure keep the detail panel usable?
//
// Measured in the panel's OWN coordinate space, not the screen's. The panel is
// rotated to face its seat, so screen-space rects swap the axes and cannot tell
// "scrolled out of view" (fine -- the body scrolls) from "clipped and
// unreachable" (broken -- .panel is overflow:hidden with no horizontal scroll).
// Local scrollWidth vs clientWidth is the honest test.
//
// Regression guarded: the look picker used to contribute several children
// straight into .panel--rot .panel__section, which is a two-column grid, so
// each label landed in a different cell from the row it named and most style
// chips were pushed out of view.
import { chromium } from "@playwright/test";

const BASE = process.argv[2] || "http://localhost:5180/lotus-tracker/";
const W = 375;
const H = 640;

const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const page = await ctx.newPage();
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(300);

const measure = () =>
  page.evaluate(() => {
    const panel = document.querySelector(".panel");
    const body = document.querySelector(".panel__body");
    let widest = 0;
    for (const s of document.querySelectorAll(".panel__section")) {
      widest = Math.max(widest, s.scrollWidth);
    }
    const row = document.querySelector(".stylerow");
    const chips = row
      ? (() => {
          const all = [...row.querySelectorAll(".stylechip")];
          // A chip squeezed to nothing by a parent grid track is the failure
          // this guards; compare each chip's own box, not its screen position.
          const degenerate = all.filter((c) => {
            const r = c.getBoundingClientRect();
            return Math.min(r.width, r.height) < 20;
          }).length;
          return { total: all.length, degenerate };
        })()
      : null;
    return {
      rot: panel.className.includes("panel--rot"),
      bodyClientW: body.clientWidth,
      bodyScrollW: body.scrollWidth,
      bodyClientH: body.clientHeight,
      bodyScrollH: body.scrollHeight,
      widest,
      chips,
    };
  });

let bad = 0;

// 4-up seats the top/bottom pair upright; 6-up rotates every seat. Both have to
// hold -- they take different CSS paths.
for (const [pod, seats] of [
  [4, [0, 1]],
  [6, [0, 2]],
]) {
  await page.evaluate((n) => {
    window.__store.getState().newGame({ playerCount: n, startingLife: 40 });
  }, pod);
  await page.waitForTimeout(200);

  const rotations = await page.evaluate(() =>
    window.__store
      .getState()
      .game.layout.placements.map((p) => `${p.playerId}:${p.rotation}`)
      .join(" "),
  );
  console.log(`\n${pod}-player rotations: ${rotations}`);

  for (const seat of seats) {
    await page.locator(".tile__more").nth(seat).click({ force: true });
    await page.waitForTimeout(250);

    for (const state of ["collapsed", "expanded"]) {
      if (state === "expanded") {
        await page.locator(".disclose").click({ force: true });
        await page.waitForTimeout(450); // smooth scrollIntoView
      }

      const m = await measure();
      const clipped = m.bodyScrollW > m.bodyClientW + 1;
      const chipsBad =
        state === "expanded" && (!m.chips || m.chips.degenerate > 0);
      const ok = !clipped && !chipsBad;
      if (!ok) bad++;

      console.log(
        `  seat ${seat} ${m.rot ? "rot    " : "upright"} ${state.padEnd(9)}` +
          `body ${m.bodyClientW}x${m.bodyClientH}, content ${m.bodyScrollW}x${m.bodyScrollH} ` +
          `| h-overflow ${clipped ? `${m.bodyScrollW - m.bodyClientW}px ❌` : "none"} ` +
          (state === "expanded"
            ? `| chips ${m.chips ? `${m.chips.total} (${m.chips.degenerate} degenerate)` : "MISSING"} `
            : "") +
          (ok ? "OK" : "❌"),
      );

      await page.screenshot({
        path: `screenshots/appearance-${pod}p-seat${seat}-${state}.png`,
      });
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
}

console.log(bad === 0 ? "\nPASS ✅" : `\nFAIL ❌ (${bad} bad states)`);
await b.close();
process.exit(bad === 0 ? 0 : 1);
