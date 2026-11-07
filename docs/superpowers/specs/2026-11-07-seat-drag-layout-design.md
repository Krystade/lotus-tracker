# Seat drag: change the layout from the board

Owner decisions (2026-11-07): handle always on; swap recomputes turn order;
stickers follow their player; 350 ms hold; facing also reachable from the
player's own tile; swap needs the centre disc; max 2 seats per end; the mover
turns to face their new edge, others keep theirs; no divider resize in v1;
**any layout Customize can build keeps working — never tidied**; releasing past
the top/bottom of the screen counts as head/foot. First cut — expect a second
round after hands-on testing.

## Gesture
- ✥ handle: 44 px button in the tile's top corner away from the junction,
  upright for that seat. Hidden for 1 player and while that seat's arcade is open.
- Hold still 350 ms (8 px drift) → armed: ring fills, vibrate(10), tile dims
  with a dashed rim. Moving early cancels. One seat gesture at a time.
- While armed the board is frozen; outlines preview the result; commit on
  release; tiles slide to their new rects (200 ms, snap under reduced motion).
- Targets, in priority order:
  1. Within 24 px of the arm point, or back on the home disc → nothing / facing
     picker on release.
  2. 80 px ⇄ disc at another tile's centre → swap the two players.
  3. Head / foot zone (top/bottom 88 px of the board, plus past the screen
     edge) → that end.
  4. Otherwise: table layouts → the nearest slot on the left/right side by
     finger half; Customize layouts → split the tile under the finger on its
     nearest edge.
- ↺ Undo pill for 5 s restores the exact previous layout and stickers.

## Model (`src/layout/table.ts`, pure)
- `SeatTable {top,right,bottom,left}`; `derive(table, rot)` builds a gap-free
  grid (lcm rows for unequal sides, end bands one side-tile deep).
- `readTable(layout)` tries every assignment of seats to the edges they touch
  or face; `exact` when `derive` reproduces the geometry. Best: most seats on
  their facing side, then fewest at the ends.
- Exact layouts: candidates = P removed, re-inserted at every slot of every
  side (ends capped at 2). Non-exact (Customize): P's cell is absorbed by the
  neighbour(s) whose edge exactly covers it, then P splits a target tile in
  half on one edge, or takes a new full-width strip at the head/foot. Nothing
  else moves.
- Size floor: every tile ≥ 90 px short side and ≥ 120 px long side at the
  current board size, else the candidate is hidden.
- Turn order: when the table is exact and every seat faces its own side, use
  the ring top → right → bottom (reversed) → left (reversed), started where the
  old sweep starts. Otherwise the existing sweep.

## Store
- `rearrangeSeats(layout)` — validates coverage + gap-free, keeps players and
  the active seat, re-anchors stickers in their holder's tile frame, snapshots
  `{layout, stickers}` for undo. `undoSeatEdit()`, `setSeatRotation(pid, r)`.
- Result id: built-in id/name when the geometry equals the preset, else
  `arranged-<n>`. No schema change.

## Tests
- table.ts: exhaustive derive round-trip, built-ins exact, Customize layouts
  never re-tidied by a move, absorb/split gap-free fuzz, walkthrough px.
- Headless WebKit at 375×812 with real touch: hold-arm, drag to head, foot,
  side, swap, undo, facing; screenshots reviewed.
