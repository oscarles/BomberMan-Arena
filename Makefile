# Raccourcis pour les scripts npm du monorepo. `make help` liste les cibles.
.DEFAULT_GOAL := help
.PHONY: help install build build-shared lint format test coverage check \
	dev dev-server dev-client dev-mock start start-server start-client \
	docker-up docker-down docker-smoke smoke check-host clean

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Installe les dépendances (npm ci)
	npm ci

build: ## Compile shared, server et client
	npm run build

build-shared: ## Compile uniquement shared (requis par le serveur et le client)
	npm run build -w @bomberman/shared

lint: ## ESLint
	npm run lint

format: ## Corrige le formatage (Prettier)
	npm run format

test: ## Lance les tests (server + client)
	npm test

coverage: ## Tests avec couverture (comme la CI)
	npm run coverage

check: ## Vérifications de la CI : lint, format, tests
	npm run lint
	npm run format:check
	npm test

# --- Lancement local -------------------------------------------------------
# Les cibles qui lancent serveur + client tournent en parallèle (make -j2) :
# Ctrl+C arrête les deux processus.

dev: build-shared ## Serveur (watch, :8080) + client Vite (http://localhost:5173)
	@$(MAKE) --no-print-directory -j2 dev-server dev-client

dev-server: ## Serveur seul en mode watch (port 8080)
	npm run dev:server

dev-client: ## Client seul dans le navigateur via Vite (http://localhost:5173)
	npm run dev:client

dev-mock: build-shared ## Client seul contre le serveur simulé (hors ligne)
	npm run dev:client:mock

start: build ## Build complet puis serveur + application Electron
	@$(MAKE) --no-print-directory -j2 start-server start-client

start-server: ## Serveur buildé (port 8080)
	npm start -w @bomberman/server

start-client: ## Application Electron (client déjà buildé)
	cd packages/client && npx electron .

# --- Déploiement ------------------------------------------------------------

URL ?= ws://localhost:8080

smoke: ## Joue une partie de test contre un serveur (make smoke URL=ws://IP:8080)
	npm run --silent smoke -w @bomberman/server -- $(URL)

check-host: ## Vérifie que cette machine peut héberger le serveur (Docker, port, réseau)
	./scripts/check-host.sh

docker-smoke: ## Construit l'image Docker et y joue une partie de test
	./scripts/docker-smoke.sh

# --- Docker / nettoyage ----------------------------------------------------

docker-up: ## Construit et démarre le serveur dockerisé
	docker compose up --build

docker-down: ## Arrête le conteneur
	docker compose down

clean: ## Supprime les artefacts de build
	rm -rf packages/*/dist packages/client/dist-electron packages/client/release coverage packages/*/coverage
