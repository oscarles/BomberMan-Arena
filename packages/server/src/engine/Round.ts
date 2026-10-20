import type {
  BombState,
  Cell,
  Direction,
  GameEventMessage,
  ItemState,
  ItemType,
  LobbySettings,
  PlayerColor,
  PlayerState,
  RoundSnapshot,
} from '@bomberman/shared';
import { rollDrop, type DropTable } from './drops.js';
import { GAME_CONFIG as CFG } from './gameConfig.js';
import { DIRECTION_VECTORS, Grid, cellKey, spawnPoints, spiralOrder } from './grid.js';
import type { Rng } from './rng.js';

/** Statistiques cumulées d'un joueur sur toute la partie. */
export interface PlayerStats {
  kills: number;
  livesLost: number;
  bombsPlaced: number;
  itemsCollected: number;
}

export interface RoundParticipant {
  id: string;
  name: string;
  color: PlayerColor;
  stats: PlayerStats;
}

export interface RoundOptions {
  roundNumber: number;
  totalRounds: number;
  participants: RoundParticipant[];
  settings: LobbySettings;
  rng: Rng;
  dropTable: DropTable;
  /** Horloge en ms au démarrage de la manche. */
  now: number;
  emit: (event: GameEventMessage) => void;
}

export type MoveResult = 'MOVED' | 'COOLDOWN' | 'BLOCKED' | 'DEAD' | 'FINISHED';

interface PlayerRuntime {
  id: string;
  name: string;
  color: PlayerColor;
  stats: PlayerStats;
  spawn: Cell;
  x: number;
  y: number;
  lives: number;
  alive: boolean;
  maxBombs: number;
  bombRange: number;
  speedLevel: number;
  activeBombs: number;
  nextMoveAt: number;
  invulnerableUntil: number;
  slowedUntil: number;
  reportedInvulnerable: boolean;
  reportedSlowed: boolean;
}

interface Bomb extends BombState {
  explodeAt: number;
}

interface Flame {
  expiresAt: number;
  ownerId: string;
}

/**
 * Une manche : toute la logique autoritaire (collisions, explosions, dégâts, objets, mort subite).
 * L'horloge est passée en paramètre (`now`, en ms) pour rester déterministe et testable.
 */
export class Round {
  readonly grid: Grid;
  finished = false;
  winnerId: string | null = null;

  private readonly players = new Map<string, PlayerRuntime>();
  private readonly bombs = new Map<string, Bomb>();
  private readonly items = new Map<string, ItemState>();
  private readonly flames = new Map<string, Flame>();
  private readonly spiral: Cell[];
  private spiralIndex = 0;
  private suddenDeath = false;
  private nextShrinkAt = 0;
  private readonly endsAt: number;
  private idCounter = 0;

  constructor(private readonly opts: RoundOptions) {
    const { settings, rng, now, participants } = opts;
    this.grid = Grid.generate(rng, 15, 13, CFG.blockDensity);
    this.spiral = spiralOrder(this.grid.width, this.grid.height);
    this.endsAt = now + settings.timeLimitSeconds * 1000;

    const spawns = rng.shuffle(spawnPoints(this.grid.width, this.grid.height));
    participants.forEach((p, i) => {
      const spawn = spawns[i] as Cell;
      this.players.set(p.id, {
        id: p.id,
        name: p.name,
        color: p.color,
        stats: p.stats,
        spawn,
        x: spawn.x,
        y: spawn.y,
        lives: settings.lives,
        alive: true,
        maxBombs: CFG.startBombs,
        bombRange: CFG.startRange,
        speedLevel: 0,
        activeBombs: 0,
        nextMoveAt: now,
        invulnerableUntil: now + CFG.invulnerabilityMs,
        slowedUntil: 0,
        reportedInvulnerable: true,
        reportedSlowed: false,
      });
    });
  }

