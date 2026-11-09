import {
  MIN_PLAYERS_TO_START,
  type LobbySettings,
  type LobbySummary,
  type LobbyVisibility,
  type PlayerColor,
} from '@bomberman/shared';
import { GameError } from '../errors.js';
import { Lobby } from './Lobby.js';
import { generateInviteCode } from './inviteCode.js';

/** Identifiant d'un salon à rejoindre : soit public (par id), soit privé (par code). */
export interface JoinTarget {
  lobbyId?: string;
  inviteCode?: string;
}

/**
 * Registre de tous les salons actifs. Ne connaît rien du réseau : elle applique uniquement
 * les règles de gestion (qui peut rejoindre, démarrer, modifier les réglages…).
 */
export class LobbyManager {
  private readonly lobbies = new Map<string, Lobby>();
  private readonly playerLobby = new Map<string, string>();

  listPublicLobbies(): LobbySummary[] {
    return [...this.lobbies.values()]
      .filter((lobby) => lobby.visibility === 'PUBLIC')
      .map((lobby) => lobby.toSummary());
  }

  getLobbyOf(playerId: string): Lobby | undefined {
    const lobbyId = this.playerLobby.get(playerId);
    return lobbyId ? this.lobbies.get(lobbyId) : undefined;
  }

  createLobby(
    playerId: string,
    playerName: string,
    name: string,
    visibility: LobbyVisibility,
    settings?: Partial<LobbySettings>,
  ): Lobby {
    if (this.playerLobby.has(playerId)) {
      throw new GameError('ALREADY_IN_LOBBY', 'Vous êtes déjà dans un salon');
    }
    const inviteCode = visibility === 'PRIVATE' ? this.generateUniqueInviteCode() : null;
    const lobby = new Lobby(name.trim() || 'Salon', visibility, settings, inviteCode);
    lobby.addPlayer(playerId, playerName);
    this.lobbies.set(lobby.id, lobby);
    this.playerLobby.set(playerId, lobby.id);
    return lobby;
  }

  joinLobby(playerId: string, playerName: string, target: JoinTarget): Lobby {
    if (this.playerLobby.has(playerId)) {
      throw new GameError('ALREADY_IN_LOBBY', 'Vous êtes déjà dans un salon');
    }
    const lobby = target.inviteCode
      ? [...this.lobbies.values()].find((l) => l.inviteCode === target.inviteCode)
      : this.lobbies.get(target.lobbyId ?? '');
    if (!lobby) {
      throw new GameError(
        target.inviteCode ? 'INVALID_INVITE_CODE' : 'LOBBY_NOT_FOUND',
        'Salon introuvable',
      );
    }
    if (lobby.status !== 'WAITING') {
      throw new GameError('GAME_IN_PROGRESS', 'Une partie est déjà en cours dans ce salon');
    }
    if (lobby.isFull()) {
      throw new GameError('LOBBY_FULL', 'Ce salon est complet');
    }
    lobby.addPlayer(playerId, playerName);
    this.playerLobby.set(playerId, lobby.id);
    return lobby;
  }

  /**
   * Retire un joueur de son salon (promeut un nouvel hôte si besoin, supprime le salon s'il est
   * vide). Ne lève pas d'erreur si le joueur n'est dans aucun salon.
   */
  leaveLobby(playerId: string): Lobby | null {
    const lobby = this.getLobbyOf(playerId);
    if (!lobby) return null;
    lobby.removePlayer(playerId);
    this.playerLobby.delete(playerId);
    if (lobby.players.length === 0) {
      this.lobbies.delete(lobby.id);
      return null;
    }
    return lobby;
  }

  updateSettings(playerId: string, settings: Partial<LobbySettings>): Lobby {
    const lobby = this.requireHost(playerId);
    lobby.updateSettings(settings);
    return lobby;
  }

  setColor(playerId: string, color: PlayerColor): Lobby {
    const lobby = this.requireMember(playerId);
    lobby.setColor(playerId, color);
    return lobby;
  }

  /** Vérifie les conditions de lancement (hôte, assez de joueurs) puis passe le salon en jeu. */
  startGame(playerId: string): Lobby {
    const lobby = this.requireHost(playerId);
    if (lobby.status !== 'WAITING') {
      throw new GameError('GAME_IN_PROGRESS', 'Une partie est déjà en cours');
    }
    if (lobby.players.length < MIN_PLAYERS_TO_START) {
      throw new GameError('NOT_ENOUGH_PLAYERS', 'Pas assez de joueurs pour démarrer');
    }
    lobby.status = 'IN_GAME';
    return lobby;
  }

  /**
   * Fin de partie : le salon redevient disponible pour une nouvelle manche (persistance du
   * lobby), ou est supprimé si tous les joueurs sont partis entre-temps.
   */
  endGame(lobbyId: string): Lobby | undefined {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return undefined;
    if (lobby.players.length === 0) {
      this.lobbies.delete(lobbyId);
      return undefined;
    }
    lobby.status = 'WAITING';
    return lobby;
  }

  private requireMember(playerId: string): Lobby {
    const lobby = this.getLobbyOf(playerId);
    if (!lobby) throw new GameError('NOT_IN_LOBBY', "Vous n'êtes dans aucun salon");
    return lobby;
  }

  private requireHost(playerId: string): Lobby {
    const lobby = this.requireMember(playerId);
    if (lobby.hostId !== playerId) {
      throw new GameError('NOT_HOST', "Seul l'hôte du salon peut faire cette action");
    }
    return lobby;
  }

  private generateUniqueInviteCode(): string {
    let code: string;
    do {
      code = generateInviteCode();
    } while ([...this.lobbies.values()].some((l) => l.inviteCode === code));
    return code;
  }
}
