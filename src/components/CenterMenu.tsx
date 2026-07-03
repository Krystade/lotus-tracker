import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { formatGameClock } from "../util/format";

interface Props {
  onNewGame: () => void;
  onSettings: () => void;
  onLayouts: () => void;
}

/** Center hexagon button + total game timer, and the pop-up action sheet. */
export function CenterMenu({ onNewGame, onSettings, onLayouts }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const elapsed = useStore((s) => s.game.gameElapsedSec);
  const gameRunning = useStore((s) => s.game.gameTimerRunning);
  const turnRunning = useStore((s) => s.game.turn.running);
  const passTurn = useStore((s) => s.passTurn);
  const resetLife = useStore((s) => s.resetLife);
  const toggleGameTimer = useStore((s) => s.toggleGameTimer);
  const toggleTurnRunning = useStore((s) => s.toggleTurnRunning);
  const resetTurnTimer = useStore((s) => s.resetTurnTimer);

  const close = () => {
    setOpen(false);
    setConfirmReset(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const act = (fn: () => void) => () => {
    fn();
    close();
  };

  return (
    <>
      <div className="center">
        <button
          className="center__hex"
          onClick={() => setOpen(true)}
          aria-label="menu"
        >
          <span className="center__hex-lines" />
        </button>
        <div className="center__clock">{formatGameClock(elapsed)}</div>
      </div>

      {open && (
        <div className="sheet-backdrop" onClick={close}>
          <div
            className="sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div className="sheet__grip" />
            <button className="sheet__row sheet__row--primary" onClick={act(passTurn)}>
              ⏭ Pass turn
            </button>
            <div className="sheet__group">
              <button className="sheet__row" onClick={() => toggleTurnRunning()}>
                {turnRunning ? "⏸ Pause turn timer" : "▶ Resume turn timer"}
              </button>
              <button className="sheet__row" onClick={act(resetTurnTimer)}>
                ↺ Reset turn timer
              </button>
              <button className="sheet__row" onClick={() => toggleGameTimer()}>
                {gameRunning ? "⏸ Pause game clock" : "▶ Resume game clock"}
              </button>
            </div>
            <div className="sheet__group">
              <button className="sheet__row" onClick={act(onLayouts)}>
                ▦ Layout
              </button>
              <button className="sheet__row" onClick={act(onSettings)}>
                ⚙ Settings
              </button>
            </div>
            <div className="sheet__group">
              <button
                className={`sheet__row${confirmReset ? " sheet__row--danger" : ""}`}
                onClick={() => {
                  if (confirmReset) {
                    resetLife();
                    close();
                  } else {
                    setConfirmReset(true);
                    window.setTimeout(() => setConfirmReset(false), 3000);
                  }
                }}
              >
                {confirmReset ? "↺ Tap again to reset life" : "↺ Reset life"}
              </button>
              <button className="sheet__row" onClick={act(onNewGame)}>
                ✦ New game
              </button>
            </div>
            <button className="sheet__close" onClick={close}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
