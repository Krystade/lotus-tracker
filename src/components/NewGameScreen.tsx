import { useState } from "react";
import { useStore } from "../state/store";
import { LOOKS, lookById } from "../layout/looks";
import { textOn } from "../layout/colors";

const LIFE_PRESETS = [20, 30, 40];

interface Props {
  onClose: () => void;
}

export function NewGameScreen({ onClose }: Props) {
  const currentCount = useStore((s) => s.game.players.length);
  const currentLife = useStore((s) => s.game.startingLife);
  const newGame = useStore((s) => s.newGame);
  const profiles = useStore((s) => s.profiles);
  const setups = useStore((s) => s.setups);
  const addProfile = useStore((s) => s.addProfile);
  const updateProfile = useStore((s) => s.updateProfile);
  const deleteProfile = useStore((s) => s.deleteProfile);
  const saveSetup = useStore((s) => s.saveSetup);
  const applySetup = useStore((s) => s.applySetup);
  const deleteSetup = useStore((s) => s.deleteSetup);

  const [count, setCount] = useState(currentCount);
  const [life, setLife] = useState(currentLife);
  const [customLife, setCustomLife] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftLook, setDraftLook] = useState(LOOKS[0].id);
  const [setupName, setSetupName] = useState("");

  const isCustom = customLife.trim() !== "";
  // Picking saved players decides the pod size; otherwise the chips do.
  const seats = picked.length > 0 ? picked.length : count;

  const toggle = (id: string) =>
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
    );

  const openEditor = (id: string | "new") => {
    setEditing(id);
    if (id === "new") {
      setDraftName("");
      setDraftLook(LOOKS[picked.length % LOOKS.length].id);
    } else {
      const p = profiles.find((x) => x.id === id);
      setDraftName(p?.name ?? "");
      setDraftLook(p?.look ?? LOOKS[0].id);
    }
  };

  const commitEditor = () => {
    if (editing === "new") addProfile(draftName, draftLook);
    else if (editing) updateProfile(editing, { name: draftName, look: draftLook });
    setEditing(null);
  };

  const start = () => {
    newGame({
      playerCount: seats,
      startingLife: life,
      profileIds: picked.length > 0 ? picked : undefined,
    });
    onClose();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel panel--center" onClick={(e) => e.stopPropagation()}>
        <div className="panel__head panel__head--dark">
          <span>New game</span>
          <button className="panel__x" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        <div className="panel__body">
          {setups.length > 0 && (
            <section className="panel__section">
              <h3>Saved setups</h3>
              <div className="setups">
                {setups.map((st) => (
                  <div key={st.id} className="setup">
                    <button
                      className="setup__load"
                      onClick={() => {
                        applySetup(st.id);
                        onClose();
                      }}
                    >
                      <strong>{st.name}</strong>
                      <em>
                        {st.playerCount}p · {st.startingLife} life ·{" "}
                        {st.turnTimerEnabled
                          ? `${Math.round(st.defaultTurnBudgetSec / 60)}m`
                          : "no timer"}
                      </em>
                    </button>
                    <button
                      className="setup__del"
                      onClick={() => deleteSetup(st.id)}
                      aria-label={`delete setup ${st.name}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel__section">
            <h3>Players</h3>
            <div className="roster">
              {profiles.map((p) => {
                const look = lookById(p.look) ?? LOOKS[0];
                const on = picked.includes(p.id);
                return (
                  <div key={p.id} className={`rost${on ? " rost--on" : ""}`}>
                    <button className="rost__pick" onClick={() => toggle(p.id)}>
                      <span
                        className="rost__swatch"
                        style={{ background: look.css }}
                      />
                      <span className="rost__name">{p.name}</span>
                      <span className="rost__tick">{on ? "✓" : ""}</span>
                    </button>
                    <button
                      className="rost__edit"
                      onClick={() => openEditor(p.id)}
                      aria-label={`edit ${p.name}`}
                    >
                      ✎
                    </button>
                  </div>
                );
              })}
              <button className="rost__add" onClick={() => openEditor("new")}>
                + New player
              </button>
            </div>

            {editing && (
              <div className="editrow">
                <input
                  className="panel__addinput"
                  value={draftName}
                  placeholder="Name"
                  maxLength={16}
                  onChange={(e) => setDraftName(e.target.value)}
                  aria-label="player name"
                />
                <div className="lookgrid">
                  {LOOKS.map((l) => (
                    <button
                      key={l.id}
                      className={`lookchip${draftLook === l.id ? " is-on" : ""}`}
                      style={{ background: l.css, color: textOn(l.base) }}
                      onClick={() => setDraftLook(l.id)}
                      aria-label={l.name}
                      title={l.name}
                    >
                      {draftLook === l.id ? "✓" : ""}
                    </button>
                  ))}
                </div>
                <div className="editrow__actions">
                  <button className="linkbtn" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                  {editing !== "new" && (
                    <button
                      className="linkbtn linkbtn--danger"
                      onClick={() => {
                        deleteProfile(editing);
                        setPicked((p) => p.filter((x) => x !== editing));
                        setEditing(null);
                      }}
                    >
                      Delete
                    </button>
                  )}
                  <button className="panel__add" onClick={commitEditor}>
                    Save
                  </button>
                </div>
              </div>
            )}

            {picked.length === 0 && (
              <div className="chipgrid">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    className={`chip${count === n ? " is-on" : ""}`}
                    onClick={() => setCount(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="panel__section">
            <h3>Starting life</h3>
            <div className="chipgrid">
              {LIFE_PRESETS.map((n) => (
                <button
                  key={n}
                  className={`chip${life === n && !isCustom ? " is-on" : ""}`}
                  onClick={() => {
                    setLife(n);
                    setCustomLife("");
                  }}
                >
                  {n}
                </button>
              ))}
              <input
                className={`chip chip--input${isCustom ? " is-on" : ""}`}
                type="number"
                inputMode="numeric"
                placeholder="Custom"
                value={customLife}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomLife(v);
                  const n = Number(v);
                  if (v.trim() !== "" && Number.isFinite(n)) setLife(n);
                }}
              />
            </div>
          </section>

          <button className="bigbtn" onClick={start}>
            Start game
          </button>
          <p className="panel__note">
            Resets life, counters, and turn order for {seats} player
            {seats === 1 ? "" : "s"} at {life} life.
          </p>

          <section className="panel__section">
            <div className="panel__addrow">
              <input
                className="panel__addinput"
                value={setupName}
                placeholder="Save this setup as…"
                maxLength={24}
                onChange={(e) => setSetupName(e.target.value)}
                aria-label="setup name"
              />
              <button
                className="panel__add"
                onClick={() => {
                  saveSetup(setupName);
                  setSetupName("");
                }}
              >
                Save
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
