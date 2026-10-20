import { randomUUID } from 'node:crypto';
import {
  DEFAULT_LOBBY_SETTINGS,
  PLAYER_COLORS,
  SETTINGS_LIMITS,
  type LobbyInfo,
  type LobbyPlayerInfo,
  type LobbySettings,
  type LobbyStatus,
  type LobbySummary,
  type LobbyVisibility,
  type PlayerColor,
} from '@bomberman/shared';
import { GameError } from '../errors.js';

/** Ramène chaque réglage numérique dans les bornes autorisées (`SETTINGS_LIMITS`). */
function clampSettings(settings: LobbySettings): LobbySettings {
  const clamp = (value: number, { min, max }: { min: number; max: number }) =>
    Math.min(max, Math.max(min, Math.round(value)));
  return {
    ...settings,
    maxPlayers: clamp(settings.maxPlayers, SETTINGS_LIMITS.maxPlayers),
    lives: clamp(settings.lives, SETTINGS_LIMITS.lives),
    timeLimitSeconds: clamp(settings.timeLimitSeconds, SETTINGS_LIMITS.timeLimitSeconds),
    rounds: clamp(settings.rounds, SETTINGS_LIMITS.rounds),
  };
}

/**
 * Un salon d'attente (lobby). Reste actif entre deux parties : seul son statut change
 * (`WAITING` / `IN_GAME`), les joueurs ne sont jamais renvoyés au menu principal.
 */
export class Lobby {
  readonly id = randomUUID();
  status: LobbyStatus = 'WAITING';
  settings: LobbySettings;
  readonly players: LobbyPlayerInfo[] = [];

  constructor(
    public name: string,
    readonly visibility: LobbyVisibility,
    settings: Partial<LobbySettings> | undefined,
    readonly inviteCode: string | null,
  ) {
    this.settings = clampSettings({ ...DEFAULT_LOBBY_SETTINGS, ...settings });
  }

  get hostId(): string | null {
    return this.players.find((p) => p.isHost)?.id ?? null;
  }

  findPlayer(playerId: string): LobbyPlayerInfo | undefined {
    return this.players.find((p) => p.id === playerId);
  }

  isFull(): boolean {
    return this.players.length >= this.settings.maxPlayers;
  }

  private nextAvailableColor(): PlayerColor {
    const taken = new Set(this.players.map((p) => p.color));
    return PLAYER_COLORS.find((c) => !taken.has(c)) ?? (PLAYER_COLORS[0] as PlayerColor);
  }

  /** Ajoute un joueur ; le premier arrivé devient l'hôte. */
  addPlayer(id: string, name: string): LobbyPlayerInfo {
    const player: LobbyPlayerInfo = {
      id,
      name,
      color: this.nextAvailableColor(),
      isHost: this.players.length === 0,
    };
    this.players.push(player);
    return player;
  }

  /** Retire un joueur ; si c'était l'hôte, promeut le suivant dans l'ordre d'arrivée. */
  removePlayer(playerId: string): void {
    const index = this.players.findIndex((p) => p.id === playerId);
    if (index === -1) return;
    const wasHost = (this.players[index] as LobbyPlayerInfo).isHost;
    this.players.splice(index, 1);
    if (wasHost && this.players.length > 0) {
      (this.players[0] as LobbyPlayerInfo).isHost = true;
    }
  }

  setColor(playerId: string, color: PlayerColor): void {
    if (!PLAYER_COLORS.includes(color)) {
      throw new GameError('INVALID_SETTINGS', 'Couleur invalide');
    }
    if (this.players.some((p) => p.color === color && p.id !== playerId)) {
      throw new GameError('COLOR_TAKEN', 'Cette couleur est déjà prise par un autre joueur');
    }
    const player = this.findPlayer(playerId);
    if (!player) throw new GameError('NOT_IN_LOBBY', "Vous n'êtes pas dans ce salon");
    player.color = color;
  }

  /** Modifie les réglages de la partie (hôte uniquement, salon en attente). */
  updateSettings(partial: Partial<LobbySettings>): void {
    if (this.status !== 'WAITING') {
      throw new GameError('GAME_IN_PROGRESS', 'Impossible de modifier les réglages en jeu');
    }
    this.settings = clampSettings({ ...this.settings, ...partial });
  }

  toInfo(): LobbyInfo {
    return {
      id: this.id,
      name: this.name,
      visibility: this.visibility,
      status: this.status,
      hostId: this.hostId ?? '',
      settings: this.settings,
      players: this.players.map((p) => ({ ...p })),
      inviteCode: this.inviteCode,
    };
  }

  /** Ligne affichée dans le navigateur de salons publics. */
  toSummary(): LobbySummary {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      playerCount: this.players.length,
      maxPlayers: this.settings.maxPlayers,
      settings: this.settings,
    };
  }
}
