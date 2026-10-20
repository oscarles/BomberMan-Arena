import type { ServerMessage } from '@bomberman/shared';
import type { WebSocket } from 'ws';

/**
 * Associe chaque identifiant de joueur à sa connexion WebSocket et centralise l'envoi des
 * messages serveur -> client (JSON). Seule couche du serveur qui connaît `ws`.
 */
export class ConnectionRegistry {
  private readonly sockets = new Map<string, WebSocket>();

  register(playerId: string, socket: WebSocket): void {
    this.sockets.set(playerId, socket);
  }

  unregister(playerId: string): void {
    this.sockets.delete(playerId);
  }

  send(playerId: string, message: ServerMessage): void {
    const socket = this.sockets.get(playerId);
    if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  }

  broadcast(playerIds: readonly string[], message: ServerMessage): void {
    for (const id of playerIds) this.send(id, message);
  }
}
