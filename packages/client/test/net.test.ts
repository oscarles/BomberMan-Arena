import type { ClientMessage, ServerMessage } from '@bomberman/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppController, cleanInviteCode, cleanName } from '../src/controller/AppController';
import { ClientModel } from '../src/model/ClientModel';
import { MockTransport } from '../src/net/MockTransport';
import type { ConnectionStatus, Transport } from '../src/net/Transport';
import {
  WebSocketTransport,
  parseServerMessage,
  type SocketLike,
} from '../src/net/WebSocketTransport';
import { SettingsStore } from '../src/settings/Settings';

class FakeSocket implements SocketLike {
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  sent: string[] = [];
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
  }
}

describe('parseServerMessage', () => {
  it('accepte une enveloppe valide', () => {
    expect(parseServerMessage('{"type":"LOBBY_LEFT","payload":{}}')).toEqual({
      type: 'LOBBY_LEFT',
      payload: {},
    });
  });

  it.each([42, 'pas du json', '"texte"', '{"type":1,"payload":{}}', '{"type":"X"}', 'null'])(
    'rejette %s',
    (raw) => {
      expect(parseServerMessage(raw)).toBeNull();
    },
  );
});

describe('WebSocketTransport', () => {
  it("relaie les messages et les changements d'état", () => {
    const socket = new FakeSocket();
    const transport = new WebSocketTransport('ws://x', () => socket);
    const statuses: ConnectionStatus[] = [];
    const messages: ServerMessage[] = [];
    transport.onStatus((s) => statuses.push(s));
    transport.onMessage((m) => messages.push(m));
    transport.connect();
    socket.readyState = 1;
    socket.onopen?.();
    socket.onmessage?.({ data: '{"type":"WELCOME","payload":{"playerId":"p","name":"n"}}' });
    socket.onmessage?.({ data: 'trame invalide' });
    socket.onclose?.();
    expect(statuses).toEqual(['connecting', 'open', 'closed']);
    expect(messages).toHaveLength(1);
  });

  it("n'envoie rien tant que la liaison n'est pas ouverte", () => {
    const socket = new FakeSocket();
    const transport = new WebSocketTransport('ws://x', () => socket);
    transport.connect();
    transport.send({ type: 'LEAVE_LOBBY', payload: {} });
    expect(socket.sent).toHaveLength(0);
    socket.readyState = 1;
    transport.send({ type: 'MOVE', payload: { direction: 'UP' } });
    expect(JSON.parse(socket.sent[0] ?? '{}')).toEqual({
      type: 'MOVE',
      payload: { direction: 'UP' },
    });
    transport.close();
    expect(socket.readyState).toBe(3);
  });
});

describe('AppController', () => {
  class SpyTransport implements Transport {
    sent: ClientMessage[] = [];
    handler: (m: ServerMessage) => void = () => undefined;
    connect = vi.fn();
    close = vi.fn();
    send(m: ClientMessage) {
      this.sent.push(m);
    }
    onMessage(h: (m: ServerMessage) => void) {
      this.handler = h;
    }
    onStatus() {}
  }

  function setup(pseudo = 'Tom') {
    const transport = new SpyTransport();
    const model = new ClientModel();
    const settings = new SettingsStore(null);
    settings.update({ pseudo });
    const controller = new AppController(model, transport, settings);
    controller.start();
    return { transport, model, controller };
  }

  it("envoie le pseudo et demande les salons après l'accueil du serveur", () => {
    const { transport } = setup('Tom');
    transport.handler({ type: 'WELCOME', payload: { playerId: 'p1', name: 'Invité' } });
    expect(transport.sent.map((m) => m.type)).toEqual(['SET_NAME', 'LIST_LOBBIES']);
  });

  it('traduit les intentions en messages du protocole', () => {
    const { transport, controller } = setup();
    controller.createLobby('   ', 'PRIVATE');
    controller.joinLobby('l1');
    controller.setColor('green');
    controller.startGame();
    controller.move('LEFT');
    controller.placeBomb();
    controller.updateSettings({ lives: 5 });
    controller.leaveLobby();
    expect(transport.sent.map((m) => m.type)).toEqual([
      'CREATE_LOBBY',
      'JOIN_LOBBY',
      'SET_COLOR',
      'START_GAME',
      'MOVE',
      'PLACE_BOMB',
      'UPDATE_SETTINGS',
      'LEAVE_LOBBY',
    ]);
    expect(transport.sent[0]).toMatchObject({
      payload: { name: 'Salon de joueur', visibility: 'PRIVATE' },
    });
  });

  it("refuse un code d'invitation mal formé", () => {
    const { transport, controller } = setup();
    expect(controller.joinByCode('abc')).toBe(false);
    expect(controller.joinByCode(' mo-ck42 ')).toBe(true);
    expect(transport.sent).toEqual([{ type: 'JOIN_LOBBY', payload: { inviteCode: 'MOCK42' } }]);
  });

  it('nettoie pseudos et codes', () => {
    expect(cleanName('  Tom   Pod  ')).toBe('Tom Pod');
    expect(cleanName('x'.repeat(40))).toHaveLength(20);
    expect(cleanInviteCode('ab-12 cd34')).toBe('AB12CD');
  });

  it('mémorise le pseudo choisi', () => {
    const { transport, controller } = setup('');
    controller.setPseudo('   ');
    expect(transport.sent).toHaveLength(0);
    controller.setPseudo('Léa');
    expect(transport.sent[0]).toEqual({ type: 'SET_NAME', payload: { name: 'Léa' } });
  });
});

