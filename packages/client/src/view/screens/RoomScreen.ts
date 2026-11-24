import {
  MIN_PLAYERS_TO_START,
  PLAYER_COLORS,
  SETTINGS_LIMITS,
  type LobbyInfo,
} from '@bomberman/shared';
import { COLOR_LABEL } from '../../assets/pixelArt';
import { formatClock, esc, setHtml } from '../ui/dom';
import { spriteHtml } from '../ui/sprites';
import type { Screen, ScreenContext } from './Screen';

type NumericSetting = 'maxPlayers' | 'lives' | 'rounds' | 'timeLimitSeconds';
type BooleanSetting = 'itemsEnabled' | 'malusEnabled';

const STEPPERS: { key: NumericSetting; label: string; hint: string; icon: string; step: number }[] =
  [
    { key: 'maxPlayers', label: 'Joueurs max', hint: '', icon: 'head', step: 1 },
    { key: 'lives', label: 'Vies', hint: '', icon: 'heart', step: 1 },
    {
      key: 'rounds',
      label: 'Manches',
      hint: 'Le plus de victoires gagne',
      icon: 'trophy',
      step: 1,
    },
    { key: 'timeLimitSeconds', label: 'Durée', hint: 'Puis mort subite', icon: 'clock', step: 30 },
  ];

/** Salle d'attente : joueurs, couleurs, réglages de l'hôte et lancement de la partie. */
export class RoomScreen implements Screen {
  readonly id = 'room' as const;
  readonly element = document.createElement('section');

  constructor(private readonly ctx: ScreenContext) {
    this.element.className = 'screen';
    this.element.addEventListener('click', (event) => this.onClick(event));
    ctx.model.events.on('lobby', () => this.render());
  }

  onShow(): void {
    this.render();
  }

  onHide(): void {
    /* rien à nettoyer */
  }

