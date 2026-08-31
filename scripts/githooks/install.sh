#!/usr/bin/env bash
# install.sh — Instala os githooks do projeto.
# Uso: bash scripts/githooks/install.sh

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOKS_DIR="$PROJECT_ROOT/scripts/githooks"
GIT_HOOKS="$PROJECT_ROOT/.git/hooks"

echo "Instalando githooks de $HOOKS_DIR em $GIT_HOOKS ..."

for hook in "$HOOKS_DIR"/*; do
  [ -f "$hook" ] || continue
  name=$(basename "$hook")
  cp "$hook" "$GIT_HOOKS/$name"
  chmod +x "$GIT_HOOKS/$name"
  echo "  [OK] $name"
done

echo "Pronto. Os hooks serao executados automaticamente a cada git commit."
