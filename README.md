# Lotus Tracker

A Magic: The Gathering **Commander/EDH life & turn tracker**, built as an installable, offline PWA. The phone lies flat in the middle of the table and each player's tile rotates to face their seat.

## Features

- **1–6 players** in colored tiles, each rotated toward its seat.
- **Life:** tap the − / + near each number for ±1; press-and-hold for ±10. Rapid taps accumulate into a **"+3 / −5" swing chip** you can tap to **undo** a mis-tap.
- **Counters:** commander tax, poison, energy, experience, storm, charge, plus custom counters. Anything above zero shows as a chip on the tile itself, so you can read a pod's poison without opening a panel.
- **Commander damage:** per-opponent grid; auto-flags lethal at 21 (and 10 poison, life ≤ 0). Taking commander damage also reduces life. A lethal tile shows a tappable **skull with the cause** (POISON / CMDR / DEAD) that one-taps eliminate.
- **Turns:** the active player has an always-on ring, and the turn passes **clockwise around the table** — seat order is derived from where tiles sit in the layout, so custom arrangements pass correctly too. **Count-down timer** (default 5:00) — tap the pill (or the menu) to pass; the pill's rim drains clockwise as the turn runs down, and at 0:00 it turns red and beeps/vibrates. **Drag the pill** to reposition it (remembered per player). **Long-press** any tile to make it active (fix a mis-pass). Last player standing gets a **🏆 WINS** badge.
- **Adjustable turn-timer size** and a total game clock (rolls to h:mm:ss).
- **Readable from every seat:** 6 and 9 are underlined on life totals and dice, the standard convention for numbers read upside down across a table.
- **Layouts:** presets for 1–6 players plus a grid-snap **custom editor** (assign seats to cells, set each tile's facing, save your own presets; invalid paintings are rejected).
- **Starting life:** 20 / 30 / 40 / custom.
- **From the center menu:** a **dice roller** (d4–d20 + coin) and **random first player** (a spin that lands on a seat and starts their turn). **Player names** are optional (edit in a tile's detail panel; default stays color-only) and show in the commander-damage grid ("from Jack").
- **Installable PWA:** keeps the screen awake, works fully **offline** (service worker), safe-area aware, remembers your game across refreshes (resilient to storage failures), guards destructive resets, and honors reduced-motion.

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
| `swing-check.mjs` / `swing-edge-check.mjs` | Swing chip + undo, incl. clamp-safe undo and external-change cancel. |
| `drag-check.mjs` | Turn-timer drag repositions and persists across reload. |
| `set-active-check.mjs` | Long-press a tile sets it active. |
| `winner-check.mjs` | Last-player-standing WINS badge. |
| `layout-check.mjs` / `layout-invalid-check.mjs` | Custom editor applies/saves; rejects invalid paintings. |
| `reset-check.mjs` | "Reset life" requires a confirming second tap. |
| `features-check.mjs` | Dice roll, random-first-player spin, and player-name editing. |
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
