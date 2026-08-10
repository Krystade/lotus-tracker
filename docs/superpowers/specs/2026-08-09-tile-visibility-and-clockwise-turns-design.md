# Clockwise turns, tile counter chips, 6/9 disambiguation, prominent detail button

Date: 2026-08-09

Four changes to Lotus Tracker, all driven by one theme: a phone lying flat in the
middle of a table is read at a glance, upside down, by up to six people. Anything
ambiguous or faint at that distance is a defect.

## 1. Clockwise turn order

### Problem

`nextActivePlayerId` walks the `players` array by index. Array index is *not*
seating order. The 4-player preset places p0 top-left, p1 top-right, p2
bottom-left, p3 bottom-right, so passing the turn traverses TL → TR → BL → BR —
a Z-pattern that cuts back across the table instead of going around it.

### Solution

New pure module `src/layout/order.ts`:

```ts
export function clockwiseSeatOrder(layout: LayoutConfig): string[];
```

It reads **only geometry**, never preset identity or array index. That is what
makes custom layouts work with no extra code: a custom layout is the same
`Placement` shape (`row`, `col`, `rowSpan`, `colSpan`, `rotation`) produced by
the grid editor.

Algorithm:

1. Center of each placement: `cx = col + colSpan / 2`, `cy = row + rowSpan / 2`.
2. Centroid = arithmetic mean of all centers.
3. Sort ascending by `atan2(cy - centroidY, cx - centroidX)`.

Step 3 relies on screen coordinates having **y pointing down**, so an increasing
`atan2` angle traverses right → down → left → up, which is visually clockwise.
This is the whole trick; it is worth a comment in the source.

Hand-verified against every built-in preset:

| Pod | Resulting order | Path |
| --- | --- | --- |
| 1 | p0 | trivial |
| 2 | p0 → p1 | top → bottom |
| 3 | p0 → p1 → p2 | TL → TR → bottom |
| 4 | p0 → p1 → **p3 → p2** | TL → TR → BR → BL |
| 5 | p0 → p1 → p3 → p4 → p2 | ring, wide bottom seat 4th |
| 6 | p0 → p1 → p3 → p5 → p4 → p2 | full ring |

### Degenerate cases (explicit rules)

- **Single tile** — return that tile.
- **Equal angles** (two centers collinear with the centroid on the same side) —
  break ties by ascending seat index, so the result is always deterministic.
- **Single row** (all centers share a `cy`) — "clockwise" is undefined on a
  line; fall back to left → right reading order.
- A single column needs no special case: the general algorithm already yields
  top → bottom, which is why the 2-player preset is correct without a rule.

### Threading it through

- `nextActivePlayerId(players, currentId, order)` walks `order` rather than
  array position, still skipping eliminated players and still returning
  `currentId` when everyone else is out.
- `advanceTurn(turn, players, budgetSec, order)` passes it down.
- The store computes the order from `s.game.layout` in `passTurn` and
  `toggleEliminated`. Cost is trivial (≤ 6 items); no memoization.

### Bundled fix

`advanceTurn` currently hardcodes `running: true`, ignoring
`settings.turnTimerEnabled`, while `setActivePlayer` and `resetTurnTimer` both
respect it. With the timer disabled, passing a turn silently arms it. Make
`advanceTurn` respect the setting, consistent with its siblings.

## 2. Clockwise countdown ring on the timer pill

A conic-gradient ring hugging the draggable turn pill, draining clockwise as the
turn budget runs down. Driven by a CSS custom property:

```
--pct: remainingSec / budgetSec
```

Because the ring lives inside the rotated tile, "clockwise from the top" is
clockwise **from that player's own viewpoint**. Rotation preserves handedness,
so no per-rotation correction is needed.

No animation machinery is required. `useTicker` runs at 250 ms, which on a 5:00
budget advances the ring by 1/1200 of its circumference per update — far below
the threshold where stepping is perceptible. Adding a CSS transition would risk
fighting the drag interaction for no visible gain.

The ring must not interfere with dragging: it is decorative, drawn on a
pseudo-element with `pointer-events: none`, so the existing pointer handlers on
the pill are untouched. At expiry it adopts the existing
`tile__pill--expired` red treatment rather than introducing a new color.

