# Verifiche effettive

## Fase 1
- Node 24.19.0, npm 11.9.0, Python 3.12.14; Wrangler locale 4.152.0 e comando preview verificati.
- `npm ci` con cache locale: completato; lockfile riproducibile.
- Lint, 5 test API/storage e test schema/seed idempotente: superati.
- `npm run build`: TypeScript e Vite superati; asset in `dist/`.
- Migrazione D1 locale e seed: applicati (24 immagini sintetiche).
- `npx wrangler deploy --dry-run --outdir .wrangler/dry-run`: superato. Binding DB locale, ASSETS, DATA_MODE demo; nessuna pubblicazione.
- Worker locale avviato su porta 8787; asset, navigazione, health, categorie, errore API JSON e admin protetto controllati via HTTP.
- Ambiente sandbox: cache npm in `/tmp/real-or-slop-npm`, `XDG_CONFIG_HOME=/tmp/real-or-slop-config` per i log Wrangler; nessuna modifica a HOME.
- Nessun browser scaricato, nessuna certificazione visuale Android/desktop fisico.
- Preview remota non ancora eseguita; configurazione Cloudflare e risorse di test da verificare. Nessun deploy, merge, DNS o billing.
