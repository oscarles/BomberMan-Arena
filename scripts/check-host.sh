#!/usr/bin/env bash
# Vérifie qu'un PC (ex. un PC à la maison transformé en serveur) est prêt à héberger le jeu.
# À lancer SUR la machine serveur, depuis la racine du dépôt : `make check-host`.
# Le test final « depuis Internet » doit être lancé depuis un AUTRE réseau (voir la fin).
set -uo pipefail

PORT="${PORT:-8080}"
FAILS=0
WARNS=0

ok() { printf '  \033[32m✔\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; WARNS=$((WARNS + 1)); }
fail() { printf '  \033[31m✘\033[0m %s\n' "$1"; FAILS=$((FAILS + 1)); }
section() { printf '\n\033[1m%s\033[0m\n' "$1"; }
# Réessaie pendant 15 s : le serveur peut mettre quelques secondes à démarrer.
reachable() {
  for _ in $(seq 1 15); do
    curl --noproxy "*" -fsS -m 2 "$1" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

section "1. Docker"
if ! command -v docker >/dev/null 2>&1; then
  fail "Docker absent : curl -fsSL https://get.docker.com | sudo sh"
elif ! docker info >/dev/null 2>&1; then
  fail "Docker installé mais inaccessible (démon arrêté, ou utilisateur hors du groupe docker)"
else
  ok "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null)"
  if docker compose version >/dev/null 2>&1; then ok "docker compose disponible"
  else fail "docker compose absent (plugin compose à installer)"; fi
  if [ -n "$(docker compose ps --status running -q server 2>/dev/null)" ]; then
    ok "Conteneur du serveur en cours d'exécution"
    policy=$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$(docker compose ps -q server)" 2>/dev/null)
    [ "$policy" = "unless-stopped" ] || [ "$policy" = "always" ] \
      && ok "Redémarrage automatique : $policy" \
      || warn "Pas de redémarrage automatique (policy : ${policy:-aucune})"
    if systemctl is-enabled docker >/dev/null 2>&1; then ok "Docker démarre au boot"
    else warn "Docker ne démarre pas au boot : sudo systemctl enable docker"; fi
  else
    fail "Serveur non démarré : docker compose up -d --build"
  fi
fi

section "2. Port $PORT"
if command -v ss >/dev/null 2>&1; then
  listen=$(ss -ltnH "sport = :$PORT" 2>/dev/null)
  if [ -z "$listen" ]; then fail "Rien n'écoute sur le port $PORT"
  elif echo "$listen" | grep -qE '(0\.0\.0\.0|\*|\[::\]):'"$PORT"; then ok "Écoute sur toutes les interfaces"
  else fail "Écoute seulement en local ($(echo "$listen" | awk '{print $4}' | head -1)) : injoignable depuis le réseau"; fi
fi
if reachable "http://localhost:$PORT/health"; then ok "http://localhost:$PORT/health répond"
else fail "http://localhost:$PORT/health ne répond pas"; fi

section "3. Pare-feu"
if command -v ufw >/dev/null 2>&1 && sudo -n ufw status >/dev/null 2>&1; then
  status=$(sudo -n ufw status)
  if echo "$status" | grep -q "inactive"; then ok "ufw inactif"
  elif echo "$status" | grep -qE "^$PORT(/tcp)?\s+ALLOW"; then ok "ufw autorise le port $PORT"
  else fail "ufw bloque le port $PORT : sudo ufw allow $PORT/tcp"; fi
else
  warn "Pare-feu non vérifié (ufw absent ou sudo requis) : vérifier que le port $PORT/tcp est ouvert"
fi
if grep -qi microsoft /proc/version 2>/dev/null; then
  warn "WSL détecté : le PC Windows doit aussi ouvrir le port (pare-feu Windows, en PowerShell admin) :"
  echo "      New-NetFirewallRule -DisplayName Bomberman -Direction Inbound -Protocol TCP -LocalPort $PORT -Action Allow"
  warn "WSL2 en mode NAT n'est pas joignable depuis le réseau : activer networkingMode=mirrored dans .wslconfig"
fi

section "4. Réseau local"
LAN_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") print $(i+1)}')
if [ -n "$LAN_IP" ]; then
  ok "IP locale : $LAN_IP"
  if reachable "http://$LAN_IP:$PORT/health"; then ok "Joignable via l'IP locale (même Wi-Fi : ws://$LAN_IP:$PORT)"
  else fail "Injoignable via l'IP locale $LAN_IP:$PORT (pare-feu ?)"; fi
  if ip -4 addr show 2>/dev/null | grep -q "dynamic"; then
    warn "IP locale attribuée par DHCP : réserver $LAN_IP dans la box, sinon la redirection de port cassera"
  fi
else
  fail "IP locale introuvable"
fi

section "5. Accès depuis Internet"
# Interroge un service externe (ipify) pour connaître l'IP publique de la box.
PUBLIC_IP=$(curl -fsS -m 5 https://api.ipify.org 2>/dev/null)
if [ -n "$PUBLIC_IP" ]; then
  ok "IP publique de la box : $PUBLIC_IP"
  warn "Comparer avec l'IP WAN affichée dans l'interface de la box : si elle diffère, ou commence par"
  echo "      100.64 à 100.127, la box est derrière un CGNAT → redirection de port impossible"
  echo "      (demander une IP publique full-stack à l'opérateur, ou utiliser Tailscale / un tunnel)."
  warn "IP publique souvent dynamique chez les particuliers : prévoir un DNS dynamique (DuckDNS…)"
else
  warn "IP publique non déterminée (pas d'accès à api.ipify.org)"
fi

section "6. Disponibilité"
if command -v systemctl >/dev/null 2>&1; then
  if [ "$(systemctl is-enabled sleep.target 2>/dev/null)" = "masked" ]; then ok "Mise en veille désactivée"
  else warn "Le PC peut se mettre en veille : sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target"; fi
fi

section "7. Partie de test (en local)"
if npm run --silent smoke -w @bomberman/server -- "ws://localhost:$PORT" >/tmp/bomberman-smoke.log 2>&1; then
  ok "Une partie à 2 joueurs se joue (détails : /tmp/bomberman-smoke.log)"
else
  fail "La partie de test échoue :"; sed 's/^/      /' /tmp/bomberman-smoke.log
fi

printf '\n\033[1mBilan : %d échec(s), %d avertissement(s)\033[0m\n' "$FAILS" "$WARNS"
cat <<EOF

Étape manuelle indispensable — depuis un AUTRE réseau (ex. un PC en partage de connexion 4G) :
  1. Dans la box : rediriger le port TCP $PORT vers ${LAN_IP:-<IP locale>}:$PORT
  2. Lancer : make smoke URL=ws://${PUBLIC_IP:-<IP publique>}:$PORT
  (le test depuis la maison elle-même n'est pas fiable : beaucoup de box ne gèrent pas le « NAT loopback »)

EOF
[ "$FAILS" -eq 0 ]
