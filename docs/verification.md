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

## Fase 4 — stato finale locale
- Node 24.19.0, Python 3.12.14, Vite 8.3.5, Wrangler 4.152.0; build frontend e Worker verificata con tsconfig separati, asset effettivi in dist/.
- Suite finale: lint, **9 test Node e 9 test Python** superati. Fixture non vuote per tutti i sei provider, test retry 429, schema, indici univoci, seed idempotente e statistiche comuni solo/PvP.
- `npm run test:integration` avvia un Worker locale distinto sulla porta 8788 con stato in `.wrangler/integration`, applica migrazioni/seed ed esegue controlli HTTP di navigazione/asset, moderazione, sessioni e due client WebSocket reali.
- PvP verificato: stessa immagine e deadline, nessuna soluzione prima di entrambe le risposte, invii duplicati e round obsoleti rifiutati, riconnessione e scadenza con Durable Object alarm; risultati persistiti D1. Nessun browser aggiuntivo scaricato.
- Moderazione: autenticazione, caricamento privato, conferme editoriali, licenze ambigue non approvabili, decisioni concorrenti con singola transizione audit. Metadati IA includono data e dichiarazione proprietario.
- Tre migrazioni D1 locali; indice SHA-256 e vista statistiche per partite solo/PvP. Backup D1 esportato e ripristinato su un nuovo stato locale: almeno 24 immagini e nessuna violazione di chiave esterna.
- `npx wrangler deploy --dry-run --outdir .wrangler/dry-run` superato: ASSETS, DB locale, R2 locale approvato/quarantena e ROOMS GameRoom con migrazione **new_sqlite_classes**. Nessuna distribuzione remota.
- Guardia preview testata: rifiuta binding mancanti, segnaposto o risorse uguali a produzione. Configurazione attiva volutamente priva di ID DB/bucket preview reali. Esempi separati con segnaposto in docs/preview.example.jsonc.

## Passaggi ancora necessari nell’account reale
- L’ultima lettura del runtime non espone CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID né una regola per api.cloudflare.com. `wrangler whoami` risponde non autenticato; non è stato avviato un login interattivo o un account temporaneo.
- Associare il segreto alla configurazione dell’ambiente e verificare account/permessi. Poi identificare o configurare risorse **di test** D1/R2 e Worker Previews senza avviare la produzione. Nessun ID o URL remoto inventato.
- Verificare isolamento DO e binding sul vero URL di preview con due client; verificare quote Free e possibili condizioni R2 prima di eventuali attivazioni. Il dry-run locale non certifica queste operazioni.
- Raccogliere e revisionare un catalogo reale con prove/licenze e immagini IA del proprietario. Tutti gli asset della demo sono sintetici, con etichette simulate; nessun archivio esterno è stato importato live.
- Test visuali su dispositivi Android/desktop fisici, definizione dei contatti privacy e conservazione prima del lancio pubblico.
- Quattro branch/PR dipendenti con destinazione main; nessun merge, auto-merge, push diretto a main, deploy produzione, Workers Builds, billing o DNS modificato. Il piano di rilascio e rollback è in docs/cloudflare.md.

## Correzione del deployment Cloudflare

- Repository riletto con fetch remoto: main al commit `a5a04d0` contiene solo README.md. La versione applicativa disponibile è il branch codex/04-pvp-cloudflare, commit `0a4752b`, con Vite 8.3.5, TypeScript e Worker API. La correzione parte da quel codice e non converte l’app in un sito statico differente.
- Configurazione preservata: name real-or-slop, compatibility_date 2026-10-25, entry worker/index.ts, assets ASSETS in ./dist, routing API/SPA e binding dati. Output Vite esplicito in vite.config.ts e hook Wrangler `build.command: npm run build`.
- `npm ci` da lockfile, lint, 9 test Node + 9 Python e build superati. La build verifica `dist/index.html`, il JS e il CSS compilati referenziati dall’HTML.
- Rimossa esclusivamente la cartella generata dist; `npx wrangler deploy --dry-run --outdir .wrangler/dry-run` ha eseguito l’hook, ricreato index/JS/CSS e preparato il pacchetto con successo. Nessun file sorgente o credenziale pubblicato.
- CI aggiornata per ripetere questo controllo senza dist preesistente. Integrazione locale di navigazione/asset, admin, sessioni e due client PvP eseguita con stato isolato.
- Dashboard: conservare repository/integrazione esistenti, main e root /; impostare Build command npm run build al posto di None, lasciare Deploy command npx wrangler deploy. L’hook protegge anche l’invocazione diretta senza build separata; con build esplicito la verifica viene ripetuta nel deploy.
- Non sono stati modificati dashboard, segreti, risorse cloud o main; nessun merge o deploy remoto. Prima del rilascio dell’app completa verificare i binding D1/R2/DO reali: quelli con nomi local non dimostrano risorse remote configurate.
