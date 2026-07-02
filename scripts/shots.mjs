// Visual + crash debugging harness. Loads the app in a phone-sized viewport,
// walks through UI, screenshots each step, and prints ALL console/page errors.
// Usage: node scripts/shots.mjs [baseUrl]
import { chromium, webkit, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:5180/";
const ENGINE = (process.env.BROWSER || "chromium").toLowerCase();
const engines = { chromium, webkit };
const launcher = engines[ENGINE] || chromium;
const OUT = `screenshots/${ENGINE}`;
mkdirSync(OUT, { recursive: true });

// iPhone 13 mini: 375x812 CSS px, DPR 3.
const iPhone13mini = {
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: devices["iPhone 13"].userAgent,
};

const errors = [];

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  📸 ${name}.png`);
}

async function run() {
  const browser = await launcher.launch();
  console.log(`engine: ${ENGINE}`);
  const context = await browser.newContext(iPhone13mini);
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[console.error] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    errors.push(`[pageerror] ${err.message}\n${err.stack || ""}`);
  });

  // Fresh state.
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(400);
  await shot(page, "01-home");

  // Open center menu.
  await page.click(".center__hex").catch((e) => errors.push(`click hex: ${e}`));
  await page.waitForTimeout(300);
  await shot(page, "02-menu");

  // Try each menu row that opens an overlay.
  for (const [label, file] of [
    ["Settings", "03-settings"],
    ["Layout", "04-layout"],
    ["New game", "05-newgame"],
  ]) {
    // reopen menu if needed
    if (!(await page.locator(".sheet").isVisible().catch(() => false))) {
      await page.click(".center__hex").catch(() => {});
      await page.waitForTimeout(200);
    }
    const before = errors.length;
    await page
      .getByText(label, { exact: false })
      .first()
      .click()
      .catch((e) => errors.push(`click ${label}: ${e}`));
    await page.waitForTimeout(350);
    await shot(page, file);
    console.log(
      `  → after "${label}": ${errors.length - before} new error(s)`,
    );
    // close overlay by pressing Escape / clicking backdrop
    await page.keyboard.press("Escape").catch(() => {});
    await page.mouse.click(5, 400).catch(() => {});
    await page.waitForTimeout(200);
  }

  // Tile detail via the TAX badge (top-left corner, not overlapped by hex).
  const before = errors.length;
  await page
    .locator(".tile__tax")
    .first()
    .click({ force: true })
    .catch((e) => errors.push(`click tax: ${e}`));
  await page.waitForTimeout(300);
  await shot(page, "06-detail");
  const detailVisible = await page
    .locator(".panel")
    .isVisible()
    .catch(() => false);
  console.log(
    `  → after TAX badge: ${errors.length - before} new error(s); .panel visible=${detailVisible}`,
  );

  await browser.close();

  console.log("\n===== ERRORS (" + errors.length + ") =====");
  for (const e of errors) console.log("• " + e + "\n");
  if (errors.length === 0) console.log("(none)");
}

run().catch((e) => {
  console.error("HARNESS FAILED:", e);
  process.exit(1);
});
