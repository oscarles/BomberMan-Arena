# BomberMan-Arena

Bomberman multijoueur en réseau (BUT 3 – Qualité de développement). Monorepo TypeScript / Node.js.

## Structure

| Package           | Rôle                                                                       |
| ----------------- | -------------------------------------------------------------------------- |
| `packages/shared` | Types, constantes et protocole WebSocket (JSON) partagés client / serveur  |
| `packages/server` | Serveur autoritaire : moteur de jeu (collisions, explosions, mort subite…) |
| `packages/client` | _À faire_ : Electron + PixiJS, pattern MVC / bus d'événements, UI mockable |

## Commandes

```bash
npm install
npm run build        # shared puis server
npm run lint         # ESLint
npm run format:check # Prettier
npm test             # Vitest
npm run coverage
docker compose up --build   # serveur (port 8080, GET /health)
```

## État d'avancement (`feat/base_du_jeu`)

Fait :

- Monorepo, ESLint + Prettier, Vitest, CI GitHub Actions (build, lint, format, tests), Dockerfile + docker-compose
- Protocole WebSocket typé (`packages/shared/src/protocol.ts`)
- Moteur de manche (`Round`) côté serveur : grille avec murs/cubes, spawn dans les coins avec zone dégagée,
  déplacements, bombes, explosions en chaîne, cubes destructibles, objets bonus/malus (rayon, bombes, vitesse,
  bombe surprise, ralentissement), vies, invulnérabilité au spawn/respawn, mort subite en spirale, fin de manche
- Tirage des objets à partir d'une table de probabilités (`DropTable`)

Reste à faire :

- Session multi-manches (victoires, leaderboard) et lobbies (public/privé + code, réglages hôte, couleur, persistance)
- Serveur WebSocket (`ws`) + boucle de jeu, validation des messages, tests d'intégration (`MOVE` → `POSITION_UPDATED`)
- Persistance BD des probabilités d'apparition des objets (`node:sqlite`)
- Client Electron / PixiJS, menus, settings, SFX, exécutable natif
- Documentation technique (architecture, protocole, post-mortem), JSDoc, GitFlow (`develop`, protections, PR à 2 relecteurs)
