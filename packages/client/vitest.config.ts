import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Couches graphiques (PixiJS, DOM, WebAudio) : vérifiées visuellement via le mode mock.
      exclude: ['src/view/**', 'src/audio/**', 'src/main.ts', 'src/assets/**', 'src/**/*.d.ts'],
    },
  },
});
