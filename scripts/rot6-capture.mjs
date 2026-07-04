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
// 6 players + populate p0 with counters and commander damage from everyone
await page.evaluate(() => {
  const st = window.__store.getState();
  st.newGame({ playerCount: 6, startingLife: 40 });
  st.adjustCounter("p0", "poison", 3);
  st.adjustCounter("p0", "energy", 5);
  st.adjustCounter("p0", "experience", 2);
  st.bumpTax("p0", 1);
  st.adjustCommanderDamage("p0", "p1", 4);
  st.adjustCommanderDamage("p0", "p2", 7);
  st.adjustCommanderDamage("p0", "p3", 2);
});
await page.waitForTimeout(150);
// open p0's detail (left seat, rotation 90)
await page.locator(".tile__more").nth(0).click({ force: true });
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/detail-6p-rot.png` });
// how much of the content is actually visible without scrolling?
const info = await page.evaluate(() => {
  const body = document.querySelector(".panel__body");
  const elim = document.querySelector(".panel__elim");
  return {
    scrollable: body ? body.scrollHeight - body.clientHeight : -1,
    elimInView: elim ? elim.getBoundingClientRect().bottom <= window.innerHeight && elim.getBoundingClientRect().top >= 0 : false,
  };
});
console.log("6p rotated panel:", JSON.stringify(info));
await b.close();
