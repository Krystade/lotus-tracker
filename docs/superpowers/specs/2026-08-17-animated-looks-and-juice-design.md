# Animated tile looks, a two-axis look picker, and juice recalibration

Date: 2026-08-17

## 1. Scope

Three connected pieces of work:

1. **Animated tile backgrounds** — eight new animated styles alongside the
   three static ones that ship today.
2. **A two-axis look picker** — the flat swatch grid does not survive the
   catalogue growing from 18 entries to 66.
3. **Juice recalibration** — the damage/heal/death feedback is not noticeable
   enough, and the reason is structural rather than a matter of duration.

"Complete UX/UI design" is scoped here to *these three pieces and everything
they touch* — the picker, the settings that govern them, migration of saved
data, and the contrast guarantee they must not break. It is not a redesign of
the board, the detail panel, or the centre menu; nothing in this document
changes how life is adjusted or turns are passed.

### 1.1 Assumptions made in the author's absence

These were decided rather than asked. Each is cheap to reverse.

| # | Assumption | Why |
| --- | --- | --- |
| A1 | Juice lands at **330 / 500 / 780 ms** | Midpoint between today's 260/400/650 and the rejected 400/600/900 |
| A2 | Wash opacities move to **0.50 / 0.66 / 0.83** | Same midpoint treatment as the durations |
| A3 | Every animated style is offered in **all six hues** | Restricting styles to certain hues would be arbitrary and hard to explain |
| A4 | The picker becomes **hue row + style row**, not a 66-cell grid | 17 controls instead of 66; the style row previews in the chosen hue |
| A5 | Battery saver is a **single setting that freezes all animation** | Simplest control that addresses the real cost; no per-tile granularity |
| A6 | Animation is **on by default** | The feature is the point; the toggle exists for long games |
| A7 | Eliminated tiles **stop animating** | They are dimmed and out of play; free saving |
| A8 | Existing look ids stay valid | `blue`, `blue-fade`, `blue-stripe` already parse under the new scheme |
| A9 | **Smoke and Marble ship behind on-device verification** | Their cost measurement is the one I do not trust (see §3.2) |

## 2. Problem

**Backgrounds.** Tiles are flat colour, one gradient, or diagonal stripes. The
app is a phone lying flat among up to six people for two hours; there is room
for the tiles to feel alive without becoming noisy.

**Juice.** The damage/heal/death feedback shipped previously "wasn't noticed at
first". That is not primarily a duration problem — see §5.1.

## 3. What the research established

### 3.1 Cost, measured

Six tiles animating simultaneously at a phone viewport, CPU throttled 6×, five
second window, main-thread task time:

| Technique | CPU | Min fps | vs static |
| --- | --- | --- | --- |
| static | 103 ms | 59.5 | 1.0× |
| blobs, no blur | 278 ms | 59.5 | 2.7× |
| swirl + static noise | 281 ms | 59.5 | 2.7× |
| SVG turbulence | 296 ms | 59.5 | 2.9× |
| conic swirl | 302 ms | 59.5 | 2.9× |
| animated background-position | 310 ms | 59.5 | 3.0× |
| dual counter-swirl | 368 ms | 59.5 | 3.6× |
| **blobs with `filter: blur()`** | **456 ms** | **29.9** | 4.4× |

Two conclusions that constrain the design:

- **`filter: blur()` is banned.** It was the only variant to drop frames, and
  removing it cut cost by 39%. Soft edges come from `radial-gradient` falloff
  instead, which costs nothing extra.
- **Everything else costs about the same**, within run-to-run noise. The choice
  between the remaining techniques is therefore aesthetic, not performance
  driven.

### 3.2 The measurement I do not trust

This ran in headless desktop Chromium with software rasterisation. On a real
phone the GPU composites transforms almost free while SVG filters still cost —
so this environment **flatters `feTurbulence`**. Smoke and Marble are the only
two candidates built on it. They ship behind an on-device check (§10, task 9.3)
rather than on the strength of a number I know to be biased.

### 3.3 What looking at them established

Rotations were built, measured, published, and rejected on sight. The principle
that came out of it, which the catalogue is now designed around:

> **Rotation reads mechanical; translation, scale and noise read organic.**
> A rotating element has a fixed pivot the eye locks onto. Translation on
> mismatched periods gives nothing to track.

This is why Lava uses three periods of 29 / 41 / 53 s: co-prime-ish durations
mean the composite never visibly repeats, so it never resolves into a loop.

Cut, with reasons worth keeping so they are not re-attempted:

| Cut | Why |
| --- | --- |
| Swirl, Aurora, Ember | Conic gradients rotating — visible pivot, mechanical |
| Haze | Horizontal banding read as a rendering artifact |
| Bloom | Radial falloff too tight; read as four discrete circles, not a field |

