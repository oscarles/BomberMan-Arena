import {
  DEFAULT_LOBBY_SETTINGS,
  GRID_HEIGHT,
  GRID_WIDTH,
  ITEM_TYPES,
  MAX_NAME_LENGTH,
  PLAYER_COLORS,
  SETTINGS_LIMITS,
  type BombState,
  type CellType,
  type ClientMessage,
  type Direction,
  type ErrorCode,
  type ItemState,
  type LeaderboardEntry,
  type LobbyInfo,
  type LobbySettings,
  type LobbySummary,
  type PlayerColor,
  type PlayerState,
  type ServerMessage,
} from '@bomberman/shared';

/** Horloge et minuteries injectables : permet de simuler le temps dans les tests. */
export interface MockClock {
  now(): number;
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export const realClock: MockClock = {
  now: () => Date.now(),
  setInterval: (handler, ms) => setInterval(handler, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

const BOT_NAMES = ['Sacha', 'Clément', 'Simon'];
const PRIVATE_CODE = 'MOCK42';
const TICK_MS = 100;
const STEP_MS = 200;
const FUSE_MS = 2000;
const SPAWNS = [
  { x: 1, y: 1 },
  { x: GRID_WIDTH - 2, y: GRID_HEIGHT - 2 },
  { x: GRID_WIDTH - 2, y: 1 },
  { x: 1, y: GRID_HEIGHT - 2 },
];
const DELTAS: Record<Direction, { x: number; y: number }> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

/** Salons publics fictifs affichés dans le navigateur de salons hors ligne. */
const FAKE_LOBBIES: LobbySummary[] = [
  fakeLobby('lobby-a', 'Arène des buts', 2, 4),
  fakeLobby('lobby-b', 'Tournoi TD', 4, 4),
  fakeLobby('lobby-c', 'Salle Clément', 3, 4),
  fakeLobby('lobby-d', 'Duel rapide', 1, 2),
];

function fakeLobby(
  id: string,
  name: string,
  playerCount: number,
  maxPlayers: number,
): LobbySummary {
  return {
    id,
    name,
    status: 'WAITING',
    playerCount,
    maxPlayers,
    settings: { ...DEFAULT_LOBBY_SETTINGS, maxPlayers },
  };
}

interface MockPlayer extends PlayerState {
  isBot: boolean;
  nextMoveAt: number;
  nextBotAt: number;
  invulnerableUntil: number;
  slowedUntil: number;
  wins: number;
  kills: number;
  livesLost: number;
  bombsPlaced: number;
  itemsCollected: number;
}

interface MockRound {
  number: number;
  grid: CellType[][];
  players: Map<string, MockPlayer>;
  bombs: Map<string, BombState & { explodeAt: number }>;
  items: Map<string, ItemState>;
  endsAt: number;
  sudden: boolean;
  shrinkQueue: { x: number; y: number }[];
  nextShrinkAt: number;
  ended: boolean;
}

/**
 * Serveur simulé : répond au protocole comme le vrai serveur (salons, manches, bombes, objets,
 * mort subite, classement) avec des joueurs fictifs. Il sert au mode hors ligne du client et
 * aux tests ; il n'est pas une copie fidèle du moteur, seulement un double de test plausible.
 */
export class MockServer {
  readonly playerId = 'me';
  private name = 'Joueur';
  private lobby: LobbyInfo | null = null;
  private round: MockRound | null = null;
  private wins = new Map<string, MockPlayer>();
  private ticker: unknown = null;
  private timeouts: unknown[] = [];
  private counter = 0;

  constructor(
    private readonly emit: (message: ServerMessage) => void,
    private readonly clock: MockClock = realClock,
    private readonly random: () => number = Math.random,
  ) {}

  /** Annonce la connexion au client. */
  hello(): void {
    this.emit({ type: 'WELCOME', payload: { playerId: this.playerId, name: this.name } });
  }

  /** Arrête toutes les minuteries. */
  dispose(): void {
    if (this.ticker !== null) this.clock.clearInterval(this.ticker);
    this.ticker = null;
    for (const id of this.timeouts) this.clock.clearTimeout(id);
    this.timeouts = [];
  }

  /** Traite un message du client et répond comme le serveur réel. */
  handle(message: ClientMessage): void {
    switch (message.type) {
      case 'SET_NAME':
        this.name = message.payload.name.trim().slice(0, MAX_NAME_LENGTH) || this.name;
        this.updateMe((p) => (p.name = this.name));
        break;
      case 'LIST_LOBBIES':
        this.emit({ type: 'LOBBY_LIST', payload: { lobbies: FAKE_LOBBIES } });
        break;
      case 'CREATE_LOBBY':
        this.createLobby(message.payload);
        break;
      case 'JOIN_LOBBY':
        this.joinLobby(message.payload);
        break;
      case 'LEAVE_LOBBY':
        this.leave();
        break;
      case 'UPDATE_SETTINGS':
        this.updateSettings(message.payload.settings);
        break;
      case 'SET_COLOR':
        this.setColor(message.payload.color);
        break;
      case 'START_GAME':
        this.startGame();
        break;
      case 'MOVE':
        this.move(message.payload.direction);
        break;
      case 'PLACE_BOMB':
        this.placeBomb(this.playerId);
        break;
    }
  }

  // ---------------------------------------------------------------- salons

  private error(code: ErrorCode, text: string): void {
    this.emit({ type: 'ERROR', payload: { code, message: text } });
  }

  private publishLobby(): void {
    if (this.lobby)
      this.emit({ type: 'LOBBY_UPDATED', payload: { lobby: structuredClone(this.lobby) } });
  }

  private updateMe(change: (player: LobbyInfo['players'][number]) => void): void {
    const me = this.lobby?.players.find((p) => p.id === this.playerId);
    if (me) {
      change(me);
      this.publishLobby();
    }
  }

  private freeColor(): PlayerColor {
    const used = new Set(this.lobby?.players.map((p) => p.color));
    return PLAYER_COLORS.find((c) => !used.has(c)) ?? 'red';
  }

  private addBot(): void {
    const lobby = this.lobby;
    if (!lobby || lobby.status !== 'WAITING' || lobby.players.length >= lobby.settings.maxPlayers)
      return;
    const index = lobby.players.filter((p) => p.id.startsWith('bot')).length;
    lobby.players.push({
      id: `bot-${index}`,
      name: BOT_NAMES[index % BOT_NAMES.length] ?? 'Bot',
      color: this.freeColor(),
      isHost: false,
    });
    this.publishLobby();
  }

  private later(handler: () => void, ms: number): void {
    this.timeouts.push(this.clock.setTimeout(handler, ms));
  }

  private createLobby(payload: Extract<ClientMessage, { type: 'CREATE_LOBBY' }>['payload']): void {
    if (this.lobby) return this.error('ALREADY_IN_LOBBY', 'Tu es déjà dans un salon.');
    this.lobby = {
      id: `lobby-${++this.counter}`,
      name: payload.name,
      visibility: payload.visibility,
      status: 'WAITING',
      hostId: this.playerId,
      settings: { ...DEFAULT_LOBBY_SETTINGS, ...payload.settings },
      players: [{ id: this.playerId, name: this.name, color: 'red', isHost: true }],
      inviteCode: payload.visibility === 'PRIVATE' ? PRIVATE_CODE : null,
    };
    this.publishLobby();
    this.later(() => this.addBot(), 900);
    this.later(() => this.addBot(), 1800);
  }

  private joinLobby(payload: { lobbyId?: string; inviteCode?: string }): void {
    if (this.lobby) return this.error('ALREADY_IN_LOBBY', 'Tu es déjà dans un salon.');
    let summary: LobbySummary | undefined;
    if (payload.inviteCode !== undefined) {
      if (payload.inviteCode !== PRIVATE_CODE)
        return this.error('INVALID_INVITE_CODE', 'Code invalide.');
      summary = fakeLobby('lobby-private', 'Salon privé', 2, 4);
    } else {
      summary = FAKE_LOBBIES.find((l) => l.id === payload.lobbyId);
    }
    if (!summary) return this.error('LOBBY_NOT_FOUND', "Ce salon n'existe plus.");
    if (summary.playerCount >= summary.maxPlayers)
      return this.error('LOBBY_FULL', 'Ce salon est plein.');
    this.lobby = {
      id: summary.id,
      name: summary.name,
      visibility: payload.inviteCode !== undefined ? 'PRIVATE' : 'PUBLIC',
      status: 'WAITING',
      hostId: 'bot-host',
      settings: { ...summary.settings },
      players: [{ id: 'bot-host', name: 'Hôte', color: 'blue', isHost: true }],
      inviteCode: payload.inviteCode ?? null,
    };
    for (let i = 1; i < summary.playerCount; i++) {
      this.lobby.players.push({
        id: `bot-${i}`,
        name: BOT_NAMES[i % 3] ?? 'Bot',
        color: this.freeColor(),
        isHost: false,
      });
    }
    this.lobby.players.push({
      id: this.playerId,
      name: this.name,
      color: this.freeColor(),
      isHost: false,
    });
    this.publishLobby();
  }

  private leave(): void {
    this.dispose();
    this.round = null;
    this.lobby = null;
    this.emit({ type: 'LOBBY_LEFT', payload: {} });
  }

  private updateSettings(settings: Partial<LobbySettings>): void {
    if (!this.lobby) return this.error('NOT_IN_LOBBY', "Tu n'es dans aucun salon.");
    if (this.lobby.hostId !== this.playerId) return this.error('NOT_HOST', "Réservé à l'hôte.");
    const merged = { ...this.lobby.settings, ...settings };
    const ok = (Object.keys(SETTINGS_LIMITS) as (keyof typeof SETTINGS_LIMITS)[]).every((key) => {
      const value = merged[key];
      return value >= SETTINGS_LIMITS[key].min && value <= SETTINGS_LIMITS[key].max;
    });
    if (!ok) return this.error('INVALID_SETTINGS', 'Réglage hors limites.');
    this.lobby.settings = merged;
    this.publishLobby();
  }

  private setColor(color: PlayerColor): void {
    if (!this.lobby) return this.error('NOT_IN_LOBBY', "Tu n'es dans aucun salon.");
    if (this.lobby.players.some((p) => p.id !== this.playerId && p.color === color)) {
      return this.error('COLOR_TAKEN', 'Couleur déjà prise.');
    }
    this.updateMe((p) => (p.color = color));
  }

  // ---------------------------------------------------------------- manche

  private startGame(): void {
    const lobby = this.lobby;
    if (!lobby) return this.error('NOT_IN_LOBBY', "Tu n'es dans aucun salon.");
    if (lobby.hostId !== this.playerId) return this.error('NOT_HOST', "Réservé à l'hôte.");
    if (lobby.players.length < 2)
      return this.error('NOT_ENOUGH_PLAYERS', 'Il faut au moins 2 joueurs.');
    lobby.status = 'IN_GAME';
    this.publishLobby();
    this.wins = new Map();
    this.startRound(1);
    this.ticker = this.clock.setInterval(() => this.tick(), TICK_MS);
  }

  private startRound(number: number): void {
    const lobby = this.lobby;
    if (!lobby) return;
    const now = this.clock.now();
    const grid = this.buildGrid();
    const players = new Map<string, MockPlayer>();
    lobby.players.forEach((info, index) => {
      const spawn = SPAWNS[index % SPAWNS.length] ?? SPAWNS[0]!;
      const previous = this.wins.get(info.id);
      players.set(info.id, {
        id: info.id,
        name: info.name,
        color: info.color,
        x: spawn.x,
        y: spawn.y,
        lives: lobby.settings.lives,
        alive: true,
        invulnerable: true,
        slowed: false,
        maxBombs: 1,
        bombRange: 2,
        speedLevel: 0,
        isBot: info.id !== this.playerId,
        nextMoveAt: now,
        nextBotAt: now + 600 + this.random() * 600,
        invulnerableUntil: now + 3000,
        slowedUntil: 0,
        wins: previous?.wins ?? 0,
        kills: previous?.kills ?? 0,
        livesLost: previous?.livesLost ?? 0,
        bombsPlaced: previous?.bombsPlaced ?? 0,
        itemsCollected: previous?.itemsCollected ?? 0,
      });
    });
    this.round = {
      number,
      grid,
      players,
      bombs: new Map(),
      items: new Map(),
      endsAt: now + lobby.settings.timeLimitSeconds * 1000,
      sudden: false,
      shrinkQueue: [],
      nextShrinkAt: 0,
      ended: false,
    };
    this.emit({
      type: 'ROUND_STARTED',
      payload: {
        snapshot: {
          roundNumber: number,
          totalRounds: lobby.settings.rounds,
          grid: grid.map((row) => [...row]),
          players: [...players.values()].map(toPlayerState),
          bombs: [],
          items: [],
          timeRemainingMs: lobby.settings.timeLimitSeconds * 1000,
          suddenDeath: false,
        },
      },
    });
  }

  private buildGrid(): CellType[][] {
    const grid: CellType[][] = [];
    for (let y = 0; y < GRID_HEIGHT; y++) {
      const row: CellType[] = [];
      for (let x = 0; x < GRID_WIDTH; x++) {
        const border = x === 0 || y === 0 || x === GRID_WIDTH - 1 || y === GRID_HEIGHT - 1;
        const pillar = x % 2 === 0 && y % 2 === 0;
        const nearSpawn = SPAWNS.some((s) => Math.abs(s.x - x) + Math.abs(s.y - y) <= 2);
        row.push(border || pillar ? 'WALL' : !nearSpawn && this.random() < 0.7 ? 'BLOCK' : 'EMPTY');
      }
      grid.push(row);
    }
    return grid;
  }

  private move(direction: Direction): void {
    const round = this.round;
    if (!round) return this.error('NOT_IN_GAME', 'Aucune partie en cours.');
    const player = round.players.get(this.playerId);
    if (player) this.step(round, player, direction);
  }

  private step(round: MockRound, player: MockPlayer, direction: Direction): void {
    const now = this.clock.now();
    if (!player.alive || round.ended || now < player.nextMoveAt) return;
    const delta = DELTAS[direction];
    const x = player.x + delta.x;
    const y = player.y + delta.y;
    if (
      round.grid[y]?.[x] !== 'EMPTY' ||
      [...round.bombs.values()].some((b) => b.x === x && b.y === y)
    )
      return;
    player.x = x;
    player.y = y;
    const speed = 1 + 0.25 * player.speedLevel;
    player.nextMoveAt = now + Math.round((STEP_MS / speed) * (player.slowed ? 2.5 : 1));
    this.emit({ type: 'POSITION_UPDATED', payload: { playerId: player.id, x, y } });
    const item = [...round.items.values()].find((i) => i.x === x && i.y === y);
    if (item) this.pickUp(round, player, item);
  }

  private pickUp(round: MockRound, player: MockPlayer, item: ItemState): void {
    round.items.delete(item.id);
    player.itemsCollected++;
    this.emit({
      type: 'ITEM_PICKED',
      payload: { itemId: item.id, playerId: player.id, itemType: item.type },
    });
    if (item.type === 'RANGE_UP') player.bombRange = Math.min(8, player.bombRange + 1);
    if (item.type === 'BOMB_UP') player.maxBombs = Math.min(6, player.maxBombs + 1);
    if (item.type === 'SPEED_UP') player.speedLevel = Math.min(5, player.speedLevel + 1);
    if (item.type === 'SLOW') {
      player.slowed = true;
      player.slowedUntil = this.clock.now() + 5000;
    }
    this.emit({ type: 'PLAYER_UPDATED', payload: { player: toPlayerState(player) } });
    if (item.type === 'SURPRISE_BOMB') this.placeBomb(player.id);
  }

  private placeBomb(playerId: string): void {
    const round = this.round;
    if (!round) return this.error('NOT_IN_GAME', 'Aucune partie en cours.');
    const player = round.players.get(playerId);
    if (!player || !player.alive || round.ended) return;
    const own = [...round.bombs.values()].filter((b) => b.ownerId === playerId);
    if (own.length >= player.maxBombs || own.some((b) => b.x === player.x && b.y === player.y))
      return;
    const bomb = {
      id: `bomb-${++this.counter}`,
      ownerId: playerId,
      x: player.x,
      y: player.y,
      range: player.bombRange,
      explodeAt: this.clock.now() + FUSE_MS,
    };
    round.bombs.set(bomb.id, bomb);
    player.bombsPlaced++;
    this.emit({
      type: 'BOMB_PLACED',
      payload: {
        bomb: { id: bomb.id, ownerId: bomb.ownerId, x: bomb.x, y: bomb.y, range: bomb.range },
      },
    });
  }

  private explode(round: MockRound, bombId: string): void {
    const bomb = round.bombs.get(bombId);
    if (!bomb) return;
    round.bombs.delete(bombId);
    const cells = [{ x: bomb.x, y: bomb.y }];
    const destroyedBlocks: { x: number; y: number }[] = [];
    for (const delta of Object.values(DELTAS)) {
      for (let i = 1; i <= bomb.range; i++) {
        const x = bomb.x + delta.x * i;
        const y = bomb.y + delta.y * i;
        const type = round.grid[y]?.[x];
        if (type === undefined || type === 'WALL') break;
        cells.push({ x, y });
        if (type === 'BLOCK') {
          destroyedBlocks.push({ x, y });
          break;
        }
      }
    }
    for (const cell of destroyedBlocks) (round.grid[cell.y] as CellType[])[cell.x] = 'EMPTY';
    this.emit({ type: 'BOMB_EXPLODED', payload: { bombId, cells, destroyedBlocks } });
    const hit = (x: number, y: number) => cells.some((c) => c.x === x && c.y === y);
    for (const item of [...round.items.values()]) {
      if (hit(item.x, item.y)) {
        round.items.delete(item.id);
        this.emit({ type: 'ITEM_DESTROYED', payload: { itemId: item.id } });
      }
    }
    for (const other of [...round.bombs.values()])
      if (hit(other.x, other.y)) this.explode(round, other.id);
    for (const player of round.players.values()) {
      if (player.alive && !player.invulnerable && hit(player.x, player.y))
        this.damage(round, player, bomb.ownerId);
    }
    if (this.lobby?.settings.itemsEnabled) {
      for (const cell of destroyedBlocks) if (this.random() < 0.3) this.spawnItem(round, cell);
    }
    this.checkRoundEnd(round);
  }

  private spawnItem(round: MockRound, cell: { x: number; y: number }): void {
    const pool = this.lobby?.settings.malusEnabled
      ? ITEM_TYPES
      : ITEM_TYPES.filter((t) => t !== 'SLOW' && t !== 'SURPRISE_BOMB');
    const item: ItemState = {
      id: `item-${++this.counter}`,
      type: pool[Math.floor(this.random() * pool.length)] ?? 'RANGE_UP',
      x: cell.x,
      y: cell.y,
    };
    round.items.set(item.id, item);
    this.emit({ type: 'ITEM_SPAWNED', payload: { item } });
  }

  private damage(round: MockRound, player: MockPlayer, killerId: string | null): void {
    player.lives--;
    player.livesLost++;
    if (killerId && killerId !== player.id)
      round.players.get(killerId)!.kills += player.lives <= 0 ? 1 : 0;
    if (player.lives <= 0) {
      player.alive = false;
      this.emit({ type: 'PLAYER_ELIMINATED', payload: { playerId: player.id, killerId } });
      return;
    }
    const spawn =
      SPAWNS[[...round.players.keys()].indexOf(player.id) % SPAWNS.length] ?? SPAWNS[0]!;
    player.x = spawn.x;
    player.y = spawn.y;
    player.invulnerable = true;
    player.invulnerableUntil = this.clock.now() + 3000;
    this.emit({ type: 'PLAYER_UPDATED', payload: { player: toPlayerState(player) } });
  }

  // ---------------------------------------------------------------- boucle

  private tick(): void {
    const round = this.round;
    if (!round || round.ended) return;
    const now = this.clock.now();
    for (const bomb of [...round.bombs.values()])
      if (now >= bomb.explodeAt) this.explode(round, bomb.id);
    for (const player of round.players.values()) {
      let changed = false;
      if (player.invulnerable && now >= player.invulnerableUntil) {
        player.invulnerable = false;
        changed = true;
      }
      if (player.slowed && now >= player.slowedUntil) {
        player.slowed = false;
        changed = true;
      }
      if (changed)
        this.emit({ type: 'PLAYER_UPDATED', payload: { player: toPlayerState(player) } });
      if (player.isBot && player.alive && now >= player.nextBotAt) {
        player.nextBotAt = now + 450 + this.random() * 400;
        this.botAct(round, player);
      }
    }
    if (!round.sudden && now >= round.endsAt) this.startSuddenDeath(round);
    if (round.sudden && now >= round.nextShrinkAt) this.shrinkStep(round, now);
    this.checkRoundEnd(round);
  }

  private botAct(round: MockRound, bot: MockPlayer): void {
    if (this.random() < 0.12) this.placeBomb(bot.id);
    const directions = Object.keys(DELTAS) as Direction[];
    bot.nextMoveAt = 0;
    this.step(round, bot, directions[Math.floor(this.random() * directions.length)] ?? 'UP');
  }

  private startSuddenDeath(round: MockRound): void {
    round.sudden = true;
    this.emit({ type: 'SUDDEN_DEATH_STARTED', payload: {} });
    const ring = (x: number, y: number) => Math.min(x, y, GRID_WIDTH - 1 - x, GRID_HEIGHT - 1 - y);
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++)
        if (round.grid[y]?.[x] !== 'WALL') round.shrinkQueue.push({ x, y });
    }
    round.shrinkQueue.sort((a, b) => ring(a.x, a.y) - ring(b.x, b.y) || a.y - b.y || a.x - b.x);
    round.nextShrinkAt = this.clock.now();
  }

  private shrinkStep(round: MockRound, now: number): void {
    const cell = round.shrinkQueue.shift();
    round.nextShrinkAt = now + 250;
    if (!cell) return;
    (round.grid[cell.y] as CellType[])[cell.x] = 'WALL';
    this.emit({ type: 'ARENA_SHRUNK', payload: { cells: [cell] } });
    for (const player of round.players.values()) {
      if (player.alive && player.x === cell.x && player.y === cell.y) {
        player.alive = false;
        player.lives = 0;
        this.emit({ type: 'PLAYER_ELIMINATED', payload: { playerId: player.id, killerId: null } });
      }
    }
  }

  private checkRoundEnd(round: MockRound): void {
    if (round.ended) return;
    const alive = [...round.players.values()].filter((p) => p.alive);
    if (alive.length > 1) return;
    round.ended = true;
    const winner = alive[0] ?? null;
    if (winner) winner.wins++;
    for (const player of round.players.values()) this.wins.set(player.id, player);
    const wins: Record<string, number> = {};
    for (const player of round.players.values()) wins[player.id] = player.wins;
    this.emit({
      type: 'ROUND_ENDED',
      payload: { roundNumber: round.number, winnerId: winner?.id ?? null, wins },
    });
    const total = this.lobby?.settings.rounds ?? 1;
    this.later(
      () => (round.number < total ? this.startRound(round.number + 1) : this.finishGame(round)),
      3000,
    );
  }

  private finishGame(round: MockRound): void {
    const entries: LeaderboardEntry[] = [...round.players.values()]
      .sort((a, b) => b.wins - a.wins || b.kills - a.kills)
      .map((p, index) => ({
        rank: index + 1,
        playerId: p.id,
        name: p.name,
        color: p.color,
        wins: p.wins,
        kills: p.kills,
        livesLost: p.livesLost,
        bombsPlaced: p.bombsPlaced,
        itemsCollected: p.itemsCollected,
        left: false,
      }));
    this.emit({ type: 'GAME_ENDED', payload: { leaderboard: entries } });
    this.dispose();
    this.round = null;
    if (this.lobby) {
      this.lobby.status = 'WAITING';
      this.publishLobby();
    }
  }
}

function toPlayerState(p: MockPlayer): PlayerState {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    x: p.x,
    y: p.y,
    lives: p.lives,
    alive: p.alive,
    invulnerable: p.invulnerable,
    slowed: p.slowed,
    maxBombs: p.maxBombs,
    bombRange: p.bombRange,
    speedLevel: p.speedLevel,
  };
}
