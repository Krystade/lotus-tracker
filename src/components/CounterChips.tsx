import { POISON_LETHAL, type CounterKey, type CounterSet } from "../state/types";

/**
 * Abbreviated so up to six chips still fit across a narrow tile. The full name
 * is what assistive tech announces — the short form is purely for sighted
 * players reading a tile from across the table.
 */
const LABELS: Array<[CounterKey, short: string, full: string]> = [
  ["tax", "TAX", "commander tax"],
  ["poison", "PSN", "poison"],
  ["energy", "NRG", "energy"],
  ["experience", "EXP", "experience"],
  ["storm", "STM", "storm"],
  ["charge", "CHG", "charge"],
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
    <div className="tile__chips">
      {standard.map(([key, short, full]) => (
        <span
          key={key}
          role="img"
          aria-label={`${full} ${counters[key]}`}
          className={`tile__chip${
            key === "poison" && counters.poison >= POISON_LETHAL
              ? " tile__chip--warn"
              : ""
          }`}
        >
          {short} {counters[key]}
        </span>
      ))}
      {custom.map((c) => (
        <span
          key={c.id}
          role="img"
          aria-label={`${c.name} ${c.value}`}
          className="tile__chip"
        >
          {c.name.slice(0, 3).toUpperCase()} {c.value}
        </span>
      ))}
    </div>
  );
}
