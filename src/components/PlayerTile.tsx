import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { useStore } from "../state/store";
import { useHoldRepeat } from "../hooks/useHoldRepeat";
import { formatClock } from "../util/format";
import { clampLife } from "../game/life";
import { isCommanderDamageLethal, isPoisonLethal } from "../game/lethal";
import { textOn } from "../layout/colors";
import { resolveLook } from "../layout/looks";
import { useLifeFeedback } from "../hooks/useLifeFeedback";
import { CounterSteppers } from "./CounterSteppers";
import { Digits } from "./Digits";
import { ArcadeTile } from "./ArcadeTile";
import { junctionFor, type TileJunction } from "../layout/junction";
import { screenToLocal, usePillGesture } from "./usePillGesture";
import { warnLevel } from "../game/turn";
import type { Placement, Rotation, TilePos } from "../state/types";

interface Props {
  placement: Placement;
  onOpenDetail: (playerId: string) => void;
  /** This seat has the pass-the-time games open over its tile. */
  arcadeOpen: boolean;
  onCloseArcade: () => void;
}

// Sits just above the counter-chip row that owns the bottom edge. Still
// draggable anywhere; this is only where it starts.
const DEFAULT_TIMER_POS: TilePos = { x: 50, y: 76 };

// Corner placement. The pill hugs the edge of the tile the junction is on --
// in every built-in layout that is the tile's own top edge, where the +/-
// zones (the middle 56% of the height) do not reach -- so a near-miss on
// life never passes the turn. Along that edge it keeps clear of the tile's
// rounded corner or, where the junction is the middle of the board, of the
// menu hexagon and the game clock under it. Screen px.
//
// The hexagon-and-clock column is centred as a whole, so the hexagon sits
// ~12px above the board's middle; on a notched phone the safe areas push the
// board's middle a further ~8px down from the screen's. Hence up > sideways.
const HEX_CLEARANCE = { left: 40, right: 40, up: 56, down: 50 };
// Corner timer at the board's middle: the face sits this far out along both
// edges, clear of the hexagon (27px) and the clock tucked under it.
const HEX_HOLE = 50;

const LOCAL_TO_SCREEN: Record<Rotation, Rotation> = { 0: 0, 90: 270, 180: 180, 270: 90 };

/**
 * "corner" mode: the timer fills the corner of the tile where the most seats
 * meet, flush against both edges, with a rounded inner edge -- a quarter
 * disc. Where that point is the middle of an edge (two seats head to head)
 * it is a half disc flush against the edge, beside the menu hexagon.
 * Everything here is in the tile's own (rotated) frame.
 */
