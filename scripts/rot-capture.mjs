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
// p0 detail (top-left, rot 90 -> faces left)
await page.locator(".tile__more").nth(0).click({ force: true });
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/detail-p0.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
// p1 detail (top-right, rot 270 -> faces right)
await page.locator(".tile__more").nth(1).click({ force: true });
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/detail-p1.png` });
console.log("captured detail-p0 (rot90), detail-p1 (rot270)");
await b.close();
