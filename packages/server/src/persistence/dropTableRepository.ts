import { DatabaseSync } from 'node:sqlite';
import { ITEM_TYPES, type ItemType } from '@bomberman/shared';
import { DEFAULT_DROP_TABLE, type DropTable } from '../engine/drops.js';

/**
 * Persiste la table des probabilités d'apparition des objets — la seule donnée que la
 * spécification fonctionnelle demande explicitement de stocker en base. Accepte un chemin de
 * fichier ou `:memory:` (tests).
 */
export class DropTableRepository {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS item_drop_rates (
        item_type TEXT PRIMARY KEY,
        weight REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS drop_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        drop_chance REAL NOT NULL
      );
    `);
    this.seedIfEmpty();
  }

  private seedIfEmpty(): void {
    const { n } = this.db.prepare('SELECT COUNT(*) AS n FROM item_drop_rates').get() as {
      n: number;
    };
    if (n > 0) return;
    const insertWeight = this.db.prepare(
      'INSERT INTO item_drop_rates (item_type, weight) VALUES (?, ?)',
    );
    for (const type of ITEM_TYPES) insertWeight.run(type, DEFAULT_DROP_TABLE.weights[type]);
    this.db
      .prepare('INSERT INTO drop_settings (id, drop_chance) VALUES (1, ?)')
      .run(DEFAULT_DROP_TABLE.dropChance);
  }

  /** Charge la table courante (appelée au début de chaque manche). */
  load(): DropTable {
    const weights = { ...DEFAULT_DROP_TABLE.weights };
    const rows = this.db.prepare('SELECT item_type, weight FROM item_drop_rates').all() as {
      item_type: ItemType;
      weight: number;
    }[];
    for (const row of rows) weights[row.item_type] = row.weight;

    const settingsRow = this.db
      .prepare('SELECT drop_chance FROM drop_settings WHERE id = 1')
      .get() as { drop_chance: number } | undefined;

    return { dropChance: settingsRow?.drop_chance ?? DEFAULT_DROP_TABLE.dropChance, weights };
  }

  /** Met à jour les probabilités (ex. depuis un futur écran d'administration). */
  save(table: DropTable): void {
    this.db.prepare('UPDATE drop_settings SET drop_chance = ? WHERE id = 1').run(table.dropChance);
    const update = this.db.prepare('UPDATE item_drop_rates SET weight = ? WHERE item_type = ?');
    for (const type of ITEM_TYPES) update.run(table.weights[type], type);
  }

  close(): void {
    this.db.close();
  }
}
