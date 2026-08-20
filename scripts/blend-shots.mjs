// Films both sliders so the result is looked at, not only measured.
import { chromium } from "@playwright/test";

const BASE = process.argv[2] || "http://localhost:5180/lotus-tracker/";
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const page = await ctx.newPage();
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector(".tile__life", { timeout: 15000 });

// --- the mix, across the whole board so every step is side by side ---
await page.evaluate(() => {
  window.__store.getState().newGame({ playerCount: 6, startingLife: 40 });
  // Re-read: the snapshot taken before newGame still holds the old pod, so
  // iterating it would leave the added seats untouched.
  const st = window.__store.getState();
  const steps = [0, 20, 40, 60, 80, 100];
  st.game.players.forEach((p, i) => {
    st.setPlayerLook(p.id, `blue~red@${steps[i]}-lava`);
  });
});
await page.waitForTimeout(600);
await page.screenshot({ path: "screenshots/mix-sweep.png" });
console.log(
  "mix sweep:",
  await page.evaluate(() =>
    window.__store
      .getState()
      .game.players.map((p) => p.look)
      .join(" "),
  ),
);

// --- the picker itself, with the mix slider visible ---
await page.evaluate(() => {
  window.__store.getState().setPlayerLook("p2", "blue~red@45-lava");
});
await page.locator(".tile__more").nth(2).click({ force: true });
await page.waitForTimeout(250);
await page.locator(".disclose").click({ force: true });
await page.waitForTimeout(500);
await page.screenshot({ path: "screenshots/mix-picker.png" });
await page.keyboard.press("Escape");
await page.waitForTimeout(250);

// --- the strength slider, at three settings, mid-flash ---
for (const s of [0.4, 1, 2]) {
  await page.evaluate((v) => {
    const st = window.__store.getState();
    st.updateSettings({ effectStrength: v });
    st.game.players.forEach((p) => st.setPlayerLook(p.id, "green"));
  }, s);
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const st = window.__store.getState();
    for (const p of st.game.players) st.adjustLife(p.id, -12);
  });
  await page.waitForTimeout(90); // inside the hold
  await page.screenshot({ path: `screenshots/strength-${s}x.png` });
  await page.waitForTimeout(900);
}
console.log("strength shots: 0.4x, 1x, 2x");

// --- the Settings panel itself ---
await page.evaluate(() =>
  window.__store.getState().updateSettings({ effectStrength: 1 }),
);
await page.click(".center__hex");
await page.waitForTimeout(300);
await page.getByText(/Settings/).first().click();
await page.waitForTimeout(400);
await page.locator(".fxpreview").scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await page.screenshot({ path: "screenshots/strength-settings.png" });

await b.close();
