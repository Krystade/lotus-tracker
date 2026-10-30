import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useStore } from "./state/store";
import { useTicker } from "./hooks/useTicker";
import { useWakeLock } from "./hooks/useWakeLock";
import { fireTurnExpiredAlert, playTick, unlockAudio } from "./util/alert";
import { warningCrossed } from "./game/turn";
import { Board } from "./components/Board";
import { CenterMenu } from "./components/CenterMenu";
import { PlayerDetail } from "./components/PlayerDetail";
import { NewGameScreen } from "./components/NewGameScreen";
import { SettingsPanel } from "./components/SettingsPanel";
import { LayoutPicker } from "./components/LayoutPicker";
import { DicePanel } from "./components/DicePanel";
import { ArcadeSeatPicker } from "./components/ArcadeSeatPicker";
import { RandomFirstOverlay } from "./components/RandomFirstOverlay";
import { LogPanel } from "./components/LogPanel";

type Overlay =
  | null
  | "newgame"
  | "settings"
  | "layout"
  | "dice"
  | "random"
  | "arcade"
  | "log";

export default function App() {
  useTicker();

  const keepAwake = useStore((s) => s.settings.keepAwake);
  useWakeLock(keepAwake);

  const expired = useStore((s) => s.game.turn.expired);
  const soundOn = useStore((s) => s.settings.soundOn);
  const vibrateOn = useStore((s) => s.settings.vibrateOn);
  const alertVolume = useStore((s) => s.settings.alertVolume);
  const wasExpired = useRef(expired);

  useEffect(() => {
    if (expired && !wasExpired.current) {
      fireTurnExpiredAlert(soundOn, vibrateOn, alertVolume);
    }
    wasExpired.current = expired;
  }, [expired, soundOn, vibrateOn, alertVolume]);

  // Soft tick on the way down past 0:30 and 0:10.
  const remaining = useStore((s) => s.game.turn.remainingSec);
  const warnOn = useStore((s) => s.settings.turnWarnOn && s.settings.turnTimerEnabled);
  const lastRemaining = useRef(remaining);
  useEffect(() => {
    const mark = warningCrossed(lastRemaining.current, remaining);
    lastRemaining.current = remaining;
    if (mark !== null && warnOn && soundOn) playTick(alertVolume, mark === 10);
  }, [remaining, warnOn, soundOn, alertVolume]);

  // Unlock audio on the first user interaction (iOS autoplay policy).
  useEffect(() => {
    const onFirst = () => unlockAudio();
    window.addEventListener("pointerdown", onFirst, { once: true });
    return () => window.removeEventListener("pointerdown", onFirst);
  }, []);

  const [overlay, setOverlay] = useState<Overlay>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  // Which seats have the pass-the-time games open -- any number of them at
  // once. They live inside each player's own tile, so the rest of the board
  // stays readable and usable for whoever's turn it actually is, and two
  // bored players are not made to share one game.
  const [arcadeSeats, setArcadeSeats] = useState<string[]>([]);
  const toggleArcadeSeat = (id: string) =>
    setArcadeSeats((seats) =>
      seats.includes(id) ? seats.filter((s) => s !== id) : [...seats, id],
    );

  // Look animation is frozen by the setting, and also whenever the tab is
  // hidden — CSS animations keep running when a page is backgrounded, unlike
  // rAF, so this is worth doing explicitly on a screen held awake for hours.
  const animateLooks = useStore((s) => s.settings.animateLooks);
  const lookSpeed = useStore((s) => s.settings.lookSpeed);
  const effectStrength = useStore((s) => s.settings.effectStrength);
  const [hidden, setHidden] = useState(
    typeof document !== "undefined" && document.visibilityState === "hidden",
  );
  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const still = !animateLooks || hidden;

  // Escape closes any open overlay/panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDetailId(null);
        setOverlay(null);
        setArcadeSeats([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className={`app${still ? " app--still" : ""}`}
      style={
        {
          "--look-speed": String(lookSpeed),
          "--fx-strength": String(effectStrength),
        } as CSSProperties
      }
    >
      <Board
        onOpenDetail={setDetailId}
        arcadeSeats={arcadeSeats}
        onCloseArcade={(id) => setArcadeSeats((s) => s.filter((x) => x !== id))}
      />
      <CenterMenu
        onNewGame={() => setOverlay("newgame")}
        onSettings={() => setOverlay("settings")}
        onLayouts={() => setOverlay("layout")}
        onDice={() => setOverlay("dice")}
        onArcade={() => setOverlay("arcade")}
        onRandomFirst={() => setOverlay("random")}
        onLog={() => setOverlay("log")}
      />

      {detailId && (
        <PlayerDetail
          playerId={detailId}
          onClose={() => setDetailId(null)}
          onPlayGames={() => {
            toggleArcadeSeat(detailId);
            setDetailId(null);
          }}
          gamesOpen={arcadeSeats.includes(detailId)}
        />
      )}
      {overlay === "newgame" && (
        <NewGameScreen onClose={() => setOverlay(null)} />
      )}
      {overlay === "settings" && (
        <SettingsPanel onClose={() => setOverlay(null)} />
      )}
      {overlay === "layout" && <LayoutPicker onClose={() => setOverlay(null)} />}
      {overlay === "log" && <LogPanel onClose={() => setOverlay(null)} />}
      {overlay === "dice" && <DicePanel onClose={() => setOverlay(null)} />}
      {overlay === "arcade" && (
        <ArcadeSeatPicker
          open={arcadeSeats}
          onToggle={toggleArcadeSeat}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === "random" && (
        <RandomFirstOverlay onClose={() => setOverlay(null)} />
      )}
    </div>
  );
}
