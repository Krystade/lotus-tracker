// Keyword and card-ruling lookup inside a player's rotated panel, against the
// live Scryfall API (a handful of requests). Works on dev or production.
// Usage: node scripts/rules-lookup-check.mjs [baseUrl]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:5180/";
const OUT = "screenshots/chromium/lookup";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ["--mute-audio"] });
let fails = 0;
const check = (ok, msg) => {
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
};
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector(".tile");

// Four players: seat 0 sits on the left, rotated 90.
await page.locator('.tile[data-pid="p0"] .tile__more').click({ force: true });
const rot = await page.locator(".rot-wrap").evaluate((e) => e.style.transform);
check(rot === "rotate(90deg)", `panel faces seat 0 (${rot})`);

// --- keywords
await page.getByText("📖 Keywords").click();
await page.getByLabel("keyword search").fill("death");
await page.waitForTimeout(100);
const first = (await page.locator(".lookup__item span").first().innerText()).trim();
check(first === "Deathtouch", `"death" lists Deathtouch first (${first})`);
await page.locator(".lookup__item").first().click();
const def = await page.locator(".kw").innerText();
check(/702\.2b/.test(def) && /destroyed as a state-based action/.test(def), "Deathtouch shows the CR text with rule numbers");
check((await page.locator(".rot-wrap").evaluate((e) => e.style.transform)) === "rotate(90deg)", "lookup stays inside the rotated panel");
await page.screenshot({ path: `${OUT}/keyword-rot90.png` });
await page.getByText("‹ All keywords").click();
await page.getByLabel("keyword search").fill("dies");
await page.waitForTimeout(80);
check((await page.locator(".lookup__item span").first().innerText()).trim() === "Dies", "rules terms too: Dies");
await page.getByText("‹ Back").click();
check(await page.getByText("📖 Keywords").count() === 1, "Back returns to the player menu");

// --- cards (live Scryfall)
await page.getByText("⚖ Card rulings").click();
await page.getByLabel("card search").fill("humilit");
const hint = page.locator(".lookup__list--hints .lookup__item").first();
await hint.waitFor({ timeout: 10000 });
check((await hint.innerText()).trim() === "Humility", "autocomplete from Scryfall (CORS ok)");
await hint.click();
await page.locator(".card h3").first().waitFor({ timeout: 10000 });
const rulings = await page.locator(".card .ruling").count();
check(rulings >= 2, `Humility shows its rulings (${rulings})`);
check(await page.locator(".card__img").count() === 1, "card image shown");
await page.getByText("+ How does it interact with another card?").click();
await page.getByLabel("second card search").fill("Opalescence");
await page.locator(".lookup__list--hints .lookup__item").first().waitFor({ timeout: 10000 });
await page.locator(".lookup__list--hints .lookup__item").first().click();
await page.locator(".lookup__section h3", { hasText: "Humility + Opalescence" }).waitFor({ timeout: 10000 });
const named = await page.locator(".ruling--named").count();
check(named >= 1, `the pair shows the ruling that names the other card (${named})`);
await page.waitForTimeout(600); // let images land
await page.screenshot({ path: `${OUT}/pair-rot90.png` });

// --- an upright seat (bottom of a 3-player table) and an unknown card
await page.locator(".panel__x, .overlay").first().click({ position: { x: 5, y: 5 } }).catch(() => {});
await page.keyboard.press("Escape");
await page.goto(BASE);
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("lotus-tracker") || "{}");
  localStorage.clear();
});
await page.reload();
await page.waitForSelector(".tile");
// Use the UI to switch to 3 players if a dev store isn't there.
const hasStore = await page.evaluate(() => !!window.__store);
if (hasStore) {
  await page.evaluate(() => window.__store.getState().newGame({ playerCount: 3, startingLife: 40 }));
  await page.locator('.tile[data-pid="p2"] .tile__more').click({ force: true });
  check((await page.locator(".rot-wrap").evaluate((e) => e.style.transform)) === "rotate(0deg)", "bottom seat's panel is upright");
  await page.getByText("⚖ Card rulings").click();
  await page.getByLabel("card search").fill("Xyzzy Notacard");
  await page.getByLabel("card search").press("Enter");
  await page.getByText(/No card called/).waitFor({ timeout: 10000 });
  check(true, "unknown card says so");
  // Offline: Scryfall unreachable.
  await page.route("https://api.scryfall.com/**", (r) => r.abort());
  await ctx.setOffline(true);
  await page.getByLabel("card search").fill("Sol Ring");
  await page.getByText(/needs internet/).first().waitFor({ timeout: 5000 });
  check(true, "offline says card lookup needs internet");
  await page.getByText("‹ Back").click();
  await page.getByText("📖 Keywords").click();
  await page.getByLabel("keyword search").fill("trample");
  check((await page.locator(".lookup__item span").first().innerText()).trim() === "Trample", "keywords still work offline");
  await ctx.setOffline(false);
  await page.screenshot({ path: `${OUT}/upright-offline.png` });
}
check(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await b.close();
console.log(fails ? `\n${fails} FAILED` : "\nall ok");
process.exit(fails ? 1 : 0);
