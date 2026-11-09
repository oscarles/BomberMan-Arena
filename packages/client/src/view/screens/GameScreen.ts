import type { GameEventMessage } from '@bomberman/shared';
import { InputController } from '../../input/InputController';
import { timeRemainingMs, type RoundModel } from '../../model/round';
import { GameRenderer } from '../game/GameRenderer';
import { esc, formatClock, setHtml } from '../ui/dom';
import { spriteHtml } from '../ui/sprites';
import type { Screen, ScreenContext } from './Screen';

const BANNER_MS = 2200;

/** Écran de jeu : rendu PixiJS de l'arène, bandeau d'état (HUD), bannières et pause. */
export class GameScreen implements Screen {
  readonly id = 'game' as const;
  readonly element = document.createElement('section');
  private readonly renderer: GameRenderer;
  private readonly input: InputController;
  private readonly hudPlayers: HTMLElement;
  private readonly hudRound: HTMLElement;
  private readonly hudTimer: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly feed: HTMLElement;
  private readonly pause: HTMLElement;
  private rendererReady: Promise<void> | null = null;
  private hudSignature = '';
  private hudTimerId = 0;
  private bannerTimer = 0;
  private paused = false;
  private visible = false;

  constructor(private readonly ctx: ScreenContext) {
    this.element.className = 'screen game-screen';
    setHtml(
      this.element,
      `
      <div class="hud">
        <div class="hud-players"></div>
        <div class="hud-center"><div class="hud-round"></div><div class="hud-timer">0:00</div></div>
        <button class="btn ghost hud-pause" type="button" data-act="pause">Pause</button>
      </div>
      <div class="game-stage">
        <div class="canvas-host"></div>
        <div class="banner" hidden></div>
        <div class="feed"></div>
        <div class="pause-menu" hidden>
          <div class="box">
            <h2 class="title-h outline">PAUSE</h2>
            <p class="note">La partie continue pour les autres joueurs.</p>
            <div class="pause-actions">
              <button class="btn go big" type="button" data-act="resume">Reprendre</button>
              <button class="btn ghost" type="button" data-act="settings">Paramètres</button>
              <button class="btn" type="button" data-act="quit">Quitter la partie</button>
            </div>
          </div>
        </div>
      </div>`,
    );
    this.hudPlayers = this.element.querySelector('.hud-players') as HTMLElement;
    this.hudRound = this.element.querySelector('.hud-round') as HTMLElement;
    this.hudTimer = this.element.querySelector('.hud-timer') as HTMLElement;
    this.banner = this.element.querySelector('.banner') as HTMLElement;
    this.feed = this.element.querySelector('.feed') as HTMLElement;
    this.pause = this.element.querySelector('.pause-menu') as HTMLElement;

    this.renderer = new GameRenderer(this.element.querySelector('.canvas-host') as HTMLElement);
    this.input = new InputController(window, () => ctx.settings.data.keyScheme, {
      onMove: (direction) => ctx.controller.move(direction),
      onBomb: () => ctx.controller.placeBomb(),
      onPause: () => this.setPaused(!this.paused),
    });

    this.element.addEventListener('click', (event) => this.onClick(event));
    ctx.model.events.on('roundStarted', (round) => this.startRound(round));
    ctx.model.events.on('roundEvent', (event) => this.onEvent(event));
    ctx.model.events.on('roundEnded', ({ winnerId, roundNumber }) =>
      this.onRoundEnded(winnerId, roundNumber),
    );
  }

  onShow(): void {
    this.visible = true;
    this.rendererReady ??= this.renderer.init();
    const round = this.ctx.model.round;
    if (round) this.startRound(round);
    this.input.setEnabled(true);
    this.hudTimerId = window.setInterval(() => this.refreshHud(), 200);
  }

  onHide(): void {
    this.visible = false;
    this.input.setEnabled(false);
    window.clearInterval(this.hudTimerId);
    this.setPaused(false);
  }

