import type { ClientMessage, ServerMessage } from '@bomberman/shared';
import type { ConnectionStatus, Transport } from './Transport';

/** Sous-ensemble de l'API `WebSocket` utilisé ici (permet de l'injecter dans les tests). */
export interface SocketLike {
  readyState: number;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  send(data: string): void;
  close(): void;
}

export type SocketFactory = (url: string) => SocketLike;

const OPEN = 1;

/** Transport réel : une connexion WebSocket échangeant des enveloppes JSON `{ type, payload }`. */
export class WebSocketTransport implements Transport {
  private socket: SocketLike | null = null;
  private messageHandler: (message: ServerMessage) => void = () => undefined;
  private statusHandler: (status: ConnectionStatus) => void = () => undefined;

  constructor(
    private readonly url: string,
    private readonly createSocket: SocketFactory = (u) => new WebSocket(u) as unknown as SocketLike,
  ) {}

  onMessage(handler: (message: ServerMessage) => void): void {
    this.messageHandler = handler;
  }

  onStatus(handler: (status: ConnectionStatus) => void): void {
    this.statusHandler = handler;
  }

  connect(): void {
    this.close();
    this.statusHandler('connecting');
    const socket = this.createSocket(this.url);
    this.socket = socket;
    socket.onopen = () => this.statusHandler('open');
    socket.onclose = () => this.statusHandler('closed');
    socket.onerror = () => this.statusHandler('closed');
    socket.onmessage = (event) => {
      const message = parseServerMessage(event.data);
      if (message) this.messageHandler(message);
    };
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === OPEN) this.socket.send(JSON.stringify(message));
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
    socket.close();
  }
}

/** Décode une trame reçue ; renvoie `null` si ce n'est pas une enveloppe `{ type, payload }`. */
export function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { type, payload } = parsed as { type?: unknown; payload?: unknown };
    if (typeof type !== 'string' || typeof payload !== 'object' || payload === null) return null;
    return parsed as ServerMessage;
  } catch {
    return null;
  }
}
