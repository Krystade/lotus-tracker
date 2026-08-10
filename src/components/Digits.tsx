/** Digits that read as a different number upside down. */
const AMBIGUOUS = new Set(["6", "9"]);

/**
 * Renders a number with 6 and 9 underlined, the standard dice convention for
 * telling them apart. The phone lies flat in the middle of the table, so every
 * number is read from some rotated seat where a 6 is otherwise a 9.
 */
export function Digits({ value }: { value: number }) {
  return (
    <>
      {String(value)
        .split("")
        .map((ch, i) =>
          AMBIGUOUS.has(ch) ? (
            <span key={i} className="digit--ambiguous">
              {ch}
            </span>
          ) : (
            ch
          ),
        )}
    </>
  );
}
