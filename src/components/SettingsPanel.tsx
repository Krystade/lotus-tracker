import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { formatClock } from "../util/format";
import { PLAYER_COLORS, textOn } from "../layout/colors";

const BUDGET_PRESETS = [120, 180, 300, 420, 600];

// Injected by Vite at build time; absent under Vitest, hence the guards.
const BUILD_ID =
  typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";
const BUILD_TIME =
  typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : "";

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const resetTurnTimer = useStore((s) => s.resetTurnTimer);

  // The preview plays the real effect on a real tile, so what is judged here
  // is what a game shows. Alternates damage and heal, at the heaviest tier --
  // the one that reads as too much if anything does.
  const [demo, setDemo] = useState<"damage" | "heal" | null>(null);
  const next = useRef<"damage" | "heal">("damage");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const playDemo = () => {
    window.clearTimeout(timer.current);
    const kind = next.current;
    next.current = kind === "damage" ? "heal" : "damage";
    setDemo(null);
    // A frame with the attribute absent, so the animation restarts rather than
    // being ignored as already-running.
    requestAnimationFrame(() => {
      setDemo(kind);
      timer.current = window.setTimeout(() => setDemo(null), 900);
    });
  };
  const demoSeat = PLAYER_COLORS[4]; // green: the seat the old wash muddied worst

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel panel--center" onClick={(e) => e.stopPropagation()}>
        <div className="panel__head panel__head--dark">
          <span>Settings</span>
          <button className="panel__x" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        <div className="panel__body">
          <section className="panel__section">
            <h3>Turn timer</h3>
            <label className="toggle">
              <span>Enable countdown</span>
              <input
                type="checkbox"
                checked={settings.turnTimerEnabled}
                onChange={(e) =>
                  update({ turnTimerEnabled: e.target.checked })
                }
              />
            </label>

            <p className="panel__sublabel">Per-turn budget</p>
            <div className="chipgrid">
              {BUDGET_PRESETS.map((sec) => (
                <button
                  key={sec}
                  className={`chip${
                    settings.defaultTurnBudgetSec === sec ? " is-on" : ""
                  }`}
                  onClick={() => update({ defaultTurnBudgetSec: sec })}
                >
                  {formatClock(sec)}
                </button>
              ))}
            </div>
            <div className="minsetter">
              <span>Custom minutes</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={Math.round(settings.defaultTurnBudgetSec / 60)}
                onChange={(e) =>
                  update({
                    defaultTurnBudgetSec: Math.max(
                      10,
                      Math.round(Number(e.target.value) * 60),
                    ),
                  })
                }
              />
            </div>
            <button className="linkbtn" onClick={resetTurnTimer}>
              Apply to current turn now
            </button>
          </section>

          <section className="panel__section">
            <h3>Turn timer size</h3>
            <div className="sizepreview">
              <span
                className="tile__pill tile__pill--preview"
                style={{ fontSize: `calc(0.95rem * ${settings.turnTimerScale})` }}
              >
                <span className="tile__pill-turn">3</span>
                <span className="tile__pill-time">5:00</span>
              </span>
            </div>
            <input
              className="slider"
              type="range"
              min={0.6}
              max={2.2}
              step={0.1}
              value={settings.turnTimerScale}
              onChange={(e) =>
                update({ turnTimerScale: Number(e.target.value) })
              }
            />
            <div className="slider__scale">
              <span>Small</span>
              <span>{settings.turnTimerScale.toFixed(1)}×</span>
              <span>Large</span>
            </div>
          </section>

          <section className="panel__section">
            <h3>Alerts &amp; screen</h3>
            <label className="toggle">
              <span>Sound at 0:00</span>
              <input
                type="checkbox"
                checked={settings.soundOn}
                onChange={(e) => update({ soundOn: e.target.checked })}
              />
            </label>
            <label className="toggle">
              <span>Vibrate at 0:00 (Android)</span>
              <input
                type="checkbox"
                checked={settings.vibrateOn}
                onChange={(e) => update({ vibrateOn: e.target.checked })}
              />
            </label>
            <label className="toggle">
              <span>Damage &amp; heal effects</span>
              <input
                type="checkbox"
                checked={settings.effectsOn}
                onChange={(e) => update({ effectsOn: e.target.checked })}
              />
            </label>
            <label className="toggle">
              <span>Animated backgrounds</span>
              <input
                type="checkbox"
                checked={settings.animateLooks}
                onChange={(e) => update({ animateLooks: e.target.checked })}
              />
            </label>
            <p className="panel__sublabel">
              Damage &amp; heal strength{" "}
              <em className="panel__em">{settings.effectStrength.toFixed(1)}×</em>
            </p>
            <button
              className="tile fxpreview"
              style={{ background: demoSeat, color: textOn(demoSeat) }}
              data-fx={demo ?? undefined}
              data-fx-level={demo ? 3 : undefined}
              onClick={playDemo}
              aria-label="preview the damage and heal effect"
            >
              <span className="fxpreview__life">34</span>
              <span className="fxpreview__hint">Tap to preview</span>
            </button>
            <input
              className="slider"
              type="range"
              min={0.2}
              max={2}
              step={0.1}
              value={settings.effectStrength}
              onChange={(e) =>
                update({ effectStrength: Number(e.target.value) })
              }
              aria-label="damage and heal effect strength"
            />
            <div className="slider__scale">
              <span>Subtle</span>
              <span>{settings.effectStrength.toFixed(1)}×</span>
              <span>Bold</span>
            </div>

            <p className="panel__sublabel">Background motion speed</p>
            <input
              className="slider"
              type="range"
              min={0.25}
              max={2.5}
              step={0.25}
              value={settings.lookSpeed}
              onChange={(e) => update({ lookSpeed: Number(e.target.value) })}
              aria-label="background motion speed"
            />
            <div className="slider__scale">
              <span>Slower</span>
              <span>{settings.lookSpeed.toFixed(2)}×</span>
              <span>Faster</span>
            </div>
            <label className="toggle">
              <span>Keep screen awake</span>
              <input
                type="checkbox"
                checked={settings.keepAwake}
                onChange={(e) => update({ keepAwake: e.target.checked })}
              />
            </label>
          </section>

          <section className="panel__section">
            <h3>Version</h3>
            <p className="panel__note">
              Updates install on their own the next time you open the app. This
              is the build you are running now.
            </p>
            <div className="buildstamp">
              <span>{BUILD_ID}</span>
              <span>{BUILD_TIME}</span>
            </div>
            <button
              className="linkbtn"
              onClick={() => {
                // Belt and braces: ask the worker to re-check, then hard-reload
                // past the HTTP cache.
                navigator.serviceWorker
                  ?.getRegistration()
                  ?.then((r) => r?.update())
                  .catch(() => undefined)
                  .finally(() => location.reload());
              }}
            >
              Check for updates now
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
