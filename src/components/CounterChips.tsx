import { POISON_LETHAL, type CounterKey, type CounterSet } from "../state/types";

/** Abbreviated so up to six chips still fit across a narrow tile. */
const LABELS: Array<[CounterKey, string]> = [
  ["tax", "TAX"],
  ["poison", "PSN"],
  ["energy", "NRG"],
  ["experience", "EXP"],
  ["storm", "STM"],
  ["charge", "CHG"],
];

/**
 * Counters shown on the tile itself, next to the life total, so a player can
 * see what is on them without opening the detail panel. Only counters actually
 * in play are drawn — an untouched tile stays clean and chips appear as the
 * game develops.
 *
 * Display only: the tile already has a dedicated control for opening the
 * detail panel, and tap targets here would compete with the life buttons.
 */
export function CounterChips({ counters }: { counters: CounterSet }) {
  const standard = LABELS.filter(([key]) => counters[key] > 0);
  const custom = counters.custom.filter((c) => c.value > 0);
  if (standard.length === 0 && custom.length === 0) return null;

  return (
    <div className="tile__chips" aria-hidden>
      {standard.map(([key, label]) => (
        <span
          key={key}
          className={`tile__chip${
            key === "poison" && counters.poison >= POISON_LETHAL
              ? " tile__chip--warn"
              : ""
          }`}
        >
          {label} {counters[key]}
        </span>
      ))}
      {custom.map((c) => (
        <span key={c.id} className="tile__chip">
          {c.name.slice(0, 3).toUpperCase()} {c.value}
        </span>
      ))}
    </div>
  );
}
