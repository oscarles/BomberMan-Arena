import type { LobbySummary } from '@bomberman/shared';
import { formatClock, esc, setHtml } from '../ui/dom';
import { spriteHtml } from '../ui/sprites';
import type { Screen, ScreenContext } from './Screen';

const REFRESH_MS = 3000;

/** Navigateur de salons : liste des salons publics, partie rapide et code d'invitation. */
export class LobbiesScreen implements Screen {
  readonly id = 'lobbies' as const;
  readonly element = document.createElement('section');
  private readonly rows: HTMLElement;
  private readonly codeInput: HTMLInputElement;
  private readonly message: HTMLElement;
  private timer = 0;

  constructor(private readonly ctx: ScreenContext) {
    this.element.className = 'screen';
    setHtml(
      this.element,
      `
      <header class="page-head">
        <div class="plaque"><div>${spriteHtml('white', 'head', 2.5)}</div><h2>Salons</h2></div>
        <div class="head-actions">
          <button class="btn ghost" type="button" data-act="back"><span data-icon="arrowl" data-s="2"></span>Retour</button>
          <button class="btn" type="button" data-act="create"><span data-icon="plus" data-s="2"></span>Créer un salon</button>
        </div>
      </header>
      <div class="box quick">
        <div class="walkers" aria-hidden="true">${(['white', 'red', 'blue'] as const).map((c) => spriteHtml(c, 'walk', 3, false, 'right')).join('')}</div>
        <p><b>Partie rapide</b>On te place dans le salon public le plus rempli.</p>
        <button class="btn go big" type="button" data-act="quick"><span data-icon="play" data-s="2"></span>Jouer</button>
      </div>
      <div class="toolbar">
        <button class="btn ghost" type="button" data-act="refresh">Actualiser</button>
        <div class="code-box">
          <label class="label" for="lobby-code">Code d'invitation</label>
          <div class="codejoin">
            <input class="input" id="lobby-code" maxlength="6" placeholder="EX : 4K7Q2P" autocomplete="off" />
            <button class="btn" type="button" data-act="join-code">Rejoindre</button>
          </div>
          <div class="code-msg" id="lobby-msg" role="status"></div>
        </div>
      </div>
      <div class="box" style="padding:4px">
        <div class="list-scroll"><div class="rows" id="lobby-rows"></div></div>
      </div>`,
    );
    this.rows = this.element.querySelector('#lobby-rows') as HTMLElement;
    this.codeInput = this.element.querySelector('#lobby-code') as HTMLInputElement;
    this.message = this.element.querySelector('#lobby-msg') as HTMLElement;
    this.element.addEventListener('click', (event) => this.onClick(event));
    this.codeInput.addEventListener('input', () => {
      this.codeInput.value = this.codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      this.message.textContent = '';
    });
    this.codeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.joinByCode();
    });
    ctx.model.events.on('lobbies', () => this.render());
    ctx.model.events.on('error', ({ code, message }) => {
      if (code === 'INVALID_INVITE_CODE' || code === 'LOBBY_NOT_FOUND')
        this.message.textContent = message;
    });
    this.render();
  }

  onShow(): void {
    this.ctx.controller.refreshLobbies();
    this.timer = window.setInterval(() => this.ctx.controller.refreshLobbies(), REFRESH_MS);
    this.render();
  }

  onHide(): void {
    window.clearInterval(this.timer);
  }

  private onClick(event: Event): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!target) return;
    this.ctx.sfx.play('click');
    switch (target.dataset.act) {
      case 'back':
        this.ctx.navigate('home');
        break;
      case 'create':
        this.ctx.openCreateLobby();
        break;
      case 'refresh':
        this.ctx.controller.refreshLobbies();
        break;
      case 'quick':
        this.quickPlay();
        break;
      case 'join-code':
        this.joinByCode();
        break;
      case 'join':
        this.ctx.controller.joinLobby(target.dataset.id ?? '');
        break;
    }
  }

  private joinByCode(): void {
    if (!this.ctx.controller.joinByCode(this.codeInput.value)) {
      this.message.textContent = 'Le code compte 6 caractères.';
    }
  }

  /** Rejoint le salon public le plus rempli ; sinon en crée un. */
  private quickPlay(): void {
    const open = this.ctx.model.lobbies
      .filter((l) => l.status === 'WAITING' && l.playerCount < l.maxPlayers)
      .sort((a, b) => b.playerCount - a.playerCount);
    const best = open[0];
    if (best) this.ctx.controller.joinLobby(best.id);
    else this.ctx.controller.createLobby('', 'PUBLIC');
  }

  private render(): void {
    const header = `<div class="row hd label"><span>Salon</span><span>Joueurs</span><span>Places</span><span>État</span><span></span></div>`;
    const lobbies = this.ctx.model.lobbies;
    const body =
      lobbies.length === 0
        ? `<div class="empty">Aucun salon ouvert pour l'instant. Crée le tien ou lance une partie rapide.</div>`
        : lobbies.map((lobby) => this.row(lobby)).join('');
    setHtml(this.rows, header + body);
  }

  private row(lobby: LobbySummary): string {
    const full = lobby.playerCount >= lobby.maxPlayers;
    const heads = Array.from({ length: lobby.maxPlayers }, (_, i) =>
      i < lobby.playerCount ? spriteHtml('white', 'head', 2) : '<span class="head-empty"></span>',
    ).join('');
    const s = lobby.settings;
    const info = `${s.lives} vie${s.lives > 1 ? 's' : ''} · ${formatClock(s.timeLimitSeconds * 1000)} · ${s.rounds} manche${s.rounds > 1 ? 's' : ''}`;
    const state = full
      ? '<span class="pill full">Complet</span>'
      : '<span class="pill open">En attente</span>';
    const action = full
      ? '<button class="btn" disabled>Complet</button>'
      : `<button class="btn go" data-act="join" data-id="${esc(lobby.id)}">Rejoindre</button>`;
    return `<div class="row"><div class="rname">${esc(lobby.name)}<small>${info}</small></div><div class="heads">${heads}</div><span class="note-cell">${lobby.playerCount}/${lobby.maxPlayers}</span><span>${state}</span>${action}</div>`;
  }
}
