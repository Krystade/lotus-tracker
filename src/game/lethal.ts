import {
  COMMANDER_DAMAGE_LETHAL,
  POISON_LETHAL,
  type Player,
} from "../state/types";

export function isPoisonLethal(poison: number): boolean {
  return poison >= POISON_LETHAL;
}

/** True if any single commander-damage source has reached the lethal threshold. */
export function isCommanderDamageLethal(
  commanderDamage: Record<string, number>,
): boolean {
  return Object.values(commanderDamage).some(
    (d) => d >= COMMANDER_DAMAGE_LETHAL,
  );
}

/** A player is "dead by rule" if life <= 0, poisoned out, or hit by 21 cmdr dmg. */
export function isPlayerDead(player: Player): boolean {
  return (
    player.life <= 0 ||
    isPoisonLethal(player.counters.poison) ||
    isCommanderDamageLethal(player.commanderDamage)
  );
}
