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
- Tirage des objets à partir d'une table de probabilités (`DropTable`), persistée en base SQLite
  (`node:sqlite`, `packages/server/src/persistence/dropTableRepository.ts`)
- Lobbies (`packages/server/src/lobby`) : création publique/privée (code d'invitation), réglages hôte bornés,
  couleur de personnage, promotion d'un nouvel hôte, persistance du salon entre deux parties
- Session multi-manches (`GameSession`) : enchaîne les manches, calcule les victoires et le classement final
- Serveur WebSocket (`ws`, `packages/server/src/net/GameServer.ts`) : validation des trames, routage
  lobby/partie, boucle de jeu centralisée
- Tests unitaires (lobby, session, moteur, persistance) et test d'intégration WebSocket bout en bout
  (`MOVE` → `POSITION_UPDATED`, rejet `NOT_HOST`)

Reste à faire :

- Client Electron / PixiJS, menus, settings, SFX, exécutable natif
- Documentation technique (architecture, protocole, post-mortem), JSDoc, GitFlow (`develop`, protections, PR à 2 relecteurs)
- Écran d'administration des probabilités d'objets (le `DropTableRepository` est prêt côté serveur)
