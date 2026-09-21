import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 8080);

// TODO(feat/lobby-reseau) : brancher ici le serveur WebSocket (ws), LobbyManager et la boucle de jeu.
const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(404).end();
});

server.listen(port, () => console.log(`[server] à l'écoute sur le port ${port}`));

process.on('SIGTERM', () => server.close(() => process.exit(0)));
