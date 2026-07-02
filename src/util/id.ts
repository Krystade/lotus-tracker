/**
 * Small unique id. Prefers crypto.randomUUID but falls back for non-secure
 * contexts (e.g. testing over http://<lan-ip> on mobile Safari, where
 * crypto.randomUUID is unavailable).
 */
export function uid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
