import type { LobbyVisibility } from '@bomberman/shared';
import type { Sfx } from '../../audio/Sfx';
import type { SettingsStore } from '../../settings/Settings';
import { esc, setHtml } from './dom';

/** Fenêtre modale générique : fond assombri, fermeture par Échap, clic à côté ou bouton. */
abstract class Modal {
  protected readonly overlay = document.createElement('div');

  constructor() {
    this.overlay.className = 'overlay';
    this.overlay.hidden = true;
    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) this.close();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.overlay.hidden) {
        event.stopPropagation();
        this.close();
      }
    });
  }

  get element(): HTMLElement {
    return this.overlay;
  }

  close(): void {
    this.overlay.hidden = true;
  }

  protected show(): void {
    this.overlay.hidden = false;
  }
}

/** Paramètres du joueur : volumes, touches de déplacement et adresse du serveur. */
export class SettingsDialog extends Modal {
  constructor(
    private readonly settings: SettingsStore,
    private readonly sfx: Sfx,
  ) {
    super();
    this.overlay.addEventListener('click', (event) => this.onClick(event));
    this.overlay.addEventListener('input', (event) => this.onInput(event));
  }

  open(): void {
    const s = this.settings.data;
    setHtml(
      this.overlay,
      `
      <div class="box" role="dialog" aria-modal="true" aria-labelledby="set-title">
        <div class="dialog-head">
          <h2 class="title-h outline" id="set-title">PARAMÈTRES</h2>
          <button class="btn ghost xbtn" type="button" data-act="close" aria-label="Fermer les paramètres"><span data-icon="cross" data-s="2"></span></button>
        </div>
        <div class="slider"><label class="label" for="vol-master">Volume général</label><input type="range" id="vol-master" min="0" max="100" value="${Math.round(s.masterVolume * 100)}" /></div>
        <div class="slider"><label class="label" for="vol-sfx">Effets (SFX)</label><input type="range" id="vol-sfx" min="0" max="100" value="${Math.round(s.sfxVolume * 100)}" /></div>
        <div class="label gold">Touches</div>
        <div class="slider">
          <label class="label" for="key-scheme">Déplacement</label>
          <select class="input" id="key-scheme">
            <option value="zqsd"${s.keyScheme === 'zqsd' ? ' selected' : ''}>Z Q S D + flèches</option>
            <option value="wasd"${s.keyScheme === 'wasd' ? ' selected' : ''}>W A S D + flèches</option>
          </select>
        </div>
        <div class="keys"><div>Bombe <kbd>ESPACE</kbd></div><div>Pause <kbd>ÉCHAP</kbd></div></div>
        <div class="label gold">Serveur</div>
        <div class="slider">
          <label class="label" for="server-url">Adresse</label>
          <input class="input server-input" id="server-url" value="${esc(s.serverUrl)}" spellcheck="false" />
        </div>
        <p class="note">Le changement d'adresse recharge le client.</p>
        <div class="dialog-actions">
          <button class="btn ghost" type="button" data-act="test">Tester le son</button>
          <button class="btn" type="button" data-act="apply">Valider</button>
        </div>
      </div>`,
    );
    this.show();
  }

  private onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.id === 'vol-master')
      this.settings.update({ masterVolume: Number(target.value) / 100 });
    if (target.id === 'vol-sfx') this.settings.update({ sfxVolume: Number(target.value) / 100 });
    if (target.id === 'key-scheme')
      this.settings.update({ keyScheme: target.value === 'wasd' ? 'wasd' : 'zqsd' });
  }

  private onClick(event: Event): void {
    const act = (event.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'close') this.close();
    if (act === 'test') this.sfx.play('explosion');
    if (act === 'apply') {
      const url = (this.overlay.querySelector('#server-url') as HTMLInputElement).value.trim();
      const changed = url !== this.settings.data.serverUrl;
      this.settings.update({ serverUrl: url });
      this.close();
      if (changed && this.settings.data.serverUrl === url) window.location.reload();
    }
  }
}

/** Création d'un salon : nom et visibilité (public listé, ou privé avec code d'invitation). */
export class CreateLobbyDialog extends Modal {
  private visibility: LobbyVisibility = 'PUBLIC';

  constructor(private readonly onCreate: (name: string, visibility: LobbyVisibility) => void) {
    super();
    this.overlay.addEventListener('click', (event) => this.onClick(event));
    this.overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.submit();
    });
  }

  open(defaultName: string): void {
    this.visibility = 'PUBLIC';
    setHtml(
      this.overlay,
      `
      <div class="box" role="dialog" aria-modal="true" aria-labelledby="create-title">
        <div class="dialog-head">
          <h2 class="title-h outline" id="create-title">NOUVEAU SALON</h2>
          <button class="btn ghost xbtn" type="button" data-act="close" aria-label="Fermer"><span data-icon="cross" data-s="2"></span></button>
        </div>
        <label class="label" for="lobby-name">Nom du salon</label>
        <input class="input" id="lobby-name" maxlength="20" value="${esc(defaultName)}" autocomplete="off" />
        <div class="label">Visibilité</div>
        <div class="chips" role="group" aria-label="Visibilité">
          <button class="chip" type="button" data-act="vis" data-vis="PUBLIC" aria-pressed="true">Public</button>
          <button class="chip" type="button" data-act="vis" data-vis="PRIVATE" aria-pressed="false">Privé (code)</button>
        </div>
        <div class="dialog-actions">
          <button class="btn ghost" type="button" data-act="close">Annuler</button>
          <button class="btn go" type="button" data-act="create">Créer</button>
        </div>
      </div>`,
    );
    this.show();
    (this.overlay.querySelector('#lobby-name') as HTMLInputElement).select();
  }

  private onClick(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!button) return;
    if (button.dataset.act === 'close') this.close();
    if (button.dataset.act === 'create') this.submit();
    if (button.dataset.act === 'vis') {
      this.visibility = button.dataset.vis === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC';
      this.overlay.querySelectorAll<HTMLElement>('[data-act="vis"]').forEach((chip) => {
        chip.setAttribute('aria-pressed', String(chip.dataset.vis === this.visibility));
      });
    }
  }

  private submit(): void {
    const name = (this.overlay.querySelector('#lobby-name') as HTMLInputElement).value;
    this.close();
    this.onCreate(name, this.visibility);
  }
}

/** Message éphémère en bas de l'écran (erreurs du serveur, confirmations). */
export class Toasts {
  readonly element = document.createElement('div');

  constructor() {
    this.element.className = 'toasts';
    this.element.setAttribute('role', 'status');
  }

  show(message: string): void {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    this.element.append(toast);
    window.setTimeout(() => toast.remove(), 3500);
  }
}
