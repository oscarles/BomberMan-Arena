import type { PlayerState, RoundSnapshot, ServerMessage } from '@bomberman/shared';
import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import { ClientModel } from '../src/model/ClientModel';
import { FLAME_DISPLAY_MS, pruneFlames, timeRemainingMs } from '../src/model/round';

function player(id: string, x: number, y: number): PlayerState {
  return {
    id,
    name: id,
    color: 'red',
    x,
    y,
    lives: 3,
    alive: true,
    invulnerable: false,
    slowed: false,
    maxBombs: 1,
    bombRange: 2,
    speedLevel: 0,
  };
}

function snapshot(): RoundSnapshot {
  return {
    roundNumber: 1,
    totalRounds: 3,
    grid: [
      ['WALL', 'WALL', 'WALL', 'WALL'],
      ['WALL', 'EMPTY', 'BLOCK', 'WALL'],
      ['WALL', 'WALL', 'WALL', 'WALL'],
    ],
    players: [player('a', 1, 1), player('b', 2, 1)],
    bombs: [],
    items: [],
    timeRemainingMs: 60_000,
    suddenDeath: false,
  };
}

function modelWithRound(now = 1_000) {
  const model = new ClientModel(() => now);
  model.apply({ type: 'WELCOME', payload: { playerId: 'a', name: 'Alice' } });
  model.apply({ type: 'ROUND_STARTED', payload: { snapshot: snapshot() } });
  return model;
}