function cornerTimer(j: TileJunction, rot: Rotation) {
  const [ax, ay] = screenToLocal(rot, j.fx - 0.5, j.fy - 0.5);
  const [dx, dy] = screenToLocal(rot, j.sx, j.sy).map(Math.sign) as [number, number];
  if (dx !== 0 && dy !== 0) {
    // A corner: (dx, dy) points from it into the tile.
    const from = dx > 0 ? (dy > 0 ? 90 : 0) : dy > 0 ? 180 : 270;
    return {
      kind: "quarter" as const,
      style: {
        left: dx > 0 ? 0 : "auto",
        right: dx < 0 ? 0 : "auto",
        top: dy > 0 ? 0 : "auto",
        bottom: dy < 0 ? 0 : "auto",
        "--cx": dx > 0 ? "0%" : "100%",
        "--cy": dy > 0 ? "0%" : "100%",
        "--from": `${from}deg`,
        "--sweep": "90deg",
        // Where the corner is the middle of the board, the menu hexagon and
        // game clock sit on it: the disc grows by that much and the face
        // sits out past them.
        "--hole": j.atCenter ? `${HEX_HOLE}px` : "0px",
        // The face is centred on the diagonal, halfway between the hole
        // and the curve: padded on the two sides that meet at the corner.
        "--pl": dx > 0 ? "var(--pdx)" : "0.4em",
        "--pr": dx < 0 ? "var(--pdx)" : "0.4em",
        "--pt": dy > 0 ? "var(--pdy)" : "0.4em",
        "--pb": dy < 0 ? "var(--pdy)" : "0.4em",
        // Round only the inner corner, the one facing back into the tile.
        borderRadius:
          dx > 0 && dy > 0 ? "0 0 100% 0"
          : dx < 0 && dy > 0 ? "0 0 0 100%"
          : dx < 0 && dy < 0 ? "100% 0 0 0"
          : "0 100% 0 0",
        "--jh": dx > 0 ? "flex-start" : "flex-end",
        "--jv": dy > 0 ? "flex-start" : "flex-end",
      } as unknown as CSSProperties,
    };
  }
  // Middle of an edge. Sit beside the hexagon that covers that point.
  const hugY = dy !== 0;
  const into = hugY ? dy : dx;
  // Always to the tile's own right of the point (its +x or +y).
  const unit: [number, number] = hugY ? [1, 0] : [0, 1];
  const [sx, sy] = screenToLocal(LOCAL_TO_SCREEN[rot], unit[0], unit[1]);
  const need =
    sx > 0 ? HEX_CLEARANCE.right : sx < 0 ? HEX_CLEARANCE.left : sy > 0 ? HEX_CLEARANCE.down : HEX_CLEARANCE.up;
  const pos = (0.5 + (hugY ? ax : ay)) * 100;
  const from = hugY ? (into > 0 ? 90 : 270) : into > 0 ? 0 : 180;
  return {
    kind: "half" as const,
    style: {
      ...(hugY
        ? { left: `clamp(0px, calc(${pos}% + ${need}px), calc(100% - 2 * var(--r)))`, [into > 0 ? "top" : "bottom"]: 0 }
        : { top: `clamp(0px, calc(${pos}% + ${need}px), calc(100% - 2 * var(--r)))`, [into > 0 ? "left" : "right"]: 0 }),
      "--cx": hugY ? "50%" : into > 0 ? "0%" : "100%",
      "--cy": hugY ? (into > 0 ? "0%" : "100%") : "50%",
      "--from": `${from}deg`,
      "--sweep": "180deg",
      borderRadius: hugY
        ? into > 0 ? "0 0 999px 999px" : "999px 999px 0 0"
        : into > 0 ? "0 999px 999px 0" : "999px 0 0 999px",
      "--jh": hugY ? "center" : into > 0 ? "flex-start" : "flex-end",
      "--jv": hugY ? (into > 0 ? "flex-start" : "flex-end") : "center",
    } as unknown as CSSProperties,
    hugY,
  };
}