## 4. The look system

### 4.1 Two-axis model

A look is a **hue** crossed with a **style**. Today's flat list of 18 becomes
6 × 11 = 66 combinations, which is only tractable because the user never sees
66 of anything (§6).

**Hues** (unchanged, from `PLAYER_COLORS`): gold, blue, magenta, red, green,
purple.

**Styles**:

| Style | Kind | Motion | Notes |
| --- | --- | --- | --- |
| `solid` | static | — | Today's default |
| `fade` | static | — | Linear gradient |
| `stripe` | static | — | Diagonal repeating |
| `lava` | animated | 3 ellipses translating, 29/41/53 s | Slowest, most liquid |
| `ribbons` | animated | 3 vertical bands, translate + skew, 17/23/29 s | Aurora without rotation |
| `nebula` | animated | 3 circles translate + scale, 23/31/37 s | Layered depth |
| `drift` | animated | 2 circles translating, 16/23 s | Simplest, cheapest |
| `tide` | animated | 2 ellipses rising/falling, 21/33 s | Slow swell |
| `pulse` | animated | 2 concentric circles scaling, 9/14 s | **Centred**; beats against itself |
| `smoke` | animated | fixed turbulence field translating, 46 s | Verify on device |
| `marble` | animated | fixed turbulence field scaling, 60 s | Verify on device |

### 4.2 Identifier scheme and back-compat

Look ids are `hue` or `hue-style`:

- `blue` → hue blue, style `solid`
- `blue-fade`, `blue-stripe` → existing, unchanged
- `blue-lava`, `blue-ribbons`, … → new

**Every id already stored on a player or profile remains valid**, because the
old ids are exactly the `solid` / `fade` / `stripe` cases of the new scheme.
No migration step, no version bump.

Parsing rule: split on the first `-`; absent a suffix, style is `solid`. An
unknown hue or style falls back to the player's seat colour as a flat fill —
the same fallback `resolveLook` already performs.

### 4.3 The contrast guarantee

The existing guarantee must survive: **text contrast is computed from a
declared base colour, never from rendered pixels.** Animated layers therefore
carry a constraint:

> Every layer within a style must stay within roughly ±25% relative luminance
> of the hue's base. No layer may approach white or black.

That is what keeps `textOn(hue.base)` correct for an animated tile. It is a
rule about the catalogue, enforced by a test (§9.2), not a property to be
re-derived per frame.

### 4.4 Rendering architecture

A style renders as **0–3 absolutely positioned layers** inside the tile, plus
the tile's own base background.

```
.tile                     background: <hue base>
  └─ .tile__look          z-index 0   (the animated layers live here)
       ├─ span.l1
       ├─ span.l2
       └─ span.l3
  └─ .tile__fx (::after)  z-index 0   damage/heal/death wash
  └─ .tile__content       z-index 1+  life total, chips, pill, detail button
```

Constraints this layout satisfies:

- Look layers sit **beneath every child**, so the life total, counter chips,
  turn pill and detail button stay crisp — the same ordering fix the juice wash
  already required.
- The look element is **outside** `.tile__content`, so it does not rotate with
  the seat. A background has no orientation; rotating it would only cost
  compositing work.
- `overflow: hidden` on `.tile` clips oversized layers; layers are sized
  120–190% deliberately so their edges never enter frame.
- Layers are inert: `pointer-events: none`, `aria-hidden`.

Styles are expressed as CSS classes keyed off a data attribute
(`data-style="lava"`) with the hue supplied as custom properties
(`--look-base`, `--look-lo`, `--look-hi`) so one rule set serves all six hues.
This is what keeps 66 combinations from becoming 66 rule sets.

### 4.5 Performance and battery

| Control | Behaviour |
| --- | --- |
| `animateLooks` setting | On by default. Off freezes every animated layer. |
| Eliminated tiles | Always frozen — dimmed and out of play. |
| Document hidden | Frozen on `visibilitychange`. |
| `prefers-reduced-motion` | Frozen; the static composition still renders. |

Freezing is a single class on the app root driving
`animation-play-state: paused`, not unmounting layers — so resuming is instant
and no layout is recomputed.

**Honest note on battery:** an always-on screen dominates power draw in this
app; the wake lock is on by default and a game runs for hours. Animation adds
roughly 3× the *main-thread* cost of static tiles, but main-thread cost is a
small fraction of what the display itself is consuming. The toggle exists
because that claim is a reasoned estimate, not a measurement on a phone, and
the user should be able to overrule it.

## 5. Juice recalibration

### 5.1 The actual defect

The current wash animates:

```
0%   { opacity: var(--fx-wash) }   /* starts at peak */
100% { opacity: 0 }
```

