import { useLayoutEffect, useRef } from "react";
import { useStore } from "../state/store";
import { tileCounters, type TileCounter } from "../game/tileCounters";
import { resolveLook } from "../layout/looks";
import type { Player } from "../state/types";

/**
 * Every counter in play, on the tile itself, each with its own - and +, so
 * nobody opens a menu mid-combat. At 0 the minus becomes a small x that
 * takes the counter off the tile until it is used again.
 */
export function CounterSteppers({ player }: { player: Player }) {
  const players = useStore((s) => s.game.players);
  const adjustCounter = useStore((s) => s.adjustCounter);
  const bumpTax = useStore((s) => s.bumpTax);
  const adjustCustomCounter = useStore((s) => s.adjustCustomCounter);
  const adjustCommanderDamage = useStore((s) => s.adjustCommanderDamage);
  const unpin = useStore((s) => s.unpinCounter);
  const ref = useRef<HTMLDivElement>(null);

  const items = tileCounters(player, players);

  // Tell the tile how much of its bottom edge the rows take, so the life
  // total can make room (see .tile__life). Written straight onto the content
  // box: it changes with layout, not with state.
  const count = items.length;
  useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const set = () => host.style.setProperty("--tcount-h", `${el.offsetHeight + 8}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      host.style.removeProperty("--tcount-h");
    };
  }, [count]);

  if (count === 0) return null;

  const step = (c: TileCounter, dir: 1 | -1) => {
    if (c.kind === "cmdr") adjustCommanderDamage(player.id, c.from.id, dir);
    else if (c.kind === "custom") adjustCustomCounter(player.id, c.id, dir);
    else if (c.counter === "tax") bumpTax(player.id, dir);
    else adjustCounter(player.id, c.counter, dir);
  };

  return (
    <div className="tcount-row" ref={ref} onPointerDown={(e) => e.stopPropagation()}>
      {items.map((c) => (
        <div
          key={c.key}
          className={`tcount${c.warn ? " tcount--warn" : ""}${c.kind === "cmdr" ? " tcount--cmdr" : ""}`}
        >
          {c.value === 0 ? (
            <button
              className="tcount__btn tcount__btn--hide"
              onClick={() => unpin(player.id, c.key)}
              aria-label={`hide ${c.full} from ${player.name}'s tile`}
            >
              ×
            </button>
          ) : (
            <button
              className="tcount__btn"
              onClick={() => step(c, -1)}
              aria-label={`${player.name} ${c.full} down`}
            >
              −
            </button>
          )}
          <span className="tcount__val" aria-label={`${c.full} ${c.value}`} aria-live="polite">
            <span className="tcount__label">
              {c.kind === "cmdr" && (
                <span
                  className="tcount__dot"
                  style={{ background: resolveLook(c.from.look, c.from.color).base }}
                  aria-hidden
                />
              )}
              {c.short}
            </span>
            <b>{c.value}</b>
          </span>
          <button
            className="tcount__btn"
            onClick={() => step(c, 1)}
            aria-label={`${player.name} ${c.full} up`}
          >
            +
          </button>
        </div>
      ))}
    </div>
  );
}