  private onClick(event: Event): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!target) return;
    this.ctx.sfx.play('click');
    switch (target.dataset.act) {
      case 'pause':
        this.setPaused(true);
        break;
      case 'resume':
        this.setPaused(false);
        break;
      case 'settings':
        this.ctx.openSettings();
        break;
      case 'quit':
        this.setPaused(false);
        this.ctx.controller.leaveLobby();
        break;
    }
  }

  private setPaused(paused: boolean): void {
    if (!this.visible && paused) return;
    this.paused = paused;
    this.pause.hidden = !paused;
    this.input.setEnabled(this.visible && !paused);
  }

  private startRound(round: RoundModel): void {
    void this.rendererReady?.then(() => {
      this.renderer.setRound(round, this.ctx.model.playerId);
      this.hudSignature = '';
      this.refreshHud();
      this.showBanner(`<small>Manche ${round.roundNumber} / ${round.totalRounds}</small>PRÊTS ?`);
      this.ctx.sfx.play('start');
    });
  }

  private onEvent(event: GameEventMessage): void {
    const { model, sfx } = this.ctx;
    switch (event.type) {
      case 'BOMB_PLACED':
        sfx.play('bombPlace');
        break;
      case 'BOMB_EXPLODED':
        sfx.play('explosion');
        this.renderer.shake();
        break;
      case 'ITEM_PICKED':
        if (event.payload.playerId === model.playerId) sfx.play('pickup');
        break;
      case 'PLAYER_UPDATED': {
        const lives = model.round?.players.get(event.payload.player.id)?.lives;
        if (
          event.payload.player.id === model.playerId &&
          lives !== undefined &&
          event.payload.player.lives < lives
        ) {
          sfx.play('hurt');
        }
        break;
      }
      case 'PLAYER_ELIMINATED': {
        const players = model.round?.players;
        const victim = players?.get(event.payload.playerId)?.name ?? 'Un joueur';
        const killer = event.payload.killerId ? players?.get(event.payload.killerId)?.name : null;
        this.pushFeed(
          killer && killer !== victim
            ? `${esc(killer)} a éliminé ${esc(victim)}`
            : `${esc(victim)} est éliminé`,
        );
        sfx.play('hurt');
        break;
      }
      case 'SUDDEN_DEATH_STARTED':
        sfx.play('suddenDeath');
        this.showBanner('<small>Temps écoulé</small>MORT SUBITE !');
        break;
      default:
        break;
    }
    this.refreshHud();
  }

  private onRoundEnded(winnerId: string | null, roundNumber: number): void {
    const winner = winnerId ? this.ctx.model.round?.players.get(winnerId)?.name : null;
    this.ctx.sfx.play('roundEnd');
    this.showBanner(
      `<small>Manche ${roundNumber} terminée</small>${winner ? `${esc(winner)} GAGNE !` : 'ÉGALITÉ'}`,
      2800,
    );
  }

  private showBanner(html: string, duration = BANNER_MS): void {
    this.banner.innerHTML = `<div class="banner-in">${html}</div>`;
    this.banner.hidden = false;
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (this.banner.hidden = true), duration);
  }

  private pushFeed(html: string): void {
    const line = document.createElement('div');
    line.className = 'feed-line';
    line.innerHTML = html;
    this.feed.append(line);
    window.setTimeout(() => line.remove(), 4000);
    while (this.feed.children.length > 4) this.feed.firstElementChild?.remove();
  }

  /** Met à jour le bandeau : chrono à chaque appel, fiches joueurs seulement si elles changent. */
  private refreshHud(): void {
    const round = this.ctx.model.round;
    if (!round) return;
    const remaining = timeRemainingMs(round, Date.now());
    this.hudTimer.textContent = round.suddenDeath ? 'MORT SUBITE' : formatClock(remaining);
    this.hudTimer.classList.toggle('urgent', round.suddenDeath || remaining < 15_000);
    this.hudRound.textContent = `Manche ${round.roundNumber}/${round.totalRounds}`;
    const players = [...round.players.values()];
    const signature = JSON.stringify(
      players.map((p) => [
        p.id,
        p.lives,
        p.alive,
        p.maxBombs,
        p.bombRange,
        p.speedLevel,
        p.slowed,
        p.invulnerable,
      ]),
    );
    if (signature === this.hudSignature) return;
    this.hudSignature = signature;
    const wins = this.ctx.model.wins;
    setHtml(
      this.hudPlayers,
      players
        .map((p) => {
          const hearts = Array.from(
            { length: Math.max(p.lives, 0) },
            () => '<span data-icon="heart" data-s="2"></span>',
          ).join('');
          return `<div class="hud-card${p.alive ? '' : ' out'}${p.id === this.ctx.model.playerId ? ' me' : ''}">
            ${spriteHtml(p.color, 'head', 2)}
            <div class="hud-info">
              <div class="hud-name">${esc(p.name)}${wins[p.id] ? ` <span class="hud-wins">★${wins[p.id]}</span>` : ''}</div>
              <div class="hud-hearts">${p.alive ? hearts : '<span class="hud-dead">ÉLIMINÉ</span>'}</div>
              <div class="hud-stats"><span data-icon="bomb" data-s="1"></span>${p.maxBombs} <span data-icon="flame" data-s="1"></span>${p.bombRange} <span data-icon="skate" data-s="1"></span>${p.speedLevel}${p.slowed ? ' <span data-icon="snail" data-s="1"></span>' : ''}</div>
            </div>
          </div>`;
        })
        .join(''),
    );
  }
}
