# Documentation technique — Bomberman Arena

Index de la documentation technique du projet (cahier des charges §5.1).

| Document                                           | Contenu                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| [architecture.md](./architecture.md)               | Structure du monorepo, séparation des responsabilités, choix techniques  |
| [protocole-websocket.md](./protocole-websocket.md) | Format JSON des messages WebSocket, référence complète + séquences       |
| [moteur-de-jeu.md](./moteur-de-jeu.md)             | Fonctionnement du moteur de manche (grille, bombes, objets, mort subite) |
| [lobbies-et-parties.md](./lobbies-et-parties.md)   | Salons, réglages, cycle de vie d'une partie, session multi-manches       |
| [deploiement.md](./deploiement.md)                 | Variables d'environnement, Docker, déploiement du serveur                |
| [post-mortem.md](./post-mortem.md)                 | Bilan qualitatif (à compléter en fin de projet)                          |

## Démarrage rapide

```bash
npm install
npm run build
npm test
npm run dev:server        # serveur sur le port 8080 (GET /health)
docker compose up --build # alternative conteneurisée
```

## État du projet

Voir le [README](../README.md) à la racine pour l'avancement fonctionnel détaillé. En résumé : le
moteur de jeu, les lobbies et le serveur WebSocket sont fonctionnels et testés côté serveur ; le
client (Electron + PixiJS) reste à développer.
