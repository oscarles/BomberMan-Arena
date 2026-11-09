import type {
  BombState,
  CellType,
  GameEventMessage,
  ItemState,
  PlayerState,
  RoundSnapshot,
} from '@bomberman/shared';

/** Durée d'affichage des flammes après une explosion (alignée sur `flameDurationMs` du serveur). */
export const FLAME_DISPLAY_MS = 500;

/** Case en flammes, affichée jusqu'à `expiresAt`. */
export interface FlameState {
  x: number;
  y: number;
  expiresAt: number;
}

/**
 * Copie locale de l'état de la manche. Le serveur est seul autoritaire : ce modèle n'est modifié
 * que par les événements qu'il envoie (`applyRoundEvent`), jamais par les actions du joueur.
 */
export interface RoundModel {
  roundNumber: number;
  totalRounds: number;
  /** Grille indexée `[y][x]`. */
  grid: CellType[][];
  players: Map<string, PlayerState>;
  bombs: Map<string, BombState>;
  items: Map<string, ItemState>;
  flames: FlameState[];
  /** Instant (ms) auquel la mort subite commence. */
  suddenDeathAt: number;
  suddenDeath: boolean;
}

/** Construit le modèle d'une manche à partir de l'instantané envoyé au démarrage. */
export function createRound(snapshot: RoundSnapshot, now: number): RoundModel {
  return {
    roundNumber: snapshot.roundNumber,
    totalRounds: snapshot.totalRounds,
    grid: snapshot.grid.map((row) => [...row]),
    players: new Map(snapshot.players.map((p) => [p.id, { ...p }])),
    bombs: new Map(snapshot.bombs.map((b) => [b.id, { ...b }])),
    items: new Map(snapshot.items.map((i) => [i.id, { ...i }])),
    flames: [],
    suddenDeathAt: now + snapshot.timeRemainingMs,
    suddenDeath: snapshot.suddenDeath,
  };
}

/** Temps restant avant la mort subite, en millisecondes (jamais négatif). */
export function timeRemainingMs(round: RoundModel, now: number): number {
  return round.suddenDeath ? 0 : Math.max(0, round.suddenDeathAt - now);
}

/** Retire les flammes dont l'affichage est terminé. */
export function pruneFlames(round: RoundModel, now: number): void {
  round.flames = round.flames.filter((flame) => flame.expiresAt > now);
}

/** Applique un événement de partie envoyé par le serveur. Les événements inconnus sont ignorés. */
export function applyRoundEvent(round: RoundModel, event: GameEventMessage, now: number): void {
  switch (event.type) {
    case 'POSITION_UPDATED': {
      const player = round.players.get(event.payload.playerId);
      if (player) {
        player.x = event.payload.x;
        player.y = event.payload.y;
      }
      break;
    }
    case 'PLAYER_UPDATED':
      round.players.set(event.payload.player.id, { ...event.payload.player });
      break;
    case 'PLAYER_ELIMINATED': {
      const player = round.players.get(event.payload.playerId);
      if (player) {
        player.alive = false;
        player.lives = 0;
      }
      break;
    }
    case 'BOMB_PLACED':
      round.bombs.set(event.payload.bomb.id, { ...event.payload.bomb });
      break;
    case 'BOMB_EXPLODED':
      round.bombs.delete(event.payload.bombId);
      for (const cell of event.payload.cells) {
        round.flames.push({ x: cell.x, y: cell.y, expiresAt: now + FLAME_DISPLAY_MS });
      }
      for (const cell of event.payload.destroyedBlocks) {
        const row = round.grid[cell.y];
        if (row) row[cell.x] = 'EMPTY';
      }
      break;
    case 'ITEM_SPAWNED':
      round.items.set(event.payload.item.id, { ...event.payload.item });
      break;
    case 'ITEM_DESTROYED':
    case 'ITEM_PICKED':
      round.items.delete(event.payload.itemId);
      break;
    case 'SUDDEN_DEATH_STARTED':
      round.suddenDeath = true;
      break;
    case 'ARENA_SHRUNK':
      for (const cell of event.payload.cells) {
        const row = round.grid[cell.y];
        if (row) row[cell.x] = 'WALL';
      }
      break;
    default:
      break;
  }
}