describe('EventBus', () => {
  it('notifie les abonnés, puis plus après désabonnement', () => {
    const bus = new EventBus<{ ping: number }>();
    const listener = vi.fn();
    const off = bus.on('ping', listener);
    bus.emit('ping', 1);
    off();
    bus.emit('ping', 2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(1);
  });

  it('clear supprime tous les écouteurs', () => {
    const bus = new EventBus<{ ping: number }>();
    const listener = vi.fn();
    bus.on('ping', listener);
    bus.clear();
    bus.emit('ping', 1);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('ClientModel', () => {
  it("mémorise l'identité reçue à la connexion", () => {
    const model = new ClientModel();
    const welcome = vi.fn();
    model.events.on('welcome', welcome);
    model.apply({ type: 'WELCOME', payload: { playerId: 'p1', name: 'Zoé' } });
    expect(model.playerId).toBe('p1');
    expect(model.name).toBe('Zoé');
    expect(welcome).toHaveBeenCalled();
  });

  it("suit le salon courant et sait si le joueur local est l'hôte", () => {
    const model = new ClientModel();
    model.apply({ type: 'WELCOME', payload: { playerId: 'a', name: 'Alice' } });
    model.apply({
      type: 'LOBBY_UPDATED',
      payload: {
        lobby: {
          id: 'l1',
          name: 'Salon',
          visibility: 'PUBLIC',
          status: 'WAITING',
          hostId: 'a',
          settings: {
            maxPlayers: 4,
            lives: 3,
            timeLimitSeconds: 120,
            itemsEnabled: true,
            malusEnabled: true,
            rounds: 3,
          },
          players: [{ id: 'a', name: 'Alice', color: 'red', isHost: true }],
          inviteCode: null,
        },
      },
    });
    expect(model.isHost).toBe(true);
    model.apply({ type: 'LOBBY_LEFT', payload: {} });
    expect(model.lobby).toBeNull();
    expect(model.isHost).toBe(false);
  });

  it('transmet les erreurs du serveur', () => {
    const model = new ClientModel();
    const onError = vi.fn();
    model.events.on('error', onError);
    model.apply({ type: 'ERROR', payload: { code: 'LOBBY_FULL', message: 'plein' } });
    expect(onError).toHaveBeenCalledWith({ code: 'LOBBY_FULL', message: 'plein' });
  });

  it("construit la manche à partir de l'instantané", () => {
    const model = modelWithRound();
    expect(model.round?.players.size).toBe(2);
    expect(timeRemainingMs(model.round!, 1_000)).toBe(60_000);
  });

  it('ignore les événements de partie hors manche', () => {
    const model = new ClientModel();
    const onEvent = vi.fn();
    model.events.on('roundEvent', onEvent);
    model.apply({ type: 'POSITION_UPDATED', payload: { playerId: 'a', x: 1, y: 1 } });
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('applique les déplacements validés par le serveur', () => {
    const model = modelWithRound();
    model.apply({ type: 'POSITION_UPDATED', payload: { playerId: 'a', x: 3, y: 1 } });
    expect(model.round?.players.get('a')).toMatchObject({ x: 3, y: 1 });
  });

  it('gère bombe, explosion, flammes et destruction de cubes', () => {
    const model = modelWithRound(5_000);
    model.apply({
      type: 'BOMB_PLACED',
      payload: { bomb: { id: 'b1', ownerId: 'a', x: 1, y: 1, range: 2 } },
    });
    expect(model.round?.bombs.has('b1')).toBe(true);
    model.apply({
      type: 'BOMB_EXPLODED',
      payload: {
        bombId: 'b1',
        cells: [
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ],
        destroyedBlocks: [{ x: 2, y: 1 }],
      },
    });
    const round = model.round!;
    expect(round.bombs.size).toBe(0);
    expect(round.grid[1]?.[2]).toBe('EMPTY');
    expect(round.flames).toHaveLength(2);
    pruneFlames(round, 5_000 + FLAME_DISPLAY_MS - 1);
    expect(round.flames).toHaveLength(2);
    pruneFlames(round, 5_000 + FLAME_DISPLAY_MS);
    expect(round.flames).toHaveLength(0);
  });

  it("gère l'apparition, le ramassage et la destruction d'objets", () => {
    const model = modelWithRound();
    model.apply({
      type: 'ITEM_SPAWNED',
      payload: { item: { id: 'i1', type: 'SPEED_UP', x: 1, y: 1 } },
    });
    model.apply({
      type: 'ITEM_SPAWNED',
      payload: { item: { id: 'i2', type: 'SLOW', x: 2, y: 1 } },
    });
    expect(model.round?.items.size).toBe(2);
    model.apply({
      type: 'ITEM_PICKED',
      payload: { itemId: 'i1', playerId: 'a', itemType: 'SPEED_UP' },
    });
    model.apply({ type: 'ITEM_DESTROYED', payload: { itemId: 'i2' } });
    expect(model.round?.items.size).toBe(0);
  });

  it('met à jour les joueurs (statuts, élimination)', () => {
    const model = modelWithRound();
    model.apply({
      type: 'PLAYER_UPDATED',
      payload: { player: { ...player('a', 1, 1), lives: 2, invulnerable: true } },
    });
    expect(model.round?.players.get('a')).toMatchObject({ lives: 2, invulnerable: true });
    model.apply({ type: 'PLAYER_ELIMINATED', payload: { playerId: 'b', killerId: 'a' } });
    expect(model.round?.players.get('b')).toMatchObject({ alive: false, lives: 0 });
  });

  it('applique la mort subite : murs et temps restant à zéro', () => {
    const model = modelWithRound();
    model.apply({ type: 'SUDDEN_DEATH_STARTED', payload: {} });
    model.apply({ type: 'ARENA_SHRUNK', payload: { cells: [{ x: 1, y: 1 }] } });
    expect(model.round?.grid[1]?.[1]).toBe('WALL');
    expect(timeRemainingMs(model.round!, 2_000)).toBe(0);
  });

  it('enregistre fin de manche et classement final', () => {
    const model = modelWithRound();
    const messages: ServerMessage[] = [
      { type: 'ROUND_ENDED', payload: { roundNumber: 1, winnerId: 'a', wins: { a: 1, b: 0 } } },
      {
        type: 'GAME_ENDED',
        payload: {
          leaderboard: [
            {
              rank: 1,
              playerId: 'a',
              name: 'Alice',
              color: 'red',
              wins: 2,
              kills: 3,
              livesLost: 1,
              bombsPlaced: 5,
              itemsCollected: 2,
              left: false,
            },
          ],
        },
      },
    ];
    messages.forEach((m) => model.apply(m));
    expect(model.wins).toEqual({ a: 1, b: 0 });
    expect(model.leaderboard[0]?.name).toBe('Alice');
  });
});
