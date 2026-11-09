import type {
  ErrorCode,
  GameEventMessage,
  LeaderboardEntry,
  LobbyInfo,
  LobbyPlayerInfo,
  LobbySummary,
  ServerMessage,
} from '@bomberman/shared';
import { EventBus } from '../core/EventBus';
import type { ConnectionStatus } from '../net/Transport';
import { applyRoundEvent, createRound, type RoundModel } from './round';

/** Fin de manche telle qu'annoncée par le serveur. */
export interface RoundEndInfo {
  roundNumber: number;
  winnerId: string | null;
  wins: Record<string, number>;
}

/** Événements émis par le modèle ; les vues et les contrôleurs s'y abonnent. */
export interface ModelEvents {
  connection: ConnectionStatus;
  welcome: { playerId: string; name: string };
  lobbies: LobbySummary[];
  lobby: LobbyInfo | null;
  roundStarted: RoundModel;
  /** Émis après que l'événement a été appliqué à `model.round`. */
  roundEvent: GameEventMessage;
  roundEnded: RoundEndInfo;
  gameEnded: LeaderboardEntry[];
  error: { code: ErrorCode; message: string };
}

/**
 * Modèle (le « M » du MVC) : état côté client reconstruit uniquement à partir des messages du
 * serveur. Il ne connaît ni le réseau ni l'affichage : `apply` est la seule porte d'entrée.
 */
export class ClientModel {
  readonly events = new EventBus<ModelEvents>();
  connection: ConnectionStatus = 'closed';
  playerId: string | null = null;
  name = '';
  lobbies: LobbySummary[] = [];
  lobby: LobbyInfo | null = null;
  round: RoundModel | null = null;
  leaderboard: LeaderboardEntry[] = [];
  /** Manches gagnées par joueur depuis le début de la partie. */
  wins: Record<string, number> = {};

  constructor(private readonly clock: () => number = () => Date.now()) {}

  /** Joueur local tel que décrit dans le salon courant. */
  get me(): LobbyPlayerInfo | undefined {
    return this.lobby?.players.find((p) => p.id === this.playerId);
  }

  /** Vrai si le joueur local est l'hôte du salon. */
  get isHost(): boolean {
    return this.me?.isHost ?? false;
  }

  setConnection(status: ConnectionStatus): void {
    this.connection = status;
    this.events.emit('connection', status);
  }

  /** Met à jour l'état à partir d'un message du serveur et prévient les abonnés. */
  apply(message: ServerMessage): void {
    switch (message.type) {
      case 'WELCOME':
        this.playerId = message.payload.playerId;
        this.name = message.payload.name;
        this.events.emit('welcome', message.payload);
        break;
      case 'LOBBY_LIST':
        this.lobbies = message.payload.lobbies;
        this.events.emit('lobbies', this.lobbies);
        break;
      case 'LOBBY_UPDATED':
        this.lobby = message.payload.lobby;
        this.events.emit('lobby', this.lobby);
        break;
      case 'LOBBY_LEFT':
        this.lobby = null;
        this.round = null;
        this.events.emit('lobby', null);
        break;
      case 'ERROR':
        this.events.emit('error', message.payload);
        break;
      case 'ROUND_STARTED':
        this.round = createRound(message.payload.snapshot, this.clock());
        this.events.emit('roundStarted', this.round);
        break;
      case 'ROUND_ENDED':
        this.wins = message.payload.wins;
        this.events.emit('roundEnded', message.payload);
        break;
      case 'GAME_ENDED':
        this.leaderboard = message.payload.leaderboard;
        this.events.emit('gameEnded', this.leaderboard);
        break;
      default:
        if (this.round) {
          applyRoundEvent(this.round, message, this.clock());
          this.events.emit('roundEvent', message);
        }
    }
  }
}
