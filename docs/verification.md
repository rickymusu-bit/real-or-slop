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

## Fase 2
- Lint, 5 test Node e 6 test Python superati; pipeline CLI eseguita con fixture, deduplica URL e permanenza in revisione verificate.
- Build frontend/Worker con TypeScript separato e Wrangler dry-run superati; R2 approvato/quarantena solo locali.
- `python3 tests/moderation.integration.py` su Worker/D1/R2 locali: accesso negato, import, upload privato, blocco approvazione senza diritti, decisione e replay superati.
- Token admin casuale esclusivamente locale in `.dev.vars` ignorato da Git; nessuna credenziale Cloudflare usata.
- API istituzionali testate con mock, non interrogate live; schedule disattivato, nessun dataset esterno scaricato. Prove di autenticità e licenze reali richiedono revisione editoriale.

## Fase 3
- Lint, suite Node (API e campionamento) e 6 test Python superati; build TypeScript/Vite e dry-run Workers superati.
- `python3 tests/game.integration.py`: sessioni con cookie HttpOnly, assenza di spiegazioni/crediti prima della risposta, bilanciamento, non ripetizione, refresh stabile, invii concorrenti idempotenti, riepilogo e punteggio verificati su D1 locale.
- Scadenza forzata su una sessione di test tramite comando D1 **--local**: risposta tardiva rifiutata con 410 e sessione conclusa. Nessuna modifica remota.
- Interfaccia con tastiera, ingrandimento, timer e ripresa rete implementata; test visuale su dispositivi fisici ancora da eseguire.
