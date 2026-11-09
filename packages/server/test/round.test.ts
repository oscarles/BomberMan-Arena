import type { GameEventMessage, LobbySettings } from '@bomberman/shared';
import { DEFAULT_LOBBY_SETTINGS } from '@bomberman/shared';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DROP_TABLE } from '../src/engine/drops.js';
import { GAME_CONFIG } from '../src/engine/gameConfig.js';
import { createRng } from '../src/engine/rng.js';
import { Round } from '../src/engine/Round.js';
import { spawnPoints } from '../src/engine/grid.js';

const stats = () => ({ kills: 0, livesLost: 0, bombsPlaced: 0, itemsCollected: 0 });

function makeRound(settings: Partial<LobbySettings> = {}) {
  const events: GameEventMessage[] = [];
  const round = new Round({
    roundNumber: 1,
    totalRounds: 1,
    participants: [
      { id: 'a', name: 'A', color: 'red', stats: stats() },
      { id: 'b', name: 'B', color: 'blue', stats: stats() },
    ],
    settings: { ...DEFAULT_LOBBY_SETTINGS, ...settings },
    rng: createRng(42),
    dropTable: DEFAULT_DROP_TABLE,
    now: 0,
    emit: (e) => events.push(e),
  });
  return { round, events };
}

describe('Round', () => {
  it('génère des zones de spawn dégagées dans les quatre coins', () => {
    const { round } = makeRound();
    for (const s of spawnPoints(15, 13)) {
      expect(round.grid.get(s.x, s.y)).toBe('EMPTY');
      expect(round.grid.get(s.x + (s.x === 1 ? 1 : -1), s.y)).toBe('EMPTY');
      expect(round.grid.get(s.x, s.y + (s.y === 1 ? 1 : -1))).toBe('EMPTY');
    }
  });

  it('déplace un joueur (MOVE -> POSITION_UPDATED) et applique le délai de déplacement', () => {
    const { round, events } = makeRound();
    const before = round.snapshot(0).players[0]!;
    const dir = before.x === 1 ? 'RIGHT' : 'LEFT';
    expect(round.move('a', dir, 0)).toBe('MOVED');
    expect(events.at(-1)?.type).toBe('POSITION_UPDATED');
    expect(round.move('a', dir, 10)).toBe('COOLDOWN');
  });

  it('refuse de traverser un mur indestructible', () => {
    const { round } = makeRound();
    const p = round.snapshot(0).players[0]!;
    expect(round.move('a', p.y === 1 ? 'UP' : 'DOWN', 0)).toBe('BLOCKED');
  });

  it('pose une bombe, limite leur nombre et fait exploser après la mèche', () => {
    const { round, events } = makeRound();
    expect(round.placeBomb('a', 0)).toBe(true);
    expect(round.placeBomb('a', 0)).toBe(false);
    round.update(GAME_CONFIG.bombFuseMs);
    expect(events.some((e) => e.type === 'BOMB_EXPLODED')).toBe(true);
  });

  it('retire une vie puis fait réapparaître le joueur invulnérable', () => {
    const { round, events } = makeRound({ lives: 2 });
    const t = GAME_CONFIG.invulnerabilityMs + 1;
    round.placeBomb('a', t);
    round.update(t + GAME_CONFIG.bombFuseMs);
    const a = events
      .filter((e) => e.type === 'PLAYER_UPDATED' && e.payload.player.id === 'a')
      .at(-1);
    expect(a?.type === 'PLAYER_UPDATED' && a.payload.player.lives).toBe(1);
    expect(a?.type === 'PLAYER_UPDATED' && a.payload.player.invulnerable).toBe(true);
  });

  it('protège les joueurs pendant la période d’invulnérabilité initiale', () => {
    const { round } = makeRound({ lives: 1 });
    round.placeBomb('a', 0);
    round.update(GAME_CONFIG.bombFuseMs - 1);
    round.update(GAME_CONFIG.bombFuseMs);
    expect(round.finished).toBe(false);
  });

  it('déclenche la mort subite à la fin du temps et termine la manche', () => {
    const { round, events } = makeRound({ timeLimitSeconds: 30 });
    let t = 30_000;
    while (!round.finished && t < 200_000) {
      round.update(t);
      t += GAME_CONFIG.shrinkIntervalMs;
    }
    expect(events.some((e) => e.type === 'SUDDEN_DEATH_STARTED')).toBe(true);
    expect(events.some((e) => e.type === 'ARENA_SHRUNK')).toBe(true);
    expect(round.finished).toBe(true);
  });
});
