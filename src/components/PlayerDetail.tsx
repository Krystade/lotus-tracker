import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { textOn } from "../layout/colors";
import type { CounterKey } from "../state/types";
import {
  COMMANDER_DAMAGE_LETHAL,
  POISON_LETHAL,
} from "../state/types";

const STANDARD_COUNTERS: { key: CounterKey; label: string }[] = [
  { key: "poison", label: "Poison" },
  { key: "energy", label: "Energy" },
  { key: "experience", label: "Experience" },
  { key: "storm", label: "Storm" },
  { key: "charge", label: "Charge" },
];

interface Props {
  playerId: string;
  onClose: () => void;
}

export function PlayerDetail({ playerId, onClose }: Props) {
  // Select the stable players array; deriving player/others via find/filter
  // inside the selector would return a new reference each render and trigger an
  // infinite useSyncExternalStore loop.
  const players = useStore((s) => s.game.players);
  // The seat's rotation so the panel opens facing that player (returns a stable
  // number primitive — safe selector).
  const rotation = useStore(
    (s) =>
      s.game.layout.placements.find((p) => p.playerId === playerId)?.rotation ??
      0,
  );
  const adjustCounter = useStore((s) => s.adjustCounter);
  const bumpTax = useStore((s) => s.bumpTax);
  const adjustCommanderDamage = useStore((s) => s.adjustCommanderDamage);
  const setLife = useStore((s) => s.setLife);
  const addCustomCounter = useStore((s) => s.addCustomCounter);
  const adjustCustomCounter = useStore((s) => s.adjustCustomCounter);
  const removeCustomCounter = useStore((s) => s.removeCustomCounter);
  const toggleEliminated = useStore((s) => s.toggleEliminated);
  const setPlayerName = useStore((s) => s.setPlayerName);

  const [lifeInput, setLifeInput] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [newCounter, setNewCounter] = useState("");

  const player = players.find((p) => p.id === playerId);
  const others = players.filter((p) => p.id !== playerId);

  useEffect(() => {
    setNameDraft(player?.name ?? "");
  }, [playerId, player?.name]);

  if (!player) return null;

  const rotated = rotation === 90 || rotation === 270;

  // Commit + resync the draft to the canonical stored name (handles empty ->
  // default and trailing-space -> unchanged without desyncing the field).
  const commitName = () => {
    const seat = Number(playerId.slice(1)) + 1;
    const canonical = nameDraft.trim().slice(0, 16) || `P${seat}`;
    setPlayerName(playerId, nameDraft);
    setNameDraft(canonical);
  };

  const addCounter = () => {
    const name = newCounter.trim();
    if (!name) return;
    addCustomCounter(playerId, name);
    setNewCounter("");
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="rot-wrap" style={{ transform: `rotate(${rotation}deg)` }}>
        <div
          className={`panel${rotated ? " panel--rot" : ""}`}
          onClick={(e) => e.stopPropagation()}
          style={{ borderColor: player.color }}
        >
        <div className="panel__head" style={{ background: player.color }}>
          <input
            className="panel__name"
            value={nameDraft}
            placeholder="Name"
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitName();
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                commitName(); // commit before App's Escape handler unmounts us
              }
            }}
            maxLength={16}
            aria-label="player name (tap to edit)"
            style={{ color: textOn(player.color) }}
          />
          <button className="panel__x" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>

        <div className="panel__body">
          <section className="panel__section">
            <div className="panel__life">
              <span className="panel__life-num">{player.life}</span>
              <div className="panel__life-set">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="set"
                  value={lifeInput}
                  onChange={(e) => setLifeInput(e.target.value)}
                />
                <button
                  onClick={() => {
                    if (lifeInput.trim() !== "")
                      setLife(playerId, Number(lifeInput));
                    setLifeInput("");
                  }}
                >
                  Set life
                </button>
              </div>
            </div>
          </section>

          <section className="panel__section">
            <h3>Counters</h3>
            <CounterRow
              label="Commander tax"
              value={player.counters.tax}
              onDec={() => bumpTax(playerId, -1)}
              onInc={() => bumpTax(playerId, 1)}
              hint="+2"
            />
            {STANDARD_COUNTERS.map(({ key, label }) => (
              <CounterRow
                key={key}
                label={label}
                value={player.counters[key]}
                warn={key === "poison" && player.counters.poison >= POISON_LETHAL}
                onDec={() => adjustCounter(playerId, key, -1)}
                onInc={() => adjustCounter(playerId, key, 1)}
              />
            ))}
            {player.counters.custom.map((c) => (
              <CounterRow
                key={c.id}
                label={c.name}
                value={c.value}
                onDec={() => adjustCustomCounter(playerId, c.id, -1)}
                onInc={() => adjustCustomCounter(playerId, c.id, 1)}
                onRemove={() => removeCustomCounter(playerId, c.id)}
              />
            ))}
            <div className="panel__addrow">
              <input
                className="panel__addinput"
                value={newCounter}
                placeholder="New counter name"
                maxLength={16}
                onChange={(e) => setNewCounter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCounter();
                }}
              />
              <button className="panel__add" onClick={addCounter}>
                + Add
              </button>
            </div>
          </section>

          {others.length > 0 && (
            <section className="panel__section">
              <h3>Commander damage taken</h3>
              <p className="panel__note">
                Adjusting also changes life. {COMMANDER_DAMAGE_LETHAL} from one
                commander is lethal.
              </p>
              {others.map((o) => {
                const dmg = player.commanderDamage[o.id] ?? 0;
                return (
                  <CounterRow
                    key={o.id}
                    label={`from ${o.name}`}
                    swatch={o.color}
                    value={dmg}
                    warn={dmg >= COMMANDER_DAMAGE_LETHAL}
                    onDec={() => adjustCommanderDamage(playerId, o.id, -1)}
                    onInc={() => adjustCommanderDamage(playerId, o.id, 1)}
                  />
                );
              })}
            </section>
          )}

          <section className="panel__section">
            <button
              className={`panel__elim${player.eliminated ? " is-on" : ""}`}
              onClick={() => toggleEliminated(playerId)}
            >
              {player.eliminated ? "Eliminated ✓ (tap to revive)" : "Mark eliminated"}
            </button>
          </section>
        </div>
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  label: string;
  value: number;
  onDec: () => void;
  onInc: () => void;
  onRemove?: () => void;
  warn?: boolean;
  hint?: string;
  swatch?: string;
}

function CounterRow({
  label,
  value,
  onDec,
  onInc,
  onRemove,
  warn,
  hint,
  swatch,
}: RowProps) {
  return (
    <div className={`crow${warn ? " crow--warn" : ""}`}>
      <span className="crow__label">
        {swatch && (
          <span className="crow__swatch" style={{ background: swatch }} />
        )}
        {label}
        {hint && <em className="crow__hint">{hint}</em>}
      </span>
      <div className="crow__ctrls">
        <button onClick={onDec} aria-label={`decrease ${label}`}>
          –
        </button>
        <span className="crow__val">{value}</span>
        <button onClick={onInc} aria-label={`increase ${label}`}>
          +
        </button>
        {onRemove && (
          <button
            className="crow__rm"
            onClick={onRemove}
            aria-label={`remove ${label}`}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