  /** Vue complète de la manche (envoyée aux clients au démarrage). */
  snapshot(now: number): RoundSnapshot {
    return {
      roundNumber: this.opts.roundNumber,
      totalRounds: this.opts.totalRounds,
      grid: this.grid.toArray(),
      players: [...this.players.values()].map((p) => this.toState(p, now)),
      bombs: [...this.bombs.values()].map(({ explodeAt: _e, ...bomb }) => bomb),
      items: [...this.items.values()],
      timeRemainingMs: Math.max(0, this.endsAt - now),
      suddenDeath: this.suddenDeath,
    };
  }

  /** Tente de déplacer un joueur d'une case ; la position reste décidée par le serveur. */
  move(playerId: string, direction: Direction, now: number): MoveResult {
    const p = this.players.get(playerId);
    if (this.finished) return 'FINISHED';
    if (!p?.alive) return 'DEAD';
    if (now < p.nextMoveAt) return 'COOLDOWN';

    const v = DIRECTION_VECTORS[direction];
    const nx = p.x + v.x;
    const ny = p.y + v.y;
    if (this.grid.get(nx, ny) !== 'EMPTY' || this.bombAt(nx, ny)) return 'BLOCKED';

    p.x = nx;
    p.y = ny;
    p.nextMoveAt = now + this.moveInterval(p, now);
    this.opts.emit({ type: 'POSITION_UPDATED', payload: { playerId, x: nx, y: ny } });
    this.pickUpItem(p, now);
    return 'MOVED';
  }

  /** Pose une bombe sur la case du joueur si sa limite de bombes le permet. */
  placeBomb(playerId: string, now: number): boolean {
    const p = this.players.get(playerId);
    if (this.finished || !p?.alive) return false;
    if (p.activeBombs >= p.maxBombs || this.bombAt(p.x, p.y)) return false;
    this.addBomb(p, now);
    return true;
  }

  /** Retire un joueur qui quitte la partie (il est éliminé). */
  removePlayer(playerId: string, now: number): void {
    const p = this.players.get(playerId);
    if (p?.alive) this.eliminate(p, null, now);
  }

  /** Fait avancer la simulation : explosions, flammes, dégâts, mort subite, fin de manche. */
  update(now: number): void {
    if (this.finished) return;
    this.explodeDueBombs(now);
    for (const [key, flame] of this.flames) if (flame.expiresAt <= now) this.flames.delete(key);
    for (const p of this.players.values()) {
      const flame = p.alive ? this.flames.get(cellKey(p.x, p.y)) : undefined;
      if (flame) this.hit(p, flame.ownerId, now);
    }
    this.updateSuddenDeath(now);
    for (const p of this.players.values()) if (p.alive) this.reportStatusChange(p, now);
    this.checkEnd();
  }

  // -------------------------------------------------------------------------

  private moveInterval(p: PlayerRuntime, now: number): number {
    const speed = 1 + CFG.speedBonusPerLevel * p.speedLevel;
    const slow = now < p.slowedUntil ? CFG.slowMultiplier : 1;
    return Math.round((CFG.baseMoveIntervalMs / speed) * slow);
  }

  private nextId(prefix: string): string {
    return `${prefix}${++this.idCounter}`;
  }

  private bombAt(x: number, y: number): Bomb | undefined {
    for (const b of this.bombs.values()) if (b.x === x && b.y === y) return b;
    return undefined;
  }

  private addBomb(p: PlayerRuntime, now: number): void {
    const bomb: Bomb = {
      id: this.nextId('b'),
      ownerId: p.id,
      x: p.x,
      y: p.y,
      range: p.bombRange,
      explodeAt: now + CFG.bombFuseMs,
    };
    this.bombs.set(bomb.id, bomb);
    p.activeBombs++;
    p.stats.bombsPlaced++;
    const { explodeAt: _e, ...state } = bomb;
    this.opts.emit({ type: 'BOMB_PLACED', payload: { bomb: state } });
  }

