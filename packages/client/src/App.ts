import { Sfx } from './audio/Sfx';
import { installCssAssets, loadAtlas } from './assets/pixelArt';
import { AppController } from './controller/AppController';
import { ClientModel } from './model/ClientModel';
import type { SettingsStore } from './settings/Settings';
import { Backdrop } from './view/backdrop/Backdrop';
import { GameScreen } from './view/screens/GameScreen';
import { HomeScreen } from './view/screens/HomeScreen';
import { LobbiesScreen } from './view/screens/LobbiesScreen';
import { ResultsScreen } from './view/screens/ResultsScreen';
import { RoomScreen } from './view/screens/RoomScreen';
import type { Screen, ScreenContext, ScreenId } from './view/screens/Screen';
import { CreateLobbyDialog, SettingsDialog, Toasts } from './view/ui/dialogs';
import { startSpriteTicker } from './view/ui/sprites';

/** Éléments de l'interface qui recouvrent le décor animé : les bots du fond les évitent. */
const OCCLUDERS =
  '.screen.active .box, .screen.active .plaque, .screen.active .btn, .screen.active .logo, .screen.active .hero, .screen.active .menu li, .screen.active .codejoin';

/**
 * Racine de l'application : assemble modèle, contrôleur et vues (MVC) et décide quel écran
 * afficher en réaction aux événements du modèle. Aucune règle de jeu ici.
 */
export class App {
  private readonly screens: Record<ScreenId, Screen>;
  private readonly backdrop: Backdrop;
  private readonly toasts = new Toasts();
  private readonly settingsDialog: SettingsDialog;
  private readonly createDialog: CreateLobbyDialog;
  private readonly banner = document.createElement('div');
  private current: ScreenId | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly model: ClientModel,
    private readonly controller: AppController,
    private readonly settings: SettingsStore,
  ) {
    installCssAssets(document.documentElement);
    loadAtlas();
    startSpriteTicker();

    const canvas = document.createElement('canvas');
    canvas.id = 'bg-game';
    canvas.setAttribute('aria-hidden', 'true');
    this.backdrop = new Backdrop(canvas, () =>
      [...document.querySelectorAll(OCCLUDERS)].map((node) => node.getBoundingClientRect()),
    );

    const sfx = new Sfx(settings);
    this.settingsDialog = new SettingsDialog(settings, sfx);
    this.createDialog = new CreateLobbyDialog((name, visibility) =>
      controller.createLobby(name, visibility),
    );
    const ctx: ScreenContext = {
      model,
      controller,
      settings,
      sfx,
      navigate: (id) => this.navigate(id),
      openSettings: () => this.settingsDialog.open(),
      openCreateLobby: () =>
        this.createDialog.open(
          `Salon de ${settings.data.pseudo || model.name || 'joueur'}`.slice(0, 20),
        ),
      toast: (message) => this.toasts.show(message),
    };
    this.screens = {
      home: new HomeScreen(ctx),
      lobbies: new LobbiesScreen(ctx),
      room: new RoomScreen(ctx),
      game: new GameScreen(ctx),
      results: new ResultsScreen(ctx),
    };

    this.banner.className = 'conn-banner';
    this.banner.hidden = true;
    this.banner.innerHTML = `<span>Connexion au serveur impossible.</span><button class="btn" type="button">Réessayer</button>`;
    this.banner.querySelector('button')?.addEventListener('click', () => controller.reconnect());

    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.append(...Object.values(this.screens).map((screen) => screen.element));
    root.append(
      canvas,
      wrap,
      this.banner,
      this.settingsDialog.element,
      this.createDialog.element,
      this.toasts.element,
    );

    this.listen(ctx);
  }

  /** Démarre l'application sur l'écran d'accueil. */
  start(): void {
    this.controller.start();
    this.navigate('home');
  }

  navigate(id: ScreenId): void {
    if (this.current === id) return;
    if (this.current) {
      const previous = this.screens[this.current];
      previous.onHide();
      previous.element.classList.remove('active');
    }
    this.current = id;
    document.body.classList.toggle('in-game', id === 'game');
    if (id === 'game') this.backdrop.stop();
    else {
      this.backdrop.setTint(id === 'home' ? 0.25 : 0.5);
      this.backdrop.start();
    }
    const next = this.screens[id];
    next.element.classList.add('active');
    window.scrollTo(0, 0);
    next.onShow();
  }

  /** Réactions de navigation aux événements du modèle. */
  private listen(ctx: ScreenContext): void {
    const { events } = this.model;
    events.on('lobby', (lobby) => {
      if (lobby && (this.current === 'home' || this.current === 'lobbies')) this.navigate('room');
      if (!lobby && this.current !== 'home' && this.current !== 'lobbies') this.navigate('lobbies');
    });
    events.on('roundStarted', () => this.navigate('game'));
    events.on('gameEnded', () => this.navigate('results'));
    events.on('error', ({ message }) => ctx.toast(message));
    events.on('connection', (status) => {
      this.banner.hidden = status !== 'closed';
    });
  }
}
