import type {
  Direction,
  GameEventMessage,
  LeaderboardEntry,
  LobbySettings,
  PlayerColor,
} from '@bomberman/shared';
import type { DropTable } from '../engine/drops.js';
import { GAME_CONFIG } from '../engine/gameConfig.js';
import { createRng, type Rng } from '../engine/rng.js';
import { Round, type PlayerStats, type RoundParticipant } from '../engine/Round.js';

export interface GameSessionParticipant {
  id: string;
  name: string;
  color: PlayerColor;
}

interface SessionPlayer extends GameSessionParticipant {
  stats: PlayerStats;
  wins: number;
  /** Vrai si le joueur a quitté la partie avant la fin (déconnexion ou abandon). */
  left: boolean;
}

export interface GameSessionOptions {
  participants: GameSessionParticipant[];
  settings: LobbySettings;
  dropTable: DropTable;
  emit: (event: GameEventMessage) => void;
  /** Appelé une fois le tableau des scores calculé, pour libérer la session côté serveur réseau. */
  onEnded: (leaderboard: LeaderboardEntry[]) => void;
  rng?: Rng;
}

const emptyStats = (): PlayerStats => ({
  kills: 0,
  livesLost: 0,
  bombsPlaced: 0,
  itemsCollected: 0,
});

/**
 * Enchaîne les manches d'une partie (plusieurs manches, cf. `settings.rounds`) pour un même
 * salon, et calcule le classement final. Ne connaît rien du réseau : les événements sont
 * remontés via `emit`.
 */
export class GameSession {
  private round: Round;
  private readonly players = new Map<string, SessionPlayer>();
  private readonly rng: Rng;
  private roundNumber = 0;
  private ended = false;
  /** Non nul pendant la pause entre deux manches (ou avant le calcul du classement final). */
  private intermissionUntil: number | null = null;

  constructor(
    private readonly opts: GameSessionOptions,
    now: number,
  ) {
    this.rng = opts.rng ?? createRng();
    for (const p of opts.participants) {
      this.players.set(p.id, { ...p, stats: emptyStats(), wins: 0, left: false });
    }
    this.round = this.startRound(now);
  }

  get isEnded(): boolean {
    return this.ended;
  }

  /** Fait avancer la manche en cours, ou enchaîne sur la suivante après la pause d'intermission. */
  update(now: number): void {
    if (this.ended) return;
    if (this.intermissionUntil !== null) {
      if (now < this.intermissionUntil) return;
      this.intermissionUntil = null;
      if (this.roundNumber >= this.opts.settings.rounds) this.finish();
      else this.round = this.startRound(now);
      return;
    }
    this.round.update(now);
    if (this.round.finished) this.onRoundFinished(now);
  }

  move(playerId: string, direction: Direction, now: number): void {
    if (this.intermissionUntil === null) this.round.move(playerId, direction, now);
  }

  placeBomb(playerId: string, now: number): void {
    if (this.intermissionUntil === null) this.round.placeBomb(playerId, now);
  }

  /** Un joueur quitte définitivement la partie (déconnexion ou abandon volontaire). */
  removePlayer(playerId: string, now: number): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.left = true;
    if (this.intermissionUntil === null) this.round.removePlayer(playerId, now);
  }

  private startRound(now: number): Round {
    this.roundNumber++;
    const participants: RoundParticipant[] = [...this.players.values()]
      .filter((p) => !p.left)
      .map((p) => ({ id: p.id, name: p.name, color: p.color, stats: p.stats }));
    const round = new Round({
      roundNumber: this.roundNumber,
      totalRounds: this.opts.settings.rounds,
      participants,
      settings: this.opts.settings,
      rng: this.rng,
      dropTable: this.opts.dropTable,
      now,
      emit: this.opts.emit,
    });
    this.opts.emit({ type: 'ROUND_STARTED', payload: { snapshot: round.snapshot(now) } });
    return round;
  }

  private onRoundFinished(now: number): void {
    const winner = this.round.winnerId;
    if (winner) {
      const player = this.players.get(winner);
      if (player) player.wins++;
    }
    const wins: Record<string, number> = {};
    for (const p of this.players.values()) wins[p.id] = p.wins;
    this.opts.emit({
      type: 'ROUND_ENDED',
      payload: { roundNumber: this.roundNumber, winnerId: winner, wins },
    });
    this.intermissionUntil = now + GAME_CONFIG.intermissionMs;
  }

  /** Calcule le classement final (victoires puis éliminations) et notifie la fin de partie. */
  private finish(): void {
    this.ended = true;
    const leaderboard: LeaderboardEntry[] = [...this.players.values()]
      .sort((a, b) => b.wins - a.wins || b.stats.kills - a.stats.kills)
      .map((p, i) => ({
        rank: i + 1,
        playerId: p.id,
        name: p.name,
        color: p.color,
        wins: p.wins,
        kills: p.stats.kills,
        livesLost: p.stats.livesLost,
        bombsPlaced: p.stats.bombsPlaced,
        itemsCollected: p.stats.itemsCollected,
        left: p.left,
      }));
    this.opts.emit({ type: 'GAME_ENDED', payload: { leaderboard } });
    this.opts.onEnded(leaderboard);
  }
}
