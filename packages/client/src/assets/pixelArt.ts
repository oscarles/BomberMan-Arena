import type { ItemType, PlayerColor } from '@bomberman/shared';
import atlasUrl from './bomberman-sprites.png';

/** Couleur d'un sprite : les 8 couleurs du protocole, plus le Bomberman blanc d'origine. */
export type SpriteColor = PlayerColor | 'white';
export type Pose = 'idle' | 'walk' | 'cheer' | 'ko' | 'dead';
export type Facing = 'down' | 'up' | 'left' | 'right';

/** Taille d'une case de la planche de sprites (en pixels). */
export const CELL_W = 80;
export const CELL_H = 108;

/** Teintes (degrés HSV) appliquées à la combinaison, aux accents et au casque de chaque couleur. */
interface Palette {
  suit: number;
  accent: number;
  helmet: number;
}
const PALETTES: Record<PlayerColor, Palette> = {
  red: { suit: 0, accent: 215, helmet: 2 },
  blue: { suit: 217, accent: 0, helmet: 212 },
  green: { suit: 125, accent: 40, helmet: 122 },
  yellow: { suit: 50, accent: 215, helmet: 48 },
  purple: { suit: 275, accent: 50, helmet: 272 },
  orange: { suit: 28, accent: 215, helmet: 28 },
  cyan: { suit: 185, accent: 30, helmet: 185 },
  pink: { suit: 325, accent: 190, helmet: 322 },
};

/** Couleur CSS représentative de chaque couleur de joueur (pastilles, classement). */
export const COLOR_CSS: Record<SpriteColor, string> = {
  white: '#f4f4fc',
  red: '#f0402e',
  blue: '#3f7cf8',
  green: '#3cc23c',
  yellow: '#f8d020',
  purple: '#9a4de0',
  orange: '#ff8a1c',
  cyan: '#22c8d8',
  pink: '#f060b8',
};

export const COLOR_LABEL: Record<SpriteColor, string> = {
  white: 'Blanc',
  red: 'Rouge',
  blue: 'Bleu',
  green: 'Vert',
  yellow: 'Jaune',
  purple: 'Violet',
  orange: 'Orange',
  cyan: 'Cyan',
  pink: 'Rose',
};

const OUT = '#14101c';

// ---------------------------------------------------------------------------
// Planche de sprites Bomberman
// ---------------------------------------------------------------------------

let atlas: HTMLImageElement | null = null;
let atlasReady = false;
const readyListeners = new Set<() => void>();
const variants = new Map<SpriteColor, HTMLCanvasElement>();

/** Charge la planche de sprites ; les affichages se redessinent via `onAtlasReady`. */
export function loadAtlas(): void {
  if (atlas) return;
  atlas = new Image();
  atlas.onload = () => {
    atlasReady = true;
    readyListeners.forEach((listener) => listener());
  };
  atlas.src = atlasUrl;
}

export function isAtlasReady(): boolean {
  return atlasReady;
}

/** Appelle `listener` dès que la planche est chargée (immédiatement si elle l'est déjà). */
export function onAtlasReady(listener: () => void): void {
  if (atlasReady) listener();
  else readyListeners.add(listener);
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g] = [c, x];
  else if (h < 120) [r, g] = [x, c];
  else if (h < 180) [g, b] = [c, x];
  else if (h < 240) [g, b] = [x, c];
  else if (h < 300) [r, b] = [x, c];
  else [r, b] = [c, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Planche recolorée pour une couleur de joueur (`null` tant que l'image n'est pas chargée). */
export function variantCanvas(color: SpriteColor): HTMLCanvasElement | null {
  if (!atlas || !atlasReady) return null;
  const cached = variants.get(color);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = atlas.width;
  canvas.height = atlas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(atlas, 0, 0);
  if (color !== 'white') {
    const palette = PALETTES[color];
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const r = (d[i] ?? 0) / 255;
      const g = (d[i + 1] ?? 0) / 255;
      const b = (d[i + 2] ?? 0) / 255;
      const max = Math.max(r, g, b);
      const delta = max - Math.min(r, g, b);
      const sat = max ? delta / max : 0;
      let hue = 0;
      if (delta) {
        if (max === r) hue = ((g - b) / delta + 6) % 6;
        else if (max === g) hue = (b - r) / delta + 2;
        else hue = (r - g) / delta + 4;
        hue *= 60;
      }
      let target = -1;
      let newSat = sat;
      let newVal = max;
      if (max > 0.25 && sat < 0.2) {
        // Blancs et gris du casque : teintés à la couleur du joueur.
        target = palette.helmet;
        newSat = 0.36 + 0.34 * max;
        newVal = Math.min(1, max * 0.96 + 0.04);
      } else if (sat > 0.35 && max > 0.15) {
        if (hue >= 190 && hue <= 265) target = palette.suit;
        else if (hue >= 325 || hue <= 14) target = palette.accent;
      }
      if (target < 0) continue;
      const [nr, ng, nb] = hsvToRgb(target, newSat, newVal);
      d[i] = nr;
      d[i + 1] = ng;
      d[i + 2] = nb;
    }
    ctx.putImageData(image, 0, 0);
  }
  variants.set(color, canvas);
  return canvas;
}

