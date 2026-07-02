/** Format a whole number of seconds as m:ss (or mm:ss for >= 10 minutes). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  const mm = minutes < 10 ? `${minutes}` : `${minutes}`;
  return `${mm}:${seconds.toString().padStart(2, "0")}`;
}

/** Format total game time as mm:ss with zero-padded minutes. */
export function formatGameClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}
