#!/usr/bin/env bash
# Construit l'image Docker du serveur, la démarre sur un port libre et y joue une partie de test.
# Prouve que l'image se construit et fonctionne avant de la déployer : `make docker-smoke`.
set -euo pipefail

IMAGE="bomberman-arena-server:smoke"
NAME="bomberman-smoke-$$"
PORT="${SMOKE_PORT:-18080}"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▶ Construction de l'image $IMAGE"
docker build -t "$IMAGE" .

echo "▶ Démarrage du conteneur sur le port $PORT"
docker run -d --name "$NAME" -p "$PORT:8080" "$IMAGE" >/dev/null

echo "▶ Attente de /health"
healthy=false
for _ in $(seq 1 30); do
  # --noproxy : un proxy d'entreprise/université intercepterait même localhost.
  if curl --noproxy '*' -fsS -m 2 "http://localhost:$PORT/health" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  if [ "$(docker inspect -f '{{.State.Running}}' "$NAME")" != "true" ]; then
    echo "✘ Le conteneur s'est arrêté :"; docker logs "$NAME"; exit 1
  fi
  sleep 1
done
if [ "$healthy" != true ]; then
  echo "✘ /health ne répond pas après 30 s :"; docker logs "$NAME"; exit 1
fi

npm run --silent smoke -w @bomberman/server -- "ws://localhost:$PORT" || { docker logs "$NAME"; exit 1; }