/** Position `[ligne, colonne]` des images de chaque animation dans la planche. */
const FRAMES: Record<Facing | 'cheer' | 'ko' | 'dead', [number, number][]> = {
  down: [
    [0, 0],
    [0, 1],
    [0, 0],
    [0, 2],
  ],
  up: [
    [1, 0],
    [1, 1],
    [1, 0],
    [1, 2],
  ],
  left: [
    [2, 0],
    [2, 1],
    [2, 0],
    [2, 2],
  ],
  right: [
    [3, 0],
    [3, 1],
    [3, 0],
    [3, 2],
  ],
  cheer: [
    [4, 0],
    [4, 1],
    [4, 2],
    [4, 1],
  ],
  ko: [
    [4, 3],
    [4, 5],
    [4, 4],
    [4, 6],
  ],
  dead: [[4, 7]],
};

/** Case `[ligne, colonne]` de la planche pour une pose, une direction et un numéro d'image. */
export function frameFor(pose: Pose, facing: Facing, frame: number): [number, number] {
  const f = Math.max(0, Math.floor(frame));
  const list =
    pose === 'walk' ? FRAMES[facing] : pose === 'idle' ? [FRAMES[facing][0]] : FRAMES[pose];
  return (list[f % list.length] ?? [0, 0]) as [number, number];
}

/** Dessine un Bomberman posé sur la ligne `bottom`, centré en `cx`, à l'échelle `scale`. */
export function drawBomber(
  ctx: CanvasRenderingContext2D,
  color: SpriteColor,
  pose: Pose,
  facing: Facing,
  frame: number,
  cx: number,
  bottom: number,
  scale: number,
): void {
  const sheet = variantCanvas(color);
  if (!sheet) return;
  const [row, col] = frameFor(pose, facing, frame);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    sheet,
    col * CELL_W,
    row * CELL_H,
    CELL_W,
    CELL_H,
    cx - (CELL_W * scale) / 2,
    bottom - CELL_H * scale,
    CELL_W * scale,
    CELL_H * scale,
  );
}

// ---------------------------------------------------------------------------
// Décor, bombes, flammes, icônes (générés en code : aucun fichier image supplémentaire)
// ---------------------------------------------------------------------------

function newCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  return [canvas, ctx];
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

export type TileKind = 'hard' | 'brick' | 'grass';
const tiles = new Map<string, HTMLCanvasElement>();

