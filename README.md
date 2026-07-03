# Lotus Tracker

A Magic: The Gathering **Commander/EDH life & turn tracker**, built as an installable, offline PWA. The phone lies flat in the middle of the table and each player's tile rotates to face their seat.

## Features

- **1–6 players** in colored tiles, each rotated toward its seat.
- **Life:** tap the − / + near each number for ±1; press-and-hold for ±10.
- **Counters:** commander tax, poison, energy, experience, storm, charge, plus custom counters.
- **Commander damage:** per-opponent grid; auto-flags lethal at 21 (and 10 poison, life ≤ 0). Taking commander damage also reduces life.
- **Count-down turn timer:** each turn starts at a budget (default 5:00) and counts down. Tap the timer pill (or the menu) to pass the turn; it resets for the next player. At 0:00 it turns red and beeps/vibrates. **Drag the pill** to reposition it — remembered per player.
- **Adjustable turn-timer size** and a total game clock.
- **Layouts:** presets for 1–6 players plus a grid-snap **custom editor** (assign seats to cells, set each tile's facing, save your own presets).
- **Starting life:** 20 / 30 / 40 / custom.
- **Table-friendly:** keeps the screen awake, works fully **offline**, remembers your game across refreshes, and guards destructive resets.

## Develop

```bash
npm install
npm run dev        # http://localhost:5180 (exposed on the LAN for phone testing)
```

Add it to your phone's home screen (Share → Add to Home Screen) for a full-screen, installable app.

## Build

```bash
npm run build      # type-checks, builds, and generates the service worker
npm run preview    # serve the production build
```

## Testing

Unit tests (Vitest) cover the pure game logic — life math, turn advancement, lethal thresholds, and alert safety:

```bash
npm test
```

Playwright harnesses (in `scripts/`) drive the real app at phone sizes and assert behavior, not just pixels:

| Script | What it verifies |
| --- | --- |
| `scenarios.mjs` | Every player count + lethal/big-number/expired states across 3 device sizes; zero console errors. |
| `overlays.mjs` | Settings / Layout / New game / Player detail render and fit at 13 mini + SE. |
| `interact-check.mjs` | Tap ±1, hold behavior, tap-to-pass-turn. |
| `drag-check.mjs` | Turn-timer drag repositions and persists across reload. |
| `layout-check.mjs` | Custom editor applies and saves layouts. |
| `reset-check.mjs` | "Reset life" requires a confirming second tap. |
| `pwa-check.mjs` | Manifest + icons, service worker control, and offline reload (run against `preview`). |
| `gen-icons.mjs` | Regenerates the PNG app icons from an SVG. |

Screenshots land in `screenshots/<engine>/<device>/` (gitignored). Run with `BROWSER=webkit` to use Safari's engine.

## Stack

React + TypeScript + Vite, Zustand (state + localStorage persistence), `vite-plugin-pwa` (Workbox service worker), self-hosted Baloo 2 font. No backend — everything runs on-device.

## Project layout

```
src/
  state/      store (zustand) + types
  game/       pure logic: life, turn, lethal thresholds
  layout/     presets, colors
  hooks/      ticker, wake lock, hold-to-repeat
  components/ Board, PlayerTile, CenterMenu, PlayerDetail, NewGameScreen,
              SettingsPanel, LayoutPicker
  util/       formatting, audio/vibration alerts, ids
scripts/      Playwright verification harnesses
```