  private onClick(event: Event): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!target || (target as HTMLButtonElement).disabled) return;
    const { controller, sfx, model } = this.ctx;
    sfx.play('click');
    const lobby = model.lobby;
    switch (target.dataset.act) {
      case 'leave':
        controller.leaveLobby();
        break;
      case 'start':
        sfx.play('start');
        controller.startGame();
        break;
      case 'color':
        controller.setColor(target.dataset.color as (typeof PLAYER_COLORS)[number]);
        break;
      case 'step':
        if (lobby)
          this.step(lobby, target.dataset.key as NumericSetting, Number(target.dataset.dir));
        break;
      case 'toggle':
        if (lobby) {
          const key = target.dataset.key as BooleanSetting;
          controller.updateSettings({ [key]: !lobby.settings[key] });
        }
        break;
      case 'copy':
        void this.copyCode(lobby?.inviteCode ?? '');
        break;
    }
  }

  private step(lobby: LobbyInfo, key: NumericSetting, direction: number): void {
    const meta = STEPPERS.find((s) => s.key === key);
    if (!meta) return;
    const limits = SETTINGS_LIMITS[key];
    const minimum = key === 'maxPlayers' ? Math.max(limits.min, lobby.players.length) : limits.min;
    const next = Math.min(
      limits.max,
      Math.max(minimum, lobby.settings[key] + direction * meta.step),
    );
    if (next !== lobby.settings[key]) this.ctx.controller.updateSettings({ [key]: next });
  }

  private async copyCode(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.ctx.toast('Code copié !');
    } catch {
      this.ctx.toast(`Code : ${code}`);
    }
  }

  private render(): void {
    const { model } = this.ctx;
    const lobby = model.lobby;
    if (!lobby) return;
    const isHost = model.isHost;
    const canStart = isHost && lobby.players.length >= MIN_PLAYERS_TO_START;
    const taken = new Set(lobby.players.filter((p) => p.id !== model.playerId).map((p) => p.color));
    const slots = Array.from({ length: lobby.settings.maxPlayers }, (_, i) => {
      const player = lobby.players[i];
      if (!player) {
        return `<div class="slot empty-slot"><div class="ghost-spr">${spriteHtml('white', 'idle', 4)}</div><span class="label">Place libre</span><span class="blink">En attente d'un joueur…</span></div>`;
      }
      const me = player.id === model.playerId;
      const swatches = me
        ? `<div class="swatches">${PLAYER_COLORS.map(
            (color) =>
              `<button type="button" class="sw${taken.has(color) ? ' taken' : ''}" data-act="color" data-color="${color}" aria-pressed="${player.color === color}" aria-label="${COLOR_LABEL[color]}${taken.has(color) ? ' (pris)' : ''}"${taken.has(color) ? ' disabled' : ''}>${spriteHtml(color, 'head', 2)}</button>`,
          ).join('')}</div>`
        : '';
      return `<div class="slot${me ? ' me' : ''}"><div class="pad">${spriteHtml(player.color, 'idle', 5)}</div><div class="nameplate">${esc(player.name)}<small>${player.isHost ? 'HÔTE' : 'JOUEUR'}${me ? ' · TOI' : ''}</small></div>${swatches}</div>`;
    }).join('');

    const steppers = STEPPERS.map((meta) => {
      const value = lobby.settings[meta.key];
      const shown = meta.key === 'timeLimitSeconds' ? formatClock(value * 1000) : String(value);
      const limits = SETTINGS_LIMITS[meta.key];
      const minimum =
        meta.key === 'maxPlayers' ? Math.max(limits.min, lobby.players.length) : limits.min;
      const control = isHost
        ? `<div class="stepper"><button type="button" data-act="step" data-key="${meta.key}" data-dir="-1" aria-label="Diminuer ${meta.label}"${value <= minimum ? ' disabled' : ''}>−</button><output>${shown}</output><button type="button" data-act="step" data-key="${meta.key}" data-dir="1" aria-label="Augmenter ${meta.label}"${value >= limits.max ? ' disabled' : ''}>+</button></div>`
        : `<div class="stepper"><output>${shown}</output></div>`;
      const icon =
        meta.icon === 'head'
          ? spriteHtml('white', 'head', 3)
          : `<span data-icon="${meta.icon}"></span>`;
      return `<div class="setting"><div class="lbl">${icon}<div><div class="label">${meta.label}</div>${meta.hint ? `<small>${meta.hint}</small>` : ''}</div></div>${control}</div>`;
    }).join('');

    const toggles = (
      [
        { key: 'itemsEnabled', label: 'Objets', hint: 'Bonus après destruction', icon: 'star' },
        { key: 'malusEnabled', label: 'Malus', hint: 'Bombe surprise, lenteur', icon: 'skull' },
      ] as const
    )
      .map((meta) => {
        const on = lobby.settings[meta.key];
        const disabled = !isHost || (meta.key === 'malusEnabled' && !lobby.settings.itemsEnabled);
        return `<div class="setting"><div class="lbl"><span data-icon="${meta.icon}"></span><div><div class="label">${meta.label}</div><small>${meta.hint}</small></div></div><button class="toggle" type="button" data-act="toggle" data-key="${meta.key}" aria-pressed="${on}"${disabled ? ' disabled' : ''}>${on ? 'OUI' : 'NON'}</button></div>`;
      })
      .join('');

    const priv = lobby.visibility === 'PRIVATE';
    setHtml(
      this.element,
      `
      <header class="page-head">
        <div class="head-left">
          <div class="plaque"><h2>${esc(lobby.name)}</h2></div>
          <div class="invite">
            <span class="pill ${priv ? 'priv' : 'open'}">${priv ? 'Privé' : 'Public'}</span>
            ${priv && lobby.inviteCode ? `<span class="label">Code</span><span class="code">${esc(lobby.inviteCode)}</span><button class="btn ghost" type="button" data-act="copy">Copier</button>` : ''}
          </div>
        </div>
        <button class="btn ghost" type="button" data-act="leave"><span data-icon="arrowl" data-s="2"></span>Quitter le salon</button>
      </header>
      <div class="room">
        <div class="col">
          <div class="box">
            <div class="box-head"><h3 class="label">Joueurs ${lobby.players.length}/${lobby.settings.maxPlayers}</h3><span class="label gold">Choisis ta couleur</span></div>
            <div class="slots">${slots}</div>
          </div>
          <div class="box deep">
            <div class="startbar">
              <p class="startmsg">${isHost ? (canStart ? 'Prêt à lancer !' : 'En attente de joueurs') : "En attente de l'hôte"}<span>${isHost ? (canStart ? 'Tu peux démarrer la partie.' : `Il faut au moins ${MIN_PLAYERS_TO_START} joueurs.`) : "L'hôte lance la partie."}</span></p>
              ${isHost ? `<button class="btn go big" type="button" data-act="start"${canStart ? '' : ' disabled'}><span data-icon="play" data-s="2"></span>Lancer la partie</button>` : ''}
            </div>
          </div>
        </div>
        <div class="col">
          <div class="box">
            <h3 class="label">Règles de la partie</h3>
            <p class="locked">${isHost ? "Tu es l'hôte : toi seul peux les modifier" : "Seul l'hôte peut modifier les règles"}</p>
            ${steppers}${toggles}
          </div>
        </div>
      </div>
      <p class="note">Le salon reste ouvert après chaque partie : vous pouvez enchaîner les manches sans repasser par le menu.</p>`,
    );
  }
}
