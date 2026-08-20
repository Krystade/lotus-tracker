// A wall of real tiles, rendered by the real app CSS, so two-colour looks can
// be judged rather than assumed. Renders one row per style, one column per mix
// step, at tile scale.
import { chromium } from "@playwright/test";

const BASE = process.argv[2] || "http://localhost:5180/lotus-tracker/";
const A = process.env.A || "blue";
const B = process.env.B || "red";
const STYLES = (process.env.STYLES || "fade,stripe,drift,lava,nebula,tide,pulse")
  .split(",");
const MIXES = [0, 25, 50, 75, 100];

const b = await chromium.launch();
const page = await (
  await b.newContext({ viewport: { width: 1180, height: 1500 }, deviceScaleFactor: 2 })
).newPage();
await page.goto(BASE);
await page.waitForSelector(".tile__life", { timeout: 15000 });

// Build the grid inside the running app so it inherits styles.css exactly.
await page.evaluate(
  ({ a, bb, styles, mixes }) => {
    document.querySelector(".app").style.display = "none";
    const wrap = document.createElement("div");
    wrap.id = "grid";
    wrap.style.cssText =
      "position:fixed;inset:0;overflow:auto;background:#0b0b0d;padding:14px;" +
      "display:grid;gap:8px;grid-template-columns:74px repeat(" +
      mixes.length +
      ",1fr);align-items:center;font:600 11px system-ui;color:#8a8a90";
    const cell = (html) => {
      const d = document.createElement("div");
      d.innerHTML = html;
      return d;
    };
    wrap.appendChild(cell(""));
    for (const m of mixes) wrap.appendChild(cell(`mix ${m}%`));
    for (const st of styles) {
      wrap.appendChild(cell(st));
      for (const m of mixes) {
        const id = `${a}~${bb}@${m}-${st}`;
        const holder = document.createElement("div");
        holder.dataset.look = id;
        holder.style.cssText = "aspect-ratio:3/4;position:relative";
        wrap.appendChild(holder);
      }
    }
    document.body.appendChild(wrap);
  },
  { a: A, bb: B, styles: STYLES, mixes: MIXES },
);

// Mount a real PlayerTile-shaped node per cell using the app's own resolver,
// reached through the dev-only store module rather than reimplemented here.
await page.evaluate(() => {
  const holders = [...document.querySelectorAll("[data-look]")];
  for (const h of holders) {
    const tile = document.createElement("div");
    tile.className = "tile look";
    tile.style.cssText = "position:absolute;inset:0";
    const layers = document.createElement("div");
    layers.className = "tile__look";
    const life = document.createElement("div");
    life.className = "tile__life";
    life.textContent = "34";
    life.style.cssText =
      "position:absolute;inset:0;display:grid;place-items:center;" +
      "font:800 2rem/1 system-ui;z-index:2";
    tile.append(layers, life);
    h.appendChild(tile);
  }
});

// Apply each look's resolved vars, using the app's resolveLook via the store's
// module graph (exposed in dev alongside __store).
const applied = await page.evaluate(async () => {
  const mod = await import("/lotus-tracker/src/layout/looks.ts");
  const col = await import("/lotus-tracker/src/layout/colors.ts");
  mod.textOn = col.textOn;
  const out = [];
  for (const h of document.querySelectorAll("[data-look]")) {
    const look = mod.resolveLook(h.dataset.look, "#888888");
    const tile = h.firstChild;
    tile.dataset.style = look.styleId;
    for (const [k, v] of Object.entries(look.vars)) tile.style.setProperty(k, v);
    // No inline background: .look already paints var(--look-base), and an
    // inline one outranks the fade/stripe gradient rules, which is what made
    // those two rows render flat.
    const layers = tile.querySelector(".tile__look");
    layers.innerHTML = "<span></span>".repeat(look.layers);
    tile.style.color = mod.textOn ? mod.textOn(look.base) : "#fff";
    out.push(`${h.dataset.look}=${look.vars["--look-hi"]}`);
  }
  return out;
});
console.log(`${applied.length} cells`);
console.log(applied.slice(0, 5).join("\n"));

await page.waitForTimeout(900);
await page.screenshot({ path: `screenshots/lookgrid-${A}-${B}.png`, fullPage: true });
await b.close();
