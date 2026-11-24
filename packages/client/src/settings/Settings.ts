/** Schéma de touches pour se déplacer (les flèches fonctionnent toujours). */
export type KeyScheme = 'zqsd' | 'wasd';

/** Préférences du joueur, conservées localement (cahier des charges : « Paramètre de chaque joueur »). */
export interface SettingsData {
  pseudo: string;
  /** Volume général, de 0 à 1. */
  masterVolume: number;
  /** Volume des effets sonores, de 0 à 1. */
  sfxVolume: number;
  keyScheme: KeyScheme;
  /** Adresse WebSocket du serveur de jeu. */
  serverUrl: string;
}

export const DEFAULT_SETTINGS: SettingsData = {
  pseudo: '',
  masterVolume: 0.7,
  sfxVolume: 0.8,
  keyScheme: 'zqsd',
  serverUrl: 'ws://localhost:8080',
};

/** Sous-ensemble de `localStorage` utilisé ici (injectable dans les tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'bomberman-arena.settings';

function clamp01(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

/** Valide des données brutes (JSON stocké) et renvoie des préférences complètes et cohérentes. */
export function sanitizeSettings(raw: unknown): SettingsData {
  const data = typeof raw === 'object' && raw !== null ? (raw as Partial<SettingsData>) : {};
  return {
    pseudo: typeof data.pseudo === 'string' ? data.pseudo.slice(0, 20) : DEFAULT_SETTINGS.pseudo,
    masterVolume: clamp01(data.masterVolume, DEFAULT_SETTINGS.masterVolume),
    sfxVolume: clamp01(data.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
    keyScheme: data.keyScheme === 'wasd' ? 'wasd' : 'zqsd',
    serverUrl:
      typeof data.serverUrl === 'string' && /^wss?:\/\/\S{1,200}$/.test(data.serverUrl.trim())
        ? data.serverUrl.trim()
        : DEFAULT_SETTINGS.serverUrl,
  };
}

/** Stockage observable des préférences. */
export class SettingsStore {
  private current: SettingsData;
  private readonly listeners = new Set<(data: SettingsData) => void>();

  constructor(private readonly storage: StorageLike | null = null) {
    this.current = this.load();
  }

  get data(): Readonly<SettingsData> {
    return this.current;
  }

  /** Fusionne un changement partiel, le sauvegarde et prévient les abonnés. */
  update(patch: Partial<SettingsData>): void {
    this.current = sanitizeSettings({ ...this.current, ...patch });
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.current));
    } catch {
      // Stockage indisponible ou plein : les préférences restent valables pour la session.
    }
    for (const listener of this.listeners) listener(this.current);
  }

  /** S'abonne aux changements ; renvoie la fonction de désabonnement. */
  onChange(listener: (data: SettingsData) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private load(): SettingsData {
    try {
      const text = this.storage?.getItem(STORAGE_KEY);
      return sanitizeSettings(text ? JSON.parse(text) : null);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
}
