import {
  INVITE_CODE_LENGTH,
  MAX_NAME_LENGTH,
  type Direction,
  type LobbySettings,
  type LobbyVisibility,
  type PlayerColor,
} from '@bomberman/shared';
import type { ClientModel } from '../model/ClientModel';
import type { Transport } from '../net/Transport';
import type { SettingsStore } from '../settings/Settings';

/** Nettoie un pseudo ou un nom de salon saisi par l'utilisateur. */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

/** Normalise un code d'invitation (majuscules, caractères alphanumériques uniquement). */
export function cleanInviteCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, INVITE_CODE_LENGTH);
}

/**
 * Contrôleur (le « C » du MVC) : traduit les intentions de l'utilisateur en messages du
 * protocole, et relie le transport au modèle. Il ne contient aucune règle de jeu : le serveur
 * valide chaque demande et le modèle ne change que sur sa réponse.
 */
export class AppController {
  constructor(
    private readonly model: ClientModel,
    private readonly transport: Transport,
    private readonly settings: SettingsStore,
  ) {}

  /** Branche le transport sur le modèle et ouvre la connexion. */
  start(): void {
    this.transport.onMessage((message) => this.model.apply(message));
    this.transport.onStatus((status) => this.model.setConnection(status));
    this.model.events.on('welcome', () => {
      const pseudo = cleanName(this.settings.data.pseudo);
      if (pseudo) this.transport.send({ type: 'SET_NAME', payload: { name: pseudo } });
      this.refreshLobbies();
    });
    this.transport.connect();
  }

  /** Relance la connexion après une coupure. */
  reconnect(): void {
    this.transport.connect();
  }

  setPseudo(raw: string): void {
    const name = cleanName(raw);
    if (!name) return;
    this.settings.update({ pseudo: name });
    this.transport.send({ type: 'SET_NAME', payload: { name } });
  }

  refreshLobbies(): void {
    this.transport.send({ type: 'LIST_LOBBIES', payload: {} });
  }

  createLobby(name: string, visibility: LobbyVisibility, settings?: Partial<LobbySettings>): void {
    const lobbyName = cleanName(name) || `Salon de ${this.model.name || 'joueur'}`;
    this.transport.send({
      type: 'CREATE_LOBBY',
      payload: { name: lobbyName, visibility, ...(settings ? { settings } : {}) },
    });
  }

  joinLobby(lobbyId: string): void {
    this.transport.send({ type: 'JOIN_LOBBY', payload: { lobbyId } });
  }

  /** Rejoint un salon privé ; renvoie `false` si le code n'a pas le bon format. */
  joinByCode(raw: string): boolean {
    const inviteCode = cleanInviteCode(raw);
    if (inviteCode.length !== INVITE_CODE_LENGTH) return false;
    this.transport.send({ type: 'JOIN_LOBBY', payload: { inviteCode } });
    return true;
  }

  leaveLobby(): void {
    this.transport.send({ type: 'LEAVE_LOBBY', payload: {} });
  }

  updateSettings(settings: Partial<LobbySettings>): void {
    this.transport.send({ type: 'UPDATE_SETTINGS', payload: { settings } });
  }

  setColor(color: PlayerColor): void {
    this.transport.send({ type: 'SET_COLOR', payload: { color } });
  }

  startGame(): void {
    this.transport.send({ type: 'START_GAME', payload: {} });
  }

  move(direction: Direction): void {
    this.transport.send({ type: 'MOVE', payload: { direction } });
  }

  placeBomb(): void {
    this.transport.send({ type: 'PLACE_BOMB', payload: {} });
  }
}