It begins at full strength on the first frame and decays immediately. There is
**no interval during which the flash is at full strength** — the peak is
instantaneous. At 260 ms the eye has nothing to catch. Lengthening the duration
alone would have produced a longer fade from an instant that was still never
held.

### 5.2 The fix: ramp, hold, release

```
0%   { opacity: 0 }
10%  { opacity: var(--fx-wash) }   /* ramp in */
44%  { opacity: var(--fx-wash) }   /* hold */
100% { opacity: 0 }                /* release */
```

The hold is a third of the duration. This is the change that makes the effect
register; the timing change below is secondary.

### 5.3 Timings

| Tier | Trigger | Today | New | Wash today → new |
| --- | --- | --- | --- | --- |
| 1 | tap, 1–2 life | 260 ms | **330 ms** | 0.40 → **0.50** |
| 2 | 3–9 life | 400 ms | **500 ms** | 0.55 → **0.66** |
| 3 | 10+ life, or death | 650 ms | **780 ms** | 0.72 → **0.83** |

Kick (life-total scale): damage 0.92 / 0.84 / 0.74; heal 1.20 at every tier.
Death adds a shake — translate plus sub-degree rotation, peaking at 5 px.

**Ceiling:** tier 3 must stay under about 1.4 s. Beyond that a press-and-hold
(which steps every ~120 ms) queues effects faster than they finish and they
visibly stack. 780 ms leaves comfortable headroom.

### 5.4 Unchanged

Haptics, the intensity tiers themselves, and `feedbackFor`'s rules — death
outranking the life change that caused it, firing only on the crossing, and
staying silent for a single-point heal — are all correct and stay as they are.

## 6. Look picker UX

### 6.1 Why it must change

The current picker is one grid of 18 swatches inside the player editor. At 66
it becomes an unusable wall, and the animated ones cannot be told apart at
swatch size.

### 6.2 Proposed layout

```
┌─────────────────────────────────────┐
│  Jack                          [×]  │
│  ┌───────────────────────────────┐  │
│  │                               │  │
│  │           40                  │  │   live preview, ~16:10
│  │                               │  │   the real look, animating
│  └───────────────────────────────┘  │
│                                     │
│  COLOUR                             │
│  ● ● ● ● ● ●                        │   6 hue dots
│                                     │
│  STYLE                              │
│  ▢ ▢ ▢ ▢ ▢ ▢                        │   11 style swatches,
│  ▢ ▢ ▢ ▢ ▢                          │   each in the chosen hue
└─────────────────────────────────────┘
```

- **Live preview** renders the actual selected combination at a size where
  motion is legible. A 40 px swatch cannot convey Lava; a preview can.
- **Colour row** — six dots, selected state ringed.
- **Style row** — eleven swatches, each rendered *in the currently selected
  hue*, so changing hue re-skins the whole row. Animated styles animate in the
  swatch; at that size they read as texture, which is enough to distinguish
  them once the preview carries the detail.
- Style swatches are labelled by name for assistive tech; the visual is the
  label for sighted users.

### 6.3 Interaction detail

| Concern | Decision |
| --- | --- |
| Default selection | Player's current look, or the seat's hue in `solid` |
| Changing hue | Style is preserved |
| Changing style | Hue is preserved |
| Commit | On Save, as today — the preview is not a live write |
| Keyboard | Both rows are button groups; visible focus ring already global |
| Touch targets | Hue dots 44×44 minimum; style swatches 44×44 minimum |
| Reduced motion | Preview and swatches render their static composition |

### 6.4 Where it lives

Unchanged: inside the player editor in the New game screen, which is where
profiles are already created and edited. No new entry point, no new menu row.

## 7. Settings changes

One new row in the existing Settings panel, beneath "Damage & heal effects":

- **Animated backgrounds** — on by default. Off freezes all look animation.

`Settings` gains `animateLooks: boolean`. The persistence merge already
deep-fills unknown fields from defaults, so an older saved state loads with it
enabled and no migration is required.

## 8. Data model changes

```ts
// types.ts
interface Settings {
  …
  animateLooks: boolean;   // new
}
```

`Player.look` and `PlayerProfile.look` are unchanged in type and meaning; only
the set of valid values grows. No store action signatures change.

New module `src/layout/looks.ts` grows a style table; the existing `Look`
interface gains a `style` and a `layers` description. `resolveLook` keeps its
signature and its fallback behaviour.

## 9. Testing

### 9.1 Unit — look catalogue

- Every hue × style combination resolves to a `Look`.
- Legacy ids (`blue`, `blue-fade`, `blue-stripe`) still resolve, to the same
  base colour they resolve to today.
- Unknown hue, unknown style, empty string and `undefined` all fall back to the
  flat player colour.
- Style ids are unique; hue ids are unique.

### 9.2 Unit — the contrast guarantee

