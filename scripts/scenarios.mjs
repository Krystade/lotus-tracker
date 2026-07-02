// Autonomous visual QA: renders every layout + key states at iPhone 13 mini
// (and a couple of other sizes) and screenshots each. Prints any console/page
// errors so regressions surface without a human eyeballing.
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:5180/";
const ENGINE = (process.env.BROWSER || "chromium").toLowerCase();
const launcher = ENGINE === "webkit" ? webkit : chromium;

const DEVICES = {
  "13mini": { width: 375, height: 812 },
  "pro-max": { width: 430, height: 932 },
  se: { width: 375, height: 667 },
};

const errors = [];

async function setup(page, fn) {
  await page.evaluate(fn);
  await page.waitForTimeout(250);
}

async function run() {
  const browser = await launcher.launch();
  for (const [devName, viewport] of Object.entries(DEVICES)) {
    const OUT = `screenshots/${ENGINE}/${devName}`;
    mkdirSync(OUT, { recursive: true });
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`[${devName}] console: ${m.text()}`);
    });
    page.on("pageerror", (e) =>
      errors.push(`[${devName}] pageerror: ${e.message}`),
    );

    await page.goto(BASE);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(300);

    // Each player count.
    for (const n of [2, 3, 4, 5, 6]) {
      await setup(
        page,
        new Function(
          `window.__store.getState().newGame({playerCount:${n},startingLife:40});`,
        ),
      );
      await page.screenshot({ path: `${OUT}/count-${n}.png` });
    }

    // Lethal + counters state (4p): p0 poisoned out, p1 heavy commander dmg.
    await setup(
      page,
      new Function(`
      const st = window.__store.getState();
      st.newGame({playerCount:4,startingLife:40});
      st.adjustCounter('p0','poison',10);
      st.adjustCommanderDamage('p1','p2',21);
      st.adjustCounter('p3','tax',6);
    `),
    );
    await page.screenshot({ path: `${OUT}/lethal.png` });

    // Big life number width stress (3 digits) + negative.
    await setup(
      page,
      new Function(`
      const st = window.__store.getState();
      st.newGame({playerCount:4,startingLife:40});
      st.setLife('p0',200); st.setLife('p1',-5); st.setLife('p2',108);
    `),
    );
    await page.screenshot({ path: `${OUT}/big-numbers.png` });

    await context.close();
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
