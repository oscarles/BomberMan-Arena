import { defineConfig } from 'vite';

/** Le rendu est chargé depuis le disque par Electron : chemins relatifs obligatoires. */
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  server: { port: 5173, strictPort: true },
});