- For every look in the catalogue, `textOn(look.base)` returns a colour whose
  contrast ratio against `base` clears 4.5:1.
- For every animated style, every declared layer colour sits within the
  luminance band of §4.3. **This is the test that stops a future style from
  silently breaking legibility.**

### 9.3 Unit — juice

- The tier table returns the new durations and washes.
- The keyframe hold fraction is asserted, since it is the thing that makes the
  effect work and the thing most likely to be "tidied" away later.

### 9.4 Component

- A tile with an animated look renders the expected layer count.
- With `animateLooks: false`, the paused class is applied.
- An eliminated tile is paused regardless of the setting.
- The picker: changing hue preserves style; changing style preserves hue.

### 9.5 Harness (Playwright, against the built app)

- Each animated style renders its layers and none escape the tile bounds.
- The life total's computed colour is unchanged by switching to an animated
  look — the contrast guarantee, verified end to end rather than only in unit.
- Battery-saver toggle actually halts animation (`getAnimations()` playState).
- Existing 14 harnesses continue to pass.

### 9.6 Visual

Film every style across its full cycle and **look at the frames** before
shipping. This is not optional and is why three styles were cut; the previous
round shipped rotations that had been measured but never watched.

### 9.7 On-device

Smoke and Marble measured on an actual handset before they are offered
(assumption A9). If either is materially worse than the transform-based styles,
it is cut rather than shipped with a warning.

## 10. Work breakdown

Ordered; each item is independently verifiable.

**Phase 1 — catalogue foundation**

1.1 Extend `looks.ts` with the hue table and a style table.
1.2 Implement id parsing (`hue`, `hue-style`) with legacy support.
1.3 Implement `resolveLook` against the new model, preserving its fallback.
1.4 Unit tests §9.1.
1.5 Luminance-band helper plus the contrast tests §9.2.

**Phase 2 — static styles on the new model**

2.1 Re-express `solid`, `fade`, `stripe` as styles driven by hue custom
    properties.
2.2 Verify existing saved games and profiles render identically to today
    (screenshot comparison against the current build).

**Phase 3 — tile rendering**

3.1 Add the `.tile__look` layer container beneath tile content.
3.2 Wire `data-style` and the hue custom properties from the resolved look.
3.3 Confirm z-order against life total, chips, pill and detail button.
3.4 Component tests §9.4 (layer count).

**Phase 4 — animated styles, one at a time**

Each substep is: write the CSS, film the cycle, look at it, keep or discard.

4.1 `drift` · 4.2 `lava` · 4.3 `nebula` · 4.4 `ribbons` · 4.5 `tide` ·
4.6 `pulse` (centred) · 4.7 `smoke` · 4.8 `marble`

**Phase 5 — motion governance**

5.1 `animateLooks` setting: type, default, Settings row.
5.2 Paused class on the app root; wire the setting.
5.3 Pause on eliminated tiles.
5.4 Pause on `visibilitychange`.
5.5 `prefers-reduced-motion` handling.
5.6 Tests §9.4.

**Phase 6 — the picker**

6.1 Live preview component.
6.2 Hue row.
6.3 Style row, re-skinning with the selected hue.
6.4 Preserve-the-other-axis behaviour.
6.5 Touch targets and assistive-tech labels.
6.6 Component tests §9.4 (picker).

**Phase 7 — juice**

7.1 Retune the tier variables to §5.3.
7.2 Replace the wash keyframes with ramp/hold/release.
7.3 Death shake.
7.4 Tests §9.3.

**Phase 8 — verification**

8.1 Full unit suite.
8.2 All 14 existing harnesses on a dev server.
8.3 New harness checks §9.5.
8.4 Film every style; review the frames.
8.5 Deploy; live-check both engines; PWA/offline; full-game harness.

**Phase 9 — post-deploy**

9.1 Screenshot the board with several looks in play.
9.2 Confirm a pre-existing saved game is visually unchanged.
9.3 Measure Smoke and Marble on device; cut if they underperform.

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| An animated style breaks life-total legibility | Luminance-band test §9.2; contrast asserted end to end §9.5 |
| Smoke/Marble cost far more on a phone than measured | Gated on §9.3; cut rather than shipped hedged |
| 66 combinations become unreviewable | Two-axis picker; styles are one rule set driven by custom properties |
| Motion is distracting over a two-hour game | On by default but one toggle away; all styles are slow by construction |
| A future style is added without the contrast check | §9.2 iterates the catalogue rather than a fixed list, so new entries are covered automatically |

## 12. Out of scope

- Photo or user-supplied backgrounds (rejected earlier: storage cap, and the
  contrast guarantee cannot hold against arbitrary pixels).
- Per-tile animation control.
- Board, detail panel, or centre-menu redesign.
- The turn-pass nudge spike, which remains its own backlog item.