## 3. Counter chips on the tile

Today the tile renders exactly one counter, commander tax, via `tile__tax`.
Poison, energy, experience, storm, charge, and custom counters exist only inside
the detail panel — so a player tracking poison has no glanceable indicator.

New `src/components/CounterChips.tsx`, rendered inside `.tile__content` beneath
the life number.

- Shows a chip for every counter with a value **> 0**, including custom
  counters. Zero-valued counters render nothing, so an early-game tile stays
  clean and chips appear as the game develops.
- **Replaces** the standalone `tile__tax` element so tax is not drawn twice.
- Labels follow the existing `TAX 2` style already on the tile, abbreviated so
  up to six fit on a narrow tile: `TAX` · `PSN` · `NRG` · `EXP` · `STM` · `CHG`.
  Custom counters use the first three characters of their name, uppercased.
- Poison takes the existing warning treatment at ≥ 10, matching `crow--warn` in
  the detail panel.
- Non-interactive display only. The tile already has a dedicated control for
  opening the detail panel, so chips do not need their own tap targets — and
  adding them would compete with the life buttons for touch area.

**Out of scope:** commander damage. It is per-opponent and needs the grid to be
meaningful; a single aggregate number on the tile would mislead.

## 4. Underline 6 and 9

Bare numerals are ambiguous when read from a rotated seat: a `6` across the
table is a `9`. Standard dice convention is to underline both.

New `src/components/Digits.tsx`:

```tsx
<Digits value={n} />
```

Splits the rendered string and wraps each `6` and `9` in a span. Styling uses
`border-bottom` rather than `text-decoration: underline`, so thickness and
offset stay controllable at the very large life-total font size, where a default
underline renders too tight to the glyph.

- Applied to: **tile life totals** and the **dice result**.
- Handles multi-digit values (`69`, `96`, `16`) by underlining each ambiguous
  digit independently, and negative life (`-6`).
- **Not** applied to counter chips or turn numbers. Both are short, contextual,
  and adding underlines there would add noise. Trivial to extend later.

## 5. More prominent detail button

`.tile__more` (the `⋯` opening a player's detail panel) is `opacity: 0.6` on a
transparent background with no border, and is easy to miss against a saturated
seat color.

- Translucent scrim background plus a hairline border, so it reads as a control
  rather than decoration.
- Full opacity.
- Tap target to **44×44**; it is currently 44×**40**, under the minimum.
- The scrim must work across all six seat colors. The button already inherits
  `currentColor`, which the tile derives via `textOn`; the scrim is keyed to the
  same light/dark decision so contrast holds on both light and dark seats.

Note: this button opens *that player's* detail panel, not app settings. App
settings remain behind the center hex menu. No change to what it does.

## Testing

**Unit (Vitest)**

- `clockwiseSeatOrder` across all six built-in presets, asserting the exact
  orders tabulated above.
- `clockwiseSeatOrder` degenerate cases: single tile, single row, collinear
  centers, and a custom (non-preset) layout.
- `nextActivePlayerId` honoring the supplied order, skipping eliminated seats,
  and wrapping.
- `advanceTurn` respecting `turnTimerEnabled`.
- `Digits` splitting: `6`, `9`, `69`, `16`, `-6`, `40` (no underline).

**Component (Testing Library)**

- `CounterChips` renders nothing when all counters are zero; renders only
  non-zero ones; applies the warning class at 10 poison.

**End-to-end (Playwright, `scripts/live-check.mjs`)**

- Clockwise pass asserted on a 4-pod (`p0 → p1 → p3 → p2`) and a 6-pod.
- Chips appear on the tile after setting a counter and disappear at zero.
- Underline spans present in the life total and dice result.
- Detail button hit target measures ≥ 44×44.

## Known follow-ups (deliberately not in this change)

- `RandomFirstOverlay` and the commander-damage grid still list seats in array
  order. Once turns run clockwise these read inconsistently. Worth a follow-up,
  but changing them is a separate design question about whether seat *display*
  order should track seat *turn* order everywhere.
- `tsconfig.tsbuildinfo` is tracked in git and should be ignored.
