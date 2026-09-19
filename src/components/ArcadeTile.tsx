import { useState } from "react";
import { useStore } from "../state/store";
import { formatClock } from "../util/format";
import { ARCADE_GAMES, formatBest, gameById } from "../game/arcade/bests";
import { ManaMatch } from "./arcade/ManaMatch";
import { ManaChant } from "./arcade/ManaChant";
import { QuickDraw } from "./arcade/QuickDraw";

/**
 * Something to do while three other people resolve their turns, played inside
 * the waiting player's own tile.
 *
 * It started life as a panel over the middle of the board, which was wrong in
 * both directions at once: it covered between a third and nearly all of every
 * life total, and its backdrop swallowed taps, so the player whose turn it
 * actually was could neither read the board nor use it. Confined to one seat,
 * it hides only the tile of the person who chose to stop paying attention,
 * and every other tile stays readable and tappable.
 *
 * Living in the tile also means the seat's rotation comes for free: the tile
 * content box is already turned to face that player.
 */
export function ArcadeTile({
  playerId,
  onClose,
}: {
  playerId: string;
  onClose: () => void;
}) {
  const [gameId, setGameId] = useState<string | null>(null);

  const bests = useStore((s) => s.arcadeBests);
  const record = useStore((s) => s.recordArcadeScore);

  const players = useStore((s) => s.game.players);
  const adjustLife = useStore((s) => s.adjustLife);
  const activeId = useStore((s) => s.game.turn.activePlayerId);
  const remainingSec = useStore((s) => s.game.turn.remainingSec);
  const expired = useStore((s) => s.game.turn.expired);
  const timerOn = useStore((s) => s.settings.turnTimerEnabled);
  const active = players.find((p) => p.id === activeId);
  const me = players.find((p) => p.id === playerId);
  const yourTurn = activeId === playerId;

  const game = gameId ? gameById(gameId) : undefined;
  const best = gameId ? bests[gameId] : undefined;

  return (
    <div
      className="arct"
      // The tile underneath listens for long-press and drags; without this a
      // tap meant for a card would also be a tap on the tile.
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      {/* One bar, everything that must never be hidden by a game: the way
          out, this player's own life (the tile it covers is their life
          counter -- taking that away to play noughts and crosses is not a
          trade anyone asked for), and whose turn it is. */}
      <div className={`arct__bar${expired ? " is-expired" : ""}${
        yourTurn ? " is-yours" : ""
      }`}>
        {/* First, not last. Every tile is rotated to face its player, so the
            board's centre is always "up" from where they sit -- which puts the
            centre hex and the game clock over this bar's far end. A close
            control there is half covered and hard to hit, which is exactly
            how it arrived: no visible way out of a game. */}
        <button className="arct__close" onClick={onClose}>
          ✕ Close
        </button>

        {game && (
          <button
            className="arct__back"
            onClick={() => setGameId(null)}
            aria-label="back to the game list"
          >
            ‹ Games
          </button>
        )}

        <div className="arct__life">
          <button
            onClick={() => adjustLife(playerId, -1)}
            aria-label="decrease your life"
          >
            –
          </button>
          <span className="arct__lifenum">{me?.life ?? 0}</span>
          <button
            onClick={() => adjustLife(playerId, 1)}
            aria-label="increase your life"
          >
            +
          </button>
        </div>

        {active && (
          <span className="arct__turn">
            <span className="arct__dot" style={{ background: active.color }} />
            <span className="arct__who">
              {yourTurn ? "Your turn" : active.name}
            </span>
            {timerOn && (
              <span className="arct__clock">{formatClock(remainingSec)}</span>
            )}
          </span>
        )}
      </div>

      <div className="arct__body">
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
        {gameId === "draw" && <QuickDraw onTime={(ms) => record("draw", ms)} />}

        {game && (
          <div className="arc__best">
            {best === undefined
              ? "No record yet"
              : `Best: ${formatBest(game.id, best)}`}
          </div>
        )}
      </div>
    </div>
  );
}
