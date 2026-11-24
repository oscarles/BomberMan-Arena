import {
  CELL_H,
  CELL_W,
  frameFor,
  onAtlasReady,
  variantCanvas,
  type Facing,
  type SpriteColor,
} from '../../assets/pixelArt';

/** Animation d'un sprite affiché dans le DOM. `head` n'affiche que la tête (listes, pastilles). */
export type SpriteAnim = 'idle' | 'walk' | 'cheer' | 'ko' | 'head';

const HEAD_W = 62;
const HEAD_H = 56;

/**
 * HTML d'un sprite animé ; `paintSprites` le dessine puis le ticker l'anime.
 * `scale` : taille relative (1 = environ 18 px de large).
 */
export function spriteHtml(
  color: SpriteColor,
  anim: SpriteAnim,
  scale: number,
  crown = false,
  facing?: Facing,
): string {
  const head = anim === 'head';
  const width = head ? 16 * scale : 18.55 * scale;
  const height = head ? (16 * scale * HEAD_H) / HEAD_W : 25 * scale;
  const attrs = [
    `data-c="${color}"`,
    `data-a="${anim}"`,
    facing ? `data-d="${facing}"` : '',
    crown ? 'data-crown="1"' : '',
  ].join(' ');
  return `<canvas class="px" width="${head ? HEAD_W : CELL_W}" height="${head ? HEAD_H : CELL_H}" ${attrs} style="width:${width.toFixed(1)}px;height:${height.toFixed(1)}px" aria-hidden="true"></canvas>`;
}

const CROWN = ['y...y...y', 'yy.yyy.yy', 'yyyyyyyyy', 'yyyyryyyy', 'yyyyyyyyy'];

function drawCrown(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const rows = CROWN.flatMap((row, ri) => [...row].map((ch, ci) => ({ ch, ri, ci })));
  ctx.fillStyle = '#14101c';
  for (const { ch, ri, ci } of rows)
    if (ch !== '.') ctx.fillRect(x + ci * s - 1, y + ri * s - 1, s + 2, s + 2);
  for (const { ch, ri, ci } of rows) {
    if (ch === '.') continue;
    ctx.fillStyle = ch === 'r' ? '#e82020' : '#ffd23a';
    ctx.fillRect(x + ci * s, y + ri * s, s, s);
  }
}

let tick = 0;

function drawOne(canvas: HTMLCanvasElement, frame: number): void {
  const anim = (canvas.dataset.a ?? 'idle') as SpriteAnim;
  const sheet = variantCanvas((canvas.dataset.c ?? 'white') as SpriteColor);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!sheet) return;
  ctx.imageSmoothingEnabled = false;
  const facing = (canvas.dataset.d ?? 'down') as Facing;
  const pose =
    anim === 'walk' ? 'walk' : anim === 'cheer' ? 'cheer' : anim === 'ko' ? 'dead' : 'idle';
  const index = pose === 'cheer' ? frame >> 1 : pose === 'walk' ? frame : 0;
  const [row, col] = frameFor(pose, facing, index);
  if (anim === 'head') {
    ctx.drawImage(sheet, col * CELL_W + 9, row * CELL_H + 2, HEAD_W, HEAD_H, 0, 0, HEAD_W, HEAD_H);
  } else {
    ctx.drawImage(
      sheet,
      col * CELL_W,
      row * CELL_H,
      CELL_W,
      CELL_H,
      0,
      anim === 'idle' ? (frame >> 2) & 1 : 0,
      CELL_W,
      CELL_H,
    );
  }
  if (canvas.dataset.crown) drawCrown(ctx, 27, 4, 3);
}

/** Dessine tous les sprites d'un conteneur (à appeler après chaque insertion de HTML). */
export function paintSprites(root: ParentNode = document): void {
  root.querySelectorAll<HTMLCanvasElement>('canvas.px').forEach((canvas) => drawOne(canvas, tick));
}

/** Lance l'animation commune des sprites du DOM (8 images par seconde environ). */
export function startSpriteTicker(): void {
  onAtlasReady(() => paintSprites());
  window.setInterval(() => {
    tick++;
    document.querySelectorAll<HTMLCanvasElement>('canvas.px').forEach((canvas) => {
      if (canvas.offsetParent !== null) drawOne(canvas, tick);
    });
  }, 140);
}
