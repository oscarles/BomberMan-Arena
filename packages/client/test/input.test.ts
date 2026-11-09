import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputController, type Timers } from '../src/input/InputController';
import { resolveKey } from '../src/input/KeyMap';
import { DEFAULT_SETTINGS, SettingsStore, sanitizeSettings } from '../src/settings/Settings';

describe('resolveKey', () => {
  it('reconnaît les flèches quel que soit le schéma', () => {
    expect(resolveKey('ArrowUp', 'zqsd')).toEqual({ kind: 'move', direction: 'UP' });
    expect(resolveKey('ArrowLeft', 'wasd')).toEqual({ kind: 'move', direction: 'LEFT' });
  });

  it('distingue ZQSD et WASD', () => {
    expect(resolveKey('z', 'zqsd')).toEqual({ kind: 'move', direction: 'UP' });
    expect(resolveKey('w', 'zqsd')).toBeNull();
    expect(resolveKey('W', 'wasd')).toEqual({ kind: 'move', direction: 'UP' });
    expect(resolveKey('a', 'wasd')).toEqual({ kind: 'move', direction: 'LEFT' });
  });

  it('associe espace à la bombe et Échap à la pause', () => {
    expect(resolveKey(' ', 'zqsd')).toEqual({ kind: 'bomb' });
    expect(resolveKey('Escape', 'zqsd')).toEqual({ kind: 'pause' });
    expect(resolveKey('x', 'zqsd')).toBeNull();
  });
});

describe('InputController', () => {
  let target: EventTarget;
  let intervals: (() => void)[];
  const timers: Timers = {
    setInterval: (handler) => intervals.push(handler),
    clearInterval: () => {
      intervals = [];
    },
  };
  const handlers = { onMove: vi.fn(), onBomb: vi.fn(), onPause: vi.fn() };

  function key(type: 'keydown' | 'keyup', k: string, repeat = false) {
    const event = Object.assign(new Event(type), { key: k, repeat });
    target.dispatchEvent(event);
  }

  beforeEach(() => {
    target = new EventTarget();
    intervals = [];
    vi.clearAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it("ne réagit pas tant qu'il est désactivé", () => {
    const input = new InputController(target, () => 'zqsd', handlers, 80, timers);
    key('keydown', 'ArrowUp');
    expect(handlers.onMove).not.toHaveBeenCalled();
    input.dispose();
  });

  it('envoie le déplacement puis le répète tant que la touche est maintenue', () => {
    const input = new InputController(target, () => 'zqsd', handlers, 80, timers);
    input.setEnabled(true);
    key('keydown', 'ArrowRight');
    expect(handlers.onMove).toHaveBeenCalledWith('RIGHT');
    intervals.forEach((tick) => tick());
    expect(handlers.onMove).toHaveBeenCalledTimes(2);
    key('keyup', 'ArrowRight');
    expect(intervals).toHaveLength(0);
    input.dispose();
  });

  it('repart de la dernière direction restée enfoncée', () => {
    const input = new InputController(target, () => 'zqsd', handlers, 80, timers);
    input.setEnabled(true);
    key('keydown', 'ArrowUp');
    key('keydown', 'ArrowLeft');
    key('keyup', 'ArrowLeft');
    handlers.onMove.mockClear();
    intervals.forEach((tick) => tick());
    expect(handlers.onMove).toHaveBeenCalledWith('UP');
    input.dispose();
  });

  it('pose une bombe une seule fois par appui', () => {
    const input = new InputController(target, () => 'zqsd', handlers, 80, timers);
    input.setEnabled(true);
    key('keydown', ' ');
    key('keydown', ' ', true);
    expect(handlers.onBomb).toHaveBeenCalledTimes(1);
    key('keydown', 'Escape');
    expect(handlers.onPause).toHaveBeenCalledTimes(1);
    input.dispose();
  });

  it('relâche tout quand la fenêtre perd le focus', () => {
    const input = new InputController(target, () => 'zqsd', handlers, 80, timers);
    input.setEnabled(true);
    key('keydown', 'ArrowDown');
    target.dispatchEvent(new Event('blur'));
    expect(intervals).toHaveLength(0);
    input.dispose();
  });
});

describe('SettingsStore', () => {
  it('renvoie les valeurs par défaut sans stockage', () => {
    expect(new SettingsStore(null).data).toEqual(DEFAULT_SETTINGS);
  });

  it('borne les volumes et persiste les changements', () => {
    const saved = new Map<string, string>();
    const storage = {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: (k: string, v: string) => void saved.set(k, v),
    };
    const store = new SettingsStore(storage);
    const listener = vi.fn();
    store.onChange(listener);
    store.update({ masterVolume: 5, keyScheme: 'wasd', pseudo: 'Tom' });
    expect(store.data).toMatchObject({ masterVolume: 1, keyScheme: 'wasd', pseudo: 'Tom' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(new SettingsStore(storage).data.pseudo).toBe('Tom');
  });

  it('ignore un stockage corrompu', () => {
    const storage = { getItem: () => '{pas du json', setItem: () => undefined };
    expect(new SettingsStore(storage).data).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ sfxVolume: 'fort', keyScheme: 'azerty' })).toEqual(DEFAULT_SETTINGS);
  });
});
