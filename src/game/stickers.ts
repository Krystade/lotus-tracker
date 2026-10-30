import type { StickerHold, StickerId } from "../state/types";

export interface StickerDef {
  id: StickerId;
  icon: string;
  name: string;
}

/** Shared markers that sit with one player at a time and change hands. */
export const STICKERS: StickerDef[] = [
  { id: "monarch", icon: "👑", name: "Monarch" },
  { id: "initiative", icon: "🏰", name: "Initiative" },
  { id: "blessing", icon: "🏙️", name: "City's Blessing" },
  { id: "ring", icon: "💍", name: "The Ring" },
];

export const stickerDef = (id: StickerId): StickerDef =>
  STICKERS.find((s) => s.id === id) ?? STICKERS[0];

const IDS = new Set<string>(STICKERS.map((s) => s.id));

/**
 * Hand a sticker to a player, or take it off the table with null. Each
 * sticker has one holder, so giving it moves it.
 */
export function giveSticker(
  stickers: StickerHold[],
  id: StickerId,
  holder: string | null,
): StickerHold[] {
  const rest = stickers.filter((s) => s.id !== id);
  return holder ? [...rest, { id, holder }] : rest;
}

/** Drop anything malformed, unknown, duplicated or held by a missing seat. */
export function sanitizeStickers(v: unknown, seats: Set<string>): StickerHold[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: StickerHold[] = [];
  for (const raw of v) {
    const s = raw as Partial<StickerHold> | null;
    if (!s || typeof s.id !== "string" || typeof s.holder !== "string") continue;
    if (!IDS.has(s.id) || !seats.has(s.holder) || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({ id: s.id as StickerId, holder: s.holder });
  }
  return out;
}
