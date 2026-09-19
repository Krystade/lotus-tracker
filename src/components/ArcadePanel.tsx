import { useState } from "react";
import { useStore } from "../state/store";
import { formatClock } from "../util/format";
import { ARCADE_GAMES, formatBest, gameById } from "../game/arcade/bests";
import type { Rotation } from "../state/types";
import { ManaMatch } from "./arcade/ManaMatch";
import { ManaChant } from "./arcade/ManaChant";
import { QuickDraw } from "./arcade/QuickDraw";

const NEXT_ROTATION: Record<Rotation, Rotation> = {
  0: 90,
  90: 180,
  180: 270,
  270: 0,
};

/**
 * Something to do while three other people resolve their turns.
 *
 * Two things make this safe to open mid-game rather than a way to miss your
 * turn: the turn strip stays visible at the top of the panel, and every game
 * is abandonable in one tap with nothing to lose. The turn alarm is fired by
 * App regardless of what is on screen, so it still goes off in here.
 */
export function ArcadePanel({ onClose }: { onClose: () => void }) {
  const [gameId, setGameId] = useState<string | null>(null);

  const bests = useStore((s) => s.arcadeBests);
  const record = useStore((s) => s.recordArcadeScore);
  const rotation = useStore((s) => s.settings.arcadeRotation);
  const updateSettings = useStore((s) => s.updateSettings);

  const players = useStore((s) => s.game.players);
  const activeId = useStore((s) => s.game.turn.activePlayerId);
  const remainingSec = useStore((s) => s.game.turn.remainingSec);
  const expired = useStore((s) => s.game.turn.expired);
  const timerOn = useStore((s) => s.settings.turnTimerEnabled);
  const active = players.find((p) => p.id === activeId);

  // Turned a quarter, the panel is landscape on screen: the long screen axis
  // becomes its width and the short one caps its height. Same trick the player
  // detail panel uses, and the reason the games relayout rather than shrink.
  const turned = rotation === 90 || rotation === 270;

  const game = gameId ? gameById(gameId) : undefined;
  const best = gameId ? bests[gameId] : undefined;

  return (
    <div
      className="overlay"
      // Only the menu closes on a tap outside. Mid-game the taps are fast and
      // near the edges, and losing a run to a stray one would be maddening.
      onClick={game ? undefined : onClose}
    >
      <div className="rot-wrap" style={{ transform: `rotate(${rotation}deg)` }}>
        <div
          className={`panel panel--arcade${turned ? " is-turned" : ""}`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
        >
          <div className="panel__head panel__head--dark">
            {game ? (
              <button
                className="arc__back"
                onClick={() => setGameId(null)}
                aria-label="back to games"
              >
                ‹ {game.name}
              </button>
            ) : (
              <span>Pass the time</span>
            )}
            <div className="arc__headbtns">
              <button
                className="panel__x"
                onClick={() =>
                  updateSettings({ arcadeRotation: NEXT_ROTATION[rotation] })
                }
                aria-label="turn to face another seat"
                title="Face another seat"
              >
                ↻
              </button>
              <button className="panel__x" onClick={onClose} aria-label="close">
                ✕
              </button>
            </div>
          </div>

          {active && (
            <div className={`arc__turn${expired ? " is-expired" : ""}`}>
              <span className="arc__turn-dot" style={{ background: active.color }} />
              <span className="arc__turn-name">{active.name}&rsquo;s turn</span>
              {timerOn && (
                <span className="arc__turn-clock">{formatClock(remainingSec)}</span>
              )}
            </div>
          )}

          <div className="panel__body panel__body--arcade">
            {!game && (
              <div className="arc__menu">
                {ARCADE_GAMES.map((g) => (
                  <button
                    key={g.id}
                    className="arc__pick"
                    onClick={() => setGameId(g.id)}
                  >
                    <span className="arc__pick-name">{g.name}</span>
                    <span className="arc__pick-blurb">{g.blurb}</span>
                    <span className="arc__pick-best">
                      {bests[g.id] === undefined
                        ? "no record yet"
                        : `best ${formatBest(g.id, bests[g.id])}`}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {gameId === "match" && (
              <ManaMatch onWin={(moves) => record("match", moves)} />
            )}
            {gameId === "chant" && (
              <ManaChant onEnd={(score) => record("chant", score)} />
            )}
            {gameId === "draw" && (
              <QuickDraw onTime={(ms) => record("draw", ms)} />
            )}

            {game && (
              <div className="arc__best">
                {best === undefined
                  ? "No record yet"
                  : `Best: ${formatBest(game.id, best)}`}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
