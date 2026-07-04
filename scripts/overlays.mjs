// Screenshots every overlay/panel at phone sizes so overflow, clipping, and
// tiny-target issues surface. Reports console/page errors.
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:5180/";
const ENGINE = (process.env.BROWSER || "chromium").toLowerCase();
const launcher = ENGINE === "webkit" ? webkit : chromium;

const DEVICES = {
  "13mini": { width: 375, height: 812 },
  se: { width: 375, height: 667 },
};

const errors = [];

async function run() {
  const browser = await launcher.launch();
  for (const [dev, viewport] of Object.entries(DEVICES)) {
    const OUT = `screenshots/${ENGINE}/${dev}`;
    mkdirSync(OUT, { recursive: true });
    const ctx = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`[${dev}] console: ${m.text()}`);
    });
    page.on("pageerror", (e) => errors.push(`[${dev}] pageerror: ${e.message}`));

    await page.goto(BASE);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(300);

    const openMenu = async () => {
      await page.click(".center__hex");
      await page.waitForTimeout(180);
    };
    const closeOverlay = async () => {
      await page.mouse.click(6, viewport.height / 2);
      await page.waitForTimeout(150);
    };
    const shot = async (name) => {
      await page.screenshot({ path: `${OUT}/ov-${name}.png` });
    };

    // Settings
    await openMenu();
    await page.getByText("Settings").first().click();
    await page.waitForTimeout(250);
    await shot("settings");
    await closeOverlay();

    // Layout presets + custom editor
    await openMenu();
    await page.getByText("Layout").first().click();
    await page.waitForTimeout(250);
    await shot("layout-presets");
    await page.getByText("Customize").first().click();
    await page.waitForTimeout(200);
    await shot("layout-custom");
    await closeOverlay();

    // New game
    await openMenu();
    await page.getByText("New game").first().click();
    await page.waitForTimeout(250);
    await shot("newgame");
    await closeOverlay();

    // Player detail, populated to test scrolling
    await page.evaluate(() => {
      const st = window.__store.getState();
      st.adjustCounter("p0", "poison", 3);
      st.adjustCounter("p0", "energy", 5);
      st.adjustCounter("p0", "experience", 2);
      st.addCustomCounter("p0", "Rad");
      st.adjustCommanderDamage("p0", "p1", 7);
      st.adjustCommanderDamage("p0", "p2", 3);
    });
    await page.locator(".tile__more").first().click({ force: true });
    await page.waitForTimeout(250);
    await shot("detail");

    await ctx.close();
  }
  await browser.close();
  console.log(`\nERRORS (${errors.length}):`);
  for (const e of errors) console.log("• " + e);
  if (!errors.length) console.log("(none)");
}

run().catch((e) => {
  console.error("HARNESS FAILED:", e);
  process.exit(1);
});