/** Tuile 16x16 : bloc indestructible, brique destructible ou herbe (avec ombre des blocs voisins). */
export function tileCanvas(kind: TileKind, parity: number, shadeLeft = false, shadeUp = false) {
  const key = `${kind}${parity}${shadeLeft ? 'L' : ''}${shadeUp ? 'U' : ''}`;
  const cached = tiles.get(key);
  if (cached) return cached;
  const [canvas, x] = newCanvas(16, 16);
  if (kind === 'hard') {
    px(x, 0, 0, 16, 16, '#c4c4d4');
    px(x, 0, 0, 16, 2, '#f4f4fc');
    px(x, 0, 0, 2, 16, '#f4f4fc');
    px(x, 0, 14, 16, 2, '#6c6c88');
    px(x, 14, 0, 2, 16, '#6c6c88');
    px(x, 14, 0, 2, 2, '#c4c4d4');
    px(x, 0, 14, 2, 2, '#c4c4d4');
    px(x, 4, 4, 8, 8, '#8888a8');
    px(x, 5, 5, 6, 6, '#a8a8c4');
    px(x, 5, 5, 6, 1, '#d0d0e4');
    px(x, 5, 5, 1, 6, '#d0d0e4');
  } else {
    px(x, 0, 0, 16, 16, parity ? '#3cb034' : '#34a42c');
    for (const [dx, dy] of [
      [3, 4],
      [11, 3],
      [7, 9],
      [13, 12],
      [2, 13],
    ] as const) {
      px(x, dx, dy, 1, 1, parity ? '#4cc444' : '#44b83c');
    }
    if (shadeLeft) px(x, 0, 0, 4, 16, '#247c1c');
    if (shadeUp) px(x, 0, 0, 16, 4, '#247c1c');
    if (kind === 'brick') {
      px(x, 0, 0, 16, 16, '#d4602c');
      for (let i = 0; i < 4; i++) {
        px(x, 0, i * 4 + 3, 16, 1, '#70200c');
        px(x, 0, i * 4, 16, 1, '#f09050');
        const joints = i % 2 ? [7, 15] : [3, 11];
        for (const jx of joints) px(x, jx, i * 4, 1, 3, '#70200c');
      }
    }
  }
  tiles.set(key, canvas);
  return canvas;
}

const bombs: HTMLCanvasElement[] = [];
/** Bombe 16x16 ; `frame` fait varier l'étincelle de la mèche (0 à 2). */
export function bombCanvas(frame = 0): HTMLCanvasElement {
  const f = Math.abs(Math.floor(frame)) % 3;
  const cached = bombs[f];
  if (cached) return cached;
  const [canvas, x] = newCanvas(16, 16);
  for (let yy = 0; yy < 16; yy++) {
    for (let xx = 0; xx < 16; xx++) {
      const d = Math.hypot(xx - 7.5, yy - 9.5);
      if (d <= 6.4) px(x, xx, yy, 1, 1, OUT);
      if (d <= 5.2) px(x, xx, yy, 1, 1, xx + yy > 19 ? '#1c1c58' : '#34349c');
    }
  }
  px(x, 4, 6, 2, 1, '#fff');
  px(x, 4, 7, 1, 2, '#fff');
  px(x, 5, 7, 1, 1, '#b8c0ff');
  px(x, 6, 2, 4, 3, OUT);
  px(x, 7, 3, 2, 1, '#a0a0c0');
  px(x, 10, 1, 1, 1, '#a05a20');
  px(x, 11, 0, 1, 1, '#a05a20');
  px(x, 12, 0, 2, 2, ['#ffe44a', '#ff9500', '#ffffff'][f] ?? '#ffe44a');
  px(x, 13, 2, 1, 1, '#ff9500');
  px(x, 11, 1, 1, 1, '#ff9500');
  bombs[f] = canvas;
  return canvas;
}

const flames: HTMLCanvasElement[] = [];
/** Case de flammes 16x16 (deux images pour faire vaciller le feu). */
export function flameCanvas(frame = 0): HTMLCanvasElement {
  const f = Math.abs(Math.floor(frame)) % 2;
  const cached = flames[f];
  if (cached) return cached;
  const [canvas, x] = newCanvas(16, 16);
  px(x, 1, 0, 14, 16, '#f06a00');
  px(x, 0, 1, 16, 14, '#f06a00');
  px(x, 3, 2, 10, 12, '#f8c820');
  px(x, 2, 3, 12, 10, '#f8c820');
  px(x, 5, 5, 6, 6, '#fff8c0');
  if (f) {
    px(x, 0, 3, 2, 2, '#ffd23a');
    px(x, 14, 10, 2, 2, '#ffd23a');
    px(x, 6, 0, 3, 1, '#fff');
  } else {
    px(x, 14, 3, 2, 2, '#ffd23a');
    px(x, 0, 10, 2, 2, '#ffd23a');
    px(x, 6, 15, 3, 1, '#fff');
  }
  flames[f] = canvas;
  return canvas;
}

export type IconName =
  | 'heart'
  | 'clock'
  | 'trophy'
  | 'skull'
  | 'brick'
  | 'star'
  | 'lock'
  | 'flame'
  | 'skate'
  | 'gear'
  | 'door'
  | 'arrowl'
  | 'plus'
  | 'play'
  | 'cross'
  | 'bomb'
  | 'snail';

