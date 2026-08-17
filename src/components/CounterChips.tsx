import { POISON_LETHAL, type CounterKey, type CounterSet } from "../state/types";

/** Which counter a chip refers to, for the quick-adjust popover. */
export type CounterRef =
  | { kind: "standard"; key: CounterKey }
  | { kind: "custom"; id: string };

/**
 * Abbreviated so several chips still fit across a narrow tile. The full name
 * is what assistive tech announces and what the quick-adjust popover titles
 * itself with — the short form is purely for sighted players reading a tile
 * from across the table.
 */
export const COUNTER_LABELS: Array<[CounterKey, short: string, full: string]> = [
  ["tax", "TAX", "commander tax"],
  ["poison", "PSN", "poison"],
  ["energy", "NRG", "energy"],
  ["experience", "EXP", "experience"],
  ["storm", "STM", "storm"],
  ["charge", "CHG", "charge"],
];

interface Props {
  counters: CounterSet;
  /** When given, chips become tappable and open the quick-adjust popover. */
  onPick?: (ref: CounterRef) => void;
}

/**
 * Counters shown on the tile itself, next to the life total, so a player can
 * see what is on them without opening the detail panel. Only counters actually
 * in play are drawn — an untouched tile stays clean and chips appear as the
 * game develops.
 */
export function CounterChips({ counters, onPick }: Props) {
  const standard = COUNTER_LABELS.filter(([key]) => counters[key] > 0);
  const custom = counters.custom.filter((c) => c.value > 0);
  if (standard.length === 0 && custom.length === 0) return null;

  const total = standard.length + custom.length;

  const chip = (
    key: string,
    ref: CounterRef,
    short: string,
    full: string,
    value: number,
    warn: boolean,
  ) => {
    const className = `tile__chip${warn ? " tile__chip--warn" : ""}`;
    const text = (
      <>
        {short} {value}
      </>
    );
    return onPick ? (
      <button
        key={key}
        className={className}
        aria-label={`${full} ${value}, tap to adjust`}
        onClick={() => onPick(ref)}
      >
        {text}
      </button>
    ) : (
      <span key={key} role="img" aria-label={`${full} ${value}`} className={className}>
        {text}
      </span>
    );
  };

  return (
    // With more than one chip the row spreads across the tile's whole bottom
    // edge; a lone chip keeps its natural width rather than stretching.
    <div className={`tile__chips${total > 1 ? " tile__chips--multi" : ""}`}>
      {standard.map(([key, short, full]) =>
        chip(
          key,
          { kind: "standard", key },
          short,
          full,
          counters[key],
          key === "poison" && counters.poison >= POISON_LETHAL,
        ),
      )}
      {custom.map((c) =>
        chip(
          c.id,
          { kind: "custom", id: c.id },
          c.name.slice(0, 3).toUpperCase(),
          c.name,
          c.value,
          false,
        ),
      )}
    </div>
  );
}
