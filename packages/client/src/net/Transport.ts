import type { ClientMessage, ServerMessage } from '@bomberman/shared';

/** État de la liaison avec le serveur. */
export type ConnectionStatus = 'connecting' | 'open' | 'closed';

/**
 * Abstraction du canal de communication : le reste du client ne sait pas s'il parle à un vrai
 * serveur WebSocket ou au serveur simulé (`MockTransport`, mode hors ligne).
 */
export interface Transport {
  /** Ouvre la liaison. */
  connect(): void;
  /** Envoie un message au serveur (ignoré si la liaison n'est pas ouverte). */
  send(message: ClientMessage): void;
  /** Ferme la liaison. */
  close(): void;
  /** Enregistre le gestionnaire des messages reçus du serveur. */
  onMessage(handler: (message: ServerMessage) => void): void;
  /** Enregistre le gestionnaire des changements d'état de la liaison. */
  onStatus(handler: (status: ConnectionStatus) => void): void;
}
