import { GRID_HEIGHT, GRID_WIDTH, type PlayerState } from '@bomberman/shared';
// Variante sans `eval` : la politique de sécurité (CSP) de la page interdit `unsafe-eval`.
import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import {
  CELL_H,
  CELL_W,
  ITEM_ICON,
  bombCanvas,
  flameCanvas,
  frameFor,
  iconInfo,
  onAtlasReady,
  tileCanvas,
  variantCanvas,
  type Facing,
  type Pose,
  type SpriteColor,
  type TileKind,
} from '../../assets/pixelArt';
import { pruneFlames, type RoundModel } from '../../model/round';

/** Taille d'une case dans le repère du monde ; le monde est ensuite mis à l'échelle de la fenêtre. */
const TILE = 32;
/** Marge au-dessus de l'arène : les têtes et pseudos de la première ligne y dépassent. */
const TOP_MARGIN = 34;
/** Échelle des Bomberman par rapport à la planche de sprites. */
const SPRITE_SCALE = 0.56;
/** Durée par défaut d'un pas (ms) tant qu'aucun déplacement récent ne permet de la mesurer. */
const DEFAULT_STEP_MS = 200;
/** Le glissement est un peu plus rapide que le rythme réel des pas : le joueur arrive avant le suivant. */
const GLIDE_CATCH_UP = 1.2;

interface PlayerView {
  container: Container;
  sprite: Sprite;
  name: Text;
  marker: Graphics;
  x: number;
  y: number;
  /** Dernière case cible reçue du serveur et durée mesurée du dernier pas. */
  targetX: number;
  targetY: number;
  changedAt: number;
  stepMs: number;
  facing: Facing;
  moving: boolean;
  anim: number;
  deadAt: number | null;
  lastLives: number;
  hurtUntil: number;
}

const textureCache = new Map<string, Texture>();

function canvasTexture(key: string, make: () => HTMLCanvasElement, nearest = true): Texture {
  let texture = textureCache.get(key);
  if (!texture) {
    texture = Texture.from(make());
    texture.source.scaleMode = nearest ? 'nearest' : 'linear';
    textureCache.set(key, texture);
  }
  return texture;
}

/** Texture d'une case de la planche de sprites pour une couleur donnée. */
function bomberTexture(color: SpriteColor, row: number, col: number): Texture | null {
  const key = `bomber:${color}:${row}:${col}`;
  const cached = textureCache.get(key);
  if (cached) return cached;
  const sheet = variantCanvas(color);
  if (!sheet) return null;
  const base = canvasTexture(`sheet:${color}`, () => sheet, false);
  const texture = new Texture({
    source: base.source,
    frame: new Rectangle(col * CELL_W, row * CELL_H, CELL_W, CELL_H),
  });
  textureCache.set(key, texture);
  return texture;
}

/**
 * Vue de la partie (le « V » du MVC) : dessine le modèle de manche avec PixiJS. Elle ne modifie
 * jamais le modèle ; les positions affichées glissent simplement vers celles confirmées par le serveur.
 */
export class GameRenderer {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly tilesLayer = new Container();
  private readonly itemsLayer = new Container();
  private readonly bombsLayer = new Container();
  private readonly flamesLayer = new Container();
  private readonly playersLayer = new Container();
  private tiles: { sprite: Sprite; key: string }[][] = [];
  private readonly players = new Map<string, PlayerView>();
  private readonly bombSprites = new Map<string, Sprite>();
  private readonly itemSprites = new Map<string, Sprite>();
  private flameSprites: Sprite[] = [];
  private round: RoundModel | null = null;
  private myId: string | null = null;
  private elapsed = 0;
  private shakeUntil = 0;
  private ready = false;

  constructor(private readonly host: HTMLElement) {}