describe('MockTransport (mode hors ligne)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function connected() {
    const transport = new MockTransport(undefined, () => 0.5);
    const model = new ClientModel();
    const controller = new AppController(model, transport, new SettingsStore(null));
    controller.start();
    vi.advanceTimersByTime(200);
    return { transport, model, controller };
  }

  it('accueille le joueur et liste des salons fictifs', () => {
    const { model, controller } = connected();
    expect(model.connection).toBe('open');
    expect(model.playerId).toBe('me');
    controller.refreshLobbies();
    expect(model.lobbies.length).toBeGreaterThan(0);
  });

  it('crée un salon, ajoute des joueurs fictifs puis lance une partie', () => {
    const { model, controller } = connected();
    controller.createLobby('Test', 'PUBLIC');
    expect(model.isHost).toBe(true);
    vi.advanceTimersByTime(2_000);
    expect(model.lobby?.players.length).toBe(3);
    controller.startGame();
    expect(model.lobby?.status).toBe('IN_GAME');
    expect(model.round?.players.size).toBe(3);
  });

  it("refuse les actions interdites avec les mêmes codes d'erreur que le serveur", () => {
    const { model, controller } = connected();
    const errors: string[] = [];
    model.events.on('error', (e) => errors.push(e.code));
    controller.startGame();
    controller.createLobby('A', 'PUBLIC');
    controller.createLobby('B', 'PUBLIC');
    controller.updateSettings({ lives: 99 });
    controller.setColor('green');
    controller.move('UP');
    expect(errors).toEqual(['NOT_IN_LOBBY', 'ALREADY_IN_LOBBY', 'INVALID_SETTINGS', 'NOT_IN_GAME']);
  });

  it("gère les codes d'invitation et les salons pleins", () => {
    const { model, controller } = connected();
    const errors: string[] = [];
    model.events.on('error', (e) => errors.push(e.code));
    controller.joinByCode('ZZZZZZ');
    controller.joinLobby('inconnu');
    controller.joinLobby('lobby-b');
    expect(errors).toEqual(['INVALID_INVITE_CODE', 'LOBBY_NOT_FOUND', 'LOBBY_FULL']);
    controller.joinByCode('MOCK42');
    expect(model.lobby?.visibility).toBe('PRIVATE');
    controller.leaveLobby();
    expect(model.lobby).toBeNull();
  });

  it("simule une manche complète jusqu'au classement", () => {
    const { model, controller } = connected();
    controller.createLobby('Test', 'PUBLIC', { rounds: 1, lives: 1, timeLimitSeconds: 30 });
    vi.advanceTimersByTime(2_000);
    controller.startGame();
    const events: string[] = [];
    model.events.on('roundEvent', (e) => events.push(e.type));
    controller.placeBomb();
    vi.advanceTimersByTime(2_500);
    expect(events).toContain('BOMB_PLACED');
    expect(events).toContain('BOMB_EXPLODED');
    vi.advanceTimersByTime(60_000);
    expect(events).toContain('SUDDEN_DEATH_STARTED');
    expect(events).toContain('ARENA_SHRUNK');
    expect(model.leaderboard.length).toBe(3);
    expect(model.lobby?.status).toBe('WAITING');
  });
});
