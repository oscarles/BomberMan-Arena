/** Fonction appelée à la réception d'un événement. */
export type Listener<T> = (payload: T) => void;

/**
 * Bus d'événements typé : les vues s'abonnent aux changements du modèle sans que celui-ci
 * connaisse la moindre vue (pattern « bus d'événements » demandé par le cahier des charges).
 *
 * @typeParam E table `nom d'événement -> type de la charge utile`
 */
export class EventBus<E extends object> {
  private readonly listeners = new Map<keyof E, Set<Listener<never>>>();

  /**
   * S'abonne à un événement.
   * @returns fonction de désabonnement
   */
  on<K extends keyof E>(type: K, listener: Listener<E[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as Listener<never>);
    return () => this.off(type, listener);
  }

  /** Se désabonne d'un événement (sans effet si l'écouteur est inconnu). */
  off<K extends keyof E>(type: K, listener: Listener<E[K]>): void {
    this.listeners.get(type)?.delete(listener as Listener<never>);
  }

  /** Notifie tous les écouteurs de l'événement, dans l'ordre d'abonnement. */
  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const listener of [...set]) (listener as Listener<E[K]>)(payload);
  }

  /** Supprime tous les écouteurs (utile aux tests et au changement d'écran). */
  clear(): void {
    this.listeners.clear();
  }
}
