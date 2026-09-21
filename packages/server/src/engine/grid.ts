import type { Cell, CellType, Direction } from '@bomberman/shared';
import type { Rng } from './rng.js';

/** Vecteur de déplacement associé à chaque direction. */
export const DIRECTION_VECTORS: Record<Direction, Cell> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

/** Clé unique d'une case, utilisable dans une `Map` ou un `Set`. */
export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Points d'apparition : les quatre coins de l'arène (première case intérieure).
 */
export function spawnPoints(width: number, height: number): Cell[] {
  return [
    { x: 1, y: 1 },
    { x: width - 2, y: 1 },
    { x: 1, y: height - 2 },
    { x: width - 2, y: height - 2 },
  ];
}

/** Cases qui doivent rester libres autour d'un point d'apparition (distance de Manhattan <= 2). */
export function isInSpawnSafeZone(x: number, y: number, spawns: readonly Cell[]): boolean {
  return spawns.some((s) => Math.abs(s.x - x) + Math.abs(s.y - y) <= 2);
}

/**
 * Ordre de fermeture de la zone pendant la mort subite : spirale de l'extérieur vers le centre.
 */
export function spiralOrder(width: number, height: number): Cell[] {
  const order: Cell[] = [];
  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;
  while (top <= bottom && left <= right) {
    for (let x = left; x <= right; x++) order.push({ x, y: top });
    for (let y = top + 1; y <= bottom; y++) order.push({ x: right, y });
    if (top < bottom) for (let x = right - 1; x >= left; x--) order.push({ x, y: bottom });
    if (left < right) for (let y = bottom - 1; y > top; y--) order.push({ x: left, y });
    top++;
    bottom--;
    left++;
    right--;
  }
  return order;
}

/** Grille de l'arène : murs indestructibles, cubes destructibles et cases libres. */
export class Grid {
  private constructor(
    readonly width: number,
    readonly height: number,
    private readonly cells: CellType[][],
  ) {}

  /**
   * Génère une arène : bordure et piliers indestructibles à positions prédéfinies, puis cubes
   * destructibles aléatoires en épargnant les zones d'apparition.
   * @param density Probabilité qu'une case éligible reçoive un cube destructible.
   */
  static generate(rng: Rng, width: number, height: number, density: number): Grid {
    const spawns = spawnPoints(width, height);
    const cells: CellType[][] = [];
    for (let y = 0; y < height; y++) {
      const row: CellType[] = [];
      for (let x = 0; x < width; x++) {
        const isBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
        const isPillar = x % 2 === 0 && y % 2 === 0;
        if (isBorder || isPillar) {
          row.push('WALL');
        } else if (isInSpawnSafeZone(x, y, spawns)) {
          row.push('EMPTY');
        } else {
          row.push(rng.next() < density ? 'BLOCK' : 'EMPTY');
        }
      }
      cells.push(row);
    }
    return new Grid(width, height, cells);
  }

  /** Construit une grille à partir d'une description (utile aux tests). */
  static fromCells(cells: CellType[][]): Grid {
    const copy = cells.map((row) => [...row]);
    return new Grid(copy[0]?.length ?? 0, copy.length, copy);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Type de la case, ou `undefined` hors de la grille. */
  get(x: number, y: number): CellType | undefined {
    return this.inBounds(x, y) ? this.cells[y]?.[x] : undefined;
  }

  set(x: number, y: number, type: CellType): void {
    if (this.inBounds(x, y)) (this.cells[y] as CellType[])[x] = type;
  }

  /** Copie de la grille indexée `[y][x]`. */
  toArray(): CellType[][] {
    return this.cells.map((row) => [...row]);
  }
}
