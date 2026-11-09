import { App } from './App';
import { AppController } from './controller/AppController';
import { ClientModel } from './model/ClientModel';
import { MockTransport } from './net/MockTransport';
import type { Transport } from './net/Transport';
import { WebSocketTransport } from './net/WebSocketTransport';
import { SettingsStore } from './settings/Settings';
import './styles/maquette.css';
import './styles/app.css';

/**
 * Point d'entrée du rendu. `?mock=1` lance le client contre un serveur simulé en mémoire
 * (interface utilisable hors ligne, sans serveur) ; sinon il se connecte au serveur configuré.
 */
function bootstrap(): void {
  const params = new URLSearchParams(window.location.search);
  const settings = new SettingsStore(window.localStorage);
  const url = params.get('server') ?? settings.data.serverUrl;
  const transport: Transport = params.has('mock')
    ? new MockTransport()
    : new WebSocketTransport(url);
  const model = new ClientModel();
  const controller = new AppController(model, transport, settings);
  const root = document.getElementById('app');
  if (!root) throw new Error('Conteneur #app introuvable');
  new App(root, model, controller, settings).start();
}

bootstrap();
