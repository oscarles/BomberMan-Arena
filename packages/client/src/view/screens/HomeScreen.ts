import { iconHtml, esc, setHtml } from '../ui/dom';
import { spriteHtml } from '../ui/sprites';
import type { Screen, ScreenContext } from './Screen';

/** Écran d'accueil : logo, pseudo et menu principal (briques), avec la séquence d'intro animée. */
export class HomeScreen implements Screen {
  readonly id = 'home' as const;
  readonly element = document.createElement('section');
  private readonly status: HTMLElement;
  private readonly title: HTMLElement;
  private readonly fx: HTMLElement;
  private readonly flash: HTMLElement;
  private fxTimer = 0;

  constructor(private readonly ctx: ScreenContext) {
    this.element.className = 'screen';
    setHtml(
      this.element,
      `
      <div class="statusbar">
        <span id="home-status"></span>
        <span id="home-server"></span>
        <button class="replay" type="button" data-act="intro">↻ Revoir l'intro</button>
      </div>
      <div class="title-screen">
        <div class="deco" id="home-deco" aria-hidden="true"></div>
        <div class="logo">
          <div class="burst-wrap" data-burst="22"><div class="burst"></div></div>
          <h1 class="l1">BOMBERMAN</h1>
          <p class="l2">ARENA</p>
        </div>
        <div class="hero">${spriteHtml('white', 'idle', 8.63)}</div>
        <div class="box pseudo">
          <label class="label" for="pseudo">Ton pseudo</label>
          <input class="input" id="pseudo" maxlength="20" autocomplete="off" value="${esc(ctx.settings.data.pseudo)}" placeholder="JOUEUR" />
        </div>
        <ul class="menu">
          <li><button type="button" data-act="play"><span class="mi" data-icon="flame"></span><span class="t">Jouer</span><small>Choisir un salon à rejoindre</small></button></li>
          <li><button type="button" data-act="create"><span class="mi" data-icon="bomb"></span><span class="t">Créer un salon</span><small>Public ou privé, tu es l'hôte</small></button></li>
          <li><button type="button" data-act="code"><span class="mi" data-icon="lock"></span><span class="t">Rejoindre par code</span><small>Salon privé sur invitation</small></button></li>
          <li><button type="button" data-act="settings"><span class="mi" data-icon="gear"></span><span class="t">Paramètres</span><small>Volume, touches, serveur</small></button></li>
          <li><button type="button" data-act="quit"><span class="mi" data-icon="door"></span><span class="t">Quitter</span></button></li>
        </ul>
        <p class="start blink">APPUIE SUR ▲ ▼ PUIS ENTRÉE</p>
        <div class="hint">
          <span><kbd>↑↓←→</kbd>Se déplacer</span>
          <span><kbd>ESPACE</kbd>Poser une bombe</span>
          <span><kbd>ÉCHAP</kbd>Pause</span>
        </div>
        <p class="copy">© 2026 BOMBERMAN ARENA · Projet BUT 3 Qualité de développement</p>
      </div>`,
    );
    this.status = this.element.querySelector('#home-status') as HTMLElement;
    this.title = this.element.querySelector('.title-screen') as HTMLElement;
    this.buildBursts();
    this.buildDeco();

    this.fx = document.createElement('div');
    this.fx.className = 'intro-fx';
    this.fx.hidden = true;
    setHtml(
      this.fx,
      `<div class="iarm-h"></div><div class="iarm-v"></div><div class="iring"></div><div class="ibomb">${iconHtml('bomb', 7)}</div>`,
    );
    this.flash = document.createElement('div');
    this.flash.className = 'flashfull';
    this.element.append(this.fx, this.flash);

    this.element.addEventListener('click', (event) => this.onClick(event));
    const pseudo = this.element.querySelector('#pseudo') as HTMLInputElement;
    pseudo.addEventListener('change', () => ctx.controller.setPseudo(pseudo.value));
    this.element.addEventListener('keydown', (event) => this.onKeyDown(event));
    ctx.model.events.on('connection', () => this.renderStatus());
    ctx.model.events.on('lobbies', () => this.renderStatus());
    this.renderStatus();
  }

  onShow(): void {
    this.renderStatus();
    this.playIntro();
  }

  onHide(): void {
    window.clearTimeout(this.fxTimer);
    this.fx.hidden = true;
    this.title.classList.remove('play');
  }

  private renderStatus(): void {
    const { connection, lobbies } = this.ctx.model;
    const label =
      connection === 'open'
        ? '● Serveur en ligne'
        : connection === 'connecting'
          ? '○ Connexion…'
          : '● Serveur injoignable';
    this.status.className = connection === 'open' ? 'on' : 'off';
    this.status.textContent = label;
    const server = this.element.querySelector('#home-server') as HTMLElement;
    server.textContent =
      connection === 'open'
        ? `${lobbies.length} salon${lobbies.length > 1 ? 's' : ''} ouvert${lobbies.length > 1 ? 's' : ''}`
        : this.ctx.settings.data.serverUrl;
  }

