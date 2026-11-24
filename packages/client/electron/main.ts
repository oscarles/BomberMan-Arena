import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Ouvre la fenêtre de jeu : rendu isolé (pas d'accès Node), seul `quit` est exposé via le preload. */
function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#17409e',
    title: 'Bomberman Arena',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) void window.loadURL(devServer);
  else {
    // `--mock` : interface contre le serveur simulé, sans serveur de jeu (mode hors ligne).
    const query: Record<string, string> = process.argv.includes('--mock') ? { mock: '1' } : {};
    void window.loadFile(path.join(here, '..', 'dist', 'index.html'), { query });
  }

  // Les liens externes s'ouvrent dans le navigateur, jamais dans la fenêtre de jeu.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.on('app:quit', () => app.quit());

void app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
