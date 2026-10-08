#!/bin/sh
# Déploie le serveur sur le Pi : copie les fichiers, reconstruit, redémarre. Les données restent.
set -e
cd "$(dirname "$0")"
ssh rby 'mkdir -p ~/apps/pdfshock-api/data && touch ~/apps/pdfshock-api/.env'
scp server.mjs Dockerfile compose.yml rby:~/apps/pdfshock-api/
ssh rby 'cd ~/apps/pdfshock-api && docker compose up -d --build && sleep 2 && curl -fsS http://127.0.0.1:5181/health'
