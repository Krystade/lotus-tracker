// Ranks candidate animated-background techniques by cost, with six tiles at a
// phone viewport — the worst case for this app.
//
// This runs on desktop Chromium, so the absolute numbers are NOT phone numbers.
// What it gives is the *relative* main-thread and raster cost between
// techniques, which is what the choice hinges on.
import { chromium } from "@playwright/test";

const TECHNIQUES = {
  // Baseline: today's flat colour, no animation at all.
  static: {
    css: `.t{background:#3E92CC}`,
    html: ``,
  },
  // Animating background-position repaints the tile every frame.
  gradientPos: {
    css: `.t{background:linear-gradient(135deg,#3E92CC,#1b4c6d,#3E92CC);background-size:400% 400%;animation:gp 12s ease-in-out infinite}
          @keyframes gp{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}`,
    html: ``,
  },
  // An oversized gradient layer moved with transform only: compositor work,
  // no repaint.
  transformSwirl: {
    css: `.t{background:#1b4c6d;position:relative;overflow:hidden}
          .t i{position:absolute;inset:-60%;background:conic-gradient(from 0deg,#3E92CC,#1b4c6d,#5fb3e8,#1b4c6d,#3E92CC);animation:sw 18s linear infinite;will-change:transform}
          @keyframes sw{to{transform:rotate(360deg)}}`,
    html: `<i></i>`,
  },
  // Two soft blobs drifting: also transform-only, reads more like smoke.
  transformBlobs: {
    css: `.t{background:#1b4c6d;position:relative;overflow:hidden}
          .t i,.t u{position:absolute;width:140%;height:140%;border-radius:50%;filter:blur(28px);will-change:transform}
          .t i{background:radial-gradient(circle,#5fb3e8,transparent 60%);animation:b1 15s ease-in-out infinite}
          .t u{background:radial-gradient(circle,#2b6f9e,transparent 60%);animation:b2 21s ease-in-out infinite}
          @keyframes b1{0%,100%{transform:translate(-25%,-20%)}50%{transform:translate(10%,15%)}}
          @keyframes b2{0%,100%{transform:translate(15%,20%)}50%{transform:translate(-20%,-15%)}}`,
    html: `<i></i><u></u>`,
  },
  // Real fractal noise. The genuine "smoke" look, and the expensive one.
  svgTurbulence: {
    css: `.t{background:#1b4c6d;position:relative;overflow:hidden}
          .t svg{position:absolute;inset:0;width:100%;height:100%}`,
    html: `<svg><filter id="f%I%"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="%I%">
             <animate attributeName="baseFrequency" dur="20s" values="0.012;0.02;0.012" repeatCount="indefinite"/>
           </feTurbulence><feColorMatrix type="matrix" values="0 0 0 0 0.24  0 0 0 0 0.57  0 0 0 0 0.80  0 0 0 -0.7 0.7"/></filter>
           <rect width="100%" height="100%" filter="url(#f%I%)"/></svg>`,
  },
  // Same drifting blobs, no blur — isolates blur as the cost driver.
  blobsNoBlur: {
    css: `.t{background:#1b4c6d;position:relative;overflow:hidden}
          .t i,.t u{position:absolute;width:150%;height:150%;border-radius:50%;will-change:transform}
          .t i{background:radial-gradient(circle,#5fb3e8 0%,transparent 62%);animation:b1 15s ease-in-out infinite}
          .t u{background:radial-gradient(circle,#2b6f9e 0%,transparent 62%);animation:b2 21s ease-in-out infinite}
          @keyframes b1{0%,100%{transform:translate(-25%,-20%)}50%{transform:translate(10%,15%)}}
          @keyframes b2{0%,100%{transform:translate(15%,20%)}50%{transform:translate(-20%,-15%)}}`,
    html: `<i></i><u></u>`,
  },
  // Static noise texture over a moving gradient: texture without per-frame noise.
  staticNoiseSwirl: {
    css: `.t{background:#1b4c6d;position:relative;overflow:hidden}
          .t i{position:absolute;inset:-60%;background:conic-gradient(from 0deg,#3E92CC,#1b4c6d,#5fb3e8,#1b4c6d,#3E92CC);animation:sw 18s linear infinite;will-change:transform}
          .t svg{position:absolute;inset:0;width:100%;height:100%;opacity:.22;mix-blend-mode:overlay}
          @keyframes sw{to{transform:rotate(360deg)}}`,
    html: `<i></i><svg><filter id="n%I%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/></filter><rect width="100%" height="100%" filter="url(#n%I%)"/></svg>`,
  },
  // Two counter-rotating conic layers: reads as slow swirling smoke.
  dualSwirl: {
    css: `.t{background:#1b4c6d;position:relative;overflow:hidden}
          .t i,.t u{position:absolute;inset:-60%;will-change:transform}
          .t i{background:conic-gradient(from 0deg,#3E92CC,transparent 40%,#5fb3e8,transparent 75%,#3E92CC);animation:sw 22s linear infinite}
          .t u{background:conic-gradient(from 180deg,transparent,#1b4c6d 30%,transparent 60%);animation:sw2 31s linear infinite;opacity:.75}
          @keyframes sw{to{transform:rotate(360deg)}}
          @keyframes sw2{to{transform:rotate(-360deg)}}`,
    html: `<i></i><u></u>`,
  },
};