  /** Crée le canvas PixiJS dans le conteneur. À appeler une fois. */
  async init(): Promise<void> {
    await this.app.init({
      resizeTo: this.host,
      backgroundAlpha: 0,
      antialias: false,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    this.host.appendChild(this.app.canvas);
    this.world.addChild(
      this.tilesLayer,
      this.itemsLayer,
      this.flamesLayer,
      this.bombsLayer,
      this.playersLayer,
    );
    this.app.stage.addChild(this.world);
    this.playersLayer.sortableChildren = true;
    await new Promise<void>((resolve) => onAtlasReady(resolve));
    this.app.ticker.add((ticker) => this.update(ticker.deltaMS));
    this.ready = true;
  }

  /** Affiche une nouvelle manche (l'objet est conservé : il est lu à chaque image). */
  setRound(round: RoundModel, myId: string | null): void {
    this.round = round;
    this.myId = myId;
    this.tilesLayer.removeChildren();
    this.tiles = [];
    for (let y = 0; y < GRID_HEIGHT; y++) {
      const row: { sprite: Sprite; key: string }[] = [];
      for (let x = 0; x < GRID_WIDTH; x++) {
        const sprite = new Sprite();
        sprite.position.set(x * TILE, y * TILE);
        sprite.width = TILE;
        sprite.height = TILE;
        this.tilesLayer.addChild(sprite);
        row.push({ sprite, key: '' });
      }
      this.tiles.push(row);
    }
    for (const view of this.players.values()) view.container.destroy({ children: true });
    this.players.clear();
    for (const sprite of [...this.bombSprites.values(), ...this.itemSprites.values()])
      sprite.destroy();
    this.bombSprites.clear();
    this.itemSprites.clear();
  }

  /** Déclenche un léger tremblement de l'écran (explosion). */
  shake(durationMs = 220): void {
    this.shakeUntil = this.elapsed + durationMs;
  }

  destroy(): void {
    if (this.ready) this.app.destroy(true, { children: true });
    this.ready = false;
  }

  // ---------------------------------------------------------------- image par image

  private update(deltaMs: number): void {
    const round = this.round;
    if (!round) return;
    this.elapsed += deltaMs;
    pruneFlames(round, Date.now());
    this.fit();
    this.drawTiles(round);
    this.drawItems(round);
    this.drawBombs(round);
    this.drawFlames(round);
    this.drawPlayers(round, deltaMs / 1000);
  }

  private fit(): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const worldH = GRID_HEIGHT * TILE + TOP_MARGIN;
    // Taille de case en pixels entiers : pixel art net, sans coutures entre les tuiles.
    const tilePx = Math.max(8, Math.floor(Math.min(w / GRID_WIDTH, h / (worldH / TILE))));
    const scale = tilePx / TILE;
    const shaking = this.elapsed < this.shakeUntil;
    const jitter = () => (shaking ? (Math.random() - 0.5) * 6 : 0);
    this.world.scale.set(scale);
    this.world.position.set(
      (w - GRID_WIDTH * TILE * scale) / 2 + jitter(),
      (h - worldH * scale) / 2 + TOP_MARGIN * scale + jitter(),
    );
  }

  private drawTiles(round: RoundModel): void {
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const cell = round.grid[y]?.[x] ?? 'EMPTY';
        const kind: TileKind = cell === 'WALL' ? 'hard' : cell === 'BLOCK' ? 'brick' : 'grass';
        const shadeLeft = round.grid[y]?.[x - 1] === 'WALL';
        const shadeUp = round.grid[y - 1]?.[x] === 'WALL';
        const key = `${kind}${(x + y) % 2}${shadeLeft}${shadeUp}`;
        const entry = this.tiles[y]?.[x];
        if (entry && entry.key !== key) {
          entry.key = key;
          entry.sprite.texture = canvasTexture(`tile:${key}`, () =>
            tileCanvas(kind, (x + y) % 2, shadeLeft, shadeUp),
          );
          entry.sprite.width = TILE;
          entry.sprite.height = TILE;
        }
      }
    }
  }

  private drawItems(round: RoundModel): void {
    for (const [id, sprite] of this.itemSprites) {
      if (!round.items.has(id)) {
        sprite.destroy();
        this.itemSprites.delete(id);
      }
    }
    for (const item of round.items.values()) {
      let sprite = this.itemSprites.get(item.id);
      if (!sprite) {
        const icon = iconInfo(ITEM_ICON[item.type]);
        sprite = new Sprite(canvasTexture(`icon:${item.type}`, () => icon.canvas));
        sprite.anchor.set(0.5);
        sprite.width = icon.w * 2.6;
        sprite.height = icon.h * 2.6;
        this.itemsLayer.addChild(sprite);
        this.itemSprites.set(item.id, sprite);
      }
      sprite.position.set(
        item.x * TILE + TILE / 2,
        item.y * TILE + TILE / 2 + Math.sin(this.elapsed / 220 + item.x) * 1.5,
      );
    }
  }

  private drawBombs(round: RoundModel): void {
    for (const [id, sprite] of this.bombSprites) {
      if (!round.bombs.has(id)) {
        sprite.destroy();
        this.bombSprites.delete(id);
      }
    }
    const frame = Math.floor(this.elapsed / 120);
    const size = 27 + (Math.floor(this.elapsed / 170) % 2) * 3;
    for (const bomb of round.bombs.values()) {
      let sprite = this.bombSprites.get(bomb.id);
      if (!sprite) {
        sprite = new Sprite();
        sprite.anchor.set(0.5);
        this.bombsLayer.addChild(sprite);
        this.bombSprites.set(bomb.id, sprite);
      }
      sprite.texture = canvasTexture(`bomb:${frame % 3}`, () => bombCanvas(frame));
      sprite.width = size;
      sprite.height = size;
      sprite.position.set(bomb.x * TILE + TILE / 2, bomb.y * TILE + TILE / 2 + 2);
    }
  }

  private drawFlames(round: RoundModel): void {
    const frame = Math.floor(this.elapsed / 80) % 2;
    while (this.flameSprites.length < round.flames.length) {
      const sprite = new Sprite();
      this.flamesLayer.addChild(sprite);
      this.flameSprites.push(sprite);
    }
    this.flameSprites.forEach((sprite, i) => {
      const flame = round.flames[i];
      sprite.visible = flame !== undefined;
      if (!flame) return;
      sprite.texture = canvasTexture(`flame:${frame}`, () => flameCanvas(frame));
      sprite.width = TILE;
      sprite.height = TILE;
      sprite.position.set(flame.x * TILE, flame.y * TILE);
      sprite.alpha = Math.min(1, (flame.expiresAt - Date.now()) / 160);
    });
  }

  private drawPlayers(round: RoundModel, dt: number): void {
    for (const [id, view] of this.players) {
      if (!round.players.has(id)) {
        view.container.destroy({ children: true });
        this.players.delete(id);
      }
    }
    for (const player of round.players.values()) {
      const view = this.players.get(player.id) ?? this.createPlayer(player);
      this.updatePlayer(view, player, dt);
    }
  }

  private createPlayer(player: PlayerState): PlayerView {
    const container = new Container();
    const sprite = new Sprite();
    sprite.anchor.set(0.5, 1);
    const name = new Text({
      text: player.name,
      style: {
        fontFamily: 'Nunito, sans-serif',
        fontWeight: '800',
        fontSize: 11,
        fill: 0xffffff,
        stroke: { color: 0x14101c, width: 3 },
      },
    });
    name.anchor.set(0.5, 1);
    name.y = -CELL_H * SPRITE_SCALE + 6;
    const marker = new Graphics()
      .poly([-4, 0, 4, 0, 0, 5])
      .fill(0xffd23a)
      .stroke({ color: 0x14101c, width: 1.5 });
    marker.y = name.y - 15;
    marker.visible = player.id === this.myId;
    container.addChild(sprite, name, marker);
    this.playersLayer.addChild(container);
    const view: PlayerView = {
      container,
      sprite,
      name,
      marker,
      x: player.x,
      y: player.y,
      targetX: player.x,
      targetY: player.y,
      changedAt: this.elapsed,
      stepMs: DEFAULT_STEP_MS,
      facing: 'down',
      moving: false,
      anim: 0,
      deadAt: null,
      lastLives: player.lives,
      hurtUntil: 0,
    };
    this.players.set(player.id, view);
    return view;
  }

  private updatePlayer(view: PlayerView, player: PlayerState, dt: number): void {
    if (player.x !== view.targetX || player.y !== view.targetY) {
      // Cadence réelle des pas (vitesse, ralentissement) : le glissement reste continu sans à-coups.
      const sinceLast = this.elapsed - view.changedAt;
      view.stepMs = sinceLast < 700 ? Math.max(90, sinceLast) : DEFAULT_STEP_MS;
      view.changedAt = this.elapsed;
      view.targetX = player.x;
      view.targetY = player.y;
    }
    const speed = (1000 / view.stepMs) * GLIDE_CATCH_UP;
    const dx = player.x - view.x;
    const dy = player.y - view.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 2.5) {
      view.x = player.x;
      view.y = player.y;
      view.moving = false;
    } else if (distance > 0.02) {
      const step = Math.min(distance, speed * dt);
      view.x += (dx / distance) * step;
      view.y += (dy / distance) * step;
      view.facing =
        Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
      view.moving = true;
      view.anim += dt * speed * 1.7;
    } else {
      view.moving = false;
    }
    if (player.lives < view.lastLives) view.hurtUntil = this.elapsed + 500;
    view.lastLives = player.lives;
    if (!player.alive && view.deadAt === null) view.deadAt = this.elapsed;
    if (player.alive) view.deadAt = null;

    let pose: Pose = view.moving ? 'walk' : 'idle';
    let frame = Math.floor(view.anim);
    let visible = true;
    if (view.deadAt !== null) {
      const t = this.elapsed - view.deadAt;
      pose = 'ko';
      frame = Math.floor(t / 90);
      visible = t < 900;
    }
    const color = player.color as SpriteColor;
    const [row, col] = frameFor(pose, view.facing, frame);
    const texture = bomberTexture(color, row, col);
    if (texture) {
      view.sprite.texture = texture;
      view.sprite.width = CELL_W * SPRITE_SCALE;
      view.sprite.height = CELL_H * SPRITE_SCALE;
    }
    const blink = player.invulnerable && Math.floor(this.elapsed / 90) % 2 === 0;
    view.container.visible = visible;
    view.sprite.alpha = blink ? 0.35 : 1;
    view.sprite.tint =
      this.elapsed < view.hurtUntil && Math.floor(this.elapsed / 70) % 2 === 0
        ? 0xff7070
        : player.slowed
          ? 0x9ab8ff
          : 0xffffff;
    view.container.position.set(view.x * TILE + TILE / 2, view.y * TILE + TILE - 1);
    view.container.zIndex = view.y;
    if (view.name.text !== player.name) view.name.text = player.name;
    view.marker.visible = player.id === this.myId && player.alive;
    view.marker.alpha = 0.7 + Math.sin(this.elapsed / 160) * 0.3;
  }
}
