import {
  MAX_NAME_LENGTH,
  PLAYER_COLORS,
  type ClientMessage,
  type Direction,
  type LobbySettings,
  type LobbyVisibility,
  type PlayerColor,
} from '@bomberman/shared';

const DIRECTIONS: readonly Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_NAME_LENGTH;
}

function isPartialSettings(value: unknown): value is Partial<LobbySettings> {
  if (!isRecord(value)) return false;
  const numberKeys = ['maxPlayers', 'lives', 'timeLimitSeconds', 'rounds'] as const;
  const boolKeys = ['itemsEnabled', 'malusEnabled'] as const;
  return (
    numberKeys.every((k) => value[k] === undefined || typeof value[k] === 'number') &&
    boolKeys.every((k) => value[k] === undefined || typeof value[k] === 'boolean')
  );
}

/**
 * Valide et type une trame brute reçue d'un client. Toute trame malformée est rejetée plutôt
 * que partiellement interprétée (le serveur reste seul maître des règles).
 * @returns Le message typé, ou `null` si la trame est invalide.
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!isRecord(raw) || typeof raw.type !== 'string') return null;
  const payload = isRecord(raw.payload) ? raw.payload : {};

  switch (raw.type) {
    case 'SET_NAME':
      return isName(payload.name) ? { type: 'SET_NAME', payload: { name: payload.name } } : null;

    case 'LIST_LOBBIES':
      return { type: 'LIST_LOBBIES', payload: {} };

    case 'CREATE_LOBBY': {
      if (!isName(payload.name)) return null;
      if (payload.visibility !== 'PUBLIC' && payload.visibility !== 'PRIVATE') return null;
      if (payload.settings !== undefined && !isPartialSettings(payload.settings)) return null;
      return {
        type: 'CREATE_LOBBY',
        payload: {
          name: payload.name,
          visibility: payload.visibility as LobbyVisibility,
          settings: payload.settings as Partial<LobbySettings> | undefined,
        },
      };
    }

    case 'JOIN_LOBBY': {
      const lobbyId = typeof payload.lobbyId === 'string' ? payload.lobbyId : undefined;
      const inviteCode = typeof payload.inviteCode === 'string' ? payload.inviteCode : undefined;
      return lobbyId || inviteCode
        ? { type: 'JOIN_LOBBY', payload: { lobbyId, inviteCode } }
        : null;
    }

    case 'LEAVE_LOBBY':
      return { type: 'LEAVE_LOBBY', payload: {} };

    case 'UPDATE_SETTINGS':
      return isPartialSettings(payload.settings)
        ? { type: 'UPDATE_SETTINGS', payload: { settings: payload.settings } }
        : null;

    case 'SET_COLOR':
      return PLAYER_COLORS.includes(payload.color as PlayerColor)
        ? { type: 'SET_COLOR', payload: { color: payload.color as PlayerColor } }
        : null;

    case 'START_GAME':
      return { type: 'START_GAME', payload: {} };

    case 'MOVE':
      return DIRECTIONS.includes(payload.direction as Direction)
        ? { type: 'MOVE', payload: { direction: payload.direction as Direction } }
        : null;

    case 'PLACE_BOMB':
      return { type: 'PLACE_BOMB', payload: {} };

    default:
      return null;
  }
}
