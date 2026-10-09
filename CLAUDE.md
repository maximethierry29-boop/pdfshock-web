# PDFShock web — contexte projet

Site https://pdfshock.com : compresse un PDF existant directement dans le navigateur (MuPDF.js en
Web Worker), seules les images sont recompressées, texte et vecteurs intacts. Le fichier ne quitte
jamais l'appareil. Mini-jeu du sorcier pendant la compression, classement partagé via
https://api.pdfshock.com (serveur dans `server/`, hébergé sur un Raspberry Pi).

## Commandes

```bash
npm install
npm run dev        # Vite, port 5174 (config preview « pdfshock-web »)
npm run build      # dist/
npm test           # compression d'un deck synthétique, 3 presets
npm run test:game  # chaque obstacle du jeu est franchissable
npm run skin       # art/skin-*-source.jpg → public/skin-*.png (pixel art)
server/deploy.sh   # copie server/ sur le Pi et relance le conteneur
```

Déploiement du site : chaque push sur `main` part en production sur Cloudflare Pages (~70 s).
Ne pousser sur `main` que du testé ; une autre branche donne une URL d'aperçu.

## Architecture

- `src/main.js` — parcours : dépôt, preset, « Zap it », phrases d'attente du sorcier, résultat, jeu.
- `src/worker.js` + `src/compress.js` — moteur MuPDF : presets `HIGH` 300 ppi / `BALANCED` 110 /
  `SMALL` 72, taille affichée mesurée par image, CMJN/ICC conservés, données d'éditeur supprimées,
  SMask recompressés (Flate mesuré via fflate).
- `src/game-core.js` (logique pure, testée) et `src/game.js` (rendu canvas, Hall of zappers).
- `src/api.js` — classement et compteurs ; n'envoie rien hors des domaines de production.
- `server/server.mjs` — Node sans dépendance : /scores, /track, /stats (jeton Cloudflare Access vérifié).
- `index.html` — page unique, styles inline ; `public/` : skins, favicon, `legal.html`, `_headers`.

## Décisions à respecter

- Garder la DA bleu nuit d'origine ; le sorcier n'habille que les marges (fond assombri sur mobile).
- MuPDF.js est AGPL : le dépôt reste public et le lien vers le code reste dans le pied de page.
- Libérer explicitement les objets MuPDF (`destroy`) : la mémoire WASM sature sinon.
- `public/legal.html` et `public/_headers` (CSP) appartiennent à la conversation « PDFShock sécurité
  et légal » ; ne pas les retoucher ailleurs, seulement vérifier qu'un changement ne casse pas la CSP.
- Fichiers client de test (`test/bw`, `test/booster`, PDF et PNG de `test/`) ignorés par git, jamais publiés.
- `.env.development.local` (API locale) ne doit jamais devenir `.env.local` : il fuirait dans le build.
- UI en anglais, commentaires et docs en français.