interface IconDef {
  m: string[];
  p: Record<string, string>;
}
const ICONS: Record<Exclude<IconName, 'bomb'>, IconDef> = {
  heart: {
    m: ['.rr.rr.', 'rwrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
    p: { r: '#ff3838', w: '#ffb0b0' },
  },
  clock: {
    m: ['..yyy..', '.ywwwy.', 'ywwkwwy', 'ywwkkwy', 'ywwwwwy', '.ywwwy.', '..yyy..'],
    p: { y: '#ffd23a', w: '#ffffff', k: OUT },
  },
  trophy: {
    m: [
      'yyyyyyyy',
      'y.yyyy.y',
      '.yyywyy.',
      '..yyyy..',
      '...yy...',
      '...yy...',
      '..yyyy..',
      '..yyyy..',
    ],
    p: { y: '#ffd23a', w: '#fff3a0' },
  },
  skull: {
    m: ['.wwwww.', 'wwwwwww', 'wkkwkkw', 'wkkwkkw', 'wwwkwww', '.wwwww.', '.wkwkw.'],
    p: { w: '#f4f4fc', k: OUT },
  },
  brick: {
    m: ['rrrmrrrr', 'rrrmrrrr', 'mmmmmmmm', 'rrrrrmrr', 'rrrrrmrr'],
    p: { r: '#e8683a', m: '#8c2c10' },
  },
  star: {
    m: ['...y...', '...y...', 'yyyyyyy', '.yyyyy.', '..yyy..', '.yy.yy.', '.y...y.'],
    p: { y: '#ffd23a' },
  },
  lock: {
    m: ['.gggg.', 'g....g', 'g....g', 'yyyyyy', 'yyyyyy', 'yykkyy', 'yykkyy', 'yyyyyy'],
    p: { g: '#d0d0e0', y: '#ffd23a', k: OUT },
  },
  flame: {
    m: [
      '...r...',
      '..rr...',
      '..rrr..',
      '.rryrr.',
      '.rryyr.',
      'rryyyrr',
      'rryyyrr',
      '.rryrr.',
      '..rrr..',
    ],
    p: { r: '#ff4a10', y: '#ffd23a' },
  },
  skate: {
    m: ['.ww.....', '.ww.....', '.ww.....', '.wwwww..', '.wwwwwww', 'bbbbbbbb', '.k..k.k.'],
    p: { w: '#f4f4fc', b: '#2c5cf0', k: '#ffd23a' },
  },
  gear: {
    m: ['..g.g..', '.ggggg.', 'gg...gg', '.g...g.', 'gg...gg', '.ggggg.', '..g.g..'],
    p: { g: '#e0e4f4' },
  },
  door: {
    m: ['.bbbb.', 'bwwwwb', 'bwwwwb', 'bwwwwb', 'bwwkwb', 'bwwwwb', 'bwwwwb', 'bbbbbb'],
    p: { b: '#7a4a00', w: '#d49a48', k: '#ffd23a' },
  },
  arrowl: {
    m: ['...w...', '..ww...', '.wwwwww', 'wwwwwww', '.wwwwww', '..ww...', '...w...'],
    p: { w: '#ffffff' },
  },
  plus: {
    m: ['...w...', '...w...', '...w...', 'wwwwwww', '...w...', '...w...', '...w...'],
    p: { w: '#ffffff' },
  },
  play: {
    m: ['ww....', 'wwww..', 'wwwwww', 'wwwwww', 'wwwwww', 'wwww..', 'ww....'],
    p: { w: '#ffffff' },
  },
  cross: {
    m: ['ww...ww', 'www.www', '.wwwww.', '..www..', '.wwwww.', 'www.www', 'ww...ww'],
    p: { w: '#ffffff' },
  },
  snail: {
    m: ['..gggg..', '.gbbbbg.', 'gbgggbbg', 'gbgbgbbg', 'gbbbbbgg', '.gggggg.', 'yyyyyyyy'],
    p: { g: '#a8a8c8', b: '#6ac0ff', y: '#7ad060' },
  },
};

interface IconInfo {
  url: string;
  w: number;
  h: number;
  canvas: HTMLCanvasElement;
}
const icons = new Map<IconName, IconInfo>();

/** Icône pixel (image `data:`) avec contour sombre automatique. */
export function iconInfo(name: IconName): IconInfo {
  const cached = icons.get(name);
  if (cached) return cached;
  let info: IconInfo;
  if (name === 'bomb') {
    const bomb = bombCanvas(0);
    info = { url: bomb.toDataURL(), w: 16, h: 16, canvas: bomb };
  } else {
    const def = ICONS[name];
    const w = (def.m[0]?.length ?? 0) + 2;
    const h = def.m.length + 2;
    const [canvas, ctx] = newCanvas(w, h);
    def.m.forEach((row, i) => {
      [...row].forEach((ch, j) => {
        if (ch === '.') return;
        for (const [dx, dy] of [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ] as const)
          px(ctx, j + 1 + dx, i + 1 + dy, 1, 1, OUT);
      });
    });
    def.m.forEach((row, i) => {
      [...row].forEach((ch, j) => {
        if (ch !== '.') px(ctx, j + 1, i + 1, 1, 1, def.p[ch] ?? '#fff');
      });
    });
    info = { url: canvas.toDataURL(), w, h, canvas };
  }
  icons.set(name, info);
  return info;
}

/** Icône associée à chaque objet ramassable. */
export const ITEM_ICON: Record<ItemType, IconName> = {
  RANGE_UP: 'flame',
  BOMB_UP: 'bomb',
  SPEED_UP: 'skate',
  SURPRISE_BOMB: 'skull',
  SLOW: 'snail',
};

export const ITEM_LABEL: Record<ItemType, string> = {
  RANGE_UP: 'Rayon étendu',
  BOMB_UP: 'Bombe en plus',
  SPEED_UP: 'Vitesse',
  SURPRISE_BOMB: 'Bombe surprise',
  SLOW: 'Ralentissement',
};

// ---------------------------------------------------------------------------
// Cadres 9-slice (panneaux et plaques en pixel art)
// ---------------------------------------------------------------------------

interface FramePalette {
  lit: string[];
  dark: string[];
}

function frameUrl(palette: FramePalette): string {
  const size = 12;
  const [canvas, ctx] = newCanvas(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dl = x;
      const dr = size - 1 - x;
      const dt = y;
      const db = size - 1 - y;
      const corner = Math.min(dl + dt, dr + dt, dl + db, dr + db);
      if (corner < 2) continue;
      const layer = corner === 2 ? 0 : Math.min(dl, dr, dt, db);
      if (layer > 3) continue;
      const lit = Math.min(dl, dt) <= Math.min(dr, db);
      px(ctx, x, y, 1, 1, (lit ? palette.lit : palette.dark)[layer] ?? OUT);
    }
  }
  return `url("${canvas.toDataURL()}")`;
}

