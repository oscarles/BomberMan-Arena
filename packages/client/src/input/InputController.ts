import type { Direction } from '@bomberman/shared';
import type { KeyScheme } from '../settings/Settings';
import { resolveKey } from './KeyMap';

/** Fonctions de temporisation (injectables pour tester sans attendre). */
export interface Timers {
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

export interface InputHandlers {
  onMove(direction: Direction): void;
  onBomb(): void;
  onPause(): void;
}

interface KeyEventLike {
  key: string;
  repeat?: boolean;
  preventDefault(): void;
}

const BROWSER_TIMERS: Timers = {
  setInterval: (handler, ms) => window.setInterval(handler, ms),
  clearInterval: (id) => window.clearInterval(id as number),
};

/**
 * Capture clavier : transforme les touches en intentions (déplacement, bombe, pause).
 * Tant qu'une direction reste enfoncée, l'intention est renvoyée à intervalle régulier ; le
 * serveur décide seul si le déplacement est autorisé (délai entre deux pas, obstacles).
 */
export class InputController {
  private readonly held: Direction[] = [];
  private timer: unknown = null;
  private enabled = false;
  private readonly onKeyDown = (event: Event) =>
    this.handleKeyDown(event as unknown as KeyEventLike);
  private readonly onKeyUp = (event: Event) => this.handleKeyUp(event as unknown as KeyEventLike);
  private readonly onBlur = () => this.releaseAll();

  constructor(
    private readonly target: EventTarget,
    private readonly scheme: () => KeyScheme,
    private readonly handlers: InputHandlers,
    private readonly repeatMs = 30,
    private readonly timers: Timers = BROWSER_TIMERS,
  ) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  /** Active ou désactive la capture (désactivée hors partie ou pendant la pause). */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.releaseAll();
  }

  /** Retire les écouteurs. */
  dispose(): void {
    this.releaseAll();
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
  }

  private handleKeyDown(event: KeyEventLike): void {
    if (!this.enabled) return;
    const action = resolveKey(event.key, this.scheme());
    if (!action) return;
    event.preventDefault();
    if (action.kind === 'move') {
      if (!this.held.includes(action.direction)) {
        this.held.push(action.direction);
        this.handlers.onMove(action.direction);
        this.startRepeat();
      }
    } else if (!event.repeat) {
      if (action.kind === 'bomb') this.handlers.onBomb();
      else this.handlers.onPause();
    }
  }

  private handleKeyUp(event: KeyEventLike): void {
    const action = resolveKey(event.key, this.scheme());
    if (action?.kind !== 'move') return;
    const index = this.held.indexOf(action.direction);
    if (index >= 0) this.held.splice(index, 1);
    if (this.held.length === 0) this.stopRepeat();
  }

  private startRepeat(): void {
    if (this.timer !== null) return;
    this.timer = this.timers.setInterval(() => {
      const direction = this.held[this.held.length - 1];
      if (direction) this.handlers.onMove(direction);
    }, this.repeatMs);
  }

  private stopRepeat(): void {
    if (this.timer === null) return;
    this.timers.clearInterval(this.timer);
    this.timer = null;
  }

  private releaseAll(): void {
    this.held.length = 0;
    this.stopRepeat();
  }
}
