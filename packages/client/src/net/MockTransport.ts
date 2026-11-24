import type { ClientMessage, ServerMessage } from '@bomberman/shared';
import { MockServer, realClock, type MockClock } from './mock/MockServer';
import type { ConnectionStatus, Transport } from './Transport';

/**
 * Transport hors ligne : relie le client à un `MockServer` en mémoire. Le reste de l'application
 * l'utilise exactement comme le transport WebSocket (mode `?mock=1`, interface testable sans réseau).
 */
export class MockTransport implements Transport {
  private messageHandler: (message: ServerMessage) => void = () => undefined;
  private statusHandler: (status: ConnectionStatus) => void = () => undefined;
  private server: MockServer | null = null;

  constructor(
    private readonly clock: MockClock = realClock,
    private readonly random: () => number = Math.random,
  ) {}

  onMessage(handler: (message: ServerMessage) => void): void {
    this.messageHandler = handler;
  }

  onStatus(handler: (status: ConnectionStatus) => void): void {
    this.statusHandler = handler;
  }

  connect(): void {
    this.server?.dispose();
    this.statusHandler('connecting');
    const server = new MockServer(
      (message) => this.messageHandler(message),
      this.clock,
      this.random,
    );
    this.server = server;
    this.clock.setTimeout(() => {
      this.statusHandler('open');
      server.hello();
    }, 150);
  }

  send(message: ClientMessage): void {
    this.server?.handle(message);
  }

  close(): void {
    this.server?.dispose();
    this.server = null;
    this.statusHandler('closed');
  }
}
