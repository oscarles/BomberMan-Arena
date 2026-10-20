import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import type { ClientMessage, ErrorCode } from '@bomberman/shared';
import { WebSocket, WebSocketServer } from 'ws';
import type { DropTable } from '../engine/drops.js';
import { GAME_CONFIG } from '../engine/gameConfig.js';
import { GameError } from '../errors.js';
import { GameSession } from '../game/GameSession.js';
import type { Lobby } from '../lobby/Lobby.js';
import { LobbyManager } from '../lobby/LobbyManager.js';
import { ConnectionRegistry } from './ConnectionRegistry.js';
import { parseClientMessage } from './validate.js';

interface ConnectionState {
  id: string;
  name: string;
}

/**
 * Serveur WebSocket : accepte les connexions, valide les trames entrantes et route chaque
 * message vers le `LobbyManager` (hors partie) ou la `GameSession` du salon (en partie).
 * C'est la seule classe qui dépend à la fois du réseau et de la logique de jeu.
 */
export class GameServer {
  private readonly wss: WebSocketServer;
  private readonly registry = new ConnectionRegistry();
  private readonly lobbies = new LobbyManager();
  private readonly sessions = new Map<string, GameSession>();
  private readonly connections = new Map<WebSocket, ConnectionState>();
  private readonly loop: ReturnType<typeof setInterval>;

  constructor(
    httpServer: HttpServer,
    private readonly dropTableProvider: () => DropTable,
  ) {
    this.wss = new WebSocketServer({ server: httpServer });
    this.wss.on('connection', (socket) => this.onConnection(socket));
    this.loop = setInterval(() => this.tick(), GAME_CONFIG.tickIntervalMs);
  }

  close(): void {
    clearInterval(this.loop);
    this.wss.close();
    for (const socket of this.connections.keys()) socket.terminate();
  }

  private onConnection(socket: WebSocket): void {
    const id = randomUUID();
    const name = `Joueur-${id.slice(0, 4)}`;
    this.connections.set(socket, { id, name });
    this.registry.register(id, socket);
    this.registry.send(id, { type: 'WELCOME', payload: { playerId: id, name } });

    socket.on('message', (raw: Buffer) => this.onMessage(socket, raw.toString()));
    socket.on('close', () => this.onClose(socket));
  }

  private onMessage(socket: WebSocket, raw: string): void {
    const state = this.connections.get(socket);
    if (!state) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.sendError(state.id, 'INVALID_MESSAGE', 'JSON invalide');
      return;
    }

    const message = parseClientMessage(parsed);
    if (!message) {
      this.sendError(state.id, 'INVALID_MESSAGE', 'Message invalide');
      return;
    }

    try {
      this.handle(state, message);
    } catch (err) {
      if (err instanceof GameError) this.sendError(state.id, err.code, err.message);
      else throw err;
    }
  }

  private handle(state: ConnectionState, message: ClientMessage): void {
    switch (message.type) {
      case 'SET_NAME': {
        state.name = message.payload.name;
        const lobby = this.lobbies.getLobbyOf(state.id);
        const player = lobby?.findPlayer(state.id);
        if (lobby && player) {
          player.name = state.name;
          this.broadcastLobby(lobby);
        }
        break;
      }

      case 'LIST_LOBBIES':
        this.registry.send(state.id, {
          type: 'LOBBY_LIST',
          payload: { lobbies: this.lobbies.listPublicLobbies() },
        });
        break;

      case 'CREATE_LOBBY': {
        const lobby = this.lobbies.createLobby(
          state.id,
          state.name,
          message.payload.name,
          message.payload.visibility,
          message.payload.settings,
        );
        this.broadcastLobby(lobby);
        break;
      }

      case 'JOIN_LOBBY': {
        const lobby = this.lobbies.joinLobby(state.id, state.name, message.payload);
        this.broadcastLobby(lobby);
        break;
      }

      case 'LEAVE_LOBBY': {
        const remaining = this.leaveCurrentLobby(state.id);
        this.registry.send(state.id, { type: 'LOBBY_LEFT', payload: {} });
        if (remaining) this.broadcastLobby(remaining);
        break;
      }

      case 'UPDATE_SETTINGS':
        this.broadcastLobby(this.lobbies.updateSettings(state.id, message.payload.settings));
        break;

      case 'SET_COLOR':
        this.broadcastLobby(this.lobbies.setColor(state.id, message.payload.color));
        break;

      case 'START_GAME': {
        const lobby = this.lobbies.startGame(state.id);
        this.broadcastLobby(lobby);
        this.startSession(lobby);
        break;
      }

      case 'MOVE':
        this.requireSession(state.id).move(state.id, message.payload.direction, Date.now());
        break;

      case 'PLACE_BOMB':
        this.requireSession(state.id).placeBomb(state.id, Date.now());
        break;
    }
  }

  private requireSession(playerId: string): GameSession {
    const lobby = this.lobbies.getLobbyOf(playerId);
    const session = lobby ? this.sessions.get(lobby.id) : undefined;
    if (!session) throw new GameError('NOT_IN_GAME', 'Aucune partie en cours');
    return session;
  }

  private startSession(lobby: Lobby): void {
    const participants = lobby.players.map((p) => ({ id: p.id, name: p.name, color: p.color }));
    const playerIds = participants.map((p) => p.id);
    const session = new GameSession(
      {
        participants,
        settings: lobby.settings,
        dropTable: this.dropTableProvider(),
        emit: (event) => this.registry.broadcast(playerIds, event),
        onEnded: () => {
          this.sessions.delete(lobby.id);
          const reverted = this.lobbies.endGame(lobby.id);
          if (reverted) this.broadcastLobby(reverted);
        },
      },
      Date.now(),
    );
    this.sessions.set(lobby.id, session);
  }

  private onClose(socket: WebSocket): void {
    const state = this.connections.get(socket);
    if (!state) return;
    this.connections.delete(socket);
    this.registry.unregister(state.id);
    const remaining = this.leaveCurrentLobby(state.id);
    if (remaining) this.broadcastLobby(remaining);
  }

  /** Retire un joueur de son salon et de la partie en cours, le cas échéant. */
  private leaveCurrentLobby(playerId: string): Lobby | null {
    const lobby = this.lobbies.getLobbyOf(playerId);
    if (!lobby) return null;
    this.sessions.get(lobby.id)?.removePlayer(playerId, Date.now());
    return this.lobbies.leaveLobby(playerId);
  }

  private broadcastLobby(lobby: Lobby): void {
    const ids = lobby.players.map((p) => p.id);
    this.registry.broadcast(ids, { type: 'LOBBY_UPDATED', payload: { lobby: lobby.toInfo() } });
  }

  private sendError(playerId: string, code: ErrorCode, message: string): void {
    this.registry.send(playerId, { type: 'ERROR', payload: { code, message } });
  }

  private tick(): void {
    const now = Date.now();
    for (const session of this.sessions.values()) session.update(now);
  }
}
