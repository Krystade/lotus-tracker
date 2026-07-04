import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const BASE = process.argv[2] || "http://localhost:5180/";
const OUT = "screenshots/chromium/13mini";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(300);
// menu (now with dice + random rows)
await page.click(".center__hex");
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/menu.png` });
// dice
await page.getByText(/Dice roller/).click();
await page.waitForTimeout(150);
await page.getByRole("button", { name: "d20", exact: true }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/dice.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
// random landed
await page.click(".center__hex");
await page.waitForTimeout(180);
await page.getByText(/Random first player/).click();
await page.waitForTimeout(3600);
await page.screenshot({ path: `${OUT}/random.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
// editable name header
await page.locator(".tile__more").first().click({ force: true });
await page.waitForTimeout(200);
await page.locator(".panel__name").fill("Jack");
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/name.png` });
console.log("captured menu, dice, random, name");
await b.close();
