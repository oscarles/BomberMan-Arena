import type { Direction } from '@bomberman/shared';
import type { KeyScheme } from '../settings/Settings';

/** Intention du joueur déduite d'une touche. Le client n'envoie que des intentions au serveur. */
export type InputAction =
  { kind: 'move'; direction: Direction } | { kind: 'bomb' } | { kind: 'pause' };

const ARROWS: Record<string, Direction> = {
  arrowup: 'UP',
  arrowdown: 'DOWN',
  arrowleft: 'LEFT',
  arrowright: 'RIGHT',
};

const LETTERS: Record<KeyScheme, Record<string, Direction>> = {
  zqsd: { z: 'UP', s: 'DOWN', q: 'LEFT', d: 'RIGHT' },
  wasd: { w: 'UP', s: 'DOWN', a: 'LEFT', d: 'RIGHT' },
};

/**
 * Traduit la valeur `KeyboardEvent.key` en action de jeu.
 * Les flèches, la barre d'espace (bombe) et Échap (pause) valent pour tous les schémas.
 */
export function resolveKey(key: string, scheme: KeyScheme): InputAction | null {
  const k = key.toLowerCase();
  const direction = ARROWS[k] ?? LETTERS[scheme][k];
  if (direction) return { kind: 'move', direction };
  if (k === ' ' || k === 'spacebar') return { kind: 'bomb' };
  if (k === 'escape') return { kind: 'pause' };
  return null;
}
