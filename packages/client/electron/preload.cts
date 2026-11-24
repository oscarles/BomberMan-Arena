// Le preload est un module CommonJS (`.cts`) : seule la forme `import = require` y est valide.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import electron = require('electron');

/** API minimale exposée au rendu : fermer l'application depuis le menu « Quitter ». */
electron.contextBridge.exposeInMainWorld('bomberman', {
  quit: (): void => electron.ipcRenderer.send('app:quit'),
});