  private explodeDueBombs(now: number): void {
    const queue = [...this.bombs.values()].filter((b) => b.explodeAt <= now);
    if (queue.length === 0) return;

    const exploded = new Set<string>();
    const allDestroyed: Cell[] = [];
    while (queue.length > 0) {
      const bomb = queue.shift() as Bomb;
      if (exploded.has(bomb.id)) continue;
      exploded.add(bomb.id);
      this.bombs.delete(bomb.id);
      const owner = this.players.get(bomb.ownerId);
      if (owner) owner.activeBombs = Math.max(0, owner.activeBombs - 1);

      const cells: Cell[] = [{ x: bomb.x, y: bomb.y }];
      const destroyedBlocks: Cell[] = [];
      for (const v of Object.values(DIRECTION_VECTORS)) {
        for (let i = 1; i <= bomb.range; i++) {
          const x = bomb.x + v.x * i;
          const y = bomb.y + v.y * i;
          const type = this.grid.get(x, y);
          if (type === undefined || type === 'WALL') break;
          cells.push({ x, y });
          const chained = this.bombAt(x, y);
          if (chained) queue.push(chained);
          if (type === 'BLOCK') {
            this.grid.set(x, y, 'EMPTY');
            destroyedBlocks.push({ x, y });
            break;
          }
        }
      }
      for (const c of cells) {
        this.flames.set(cellKey(c.x, c.y), {
          expiresAt: now + CFG.flameDurationMs,
          ownerId: bomb.ownerId,
        });
        for (const item of [...this.items.values()]) {
          if (item.x === c.x && item.y === c.y) {
            this.items.delete(item.id);
            this.opts.emit({ type: 'ITEM_DESTROYED', payload: { itemId: item.id } });
          }
        }
      }
      allDestroyed.push(...destroyedBlocks);
      this.opts.emit({
        type: 'BOMB_EXPLODED',
        payload: { bombId: bomb.id, cells, destroyedBlocks },
      });
    }

    // Les objets sont tirés après les explosions pour ne pas être détruits par elles.
    for (const c of allDestroyed) {
      const type = rollDrop(this.opts.dropTable, this.opts.rng, this.opts.settings);
      if (type) {
        const item: ItemState = { id: this.nextId('i'), type, x: c.x, y: c.y };
        this.items.set(item.id, item);
        this.opts.emit({ type: 'ITEM_SPAWNED', payload: { item } });
      }
    }
  }

  private hit(p: PlayerRuntime, killerId: string, now: number): void {
    if (now < p.invulnerableUntil) return;
    p.lives--;
    p.stats.livesLost++;
    if (p.lives <= 0) {
      this.eliminate(p, killerId === p.id ? null : killerId, now);
      return;
    }
    // Réapparition au point de départ avec protection temporaire.
    p.x = p.spawn.x;
    p.y = p.spawn.y;
    p.nextMoveAt = now;
    p.invulnerableUntil = now + CFG.invulnerabilityMs;
    this.opts.emit({ type: 'POSITION_UPDATED', payload: { playerId: p.id, x: p.x, y: p.y } });
    this.publish(p, now);
  }

  private eliminate(p: PlayerRuntime, killerId: string | null, now: number): void {
    p.alive = false;
    p.lives = 0;
    if (killerId) {
      const killer = this.players.get(killerId);
      if (killer) killer.stats.kills++;
    }
    this.publish(p, now);
    this.opts.emit({ type: 'PLAYER_ELIMINATED', payload: { playerId: p.id, killerId } });
  }

  private pickUpItem(p: PlayerRuntime, now: number): void {
    const item = [...this.items.values()].find((i) => i.x === p.x && i.y === p.y);
    if (!item) return;
    this.items.delete(item.id);
    p.stats.itemsCollected++;
    this.applyItem(p, item.type, now);
    this.opts.emit({
      type: 'ITEM_PICKED',
      payload: { itemId: item.id, playerId: p.id, itemType: item.type },
    });
    this.publish(p, now);
  }

