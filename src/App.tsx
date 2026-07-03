import { useEffect, useRef, useState } from "react";
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

type Overlay = null | "newgame" | "settings" | "layout";

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

  return (
    <div className="app">
      <Board onOpenDetail={setDetailId} />
      <CenterMenu
        onNewGame={() => setOverlay("newgame")}
        onSettings={() => setOverlay("settings")}
        onLayouts={() => setOverlay("layout")}
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
    </div>
  );
}
