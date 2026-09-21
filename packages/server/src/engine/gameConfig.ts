/** Constantes d'équilibrage du gameplay (durées en millisecondes). */
export const GAME_CONFIG = {
  /** Délai entre la pose d'une bombe et son explosion. */
  bombFuseMs: 2000,
  /** Durée pendant laquelle les flammes restent dangereuses. */
  flameDurationMs: 500,
  /** Délai minimal entre deux déplacements à vitesse normale. */
  baseMoveIntervalMs: 200,
  /** Gain de vitesse par niveau de bonus (0.25 = +25 %). */
  speedBonusPerLevel: 0.25,
  /** Multiplicateur du délai de déplacement sous l'effet du malus de ralentissement. */
  slowMultiplier: 2.5,
  /** Durée du malus de ralentissement. */
  slowDurationMs: 5000,
  /** Invulnérabilité au début de la manche et après une réapparition. */
  invulnerabilityMs: 3000,
  /** Caractéristiques initiales d'un joueur. */
  startBombs: 1,
  startRange: 2,
  /** Plafonds des bonus cumulables. */
  maxBombs: 6,
  maxRange: 8,
  maxSpeedLevel: 5,
  /** Proportion de cases libres remplies par des cubes destructibles. */
  blockDensity: 0.7,
  /** Intervalle entre deux cases fermées pendant la mort subite. */
  shrinkIntervalMs: 250,
  /** Pause entre la fin d'une manche et la suivante (ou la fin de partie). */
  intermissionMs: 3000,
} as const;
