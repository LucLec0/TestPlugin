#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-8080}"

echo "[survivor] Démarrage du serveur local sur http://localhost:${PORT}"
echo "[survivor] Ouvre cette URL dans ton navigateur."
PORT="$PORT" exec node server.js
