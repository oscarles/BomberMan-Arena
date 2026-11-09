import type { AppController } from '../../controller/AppController';
import type { ClientModel } from '../../model/ClientModel';
import type { Sfx } from '../../audio/Sfx';
import type { SettingsStore } from '../../settings/Settings';

export type ScreenId = 'home' | 'lobbies' | 'room' | 'game' | 'results';

/** Services partagés par tous les écrans (injectés, jamais importés en global). */
export interface ScreenContext {
  model: ClientModel;
  controller: AppController;
  settings: SettingsStore;
  sfx: Sfx;
  navigate(id: ScreenId): void;
  openSettings(): void;
  openCreateLobby(): void;
  toast(message: string): void;
}

/** Un écran = un conteneur DOM qui sait s'afficher et se masquer. */
export interface Screen {
  readonly id: ScreenId;
  readonly element: HTMLElement;
  onShow(): void;
  onHide(): void;
}
