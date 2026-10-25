# Preview e rilascio guidato

L’integrazione GitHub–Cloudflare esistente è mantenuta. Questa correzione non la sostituisce, non modifica credenziali e non avvia merge o deploy remoti. Le risorse cloud restano da verificare separatamente; non usare un deploy di produzione per sbloccare una preview.

## Correzione del rilevamento degli asset

Diagnosi sul contenuto effettivo del repository: `main` al commit `a5a04d0` contiene soltanto README.md. Mancano package.json, lockfile, index.html e wrangler.jsonc. Il messaggio “Could not detect a directory containing static files” è coerente con un deploy eseguito da quel branch. L’app esistente nella PR #4 usa **TypeScript/Vite + Worker API**, non è un sito HTML statico pronto da caricare senza compilazione.

La PR di correzione parte dall’app della PR #4 e ha destinazione main: include pertanto anche i commit applicativi ancora da revisionare. Nessun merge è stato eseguito. Dopo che il codice sarà approvato e presente nel branch collegato, la build deve generare gli asset prima del deploy.

| Impostazione dashboard | Valore |
| --- | --- |
| Repository | rickymusu-bit/real-or-slop, collegamento esistente |
| Production branch | main |
| Root directory | / |
| Build command | npm run build (al posto di None) |
| Deploy command | npx wrangler deploy (invariato) |
| Node | 24, come .nvmrc |
| Output asset | dist, tramite assets.directory in wrangler.jsonc |

Non cambiare root directory in `/dist`, non usare la index.html sorgente e non aggiungere un secondo hosting. Vite emette `dist/index.html` con JS/CSS compilati in `dist/assets/`. Il controllo eseguito da npm run build verifica la presenza di index e risorse locali referenziate. Wrangler mantiene entry worker/index.ts, binding ASSETS, routing API/SPA, compatibility_date e binding D1/R2/DO.

`build.command` in Wrangler esegue npm run build anche quando si invoca direttamente npx wrangler deploy senza dist preesistente. Con il build esplicito in dashboard la build viene ripetuta durante il deploy: è una verifica deliberata del contenuto del pacchetto, senza migrazioni o pubblicazioni nello script build. CI cancella dist e controlla che il dry-run lo ricrei. Il dry-run non pubblica il Worker.

La correzione risolve la generazione e individuazione degli asset. I binding con suffisso local sono ancora emulatori, non risorse remote: prima di un rilascio dell’app completa verificare separatamente D1, R2 e DO nell’account esistente. Non inventare ID o creare automaticamente risorse; un dry-run riuscito non dimostra che questi binding remoti siano pronti.

## Accesso

Nel pannello Cloudflare: profilo → My Profile → API Tokens → Create Token. Usare un token limitato all’account e alle operazioni necessarie (modello Edit Cloudflare Workers come base); estendere a D1/R2 solo quando necessari. Nel runtime configurare CLOUDFLARE_API_TOKEN come segreto, CLOUDFLARE_ACCOUNT_ID come variabile e consentire api.cloudflare.com. Un segreto nel catalogo di rete deve anche essere associato alla configurazione dell’ambiente; salvarlo nel catalogo non garantisce un binding runtime. Non inserire token in chat/Git. `npx wrangler whoami` deve riconoscere l’account senza login interattivo. La prontezza del runtime non garantisce i permessi per ciascuna operazione.

## Preview

