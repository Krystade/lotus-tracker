import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useStore } from "./state/store";
import { useTicker } from "./hooks/useTicker";
import { useWakeLock } from "./hooks/useWakeLock";
import { fireTurnExpiredAlert, unlockAudio } from "./util/alert";
import { Board } from "./components/Board";
import { CenterMenu } from "./components/CenterMenu";
import { PlayerDetail } from "./components/PlayerDetail";
import { NewGameScreen } from "./components/NewGameScreen";
import { SettingsPanel } from "./components/SettingsPanel";
import { LayoutPicker } from "./components/LayoutPicker";
import { DicePanel } from "./components/DicePanel";
import { RandomFirstOverlay } from "./components/RandomFirstOverlay";

type Overlay = null | "newgame" | "settings" | "layout" | "dice" | "random";

export default function App() {
  useTicker();

  const keepAwake = useStore((s) => s.settings.keepAwake);
  useWakeLock(keepAwake);

  const expired = useStore((s) => s.game.turn.expired);
  const soundOn = useStore((s) => s.settings.soundOn);
  const vibrateOn = useStore((s) => s.settings.vibrateOn);
  const wasExpired = useRef(expired);

  useEffect(() => {
    if (expired && !wasExpired.current) {
      fireTurnExpiredAlert(soundOn, vibrateOn);
    }
    wasExpired.current = expired;
  }, [expired, soundOn, vibrateOn]);

  // Unlock audio on the first user interaction (iOS autoplay policy).
  useEffect(() => {
    const onFirst = () => unlockAudio();
    window.addEventListener("pointerdown", onFirst, { once: true });
    return () => window.removeEventListener("pointerdown", onFirst);
  }, []);

  const [overlay, setOverlay] = useState<Overlay>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

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
      <Board onOpenDetail={setDetailId} />
      <CenterMenu
        onNewGame={() => setOverlay("newgame")}
        onSettings={() => setOverlay("settings")}
        onLayouts={() => setOverlay("layout")}
        onDice={() => setOverlay("dice")}
        onRandomFirst={() => setOverlay("random")}
      />

      {detailId && (
        <PlayerDetail playerId={detailId} onClose={() => setDetailId(null)} />
      )}
      {overlay === "newgame" && (
        <NewGameScreen onClose={() => setOverlay(null)} />
      )}
      {overlay === "settings" && (
        <SettingsPanel onClose={() => setOverlay(null)} />
      )}
      {overlay === "layout" && <LayoutPicker onClose={() => setOverlay(null)} />}
      {overlay === "dice" && <DicePanel onClose={() => setOverlay(null)} />}
      {overlay === "random" && (
        <RandomFirstOverlay onClose={() => setOverlay(null)} />
      )}
    </div>
  );
}
