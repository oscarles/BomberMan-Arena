import { BONUS_ITEMS, ITEM_TYPES, type ItemType } from '@bomberman/shared';
import type { Rng } from './rng.js';

/**
 * Table de probabilités d'apparition des objets (stockée en base de données).
 */
export interface DropTable {
  /** Probabilité (0..1) qu'un cube détruit laisse un objet. */
  dropChance: number;
  /** Poids relatif de chaque type d'objet parmi les objets lâchés. */
  weights: Record<ItemType, number>;
}

/** Table utilisée si la base est indisponible ou vide. */
export const DEFAULT_DROP_TABLE: DropTable = {
  dropChance: 0.3,
  weights: { RANGE_UP: 25, BOMB_UP: 25, SPEED_UP: 20, SURPRISE_BOMB: 15, SLOW: 15 },
};

/** Options de tirage issues des réglages du salon. */
export interface DropOptions {
  itemsEnabled: boolean;
  malusEnabled: boolean;
}

/**
 * Tire l'objet lâché par un cube détruit.
 * @returns Le type d'objet, ou `null` si rien n'apparaît.
 */
export function rollDrop(table: DropTable, rng: Rng, options: DropOptions): ItemType | null {
  if (!options.itemsEnabled) return null;
  if (rng.next() >= table.dropChance) return null;

  const candidates = options.malusEnabled ? ITEM_TYPES : BONUS_ITEMS;
  const total = candidates.reduce((sum, type) => sum + Math.max(0, table.weights[type]), 0);
  if (total <= 0) return null;

  let roll = rng.next() * total;
  for (const type of candidates) {
    roll -= Math.max(0, table.weights[type]);
    if (roll < 0) return type;
  }
  return candidates[candidates.length - 1] ?? null;
}