export function PlayerTile({
  placement,
  onOpenDetail,
  arcadeOpen,
  onCloseArcade,
}: Props) {
  const pid = placement.playerId;
  const player = useStore((s) => s.game.players.find((p) => p.id === pid));
  const turn = useStore((s) => s.game.turn);
  // Last player standing (returns a stable id/null primitive — safe selector).
  const winnerId = useStore((s) => {
    if (s.game.players.length <= 1) return null;
    const alive = s.game.players.filter((p) => !p.eliminated);
    return alive.length === 1 ? alive[0].id : null;
  });
  const scale = useStore((s) => s.settings.turnTimerScale);
  const timerEnabled = useStore((s) => s.settings.turnTimerEnabled);
  const timerPlacement = useStore((s) => s.settings.turnTimerPlacement);
  const warnOn = useStore((s) => s.settings.turnWarnOn);
  const layout = useStore((s) => s.game.layout);
  // Share of the turn budget still on the clock, for the countdown ring.
  const turnFraction =
    turn.budgetSec > 0
      ? Math.max(0, Math.min(1, turn.remainingSec / turn.budgetSec))
      : 0;
  const adjustLife = useStore((s) => s.adjustLife);
  const passTurn = useStore((s) => s.passTurn);
  const setTimerPos = useStore((s) => s.setTimerPos);
  const setActivePlayer = useStore((s) => s.setActivePlayer);
  const toggleEliminated = useStore((s) => s.toggleEliminated);

  const contentRef = useRef<HTMLDivElement>(null);
  const pinnedToCorner = timerPlacement === "corner";
  const pill = usePillGesture({
    pos: { ...DEFAULT_TIMER_POS, ...player?.timerPos } as TilePos & { x: number; y: number },
    rotation: placement.rotation,
    pinned: pinnedToCorner,
    box: () => contentRef.current,
    onTap: passTurn,
    onCommit: (p) => setTimerPos(pid, p),
  });

  // Accumulating life swing: sums rapid taps, shows a "+3 / -5" chip, then
  // fades and commits. Tapping the chip undoes the whole swing (mis-tap guard).
  const [swing, setSwing] = useState(0);
  const swingTimer = useRef<number | null>(null);
  // The life value we expect after our own edits — lets us (a) accumulate the
  // *applied* (clamp-aware) delta and (b) detect life changed by another path.
  const expectedLife = useRef(player?.life ?? 0);
  const clearSwingTimer = () => {
    if (swingTimer.current !== null) window.clearTimeout(swingTimer.current);
    swingTimer.current = null;
  };
  const bumpLife = useCallback(
    (n: number) => {
      const before = expectedLife.current;
      const after = clampLife(before + n);
      adjustLife(pid, n);
      expectedLife.current = after;
      setSwing((s) => s + (after - before)); // applied delta, not nominal
      if (swingTimer.current !== null) window.clearTimeout(swingTimer.current);
      swingTimer.current = window.setTimeout(() => setSwing(0), 2200);
    },
    [adjustLife, pid],
  );
  const undoSwing = () => {
    if (swing !== 0) {
      adjustLife(pid, -swing);
      expectedLife.current = clampLife(expectedLife.current - swing);
    }
    setSwing(0);
    clearSwingTimer();
  };
  // If life changed by any other path (Set life, commander damage), the pending
  // swing is stale — drop it so undo can't corrupt the new total.
  useEffect(() => {
    const life = player?.life;
    if (life === undefined) return;
    if (life !== expectedLife.current) {
      expectedLife.current = life;
      setSwing(0);
      clearSwingTimer();
    }
  }, [player?.life]);
  useEffect(() => clearSwingTimer, []);

  const isActive = turn.activePlayerId === pid;

  // Long-press the tile body (not a control) to make this seat the active turn
  // — recovery from a mis-pass without cycling the whole table.
  const longPress = useRef<number | null>(null);
  const lpStart = useRef<{ x: number; y: number } | null>(null);
  const cancelLongPress = () => {
    if (longPress.current !== null) window.clearTimeout(longPress.current);
    longPress.current = null;
    lpStart.current = null;
  };
  const onContentDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    cancelLongPress();
    lpStart.current = { x: e.clientX, y: e.clientY };
    longPress.current = window.setTimeout(() => {
      if (!isActive && player && !player.eliminated) setActivePlayer(pid);
    }, 550);
  };
  const onContentMove = (e: PointerEvent) => {
    const st = lpStart.current;
    if (st && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 10) {
      cancelLongPress();
    }
  };
  useEffect(() => cancelLongPress, []);

  const minus = useHoldRepeat(bumpLife, -1, -10);
  const plus = useHoldRepeat(bumpLife, 1, 10);

  // Derived before the early return below so the hook call order stays stable
  // (a tile can briefly render without its player while a pod is resized).
  const poisonDead = isPoisonLethal(player?.counters.poison ?? 0);
  const cmdrDead = isCommanderDamageLethal(player?.commanderDamage);
  const lethal = (player?.life ?? 1) <= 0 || poisonDead || cmdrDead;
  const effectsOn = useStore((s) => s.settings.effectsOn);
  const vibrateOn = useStore((s) => s.settings.vibrateOn);
  const fx = useLifeFeedback(player?.life ?? 0, lethal, effectsOn, vibrateOn);

  if (!player) return null;

  const rotated = placement.rotation === 90 || placement.rotation === 270;
  const deathCause = poisonDead ? "POISON" : cmdrDead ? "CMDR" : "DEAD";
  const lowLife = player.life > 0 && player.life <= 5;
  const pillPos = { ...DEFAULT_TIMER_POS, ...player.timerPos, ...pill.live };
  const junction = pinnedToCorner ? junctionFor(layout, pid) : null;
  const corner = junction ? cornerTimer(junction, placement.rotation) : null;
  const pillScale = scale * (pillPos.scale ?? 1);
  const pillPlace: CSSProperties = corner
    ? corner.style
    : {
        left: `${pillPos.x}%`,
        top: `${pillPos.y}%`,
        transform: `translate(-50%, -50%) rotate(${pillPos.angle ?? 0}deg)`,
      };

  const contentStyle = {
    transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
    width: rotated ? "100cqh" : "100%",
    height: rotated ? "100cqw" : "100%",
    // The content box's own width and height, for anything sized to fit it.
    "--lw": rotated ? "100cqh" : "100cqw",
    "--lh": rotated ? "100cqw" : "100cqh",
  } as CSSProperties;

  // Contrast comes from the look's declared base colour, not from the rendered
  // pixels, so a gradient, striped or animated tile is as legible as a flat
  // one. The style's CSS reads the --look-* custom properties.
  const look = resolveLook(player.look, player.color);
  const tileStyle: CSSProperties = {
    gridRow: `${placement.row} / span ${placement.rowSpan}`,
    gridColumn: `${placement.col} / span ${placement.colSpan}`,
    color: textOn(look.base),
    ...look.vars,
  } as CSSProperties;

  return (
    <div
      className={`tile look${player.eliminated ? " tile--out" : ""}${
        lethal ? " tile--lethal" : ""
      }${isActive && !player.eliminated ? " tile--active" : ""}`}
      style={tileStyle}
      data-pid={pid}
      data-style={look.styleId}
      data-fx={fx?.kind}
      data-fx-level={fx?.intensity}
    >
      {look.layers > 0 && (
        <div className="tile__look" aria-hidden>
          {Array.from({ length: look.layers }, (_, i) => (
            <span key={i} />
          ))}
        </div>
      )}
      <div
        className="tile__content"
        ref={contentRef}
        style={contentStyle}
        onPointerDown={onContentDown}
        onPointerMove={onContentMove}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
      >
        <button
          className="tile__adj tile__adj--minus"
          aria-label={`${player.name} decrease life`}
          {...minus}
        >
          <span className="tile__sign">–</span>
        </button>
        <button
          className="tile__adj tile__adj--plus"
          aria-label={`${player.name} increase life`}
          {...plus}
        >
          <span className="tile__sign">+</span>
        </button>

        <div
          className={`tile__life${lowLife ? " tile__life--low" : ""}`}
          aria-live="polite"
          aria-atomic="true"
          aria-label={`${player.name} life ${player.life}`}
        >
          <Digits value={player.life} />
        </div>

        {swing !== 0 && (
          <button
            className={`tile__swing${
              swing > 0 ? " tile__swing--up" : " tile__swing--down"
            }`}
            onClick={undoSwing}
            aria-label={`undo life change ${swing > 0 ? "+" : ""}${swing}`}
          >
            {swing > 0 ? `+${swing}` : swing}
            <span className="tile__swing-undo">↺</span>
          </button>
        )}

        {winnerId === pid && !player.eliminated && !lethal && (
          <div className="tile__winner">
            <span aria-hidden>🏆</span> WINS
          </div>
        )}

        {lethal && (
          <button
            className="tile__skull"
            onClick={() => toggleEliminated(pid)}
            aria-label={`Lethal (${deathCause}); tap to ${
              player.eliminated ? "revive" : "eliminate"
            }`}
          >
            <span aria-hidden>☠</span>
            <span className="tile__skull-cause">{deathCause}</span>
          </button>
        )}

        <CounterSteppers player={player} />

        <button
          className="tile__more"
          onClick={() => onOpenDetail(pid)}
          aria-label="player details"
        >
          ⋯
        </button>

        {isActive && timerEnabled && (
          <button
            className={`tile__pill${turn.expired ? " tile__pill--expired" : ""}${
              warnOn && !turn.expired && warnLevel(turn.remainingSec)
                ? ` tile__pill--${warnLevel(turn.remainingSec)}`
                : ""
            }${
              pill.live ? " tile__pill--dragging" : ""
            }${corner ? ` tile__pill--corner tile__pill--${corner.kind}${corner.kind === "half" && !corner.hugY ? " tile__pill--side" : ""}` : ""
            }`}
            style={
              {
                ...pillPlace,
                "--timer-scale": String(pillScale),
                // Drives the countdown ring; drains clockwise from the top.
                "--pct": String(turnFraction),
              } as CSSProperties
            }
            onPointerDown={pill.onPointerDown}
            // Pointer taps are handled by the gesture (and their clicks
            // swallowed); this is the keyboard's Enter/Space.
            onClick={(e) => {
              if (e.detail === 0) passTurn();
            }}
            aria-label={
              junction
                ? "turn timer: tap to pass turn, pinch to resize"
                : "turn timer: tap to pass turn, drag to move, pinch to resize or turn"
            }
          >
            <span className="tile__pill-inner">
              <span className="tile__pill-turn">{turn.turnNumber}</span>
              <span className="tile__pill-time">
                {formatClock(turn.remainingSec)}
              </span>
            </span>
          </button>
        )}

        {/* Last inside the rotated content box, so it covers this tile and
            only this tile, already facing the right way. */}
        {arcadeOpen && <ArcadeTile playerId={pid} onClose={onCloseArcade} />}
      </div>
    </div>
  );
}
