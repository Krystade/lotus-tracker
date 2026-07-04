// Verifies the added features: dice roller, random first player, player names.
import { chromium } from "@playwright/test";

const BASE = process.argv[2] || "http://localhost:5180/";
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const page = await ctx.newPage();
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(300);

const openMenu = async () => {
  await page.click(".center__hex");
  await page.waitForTimeout(180);
};
const st = () => page.evaluate(() => window.__store.getState().game);

// --- Dice ---
await openMenu();
await page.getByText(/Dice roller/).click();
await page.waitForTimeout(150);
await page.getByRole("button", { name: "d20", exact: true }).click();
await page.waitForTimeout(750);
const diceText = (await page.locator(".dice__result").innerText()).trim();
const diceVal = Number(diceText);
const diceOk = Number.isInteger(diceVal) && diceVal >= 1 && diceVal <= 20;
await page.keyboard.press("Escape"); // close overlay
await page.waitForTimeout(200);

// --- Random first player ---
await openMenu();
await page.getByText(/Random first player/).click();
await page.waitForTimeout(3600); // let the spin land
const randText = (await page.locator(".rand__result").innerText()).trim();
const turn = (await st()).turn;
const randOk = /goes first/.test(randText) && turn.turnNumber === 1;
await page.keyboard.press("Escape"); // close overlay
await page.waitForTimeout(250);

// --- Player name ---
await page.locator(".tile__more").first().click({ force: true }); // p0 detail
await page.waitForTimeout(250);
await page.locator(".panel__name").fill("Jack");
await page.locator(".panel__name").blur();
await page.waitForTimeout(150);
const name0 = (await st()).players[0].name;
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
// open a DIFFERENT player's detail — its commander-damage grid should list "from Jack"
await page.locator(".tile__more").nth(1).click({ force: true });
await page.waitForTimeout(250);
const fromJack = await page.getByText(/from Jack/).count();
const nameOk = name0 === "Jack" && fromJack >= 1;

console.log(`dice d20: "${diceText}" -> ${diceOk}`);
console.log(`random first: "${randText}" turn#=${turn.turnNumber} -> ${randOk}`);
console.log(`name edit: players[0].name="${name0}" from-Jack rows=${fromJack} -> ${nameOk}`);
console.log(diceOk && randOk && nameOk ? "PASS ✅" : "FAIL ❌");
await b.close();
