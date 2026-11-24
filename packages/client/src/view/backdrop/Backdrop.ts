import {
  bombCanvas,
  drawBomber,
  flameCanvas,
  tileCanvas,
  type Facing,
  type SpriteColor,
} from '../../assets/pixelArt';

type Kind = 0 | 1 | 2; // 0 = herbe, 1 = bloc, 2 = brique
interface Bot {
  color: SpriteColor;
  x: number;
  y: number;
  path: [number, number][];
  dead: number;
  invulnerable: number;
  spawn: [number, number];
  cooldown: number;
  facing: Facing;
  anim: number;
  moving: boolean;
}
interface Bomb {
  c: number;
  r: number;
  t: number;
  owner: Bot;
}
interface Flame {
  c: number;
  r: number;
  t: number;
}

const T = 32; // taille d'une case dans le repère de dessin
const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const BOT_COLORS: SpriteColor[] = ['white', 'red', 'pink', 'green'];

/**
 * Décor animé des menus : quatre Bomberman pilotés par un mini-algorithme (simple simulation
 * visuelle, sans lien avec le serveur) jouent derrière l'interface. Ils évitent les zones
 * recouvertes par les panneaux pour rester visibles.
 */
export class Backdrop {
  private readonly ctx: CanvasRenderingContext2D;
  private cols = 15;
  private rows = 13;
  private cell = 64;
  private ox = 0;
  private oy = 0;
  private dpr = 1;
  private grid: Kind[][] = [];
  private bots: Bot[] = [];
  private bombs: Bomb[] = [];
  private flames: Flame[] = [];
  private spawns: [number, number][] = [];
  private occupied = new Set<string>();
  private time = 0;
  private regen = 0;
  private occTimer = 0;
  private raf = 0;
  private last = 0;
  private running = false;
  private tint = 0.25;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    /** Rectangles (en pixels écran) recouverts par l'interface. */
    private readonly occluders: () => DOMRect[],
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponible');
    this.ctx = ctx;
    window.addEventListener('resize', () => this.onResize());
  }

  /** Assombrit le décor (0 = pas de voile) pour faire ressortir l'interface. */
  setTint(tint: number): void {
    this.tint = tint;
    this.occTimer = 0;
  }

  start(): void {
    if (this.running) return;
    if (this.grid.length === 0) this.reset();
    this.resize();
    this.running = true;
    this.last = 0;
    this.raf = requestAnimationFrame((ts) => this.frame(ts));
    this.canvas.style.display = 'block';
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.canvas.style.display = 'none';
  }

  // ---------------------------------------------------------------- simulation

  private dims(): { cell: number; cols: number; rows: number } {
    const cell = window.innerWidth >= 900 ? 64 : 48;
    const odd = (n: number) => {
      const v = Math.max(9, Math.ceil(n));
      return v % 2 ? v : v + 1;
    };
    return {
      cell,
      cols: Math.min(41, odd(window.innerWidth / cell)),
      rows: Math.min(31, odd(window.innerHeight / cell)),
    };
  }

  private isHard(c: number, r: number): boolean {
    return (
      c === 0 ||
      r === 0 ||
      c === this.cols - 1 ||
      r === this.rows - 1 ||
      (c % 2 === 0 && r % 2 === 0)
    );
  }

  private reset(): void {
    const d = this.dims();
    this.cell = d.cell;
    this.cols = d.cols;
    this.rows = d.rows;
    this.spawns = [
      [1, 1],
      [this.cols - 2, 1],
      [1, this.rows - 2],
      [this.cols - 2, this.rows - 2],
    ];
    this.grid = Array.from({ length: this.rows }, (_, r) =>
      Array.from({ length: this.cols }, (_, c): Kind => {
        if (this.isHard(c, r)) return 1;
        const nearSpawn = this.spawns.some(([sc, sr]) => Math.abs(sc - c) + Math.abs(sr - r) <= 2);
        return !nearSpawn && Math.random() < 0.62 ? 2 : 0;
      }),
    );
    this.bombs = [];
    this.flames = [];
    this.bots = BOT_COLORS.map((color, i) => {
      const spawn = this.spawns[i] ?? [1, 1];
      return {
        color,
        x: spawn[0] + 0.5,
        y: spawn[1] + 0.5,
        path: [],
        dead: 0,
        invulnerable: 0,
        spawn,
        cooldown: 0.4 + Math.random() * 1.5,
        facing: 'down',
        anim: 0,
        moving: false,
      };
    });
  }

  private onResize(): void {
    const d = this.dims();
    if (d.cell !== this.cell || d.cols !== this.cols || d.rows !== this.rows) this.reset();
    if (this.running) this.resize();
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.ox = Math.round((w - this.cols * this.cell) / 2);
    this.oy = Math.round((h - this.rows * this.cell) / 2);
  }

  private bombAt(c: number, r: number): boolean {
    return this.bombs.some((b) => b.c === c && b.r === r);
  }

  private blast(c: number, r: number, range: number): [number, number][] {
    const out: [number, number][] = [[c, r]];
    for (const [dc, dr] of DIRS) {
      for (let i = 1; i <= range; i++) {
        const cc = c + dc * i;
        const rr = r + dr * i;
        const kind = this.grid[rr]?.[cc];
        if (kind === undefined || kind === 1) break;
        out.push([cc, rr]);
        if (kind === 2) break;
      }
    }
    return out;
  }

  private danger(maxT: number): Set<string> {
    const set = new Set<string>();
    for (const bomb of this.bombs) {
      if (bomb.t <= maxT) for (const [c, r] of this.blast(bomb.c, bomb.r, 2)) set.add(`${c},${r}`);
    }
    for (const flame of this.flames) set.add(`${flame.c},${flame.r}`);
    return set;
  }

  private bfs(
    sc: number,
    sr: number,
    goal: (c: number, r: number) => boolean,
    blocked: (c: number, r: number) => boolean,
  ): [number, number][] | null {
    const queue: [number, number][] = [[sc, sr]];
    const prev = new Map<string, [number, number]>();
    const seen = new Set<string>([`${sc},${sr}`]);
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head] as [number, number];
      if ((cur[0] !== sc || cur[1] !== sr) && goal(cur[0], cur[1])) {
        const path: [number, number][] = [];
        let node: [number, number] | undefined = cur;
        while (node && !(node[0] === sc && node[1] === sr)) {
          path.unshift(node);
          node = prev.get(`${node[0]},${node[1]}`);
        }
        return path;
      }
      for (const [dc, dr] of DIRS) {
        const nc = cur[0] + dc;
        const nr = cur[1] + dr;
        const key = `${nc},${nr}`;
        if (seen.has(key) || this.grid[nr]?.[nc] !== 0 || blocked(nc, nr)) continue;
        seen.add(key);
        prev.set(key, cur);
        queue.push([nc, nr]);
      }
    }
    return null;
  }

  private nextToBrick(c: number, r: number): boolean {
    return DIRS.some(([dc, dr]) => this.grid[r + dr]?.[c + dc] === 2);
  }

  private computeOccupied(): void {
    const rects = this.occluders();
    this.occupied.clear();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x0 = this.ox + c * this.cell;
        const y0 = this.oy + (r - 0.6) * this.cell;
        const x1 = x0 + this.cell;
        const y1 = this.oy + (r + 1) * this.cell;
        if (rects.some((q) => x0 < q.right && x1 > q.left && y0 < q.bottom && y1 > q.top)) {
          this.occupied.add(`${c},${r}`);
        }
      }
    }
  }

  private stepBot(bot: Bot, dt: number): void {
    if (bot.dead > 0) {
      bot.dead -= dt;
      if (bot.dead <= 0) {
        bot.x = bot.spawn[0] + 0.5;
        bot.y = bot.spawn[1] + 0.5;
        bot.path = [];
        bot.invulnerable = 1.6;
      }
      return;
    }
    if (bot.invulnerable > 0) bot.invulnerable -= dt;
    if (bot.path.length === 0) this.plan(bot);
    bot.moving = bot.path.length > 0;
    const next = bot.path[0];
    if (!next) return;
    const tx = next[0] + 0.5;
    const ty = next[1] + 0.5;
    const dx = tx - bot.x;
    const dy = ty - bot.y;
    const dist = Math.hypot(dx, dy);
    const step = 3.4 * dt;
    bot.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    bot.anim += dt * 9;
    if (dist <= step) {
      bot.x = tx;
      bot.y = ty;
      bot.path.shift();
    } else {
      bot.x += (dx / dist) * step;
      bot.y += (dy / dist) * step;
    }
  }

  private plan(bot: Bot): void {
    const c = Math.floor(bot.x);
    const r = Math.floor(bot.y);
    const danger = this.danger(1.4);
    if (danger.has(`${c},${r}`)) {
      bot.path =
        this.bfs(
          c,
          r,
          (cc, rr) => !danger.has(`${cc},${rr}`),
          (cc, rr) => this.bombAt(cc, rr),
        ) ?? [];
      return;
    }
    const hidden = this.occupied.has(`${c},${r}`);
    const ownBomb = this.bombs.some((b) => b.owner === bot);
    const wantsBomb = this.nextToBrick(c, r) || Math.random() < 0.12;
    if (
      !ownBomb &&
      bot.cooldown <= 0 &&
      wantsBomb &&
      (!hidden || Math.random() < 0.1) &&
      !this.bombAt(c, r)
    ) {
      this.bombs.push({ c, r, t: 2, owner: bot });
      bot.cooldown = 1 + Math.random() * 2;
      const all = this.danger(99);
      bot.path =
        this.bfs(
          c,
          r,
          (cc, rr) => !all.has(`${cc},${rr}`),
          (cc, rr) => this.bombAt(cc, rr),
        ) ?? [];
      return;
    }
    const blocked = (cc: number, rr: number) => this.bombAt(cc, rr) || danger.has(`${cc},${rr}`);
    const visible = (cc: number, rr: number) =>
      !danger.has(`${cc},${rr}`) && !this.occupied.has(`${cc},${rr}`);
    bot.path =
      this.bfs(c, r, (cc, rr) => visible(cc, rr) && this.nextToBrick(cc, rr), blocked) ??
      this.bfs(c, r, (cc, rr) => visible(cc, rr) && Math.random() < 0.2, blocked) ??
      this.bfs(c, r, (cc, rr) => !danger.has(`${cc},${rr}`) && this.nextToBrick(cc, rr), blocked) ??
      [];
  }

  private explode(bomb: Bomb): void {
    const index = this.bombs.indexOf(bomb);
    if (index < 0) return;
    this.bombs.splice(index, 1);
    for (const [c, r] of this.blast(bomb.c, bomb.r, 2)) {
      const row = this.grid[r];
      if (row && row[c] === 2) row[c] = 0;
      this.flames.push({ c, r, t: 0.55 });
      for (const other of this.bombs)
        if (other.c === c && other.r === r) other.t = Math.min(other.t, 0.08);
    }
  }

  private update(dt: number): void {
    this.time += dt;
    this.occTimer -= dt;
    if (this.occTimer <= 0) {
      this.computeOccupied();
      this.occTimer = 0.5;
    }
    for (const bot of this.bots) {
      bot.cooldown -= dt;
      this.stepBot(bot, dt);
    }
    for (const bomb of [...this.bombs]) {
      bomb.t -= dt;
      if (bomb.t <= 0) this.explode(bomb);
    }
    for (const flame of this.flames) flame.t -= dt;
    this.flames = this.flames.filter((f) => f.t > 0);
    for (const bot of this.bots) {
      if (bot.dead > 0 || bot.invulnerable > 0) continue;
      const c = Math.floor(bot.x);
      const r = Math.floor(bot.y);
      if (this.flames.some((f) => f.c === c && f.r === r)) {
        bot.dead = 1.5;
        bot.path = [];
      }
    }
    this.regenerateBricks(dt);
  }

  /** Les briques repoussent pour que le mur ne disparaisse jamais. */
  private regenerateBricks(dt: number): void {
    this.regen -= dt;
    const bricks = this.grid.reduce((n, row) => n + row.filter((k) => k === 2).length, 0);
    if (bricks >= this.cols * this.rows * 0.2 || this.regen > 0) return;
    const c = 1 + Math.floor(Math.random() * (this.cols - 2));
    const r = 1 + Math.floor(Math.random() * (this.rows - 2));
    const free =
      this.grid[r]?.[c] === 0 &&
      (!this.occupied.has(`${c},${r}`) || Math.random() < 0.3) &&
      !this.bombAt(c, r) &&
      !this.flames.some((f) => f.c === c && f.r === r) &&
      this.bots.every((b) => Math.abs(Math.floor(b.x) - c) + Math.abs(Math.floor(b.y) - r) > 2);
    if (free) {
      (this.grid[r] as Kind[])[c] = 2;
      this.regen = 0.25;
    }
  }

  // ---------------------------------------------------------------- dessin

  private draw(): void {
    const ctx = this.ctx;
    const k = this.cell / T;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(this.dpr * k, 0, 0, this.dpr * k, this.ox * this.dpr, this.oy * this.dpr);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const kind = this.grid[r]?.[c] ?? 0;
        const name = kind === 1 ? 'hard' : kind === 2 ? 'brick' : 'grass';
        const shadeLeft = this.grid[r]?.[c - 1] === 1;
        const shadeUp = this.grid[r - 1]?.[c] === 1;
        ctx.drawImage(tileCanvas(name, (r + c) % 2, shadeLeft, shadeUp), c * T, r * T, T, T);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(10,32,130,${this.tint})`;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr * k, 0, 0, this.dpr * k, this.ox * this.dpr, this.oy * this.dpr);
    ctx.imageSmoothingEnabled = false;
    const flameFrame = Math.floor(this.time * 12) % 2;
    for (const flame of this.flames) {
      ctx.globalAlpha = Math.min(1, flame.t / 0.2);
      ctx.drawImage(flameCanvas(flameFrame), flame.c * T, flame.r * T, T, T);
    }
    ctx.globalAlpha = 1;
    for (const bomb of this.bombs) {
      const size = 28 + (Math.floor(this.time * 6) % 2) * 3;
      ctx.drawImage(
        bombCanvas(Math.floor(this.time * 8)),
        bomb.c * T + 16 - size / 2,
        bomb.r * T + 18 - size / 2,
        size,
        size,
      );
    }
    for (const bot of [...this.bots].sort((a, b) => a.y - b.y)) this.drawBot(ctx, bot);
  }

  private drawBot(ctx: CanvasRenderingContext2D, bot: Bot): void {
    const cx = bot.x * T;
    const bottom = bot.y * T + 15;
    if (bot.dead > 0) {
      const p = Math.min(1, (1.5 - bot.dead) / 0.9);
      if (p >= 1) return;
      ctx.globalAlpha = 1 - p * 0.75;
      drawBomber(ctx, bot.color, 'ko', bot.facing, Math.floor(p * 9), cx, bottom - p * 10, 0.56);
      ctx.globalAlpha = 1;
      return;
    }
    if (bot.invulnerable > 0 && Math.floor(this.time * 10) % 2) return;
    drawBomber(
      ctx,
      bot.color,
      bot.moving ? 'walk' : 'idle',
      bot.facing,
      Math.floor(bot.anim),
      cx,
      bottom,
      0.56,
    );
  }

  private frame(timestamp: number): void {
    if (!this.running) return;
    const dt = Math.max(0, Math.min(0.05, (timestamp - this.last) / 1000 || 0));
    this.last = timestamp;
    try {
      this.update(dt);
      this.draw();
    } catch (error) {
      console.error(error);
    }
    this.raf = requestAnimationFrame((ts) => this.frame(ts));
  }
}