/** Génère les images CSS (cadres, bombe, herbe, brique) utilisées par la feuille de style. */
export function installCssAssets(root: HTMLElement): void {
  const set = (name: string, value: string) => root.style.setProperty(name, value);
  set(
    '--frame-blue',
    frameUrl({
      lit: ['#0a1450', '#f2f7ff', '#8ab4ff', '#3a68e0'],
      dark: ['#0a1450', '#a8c4f8', '#4a78e8', '#1e46b4'],
    }),
  );
  set(
    '--frame-stone',
    frameUrl({
      lit: ['#14101c', '#f4f4fc', '#d4d4e4', '#b8b8cc'],
      dark: ['#14101c', '#7e7e9c', '#6c6c88', '#8a8aa8'],
    }),
  );
  set('--bomb', `url("${bombCanvas(0).toDataURL()}")`);
  set('--grass-img', `url("${tileCanvas('grass', 0).toDataURL()}")`);
  const [brick, x] = newCanvas(64, 32);
  px(x, 0, 0, 64, 32, '#8f3414');
  const lay = (bx: number, by: number, bw: number, bh: number) => {
    const g = x.createLinearGradient(0, by, 0, by + bh);
    g.addColorStop(0, '#f58a55');
    g.addColorStop(1, '#d9552a');
    x.fillStyle = g;
    x.fillRect(bx, by, bw, bh);
    px(x, bx, by, bw, 2, 'rgba(255,255,255,.35)');
    px(x, bx, by + bh - 2, bw, 2, 'rgba(90,25,0,.25)');
  };
  lay(1, 1, 30, 14);
  lay(33, 1, 30, 14);
  lay(-15, 17, 30, 14);
  lay(17, 17, 30, 14);
  lay(49, 17, 30, 14);
  set('--brick-img', `url(${brick.toDataURL()})`);
}
