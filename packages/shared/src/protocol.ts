import type {
  BombState,
  Cell,
  Direction,
  ItemState,
  ItemType,
  LeaderboardEntry,
  LobbyInfo,
  LobbySettings,
  LobbySummary,
  LobbyVisibility,
  PlayerColor,
  PlayerState,
  RoundSnapshot,
} from './types.js';

/**
 * Protocole WebSocket (JSON). Chaque trame est une enveloppe `{ type, payload }`.
 * Les messages sont décrits ici sous forme d'union discriminée sur `type`.
 */

// ---------------------------------------------------------------------------
// Client -> Serveur
// ---------------------------------------------------------------------------

/** Définit le pseudo du joueur. */
export interface SetNameMessage {
  type: 'SET_NAME';
  payload: { name: string };
}

/** Demande la liste des salons publics. */
export interface ListLobbiesMessage {
  type: 'LIST_LOBBIES';
  payload: Record<string, never>;
}

/** Crée un salon (l'émetteur en devient l'hôte). */
export interface CreateLobbyMessage {
  type: 'CREATE_LOBBY';
  payload: {
    name: string;
    visibility: LobbyVisibility;
    settings?: Partial<LobbySettings>;
  };
}

/** Rejoint un salon public (`lobbyId`) ou privé (`inviteCode`). */
export interface JoinLobbyMessage {
  type: 'JOIN_LOBBY';
  payload: { lobbyId?: string; inviteCode?: string };
}

/** Quitte le salon courant. */
export interface LeaveLobbyMessage {
  type: 'LEAVE_LOBBY';
  payload: Record<string, never>;
}

/** Modifie les réglages du salon (hôte uniquement, salon en attente). */
export interface UpdateSettingsMessage {
  type: 'UPDATE_SETTINGS';
  payload: { settings: Partial<LobbySettings> };
}

/** Choisit la couleur de son personnage. */
export interface SetColorMessage {
  type: 'SET_COLOR';
  payload: { color: PlayerColor };
}

/** Lance la partie (hôte uniquement). */
export interface StartGameMessage {
  type: 'START_GAME';
  payload: Record<string, never>;
}

/** Demande de déplacement d'une case. Le serveur reste maître de la position. */
export interface MoveMessage {
  type: 'MOVE';
  payload: { direction: Direction };
}

/** Demande de pose de bombe sur la case courante. */
export interface PlaceBombMessage {
  type: 'PLACE_BOMB';
  payload: Record<string, never>;
}

export type ClientMessage =
  | SetNameMessage
  | ListLobbiesMessage
  | CreateLobbyMessage
  | JoinLobbyMessage
  | LeaveLobbyMessage
  | UpdateSettingsMessage
  | SetColorMessage
  | StartGameMessage
  | MoveMessage
  | PlaceBombMessage;

export type ClientMessageType = ClientMessage['type'];

// ---------------------------------------------------------------------------
// Serveur -> Client : messages de connexion et de salon
// ---------------------------------------------------------------------------

export interface WelcomeMessage {
  type: 'WELCOME';
  payload: { playerId: string; name: string };
}

export interface LobbyListMessage {
  type: 'LOBBY_LIST';
  payload: { lobbies: LobbySummary[] };
}

/** Envoyé à l'entrée dans un salon puis à chaque changement de celui-ci. */
export interface LobbyUpdatedMessage {
  type: 'LOBBY_UPDATED';
  payload: { lobby: LobbyInfo };
}

/** Confirme que le joueur n'est plus dans un salon. */
export interface LobbyLeftMessage {
  type: 'LOBBY_LEFT';
  payload: Record<string, never>;
}

export type ErrorCode =
  | 'INVALID_MESSAGE'
  | 'LOBBY_NOT_FOUND'
  | 'LOBBY_FULL'
  | 'INVALID_INVITE_CODE'
  | 'GAME_IN_PROGRESS'
  | 'ALREADY_IN_LOBBY'
  | 'NOT_IN_LOBBY'
  | 'NOT_HOST'
  | 'INVALID_SETTINGS'
  | 'COLOR_TAKEN'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NOT_IN_GAME';

