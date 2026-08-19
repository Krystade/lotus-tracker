import type { CSSProperties } from "react";
import { HUES, LOOK_STYLES, lookId, resolveLook } from "../layout/looks";
import { LookPreview } from "./LookPreview";

interface Props {
  /** Current look id. */
  value: string;
  onChange: (lookId: string) => void;
  /** The seat's own colour, used when the look has never been set. */
  seatColor: string;
}

/**
 * Colour(s) plus style, shared by the player detail panel and the new-game
 * editor so the two cannot drift apart.
 *
 * Two axes rather than one grid: the catalogue is unbounded now that colours
 * can come from a wheel, but a player only ever sees six presets, a wheel, and
 * eleven styles.
 */
export function LookPicker({ value, onChange, seatColor }: Props) {
  const current = resolveLook(value, seatColor);
  const spec = current.colourSpec;
  const primary = spec[0];
  const secondary = spec[1];
  const style = current.styleId;
  const styleDef = LOOK_STYLES.find((s) => s.id === style);
  // Only styles that paint more than one layer can show two colours; on a
  // single-layer style a second colour would have nowhere to go.
  const supportsTwo = (styleDef?.layers ?? 0) >= 2;

  const emit = (colours: string[], styleId: string) =>
    onChange(lookId(colours.filter(Boolean).join("~"), styleId));

  const setPrimary = (c: string) => emit([c, secondary ?? ""], style);
  const setSecondary = (c: string | null) =>
    emit(c ? [primary, c] : [primary], style);

  const swatchFor = (colour: string, styleId: string) =>
    resolveLook(lookId(colour, styleId), seatColor);

  // One element, not a fragment. The detail panel lays its sections out as a
  // two-column grid when rotated, and a fragment's children each become an
  // independent grid item -- which scattered the labels away from their rows
  // and pushed Counters off screen. A single wrapper keeps the picker's
  // internals its own business.
  return (
    <div className="picker">
      <p className="picker__label">Colour</p>
      <div className="huerow">
        {HUES.map((h) => (
          <button
            key={h.id}
            className={`huedot${primary === h.id ? " is-on" : ""}`}
            style={{ background: h.base }}
            onClick={() => setPrimary(h.id)}
            aria-label={h.name}
            aria-pressed={primary === h.id}
          />
        ))}
        <label
          className={`huedot huedot--wheel${primary.startsWith("#") ? " is-on" : ""}`}
          style={
            { background: current.base, "--wheel": current.base } as CSSProperties
          }
          title="Custom colour"
        >
          <input
            type="color"
            value={current.base}
            onChange={(e) => setPrimary(e.target.value.toLowerCase())}
            aria-label="custom colour"
          />
        </label>
      </div>

      {supportsTwo && (
        <>
          <p className="picker__label">
            Second colour <em>optional</em>
          </p>
          <div className="huerow">
            <button
              className={`huedot huedot--none${!secondary ? " is-on" : ""}`}
              onClick={() => setSecondary(null)}
              aria-label="no second colour"
              aria-pressed={!secondary}
            >
              ✕
            </button>
            {HUES.map((h) => (
              <button
                key={h.id}
                className={`huedot${secondary === h.id ? " is-on" : ""}`}
                style={{ background: h.base }}
                onClick={() => setSecondary(h.id)}
                aria-label={`second colour ${h.name}`}
                aria-pressed={secondary === h.id}
              />
            ))}
            <label
              className={`huedot huedot--wheel${
                secondary?.startsWith("#") ? " is-on" : ""
              }`}
              style={{ background: secondary?.startsWith("#") ? secondary : "#555" }}
              title="Custom second colour"
            >
              <input
                type="color"
                value={secondary?.startsWith("#") ? secondary : "#888888"}
                onChange={(e) => setSecondary(e.target.value.toLowerCase())}
                aria-label="custom second colour"
              />
            </label>
          </div>
        </>
      )}

      <p className="picker__label">Style</p>
      <div className="stylerow">
        {LOOK_STYLES.map((st) => (
          <button
            key={st.id}
            className={`stylechip${style === st.id ? " is-on" : ""}`}
            onClick={() => emit(spec, st.id)}
            aria-label={st.name}
            aria-pressed={style === st.id}
          >
            <LookPreview
              look={swatchFor(spec.join("~"), st.id)}
              className="stylechip__art"
            />
            {/* Named because Smoke and Lava are not tellable apart at this
                size on a phone. */}
            <span className="stylechip__name">{st.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
