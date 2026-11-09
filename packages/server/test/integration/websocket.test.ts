import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ServerMessage } from '@bomberman/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { DEFAULT_DROP_TABLE } from '../../src/engine/drops.js';
import { GameServer } from '../../src/net/GameServer.js';

/** Attend le prochain message serveur satisfaisant `predicate` sur cette connexion. */
function waitFor(
  socket: WebSocket,
  predicate: (m: ServerMessage) => boolean,
  timeoutMs = 2000,
): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Délai dépassé en attente d'un message")),
      timeoutMs,
    );
    const onMessage = (raw: Buffer) => {
      const message = JSON.parse(raw.toString()) as ServerMessage;
      if (predicate(message)) {
        clearTimeout(timer);
        socket.off('message', onMessage);
        resolve(message);
      }
    };
    socket.on('message', onMessage);
  });
}

function send(socket: WebSocket, message: unknown): void {
  socket.send(JSON.stringify(message));
}

describe('Protocole WebSocket (intégration)', () => {
  let httpServer: Server;
  let gameServer: GameServer;
  let url: string;

  beforeEach(async () => {
    httpServer = createServer();
    gameServer = new GameServer(httpServer, () => DEFAULT_DROP_TABLE);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const { port } = httpServer.address() as AddressInfo;
    url = `ws://127.0.0.1:${port}`;
  });

  afterEach(() => {
    gameServer.close();
    httpServer.close();
  });

  it('une commande MOVE entraîne bien une réponse POSITION_UPDATED', async () => {
    const host = new WebSocket(url);
    const guest = new WebSocket(url);

    const [hostWelcome] = await Promise.all([
      waitFor(host, (m) => m.type === 'WELCOME'),
      waitFor(guest, (m) => m.type === 'WELCOME'),
    ]);
    const hostId = hostWelcome.type === 'WELCOME' ? hostWelcome.payload.playerId : '';

    send(host, { type: 'CREATE_LOBBY', payload: { name: 'Arène', visibility: 'PUBLIC' } });
    const created = await waitFor(host, (m) => m.type === 'LOBBY_UPDATED');
    const lobbyId = created.type === 'LOBBY_UPDATED' ? created.payload.lobby.id : '';

    send(guest, { type: 'JOIN_LOBBY', payload: { lobbyId } });
    await waitFor(host, (m) => m.type === 'LOBBY_UPDATED' && m.payload.lobby.players.length === 2);

    send(host, { type: 'START_GAME', payload: {} });
    const started = await waitFor(host, (m) => m.type === 'ROUND_STARTED');
    const me =
      started.type === 'ROUND_STARTED'
        ? started.payload.snapshot.players.find((p) => p.id === hostId)
        : undefined;
    expect(me).toBeDefined();

    const direction = me!.x === 1 ? 'RIGHT' : 'LEFT';
    send(host, { type: 'MOVE', payload: { direction } });
    const moved = await waitFor(
      host,
      (m) => m.type === 'POSITION_UPDATED' && m.payload.playerId === hostId,
    );

    expect(moved.type === 'POSITION_UPDATED' && moved.payload.x).toBe(
      direction === 'RIGHT' ? me!.x + 1 : me!.x - 1,
    );
    expect(moved.type === 'POSITION_UPDATED' && moved.payload.y).toBe(me!.y);

    host.close();
    guest.close();
  });

  it('refuse à un non-hôte de démarrer la partie (ERROR NOT_HOST)', async () => {
    const host = new WebSocket(url);
    const guest = new WebSocket(url);
    await Promise.all([
      waitFor(host, (m) => m.type === 'WELCOME'),
      waitFor(guest, (m) => m.type === 'WELCOME'),
    ]);

    send(host, { type: 'CREATE_LOBBY', payload: { name: 'Arène', visibility: 'PUBLIC' } });
    const created = await waitFor(host, (m) => m.type === 'LOBBY_UPDATED');
    const lobbyId = created.type === 'LOBBY_UPDATED' ? created.payload.lobby.id : '';

    send(guest, { type: 'JOIN_LOBBY', payload: { lobbyId } });
    await waitFor(guest, (m) => m.type === 'LOBBY_UPDATED');

    send(guest, { type: 'START_GAME', payload: {} });
    const error = await waitFor(guest, (m) => m.type === 'ERROR');
    expect(error.type === 'ERROR' && error.payload.code).toBe('NOT_HOST');

    host.close();
    guest.close();
  });
});
