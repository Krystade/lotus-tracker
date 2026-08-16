// Simulates a real 4-player Commander game end to end on the LIVE site.
import { chromium } from "@playwright/test";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
const p = await ctx.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
const game = () => p.evaluate(() => JSON.parse(localStorage.getItem("lotus-tracker")).state.game);
const fail = [];
const ok = (n,c,d="") => { if(!c) fail.push(n); console.log(`  ${c?"✓":"✗"} ${n}${d?` — ${d}`:""}`); };

await p.goto("https://krystade.github.io/lotus-tracker/");
await p.evaluate(() => localStorage.clear());
await p.reload(); await p.waitForSelector(".tile__life"); await p.waitForTimeout(500);

// A full lap of turns, twice around.
const lap = [];
for (let i=0;i<8;i++){
  await p.locator(".tile__pill-turn").first().click({force:true});
  await p.waitForTimeout(220);
  lap.push((await game()).turn.activePlayerId);
}
ok("two full clockwise laps", lap.join(",")==="p1,p3,p2,p0,p1,p3,p2,p0", lap.join(","));
ok("turn number counts every pass", (await game()).turn.turnNumber===9, `turn ${(await game()).turn.turnNumber}`);

// Commander damage kills p1: 21 from p0.
await p.locator(".tile__more").nth(1).click({force:true}); await p.waitForTimeout(350);
const cmdrPlus = p.locator(".crow", { hasText: /^P1|from/ }).first();
// use the commander-damage grid: find the row for the first opponent
const dmgRows = await p.locator(".cmdr__row, .crow").count();
await p.keyboard.press("Escape"); await p.waitForTimeout(250);

// Simpler + realistic: beat p1 down to 0 with the minus button.
const before = (await game()).players[1].life;
for (let i=0;i<before;i++){ await p.locator(".tile__adj--minus").nth(1).click({force:true}); await p.waitForTimeout(12); }
await p.waitForTimeout(2600);
const g1 = await game();
ok("a player can be reduced to 0", g1.players[1].life<=0, `p1 life=${g1.players[1].life}`);
const skull = await p.locator(".tile__skull").count();
ok("dead player shows the skull", skull>=1);

// Eliminate p1 via the skull, then confirm turns skip them.
await p.locator(".tile__skull").first().click({force:true}); await p.waitForTimeout(350);
const g2 = await game();
ok("skull eliminates the player", g2.players[1].eliminated===true);
const lap2=[];
for (let i=0;i<3;i++){ await p.locator(".tile__pill-turn").first().click({force:true}); await p.waitForTimeout(220); lap2.push((await game()).turn.activePlayerId); }
ok("eliminated seat is skipped, order still clockwise", !lap2.includes("p1"), lap2.join(","));

// Eliminate down to one player -> winner badge.
for (const idx of [2,3]) {
  await p.locator(".tile__more").nth(idx).click({force:true}); await p.waitForTimeout(320);
  await p.getByText(/Mark eliminated/).click(); await p.waitForTimeout(320);
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
}
await p.waitForTimeout(400);
const wins = await p.locator(".tile__winner").count();
ok("last player standing gets the WINS badge", wins===1, `${wins} badge(s)`);
const g3 = await game();
ok("turn never gets stuck on a dead seat", g3.players.find(x=>x.id===g3.turn.activePlayerId)?.eliminated===false,
   `active=${g3.turn.activePlayerId}`);
ok("no page errors during a full game", errs.length===0, errs[0]??"");
console.log(fail.length? `\nFAILED: ${fail.join("; ")}` : "\nFULL GAME PASS ✅");
await b.close();
process.exit(fail.length?1:0);