export interface ErrorMessage {
  type: 'ERROR';
  payload: { code: ErrorCode; message: string };
}

// ---------------------------------------------------------------------------
// Serveur -> Client : événements de jeu
// ---------------------------------------------------------------------------

export interface RoundStartedMessage {
  type: 'ROUND_STARTED';
  payload: { snapshot: RoundSnapshot };
}

/** Nouvelle position (validée par le serveur) d'un joueur. */
export interface PositionUpdatedMessage {
  type: 'POSITION_UPDATED';
  payload: { playerId: string; x: number; y: number };
}

/** Mise à jour des caractéristiques d'un joueur (vies, bonus, statuts…). */
export interface PlayerUpdatedMessage {
  type: 'PLAYER_UPDATED';
  payload: { player: PlayerState };
}

export interface PlayerEliminatedMessage {
  type: 'PLAYER_ELIMINATED';
  payload: { playerId: string; killerId: string | null };
}

export interface BombPlacedMessage {
  type: 'BOMB_PLACED';
  payload: { bomb: BombState };
}

/** Explosion d'une bombe : cases en flammes et cubes détruits. */
export interface BombExplodedMessage {
  type: 'BOMB_EXPLODED';
  payload: { bombId: string; cells: Cell[]; destroyedBlocks: Cell[] };
}

export interface ItemSpawnedMessage {
  type: 'ITEM_SPAWNED';
  payload: { item: ItemState };
}

/** Objet détruit par une explosion. */
export interface ItemDestroyedMessage {
  type: 'ITEM_DESTROYED';
  payload: { itemId: string };
}

export interface ItemPickedMessage {
  type: 'ITEM_PICKED';
  payload: { itemId: string; playerId: string; itemType: ItemType };
}

/** La limite de temps est atteinte : la zone de jeu commence à rétrécir. */
export interface SuddenDeathStartedMessage {
  type: 'SUDDEN_DEATH_STARTED';
  payload: Record<string, never>;
}

/** Cases devenues des murs à cause du rétrécissement de la zone. */
export interface ArenaShrunkMessage {
  type: 'ARENA_SHRUNK';
  payload: { cells: Cell[] };
}

export interface RoundEndedMessage {
  type: 'ROUND_ENDED';
  payload: {
    roundNumber: number;
    /** Vainqueur de la manche, `null` en cas d'égalité. */
    winnerId: string | null;
    /** Nombre de manches gagnées par joueur. */
    wins: Record<string, number>;
  };
}

/** Fin de partie : tableau des scores. Le salon reste actif ensuite. */
export interface GameEndedMessage {
  type: 'GAME_ENDED';
  payload: { leaderboard: LeaderboardEntry[] };
}

/** Sous-ensemble des messages serveur produits par le moteur de jeu. */
export type GameEventMessage =
  | RoundStartedMessage
  | PositionUpdatedMessage
  | PlayerUpdatedMessage
  | PlayerEliminatedMessage
  | BombPlacedMessage
  | BombExplodedMessage
  | ItemSpawnedMessage
  | ItemDestroyedMessage
  | ItemPickedMessage
  | SuddenDeathStartedMessage
  | ArenaShrunkMessage
  | RoundEndedMessage
  | GameEndedMessage;

export type ServerMessage =
  | WelcomeMessage
  | LobbyListMessage
  | LobbyUpdatedMessage
  | LobbyLeftMessage
  | ErrorMessage
  | GameEventMessage;

export type ServerMessageType = ServerMessage['type'];

/** Extrait le type de message serveur correspondant à un `type` donné. */
export type ServerMessageOf<T extends ServerMessageType> = Extract<ServerMessage, { type: T }>;
