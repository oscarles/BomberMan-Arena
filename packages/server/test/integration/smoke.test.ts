import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveServerUrls, runSmokeTest } from '../../scripts/smoke-test.js';
import { DEFAULT_DROP_TABLE } from '../../src/engine/drops.js';
import { GameServer } from '../../src/net/GameServer.js';

describe('resolveServerUrls', () => {
  it('accepte une adresse ws:// et en déduit http://', () => {
    expect(resolveServerUrls('ws://1.2.3.4:8080')).toEqual({
      http: 'http://1.2.3.4:8080',
      ws: 'ws://1.2.3.4:8080',
    });
  });

  it('accepte hôte:port sans protocole', () => {
    expect(resolveServerUrls('monserveur.fr:8080/')).toEqual({
      http: 'http://monserveur.fr:8080',
      ws: 'ws://monserveur.fr:8080',
    });
  });

  it('associe https:// à wss://', () => {
    expect(resolveServerUrls('https://jeu.example.com')).toEqual({
      http: 'https://jeu.example.com',
      ws: 'wss://jeu.example.com',
    });
  });

  it('refuse un protocole inconnu', () => {
    expect(() => resolveServerUrls('ftp://x')).toThrow('Protocole non supporté');
  });
});

describe('runSmokeTest (intégration)', () => {
  let httpServer: Server;
  let gameServer: GameServer;
  let address: string;

  beforeEach(async () => {
    // Même routage HTTP que src/index.ts : /health répond ok.
    httpServer = createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }
      res.writeHead(404).end();
    });
    gameServer = new GameServer(httpServer, () => DEFAULT_DROP_TABLE);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    address = `ws://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    gameServer.close();
    httpServer.close();
  });

  it('valide toutes les étapes contre un serveur réel', async () => {
    const report = await runSmokeTest(address, { pings: 2 });

    expect(report.steps.filter((s) => !s.ok)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.steps.map((s) => s.name)).toContain(
      'Déplacement synchronisé (A bouge, B le voit)',
    );
    expect(report.latencyMs).not.toBeNull();
  });

  it("échoue proprement à l'étape santé quand le serveur est injoignable", async () => {
    const port = (httpServer.address() as AddressInfo).port;
    gameServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));

    const report = await runSmokeTest(`ws://127.0.0.1:${port}`, { timeoutMs: 1000 });

    expect(report.ok).toBe(false);
    expect(report.steps).toHaveLength(1);
    expect(report.steps[0]).toMatchObject({ name: 'Santé HTTP (/health)', ok: false });
  });
});
