/** Direction de déplacement sur la grille. */
export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

/**
 * Type de case de l'arène.
 * - `EMPTY` : case libre
 * - `WALL` : cube indestructible
 * - `BLOCK` : cube destructible
 */
export type CellType = 'EMPTY' | 'WALL' | 'BLOCK';

/** Objets ramassables : bonus (pouvoirs) puis malus (handicaps). */
export type ItemType = 'RANGE_UP' | 'BOMB_UP' | 'SPEED_UP' | 'SURPRISE_BOMB' | 'SLOW';

/** Couleurs de personnage disponibles. */
export type PlayerColor =
  'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'cyan' | 'pink';

/** Visibilité d'un salon : public (listé) ou privé (accessible par code d'invitation). */
export type LobbyVisibility = 'PUBLIC' | 'PRIVATE';

/** État d'un salon. Le salon reste actif entre deux parties. */
export type LobbyStatus = 'WAITING' | 'IN_GAME';

/** Coordonnées d'une case (x = colonne, y = ligne). */
export interface Cell {
  x: number;
  y: number;
}

/** Réglages de partie définis par l'hôte. */
export interface LobbySettings {
  /** Nombre maximal de joueurs dans le salon. */
  maxPlayers: number;
  /** Nombre de vies de chaque joueur au début d'une manche. */
  lives: number;
  /** Durée limite d'une manche avant la mort subite (secondes). */
  timeLimitSeconds: number;
  /** Active l'apparition d'objets à la destruction des cubes. */
  itemsEnabled: boolean;
  /** Autorise les malus (n'a d'effet que si les objets sont activés). */
  malusEnabled: boolean;
  /** Nombre de manches de la partie. */
  rounds: number;
}

/** Joueur tel que décrit dans un salon. */
export interface LobbyPlayerInfo {
  id: string;
  name: string;
  color: PlayerColor;
  isHost: boolean;
}

/** Description complète d'un salon (envoyée à ses membres). */
export interface LobbyInfo {
  id: string;
  name: string;
  visibility: LobbyVisibility;
  status: LobbyStatus;
  hostId: string;
  settings: LobbySettings;
  players: LobbyPlayerInfo[];
  /** Code d'invitation, présent uniquement pour les salons privés. */
  inviteCode: string | null;
}

/** Ligne du navigateur de salons. */
export interface LobbySummary {
  id: string;
  name: string;
  status: LobbyStatus;
  playerCount: number;
  maxPlayers: number;
  settings: LobbySettings;
}

/** État d'un joueur pendant une manche. */
export interface PlayerState {
  id: string;
  name: string;
  color: PlayerColor;
  x: number;
  y: number;
  lives: number;
  alive: boolean;
  /** Vrai pendant la protection de début de manche / de réapparition. */
  invulnerable: boolean;
  /** Vrai pendant l'effet du malus de ralentissement. */
  slowed: boolean;
  maxBombs: number;
  bombRange: number;
  speedLevel: number;
}

/** Bombe posée sur la grille. */
export interface BombState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  range: number;
}

/** Objet posé sur la grille. */
export interface ItemState {
  id: string;
  type: ItemType;
  x: number;
  y: number;
}

/** Vue complète d'une manche, envoyée au démarrage de celle-ci. */
export interface RoundSnapshot {
  roundNumber: number;
  totalRounds: number;
  /** Grille indexée `[y][x]`. */
  grid: CellType[][];
  players: PlayerState[];
  bombs: BombState[];
  items: ItemState[];
  /** Temps restant avant la mort subite (ms). */
  timeRemainingMs: number;
  suddenDeath: boolean;
}

/** Ligne du tableau des scores affiché en fin de partie. */
export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  name: string;
  color: PlayerColor;
  /** Manches remportées. */
  wins: number;
  /** Joueurs éliminés par les bombes de ce joueur. */
  kills: number;
  /** Nombre de vies perdues au total. */
  livesLost: number;
  bombsPlaced: number;
  itemsCollected: number;
  /** Vrai si le joueur a quitté la partie avant la fin. */
  left: boolean;
}