const page_html = (name) => {
  const t = TECHNIQUES[name];
  const tiles = Array.from({ length: 6 }, (_, i) =>
    `<div class="t">${t.html.replaceAll("%I%", String(i))}</div>`,
  ).join("");
  return `<!doctype html><meta name=viewport content="width=device-width">
  <style>
    html,body{margin:0;height:100%;background:#000}
    .board{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(3,1fr);gap:8px;height:100%;padding:6px;box-sizing:border-box}
    .t{border-radius:22px;overflow:hidden}
    ${t.css}
  </style><div class="board">${tiles}</div>`;
};

const b = await chromium.launch();
console.log("6 tiles, CPU throttled 6x, 5s window - all times are ms of main-thread work");
console.log("");
console.log("technique        avg fps  min fps  cpu(task)  script   layout  recalcSty");
for (const name of Object.keys(TECHNIQUES)) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  // Approximate a mid-range phone: the desktop CPU hides every difference.
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  await cdp.send("Performance.enable");
  await p.setContent(page_html(name));
  await p.waitForTimeout(900); // let animations settle
  const before = Object.fromEntries(
    (await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]),
  );

  const r = await p.evaluate(async () => {
    let long = 0;
    const po = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) long += e.duration;
    });
    try { po.observe({ entryTypes: ["longtask"] }); } catch { /* not supported */ }

    const deltas = [];
    let last = performance.now();
    const started = last;
    await new Promise((res) => {
      const tick = (now) => {
        deltas.push(now - last);
        last = now;
        if (now - started > 5000) return res();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    po.disconnect();
    deltas.shift();
    const fps = deltas.map((d) => 1000 / d);
    const avg = fps.reduce((a, c) => a + c, 0) / fps.length;
    const min = Math.min(...fps);
    const heap = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0;
    return { avg, min, frames: deltas.length, long, heap };
  });

  const after = Object.fromEntries(
    (await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]),
  );
  const d = (k) => ((after[k] ?? 0) - (before[k] ?? 0)) * 1000; // ms
  console.log(
    `${name.padEnd(16)} ${r.avg.toFixed(1).padStart(7)} ${r.min.toFixed(1).padStart(8)} ` +
    `${d("TaskDuration").toFixed(0).padStart(9)} ${d("ScriptDuration").toFixed(0).padStart(8)} ` +
    `${d("LayoutDuration").toFixed(0).padStart(8)} ${d("RecalcStyleDuration").toFixed(0).padStart(9)}`,
  );
  await ctx.close();
}
await b.close();
