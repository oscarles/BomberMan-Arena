import { DEFAULT_LOBBY_SETTINGS, type GameEventMessage } from '@bomberman/shared';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DROP_TABLE } from '../src/engine/drops.js';
import { GAME_CONFIG } from '../src/engine/gameConfig.js';
import { createRng } from '../src/engine/rng.js';
import { GameSession } from '../src/game/GameSession.js';

function makeSession(rounds: number, now = 0) {
  const events: GameEventMessage[] = [];
  let ended: GameEventMessage | null = null;
  const session = new GameSession(
    {
      participants: [
        { id: 'a', name: 'A', color: 'red' },
        { id: 'b', name: 'B', color: 'blue' },
      ],
      settings: { ...DEFAULT_LOBBY_SETTINGS, rounds, timeLimitSeconds: 30 },
      dropTable: DEFAULT_DROP_TABLE,
      rng: createRng(7),
      emit: (e) => {
        events.push(e);
        if (e.type === 'GAME_ENDED') ended = e;
      },
      onEnded: () => {},
    },
    now,
  );
  return { session, events, isEnded: () => ended !== null, ended: () => ended };
}

/** Fait tourner la mort subite jusqu'à la fin de la manche courante (au plus `maxMs`). */
function runUntilRoundOver(
  session: GameSession,
  events: GameEventMessage[],
  start: number,
): number {
  let t = start;
  const before = events.filter((e) => e.type === 'ROUND_ENDED').length;
  while (events.filter((e) => e.type === 'ROUND_ENDED').length === before && t < start + 200_000) {
    session.update(t);
    t += GAME_CONFIG.shrinkIntervalMs;
  }
  return t;
}

describe('GameSession', () => {
  it('démarre immédiatement la première manche', () => {
    const { events } = makeSession(1);
    expect(events[0]?.type).toBe('ROUND_STARTED');
  });

  it('enchaîne les manches jusqu’au nombre configuré puis publie le classement', () => {
    const { session, events, isEnded } = makeSession(2, 30_000);
    let t = runUntilRoundOver(session, events, 30_000);
    expect(events.some((e) => e.type === 'ROUND_ENDED')).toBe(true);
    expect(isEnded()).toBe(false); // encore une manche à jouer

    // Pause d'intermission puis démarrage de la seconde manche.
    t += GAME_CONFIG.intermissionMs;
    session.update(t);
    expect(events.filter((e) => e.type === 'ROUND_STARTED')).toHaveLength(2);

    t = runUntilRoundOver(session, events, t + 30_000);
    t += GAME_CONFIG.intermissionMs;
    session.update(t);

    expect(isEnded()).toBe(true);
    const ended = events.find((e) => e.type === 'GAME_ENDED');
    expect(ended?.type === 'GAME_ENDED' && ended.payload.leaderboard).toHaveLength(2);
  });

  it('retire un joueur qui abandonne : il ne participe plus aux manches suivantes', () => {
    const { session, events } = makeSession(2, 30_000);
    session.removePlayer('b', 1000);
    expect(events.some((e) => e.type === 'PLAYER_ELIMINATED')).toBe(true);
  });
});
