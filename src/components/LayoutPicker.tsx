import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { colorForSeat } from "../layout/colors";
import { allBuiltInPresets } from "../layout/presets";
import type { LayoutConfig, Placement, Rotation } from "../state/types";

interface Props {
  onClose: () => void;
}

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

function seatOf(playerId: string): number {
  return Number(playerId.slice(1));
}

/** Mini colored preview of a layout on a small grid. */
function Mini({ layout }: { layout: LayoutConfig }) {
  return (
    <div
      className="mini"
      style={{
        gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
        gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
      }}
    >
      {layout.placements.map((p) => (
        <span
          key={p.playerId}
          className="mini__cell"
          style={{
            background: colorForSeat(seatOf(p.playerId)),
            gridRow: `${p.row} / span ${p.rowSpan}`,
            gridColumn: `${p.col} / span ${p.colSpan}`,
          }}
        >
          <span style={{ transform: `rotate(${p.rotation}deg)` }}>▲</span>
        </span>
      ))}
    </div>
  );
}

export function LayoutPicker({ onClose }: Props) {
  const [tab, setTab] = useState<"presets" | "custom">("presets");
  const applyLayout = useStore((s) => s.applyLayout);
  const saveCustomLayout = useStore((s) => s.saveCustomLayout);
  const deleteCustomLayout = useStore((s) => s.deleteCustomLayout);
  const customLayouts = useStore((s) => s.customLayouts);
  const builtIns = useMemo(() => allBuiltInPresets(), []);

  const apply = (layout: LayoutConfig) => {
    applyLayout(layout);
    onClose();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel panel--center" onClick={(e) => e.stopPropagation()}>
        <div className="panel__head panel__head--dark">
          <span>Layout</span>
          <button className="panel__x" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        <div className="tabs">
          <button
            className={`tabs__tab${tab === "presets" ? " is-on" : ""}`}
            onClick={() => setTab("presets")}
          >
            Presets
          </button>
          <button
            className={`tabs__tab${tab === "custom" ? " is-on" : ""}`}
            onClick={() => setTab("custom")}
          >
            Customize
          </button>
        </div>

        <div className="panel__body">
          {tab === "presets" ? (
            <>
              <div className="preset-grid">
                {builtIns.map((l) => (
                  <button key={l.id} className="preset" onClick={() => apply(l)}>
                    <Mini layout={l} />
                    <span>{l.name}</span>
                  </button>
                ))}
              </div>
              {customLayouts.length > 0 && (
                <>
                  <h3>Your layouts</h3>
                  <div className="preset-grid">
                    {customLayouts.map((l) => (
                      <div key={l.id} className="preset preset--custom">
                        <button onClick={() => apply(l)}>
                          <Mini layout={l} />
                          <span>{l.name}</span>
                        </button>
                        <button
                          className="preset__del"
                          onClick={() => deleteCustomLayout(l.id)}
                          aria-label="delete layout"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <CustomEditor
              onApply={apply}
              onSave={(name, layout) => {
                applyLayout(layout);
                saveCustomLayout(name);
                onClose();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CustomEditor({
  onApply,
  onSave,
}: {
  onApply: (l: LayoutConfig) => void;
  onSave: (name: string, l: LayoutConfig) => void;
}) {
  const current = useStore((s) => s.game.layout);
  const [rows, setRows] = useState(current.rows);
  const [cols, setCols] = useState(current.cols);
  const [paint, setPaint] = useState(0);
  const [rotations, setRotations] = useState<Record<number, Rotation>>(() => {
    const r: Record<number, Rotation> = {};
    current.placements.forEach((p) => (r[seatOf(p.playerId)] = p.rotation));
    return r;
  });

  // grid[r][c] = seat index or -1 (empty). Initialized from current layout.
  const [grid, setGrid] = useState<number[][]>(() => {
    const g = Array.from({ length: current.rows }, () =>
      Array.from({ length: current.cols }, () => -1),
    );
    current.placements.forEach((p) => {
      for (let r = p.row - 1; r < p.row - 1 + p.rowSpan; r++) {
        for (let c = p.col - 1; c < p.col - 1 + p.colSpan; c++) {
          if (g[r] && c < g[r].length) g[r][c] = seatOf(p.playerId);
        }
      }
    });
    return g;
  });

  const resize = (nextRows: number, nextCols: number) => {
    setRows(nextRows);
    setCols(nextCols);
    setGrid(
      Array.from({ length: nextRows }, (_, r) =>
        Array.from({ length: nextCols }, (_, c) => grid[r]?.[c] ?? -1),
      ),
    );
  };

  const paintCell = (r: number, c: number) => {
    setGrid((g) => g.map((row, ri) => row.map((v, ci) => (ri === r && ci === c ? paint : v))));
  };

  const build = (): LayoutConfig | null => {
    const seats = new Map<number, { minR: number; maxR: number; minC: number; maxC: number }>();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const seat = grid[r][c];
        if (seat < 0) continue;
        const box = seats.get(seat);
        if (!box) seats.set(seat, { minR: r, maxR: r, minC: c, maxC: c });
        else {
          box.minR = Math.min(box.minR, r);
          box.maxR = Math.max(box.maxR, r);
          box.minC = Math.min(box.minC, c);
          box.maxC = Math.max(box.maxC, c);
        }
      }
    }
    if (seats.size === 0) return null;
    // Re-index seats to a contiguous 0..n-1 order (top-left first).
    const ordered = [...seats.entries()].sort(
      (a, b) => a[1].minR - b[1].minR || a[1].minC - b[1].minC,
    );
    const placements: Placement[] = ordered.map(([seat, box], i) => ({
      playerId: `p${i}`,
      row: box.minR + 1,
      col: box.minC + 1,
      rowSpan: box.maxR - box.minR + 1,
      colSpan: box.maxC - box.minC + 1,
      rotation: rotations[seat] ?? 0,
    }));
    return {
      id: `custom-draft`,
      name: `${placements.length} players`,
      playerCount: placements.length,
      rows,
      cols,
      placements,
      builtIn: false,
    };
  };

  const usedSeats = [...new Set(grid.flat().filter((s) => s >= 0))].sort();

  const cycleRotation = (seat: number) =>
    setRotations((r) => {
      const cur = r[seat] ?? 0;
      const next = ROTATIONS[(ROTATIONS.indexOf(cur) + 1) % 4];
      return { ...r, [seat]: next };
    });

  return (
    <div className="editor">
      <div className="editor__row">
        <span>Rows</span>
        <Stepper value={rows} min={1} max={4} onChange={(v) => resize(v, cols)} />
        <span>Cols</span>
        <Stepper value={cols} min={1} max={3} onChange={(v) => resize(rows, v)} />
      </div>

      <p className="panel__sublabel">Paint a seat, then tap cells:</p>
      <div className="palette">
        {[0, 1, 2, 3, 4, 5].map((seat) => (
          <button
            key={seat}
            className={`palette__swatch${paint === seat ? " is-on" : ""}`}
            style={{ background: colorForSeat(seat) }}
            onClick={() => setPaint(seat)}
          >
            {seat + 1}
          </button>
        ))}
        <button
          className={`palette__swatch palette__erase${paint === -1 ? " is-on" : ""}`}
          onClick={() => setPaint(-1)}
        >
          erase
        </button>
      </div>

      <div
        className="editor__grid"
        style={{
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
        }}
      >
        {grid.map((row, r) =>
          row.map((seat, c) => (
            <button
              key={`${r}-${c}`}
              className="editor__cell"
              style={{ background: seat >= 0 ? colorForSeat(seat) : "#1c1c1e" }}
              onClick={() => paintCell(r, c)}
            >
              {seat >= 0 && (
                <span style={{ transform: `rotate(${rotations[seat] ?? 0}deg)` }}>
                  ▲
                </span>
              )}
            </button>
          )),
        )}
      </div>

      {usedSeats.length > 0 && (
        <>
          <p className="panel__sublabel">Facing (tap to rotate):</p>
          <div className="palette">
            {usedSeats.map((seat) => (
              <button
                key={seat}
                className="palette__swatch"
                style={{ background: colorForSeat(seat) }}
                onClick={() => cycleRotation(seat)}
              >
                <span style={{ transform: `rotate(${rotations[seat] ?? 0}deg)` }}>
                  ▲
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="editor__actions">
        <button
          className="bigbtn"
          onClick={() => {
            const l = build();
            if (l) onApply(l);
          }}
        >
          Apply
        </button>
        <button
          className="bigbtn bigbtn--ghost"
          onClick={() => {
            const l = build();
            if (!l) return;
            const name = window.prompt("Name this layout?");
            if (name) onSave(name, l);
          }}
        >
          Save as preset
        </button>
      </div>
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - 1))}>–</button>
      <span>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}
