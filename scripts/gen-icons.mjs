// Rasterizes the app icon to PNGs using Playwright (no native image deps).
import { chromium } from "@playwright/test";

const icon = (bg) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${bg}"/>
  <g fill="#f0356b" transform="translate(0,-34) scale(0.86) translate(41,41)">
    <path d="M256 88c34 54 34 108 0 162-34-54-34-108 0-162z"/>
    <path d="M180 150c58 20 86 66 92 128-62-6-108-42-124-100 10-10 21-19 32-28z"/>
    <path d="M332 150c-58 20-86 66-92 128 62-6 108-42 124-100-10-10-21-19-32-28z"/>
    <path d="M120 250c60 6 100 40 116 98-64 8-116-16-148-70 8-10 19-19 32-28z"/>
    <path d="M392 250c-60 6-100 40-116 98 64 8 116-16 148-70-8-10-19-19-32-28z"/>
  </g>
  <text x="256" y="418" font-family="Arial, Helvetica, sans-serif" font-size="150"
        font-weight="800" fill="#ffffff" text-anchor="middle">40</text>
</svg>`;

const OUT = "public";
const targets = [
  { file: "pwa-192.png", size: 192, bg: "#0a0a0a" },
  { file: "pwa-512.png", size: 512, bg: "#0a0a0a" },
  { file: "maskable-512.png", size: 512, bg: "#0a0a0a" },
  { file: "apple-touch-icon.png", size: 180, bg: "#0a0a0a" },
];

const b = await chromium.launch();
const page = await b.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<body style="margin:0;padding:0">${icon(t.bg).replace(
      'width="512" height="512"',
      `width="${t.size}" height="${t.size}"`,
    )}</body>`,
  );
  await page.waitForTimeout(50);
  await page.screenshot({ path: `${OUT}/${t.file}`, clip: { x: 0, y: 0, width: t.size, height: t.size } });
  console.log(`wrote ${OUT}/${t.file} (${t.size}px)`);
}
await b.close();
