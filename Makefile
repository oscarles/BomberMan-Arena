# Raccourcis pour les scripts npm du monorepo. `make help` liste les cibles.
.DEFAULT_GOAL := help
.PHONY: help install build lint format test coverage check dev docker-up docker-down clean

install: ## Installe les dépendances (npm ci)
	npm ci

build: ## Compile shared puis server
	npm run build

docker-up: ## Construit et démarre le serveur dockerisé
	docker compose up --build

docker-down: ## Arrête le conteneur
	docker compose down