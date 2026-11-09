import type { ErrorCode } from '@bomberman/shared';

/** Erreur métier (lobby ou partie) traduite en message `ERROR` envoyé au client fautif. */
export class GameError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}
