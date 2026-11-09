import { ITEM_TYPES } from '@bomberman/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DROP_TABLE } from '../src/engine/drops.js';
import { DropTableRepository } from '../src/persistence/dropTableRepository.js';

describe('DropTableRepository', () => {
  let repo: DropTableRepository;

  beforeEach(() => {
    repo = new DropTableRepository(':memory:');
  });

  afterEach(() => repo.close());

  it('amorce la base avec la table par défaut au premier démarrage', () => {
    const table = repo.load();
    expect(table.dropChance).toBeCloseTo(DEFAULT_DROP_TABLE.dropChance);
    for (const type of ITEM_TYPES)
      expect(table.weights[type]).toBe(DEFAULT_DROP_TABLE.weights[type]);
  });

  it('persiste les modifications entre deux lectures', () => {
    repo.save({ dropChance: 0.5, weights: { ...DEFAULT_DROP_TABLE.weights, RANGE_UP: 999 } });
    const reloaded = repo.load();
    expect(reloaded.dropChance).toBeCloseTo(0.5);
    expect(reloaded.weights.RANGE_UP).toBe(999);
  });
});