1. Verificare Workers Free e risorse disponibili nel proprio account, senza upgrade/billing. Configurare Worker Previews dal pannello per real-or-slop **senza avviare un deploy produzione**. Se la piattaforma richiede un primo rilascio del Worker, fermarsi e richiedere l’approvazione esplicita: non aggirarlo.
2. D1 e R2 di test devono essere esplicitamente identificati. I nomi `*-local` nella configurazione attiva sono solo emulatori, non risorse create. Gli ID non sono segreti, ma non devono essere inventati. Configurare previews.d1_databases e previews.r2_buckets usando risorse verificate di test; mantenere la quarantena privata. Il blocco previews non eredita automaticamente binding non ereditabili dal livello principale.
3. Il file `docs/preview.example.jsonc` è un modello separato con segnaposto, NON una configurazione eseguibile. Ricopiare i binding verificati nel blocco previews del file effettivo. Creare una configurazione di migrazione dedicata al DB test, verificando che lo stesso ID compaia nel binding della preview. Usare `scripts/check-preview.mjs` per rifiutare segnaposto e risorse uguali a produzione prima di ogni migrazione remota.
4. Solo dopo aver verificato la destinazione, applicare migrazioni/seed di TEST usando quella configurazione dedicata. Nessuna migrazione remote con la configurazione principale implicita. Se più preview condividono lo stesso ID/bucket, condividono dati: documentare staging comune o risorse per PR. I test distruttivi richiedono risorse per PR isolate.
5. Wrangler locale 4.152.0 include `npx wrangler preview`; verificati help e schema installati, che ammettono previews.durable_objects. Usare DO SQLite (`new_sqlite_classes`) e verificare l’isolamento reale dello stato su ciascuna preview. Non usare Version URLs come garanzia di isolamento. Pubblicare con `npx wrangler preview --ignore-base-config` soltanto da config completa e controllata: evita di ereditare binding inattesi dal dashboard. Impostare un ADMIN_TOKEN distinto tramite `wrangler preview secret`, mai quello di produzione.
6. Verificare URL effettivo, asset/API, 404 JSON, admin negato senza autenticazione, sessioni e due client PvP sullo stesso URL. Consegnare URL/commit solo dopo prova riuscita. In assenza di accessi rimane la demo locale.

## Produzione: richiede approvazione

- Repository rickymusu-bit/real-or-slop, branch main, directory radice, Node 24, build `npm run build`, deploy `npx wrangler deploy`.
- Preparare account, login admin, catalogo editoriale e privacy effettivi, quote Workers/DO/D1/Actions/build. R2 Standard ha franchigie e condizioni proprie: nessuna attivazione di fatturazione implicita. Workers Free non significa risorse illimitate.
- Separare config e segreti produzione da preview; DATA_MODE=production esclude tutte le fixture. Aggiornare DB e bucket con destinazioni verificate soltanto dopo autorizzazione per le risorse di produzione. Per asset approvati conservare crediti/licenza, backup originali e chiavi opache.
- L’approvazione deve coprire **merge e pubblicazione** se il merge su main attiva Workers Builds. Nessun auto-merge. Se il collegamento avvia un deploy iniziale, serve la stessa approvazione prima di collegarlo.
- Dopo approvazione: un solo flusso concordato (Workers Builds da main oppure deploy manuale dal commit approvato). Usare workers.dev. DNS, domini e acquisti restano separati e facoltativi.

## Backup e ripristino

`python3 scripts/local-data.py backup` esporta il DB locale in `.wrangler/backups/metadata.sql`. `restore-test` ripristina in un nuovo stato locale separato e verifica lo schema. Questi comandi non hanno una modalità remota. Gli oggetti R2 restano fuori dal DB: copia/versionamento degli originali e inventario SHA-256 devono essere predisposti separatamente prima di un import reale. Le fixture sono rigenerabili da seed e renderer; i file di quarantena `.pipeline` vanno conservati privatamente.

Prima di ogni migrazione remota autorizzata: esportare D1 con config e ID verificati, salvare inventario oggetti e originali R2, provare restore su test. Migrazioni additive e compatibili con la versione precedente prima di rimuovere campi. Rollback del Worker non ripristina né D1 né R2. Ripristinare metadati e oggetti coerenti da backup soltanto in finestra approvata; mantenere le versioni precedenti dei file finché serve tornare indietro.

## PvP e quote

Stanza privata di due giocatori, codice casuale 60 bit, scadenza 30 minuti. Stato DO SQLite; risultati D1, immagini R2 o fixture. WebSocket hibernation, massimo due connessioni per giocatore, rate limit su creazione/ingresso e messaggi, timeout con alarm server-side. HTTP di ripresa solo durante perdita WebSocket (circa una richiesta ogni 2,5 secondi/client): usare con moderazione nelle quote Free. Risposte 429/503 mostrano un errore e consentono ripresa; nessun upgrade automatico. I timeout contano come risposta errata e tempo massimo; parità per punti, poi tempo totale minore. Una parità esatta resta parità.

Riconnessione nella stessa scheda tramite token in sessionStorage; il token non contiene soluzioni e non viene incluso negli URL. WebSocket trasmette il token nel subprotocollo, HTTP nel bearer header. Nessuna classifica pubblica o raccolta email. Cambiare browser senza token richiede una nuova stanza. La funzionalità remota e l’isolamento DO restano da verificare nell’account reale.
