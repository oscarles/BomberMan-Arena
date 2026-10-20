import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { GameServer } from './net/GameServer.js';
import { DropTableRepository } from './persistence/dropTableRepository.js';

const port = Number(process.env.PORT ?? 8080);
const dbPath = process.env.DB_PATH ?? './data/bomberman.db';
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });

const dropTableRepository = new DropTableRepository(dbPath);

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(404).end();
});

const gameServer = new GameServer(server, () => dropTableRepository.load());

server.listen(port, () => console.log(`[server] à l'écoute sur le port ${port}`));

process.on('SIGTERM', () => {
  gameServer.close();
  dropTableRepository.close();
  server.close(() => process.exit(0));
});
