import type { ItemType, LobbySettings, PlayerColor } from './types.js';

/** Largeur de l'arène en cases (impair pour obtenir une grille de piliers régulière). */
export const GRID_WIDTH = 15;
/** Hauteur de l'arène en cases. */
export const GRID_HEIGHT = 13;

/** Nombre maximal de joueurs par salon (périmètre MVP : 1 à 4 joueurs connectés). */
export const MAX_PLAYERS_LIMIT = 4;
/** Nombre minimal de joueurs nécessaire pour lancer une partie. */
export const MIN_PLAYERS_TO_START = 2;

/** Bornes des réglages configurables par l'hôte du salon. */
export const SETTINGS_LIMITS = {
  maxPlayers: { min: MIN_PLAYERS_TO_START, max: MAX_PLAYERS_LIMIT },
  lives: { min: 1, max: 5 },
  timeLimitSeconds: { min: 30, max: 600 },
  rounds: { min: 1, max: 9 },
} as const;

/** Réglages appliqués à la création d'un salon. */
export const DEFAULT_LOBBY_SETTINGS: LobbySettings = {
  maxPlayers: MAX_PLAYERS_LIMIT,
  lives: 3,
  timeLimitSeconds: 120,
  itemsEnabled: true,
  malusEnabled: true,
  rounds: 3,
};

/** Palette de couleurs sélectionnables dans le salon d'attente. */
export const PLAYER_COLORS: readonly PlayerColor[] = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'cyan',
  'pink',
];

/** Objets bénéfiques. */
export const BONUS_ITEMS: readonly ItemType[] = ['RANGE_UP', 'BOMB_UP', 'SPEED_UP'];
/** Objets handicapants. */
export const MALUS_ITEMS: readonly ItemType[] = ['SURPRISE_BOMB', 'SLOW'];
/** Tous les types d'objets. */
export const ITEM_TYPES: readonly ItemType[] = [...BONUS_ITEMS, ...MALUS_ITEMS];

/** Longueur maximale d'un pseudo ou d'un nom de salon. */
export const MAX_NAME_LENGTH = 20;
/** Longueur d'un code d'invitation de salon privé. */
export const INVITE_CODE_LENGTH = 6;
