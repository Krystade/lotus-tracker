import { useStore } from "../state/store";
import { formatGameClock } from "../util/format";
import { stickerDef } from "../game/stickers";
import { resolveLook } from "../layout/looks";
import type { LogEntry, Player } from "../state/types";

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/**
 * Everything that happened this game, newest first, each with an undo.
 * Reached from the menu only: it is for settling "wait, what's my life?",
 * not something the board needs to show.
 */
export function LogPanel({ onClose }: { onClose: () => void }) {
  const log = useStore((s) => s.game.log);
  const players = useStore((s) => s.game.players);
  const adjustLife = useStore((s) => s.adjustLife);
  const adjustCommanderDamage = useStore((s) => s.adjustCommanderDamage);
  const adjustCounter = useStore((s) => s.adjustCounter);

  const who = (id?: string) => players.find((p) => p.id === id);
  const name = (id?: string) => who(id)?.name ?? "—";

  const undo = (e: LogEntry) => {
    if (e.kind === "life") adjustLife(e.playerId, -e.delta);
    else if (e.kind === "cmdr" && e.from) adjustCommanderDamage(e.playerId, e.from, -e.delta);
    else if (e.kind === "poison") adjustCounter(e.playerId, "poison", -e.delta);
  };

  const describe = (e: LogEntry) => {
    switch (e.kind) {
      case "life":
        return (
          <>
            <b className={e.delta < 0 ? "log__down" : "log__up"}>{signed(e.delta)}</b>{" "}
            life → {e.value}
          </>
        );
      case "cmdr":
        return (
          <>
            <b className={e.delta > 0 ? "log__down" : "log__up"}>{signed(e.delta)}</b>{" "}
            commander from {name(e.from)} → {e.value}
          </>
        );
      case "poison":
        return (
          <>
            <b className={e.delta > 0 ? "log__down" : "log__up"}>{signed(e.delta)}</b>{" "}
            poison → {e.value}
          </>
        );
      case "sticker": {
        const def = stickerDef(e.sticker ?? "monarch");
        return (
          <>
            {def.icon} took {def.name}
            {e.from ? ` from ${name(e.from)}` : ""}
          </>
        );
      }
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel panel--center" onClick={(e) => e.stopPropagation()}>
        <div className="panel__head panel__head--dark">
          <span>Game log</span>
          <button className="panel__x" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        <div className="panel__body">
          {log.length === 0 ? (
            <p className="log__empty">Nothing yet. Life changes, commander damage, poison and stickers show up here.</p>
          ) : (
            <ol className="log">
              {log
                .slice()
                .reverse()
                .map((e) => (
                  <li key={e.n} className="log__row">
                    <Dot player={who(e.playerId)} />
                    <span className="log__text">
                      <span className="log__who">{name(e.playerId)}</span> {describe(e)}
                      <span className="log__when">
                        T{e.turn} · {formatGameClock(e.at)}
                      </span>
                    </span>
                    {e.kind !== "sticker" && (
                      <button
                        className="log__undo"
                        onClick={() => undo(e)}
                        aria-label={`undo ${name(e.playerId)} ${e.kind} ${signed(e.delta)}`}
                      >
                        ↺
                      </button>
                    )}
                  </li>
                ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function Dot({ player }: { player?: Player }) {
  const base = player ? resolveLook(player.look, player.color).base : "#666";
  return <span className="log__dot" style={{ background: base }} aria-hidden />;
}
