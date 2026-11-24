# 💣 Bomberman Arena

Bomberman multijoueur en réseau, de 2 à 4 joueurs. Projet BUT 3 « Qualité de développement ».

Le **serveur** Node.js gère toute la partie (collisions, explosions, bonus, fin de partie). Le
**client** Electron + PixiJS affiche l'état reçu et envoie les actions du joueur. Les deux
communiquent en **WebSocket** (JSON).

📖 [Documentation technique](./docs/README.md) · [Protocole WebSocket](./docs/protocole-websocket.md)
· [Architecture](./docs/architecture.md)

## Démarrage rapide

Prérequis : **Node.js ≥ 24**, `make` (sous Windows, utiliser WSL).

```bash
make install   # installe les dépendances
make dev       # lance le serveur + le client
```

Ouvrir ensuite **http://localhost:5173**. Le serveur écoute sur `ws://localhost:8080`.
`Ctrl+C` arrête tout.

## Commandes

`make help` affiche la liste complète.

### Lancer le jeu

| Commande         | Effet                                                          |
| ---------------- | -------------------------------------------------------------- |
| `make dev`       | Serveur (rechargement auto) + client dans le navigateur        |
| `make start`     | Build complet, puis serveur + application de bureau Electron   |
| `make dev-mock`  | Client seul, contre un serveur simulé (aucun serveur à lancer) |
| `make docker-up` | Serveur seul dans Docker (`make docker-down` pour l'arrêter)   |

Pour lancer un seul côté : `make dev-server`, `make dev-client`, `make start-server`,
`make start-client`.

### Qualité

| Commande        | Effet                                            |
| --------------- | ------------------------------------------------ |
| `make check`    | Lint + format + tests (à lancer avant chaque PR) |
| `make test`     | Tests Vitest (serveur + client)                  |
| `make coverage` | Tests avec couverture, comme la CI               |
| `make lint`     | ESLint                                           |
| `make format`   | Corrige le formatage avec Prettier               |
| `make build`    | Compile `shared`, `server` et `client`           |
| `make clean`    | Supprime les fichiers de build                   |

## Structure

```
packages/
  shared/   types et protocole WebSocket partagés (le contrat client ↔ serveur)
  server/   serveur autoritaire : moteur de jeu, salons, réseau, SQLite
  client/   application Electron + PixiJS (MVC + bus d'événements)
docs/       documentation technique
```

## Configuration du serveur

| Variable  | Défaut                | Rôle                         |
| --------- | --------------------- | ---------------------------- |
| `PORT`    | `8080`                | Port HTTP / WebSocket        |
| `DB_PATH` | `./data/bomberman.db` | Base SQLite (tables de drop) |

Vérifier que le serveur tourne : `curl http://localhost:8080/health`.

## Contribuer

GitFlow : `main` ← `release/*` ← `develop` ← `feature/*`.

1. Créer une branche `feature/ma-tache` depuis `develop` à jour.
2. Écrire des commits au format [Conventional Commits](https://www.conventionalcommits.org/fr/)
   (`feat(server): …`, `fix(client): …`).
3. Lancer `make check`, puis ouvrir une PR vers `develop` (2 approbations, dont 1 DevOps/Qualité).

La CI (GitHub Actions) exécute build → lint → format → tests à chaque push et PR.