  private onClick(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!button) return;
    this.ctx.sfx.play('click');
    const pseudo = this.element.querySelector('#pseudo') as HTMLInputElement;
    if (pseudo.value.trim()) this.ctx.controller.setPseudo(pseudo.value);
    switch (button.dataset.act) {
      case 'intro':
        this.playIntro();
        break;
      case 'play':
        this.ctx.navigate('lobbies');
        break;
      case 'code':
        this.ctx.navigate('lobbies');
        window.setTimeout(() => document.getElementById('lobby-code')?.focus(), 50);
        break;
      case 'create':
        this.ctx.openCreateLobby();
        break;
      case 'settings':
        this.ctx.openSettings();
        break;
      case 'quit':
        this.quit();
        break;
    }
  }

  /** Flèches haut/bas : déplacent le curseur (bombe) dans le menu. */
  private onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if ((event.target as HTMLElement).id === 'pseudo') return;
    const buttons = [...this.element.querySelectorAll<HTMLButtonElement>('.menu button')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'ArrowDown'
        ? (index + 1) % buttons.length
        : (index <= 0 ? buttons.length : index) - 1;
    event.preventDefault();
    buttons[next]?.focus();
  }

  private quit(): void {
    const bridge = (window as unknown as { bomberman?: { quit(): void } }).bomberman;
    if (bridge) bridge.quit();
    else this.ctx.toast('Ferme la fenêtre pour quitter.');
  }

  /** Étoile jaune derrière le logo (polygone en pointes). */
  private buildBursts(): void {
    this.element.querySelectorAll<HTMLElement>('[data-burst]').forEach((wrap) => {
      const n = Number(wrap.dataset.burst);
      const points: string[] = [];
      for (let i = 0; i < n * 2; i++) {
        const angle = (Math.PI * i) / n - Math.PI / 2;
        const radius = i % 2 ? 36 : i % 4 === 0 ? 50 : 44;
        points.push(
          `${(50 + radius * Math.cos(angle)).toFixed(1)}% ${(50 + radius * Math.sin(angle)).toFixed(1)}%`,
        );
      }
      (wrap.firstElementChild as HTMLElement).style.clipPath = `polygon(${points.join(',')})`;
    });
  }

  /** Bonus qui flottent et étincelles autour du logo. */
  private buildDeco(): void {
    const items: [Parameters<typeof iconHtml>[0], number, number, number, number][] = [
      ['flame', 3, 22, 6, 0],
      ['bomb', 9, 52, 4.5, 0.6],
      ['skate', 2, 74, 5, 1.1],
      ['star', 91, 16, 6, 0.3],
      ['heart', 88, 46, 5, 0.9],
      ['skull', 93, 72, 5, 1.4],
    ];
    const sparks = [
      [20, 9],
      [66, 6],
      [74, 24],
      [14, 30],
      [58, 3],
      [82, 14],
    ];
    const html =
      items
        .map(
          ([icon, x, y, s, d]) =>
            `<div class="it" style="left:${x}%;top:${y}%;animation-delay:-${d}s">${iconHtml(icon, s)}</div>`,
        )
        .join('') +
      sparks
        .map(
          ([x, y], i) =>
            `<div class="sp" style="left:${x}%;top:${y}%;animation-delay:-${(i * 0.37).toFixed(2)}s"></div>`,
        )
        .join('');
    (this.element.querySelector('#home-deco') as HTMLElement).innerHTML = html;
  }

  /** Séquence d'intro : bombe, explosion, logo, Bomberman, puis briques du menu. */
  private playIntro(): void {
    window.clearTimeout(this.fxTimer);
    this.title.classList.remove('play');
    this.fx.classList.remove('run');
    const logo = this.element.querySelector('.logo') as HTMLElement;
    const rect = logo.getBoundingClientRect();
    this.fx.style.left = `${rect.left + rect.width / 2}px`;
    this.fx.style.top = `${rect.top + rect.height / 2}px`;
    this.fx.hidden = false;
    void this.title.offsetWidth;
    this.fx.classList.add('run');
    this.title.classList.add('play');
    this.flash.classList.remove('run');
    void this.flash.offsetWidth;
    this.flash.classList.add('run');
    window.setTimeout(() => this.ctx.sfx.play('explosion'), 1100);
    this.fxTimer = window.setTimeout(() => (this.fx.hidden = true), 3000);
  }
}