  private applyItem(p: PlayerRuntime, type: ItemType, now: number): void {
    switch (type) {
      case 'RANGE_UP':
        p.bombRange = Math.min(CFG.maxRange, p.bombRange + 1);
        break;
      case 'BOMB_UP':
        p.maxBombs = Math.min(CFG.maxBombs, p.maxBombs + 1);
        break;
      case 'SPEED_UP':
        p.speedLevel = Math.min(CFG.maxSpeedLevel, p.speedLevel + 1);
        break;
      case 'SURPRISE_BOMB':
        // Pose involontaire et immédiate, indépendante de la limite de bombes.
        if (!this.bombAt(p.x, p.y)) this.addBomb(p, now);
        break;
      case 'SLOW':
        p.slowedUntil = now + CFG.slowDurationMs;
        break;
    }
  }

  private updateSuddenDeath(now: number): void {
    if (!this.suddenDeath) {
      if (now < this.endsAt) return;
      this.suddenDeath = true;
      this.nextShrinkAt = now;
      this.opts.emit({ type: 'SUDDEN_DEATH_STARTED', payload: {} });
    }
    const closed: Cell[] = [];
    while (now >= this.nextShrinkAt && this.spiralIndex < this.spiral.length) {
      const c = this.spiral[this.spiralIndex++] as Cell;
      if (this.grid.get(c.x, c.y) === 'WALL') continue;
      this.closeCell(c, now);
      closed.push(c);
      this.nextShrinkAt += CFG.shrinkIntervalMs;
    }
    if (closed.length > 0) this.opts.emit({ type: 'ARENA_SHRUNK', payload: { cells: closed } });
  }

  /** Transforme une case en mur : bombes et objets disparaissent, les joueurs présents meurent. */
  private closeCell(c: Cell, now: number): void {
    this.grid.set(c.x, c.y, 'WALL');
    this.flames.delete(cellKey(c.x, c.y));
    for (const b of [...this.bombs.values()]) {
      if (b.x !== c.x || b.y !== c.y) continue;
      this.bombs.delete(b.id);
      const owner = this.players.get(b.ownerId);
      if (owner) owner.activeBombs = Math.max(0, owner.activeBombs - 1);
    }
    for (const i of [...this.items.values()])
      if (i.x === c.x && i.y === c.y) this.items.delete(i.id);
    for (const p of this.players.values()) {
      if (p.alive && p.x === c.x && p.y === c.y) this.eliminate(p, null, now);
    }
  }

  private checkEnd(): void {
    const alive = [...this.players.values()].filter((p) => p.alive);
    if (alive.length <= 1) {
      this.finished = true;
      this.winnerId = alive[0]?.id ?? null;
    }
  }

  private toState(p: PlayerRuntime, now: number): PlayerState {
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      x: p.x,
      y: p.y,
      lives: p.lives,
      alive: p.alive,
      invulnerable: now < p.invulnerableUntil,
      slowed: now < p.slowedUntil,
      maxBombs: p.maxBombs,
      bombRange: p.bombRange,
      speedLevel: p.speedLevel,
    };
  }

  private publish(p: PlayerRuntime, now: number): void {
    const state = this.toState(p, now);
    p.reportedInvulnerable = state.invulnerable;
    p.reportedSlowed = state.slowed;
    this.opts.emit({ type: 'PLAYER_UPDATED', payload: { player: state } });
  }

  /** Notifie les clients quand un statut temporaire (invulnérabilité, ralentissement) expire. */
  private reportStatusChange(p: PlayerRuntime, now: number): void {
    if (
      p.reportedInvulnerable !== now < p.invulnerableUntil ||
      p.reportedSlowed !== now < p.slowedUntil
    ) {
      this.publish(p, now);
    }
  }
}
