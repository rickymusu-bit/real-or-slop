# Real or Slop

Gioco per distinguere immagini autentiche documentate da immagini create con IA dal proprietario. La demo usa esclusivamente illustrazioni geometriche originali con **etichette simulate**: non è un archivio verificato.

Node 24 (`.nvmrc`), Python 3.12 per pipeline e test schema. TypeScript, Vite, Worker Static Assets/API, D1 locale; adapter R2 pronto, nessuna risorsa remota richiesta.

```sh
npm ci
npm run db:migrate
npm run db:seed
npm run dev
# http://localhost:8787
npm run lint
npm test
npm run build
npx wrangler deploy --dry-run --outdir .wrangler/dry-run
```

```text
Browser → Vite dist/ → Worker router → D1 (catalogo, audit, sessioni)
                                   → storage adapter (demo / R2)
Python offline → quarantena privata → revisione autenticata → catalogo approvato
```

La build esegue TypeScript e Vite, produce `dist/` (configurato in `vite.config.ts`) e verifica che `index.html` e tutte le risorse locali referenziate siano presenti; l'entry Worker è `worker/index.ts`. `/api/*` attraversa sempre il Worker e non restituisce il fallback SPA. Le risposte non sono incluse negli asset frontend. `/admin` e `/api/admin/*` verificano un token server-side: disabilitati se non configurato. Nessun segreto frontend.

## Cloudflare Workers Builds (integrazione GitHub esistente)

| Impostazione | Valore |
|---|---|
| Repository | `rickymusu-bit/real-or-slop` |
| Branch produzione | `main` |
| Directory | `/` (radice del repository) |
| Node | 24 |
| Build | `npm run build` |
| Deploy demo attuale | `npm run deploy:demo` **solo per il rilascio approvato** |
| Preview branch/PR | `npx wrangler preview` |

Impostare **Build command: `npm run build`** al posto di `None`. Per la demo attuale impostare **Deploy command: `npm run deploy:demo`**, mantenendo branch `main` e root `/`; vedere la sezione demo senza R2 sotto. Per Workers l’output è configurato in `wrangler.jsonc` con `assets.directory: "./dist"`, non cambiando la root in `/dist`. Non pubblicare la `index.html` sorgente: fa riferimento a TypeScript da compilare.

Wrangler esegue anche un hook `build.command: "npm run build"`: un deploy da checkout pulito ricrea `dist/` prima del packaging, anche se il comando build della dashboard è ancora `None`. Con il build esplicito in dashboard la compilazione viene ripetuta intenzionalmente prima del deploy, per verificare gli asset effettivamente inclusi. `dist/` resta generata e ignorata da Git; non servono token nei file del progetto.

Al momento della diagnosi, `main` al commit `a5a04d0` conteneva solo `README.md`: l’app TypeScript/Vite + Worker è nella PR #4. La correzione mantiene quell’architettura e ne include i commit; serve portare il codice applicativo su main tramite revisione e merge approvato. Modificare soltanto la dashboard mentre main contiene solo il README non può produrre un sito. Vedere [diagnosi e impostazioni](docs/cloudflare.md#correzione-del-rilevamento-degli-asset).

Wrangler 4.152.0 fissato nel lockfile (minimo richiesto dalle specifiche: 4.135.0). Non usare deploy per ottenere preview. La configurazione attiva non contiene ID o bucket inventati: il D1 principale usa l’ID reale confermato dal proprietario; il profilo local usa invece gli emulatori. Prima della preview assegnare risorse di TEST verificate al blocco `previews`; verificare schema effettivo Wrangler. Account, autorizzazioni e quote devono essere configurati dal proprietario. L’integrazione GitHub–Cloudflare esistente viene mantenuta. Le modifiche a main possono avviare il rilascio: il merge richiede approvazione esplicita anche per la pubblicazione.

Piano Workers Free; nessun upgrade o billing autorizzato. D1, R2 Standard e build hanno quote separate. Superare le franchigie R2 può costare; non attivare automaticamente. Dominio personalizzato facoltativo, DNS e acquisti separati.

## Dati e privacy

Niente dati identificativi obbligatori. Sessioni anonime, nickname facoltativo; nessun analytics o cookie pubblicitario. Fonte/licenza/spiegazione soltanto dopo la risposta. Crediti delle immagini pubbliche devono rispettare attribuzioni e share-alike. Le immagini IA del catalogo futuro sono create per un gioco di fantasia. Informativa nell'app. Prima di un lancio pubblico definire titolare, contatti e tempi di conservazione effettivi.

Specifiche versionate in `docs/specification-v1.1.0.md`. Versione app distinta: vedere `CHANGELOG.md`. Le PR #10 e #11 sono state integrate dopo approvazione esplicita; il tema Digital Gallery successivo resta in una PR in bozza. Nessun comando di deploy eseguito in questa fase.

## Digital Gallery (0.9.0)

Tema scuro con palette REAL turchese / SLOP viola, Space Grotesk Bold e Inter
locali con licenza OFL, immagini integre e pulsanti simmetrici. Le API mantengono
`REAL`/`AI`. Home, impostazioni, gioco, risultati e PvP condividono il nuovo tema;
le indicazioni demo rimangono esplicite. Accessibilità da tastiera, contrasto,
progresso e movimento ridotto sono verificati in Chromium già disponibile.

`npm run test:gallery` esegue controlli browser locali e salva screenshot in
`artifacts/gallery/`. Eseguire in sequenza con le altre suite Wrangler.
[Design, font, verifiche e misure](docs/digital-gallery-v1.0.0.md).
Questa fase cambia soltanto l'interfaccia: precaricamento e preparazione dei timer
restano alla fase successiva, con comportamento server attuale invariato.

## Studio SLOP (0.8.0)

Da `/admin` aprire `/admin/slop`: concept e fatti documentati, template per
Facile/Medio/Difficile ed Esperto soltanto editoriale, prompt e spiegazione
modificabili, dati della generazione esterna, note e cronologia privata.
La generazione è manuale con strumenti esterni: nessuna API o creazione automatica.
Dopo il salvataggio si carica il file in quarantena e si usa la moderazione
esistente per approvare o rifiutare. Il revisore può correggere la spiegazione
finale con audit; modello e prompt effettivo del tentativo importato restano
congelati. Nessuna quarta difficoltà pubblica o modifica al campionamento.

Applicare prima la migrazione additiva `0005_slop_studio.sql`. La demo senza R2
consente la progettazione, ma upload e approvazione richiedono storage configurato;
questa fase verifica il flusso completo solo in locale e non crea risorse remote.
[Procedura, API, versioni e limiti](docs/studio-generazione-slop-v1.0.0.md).

## Selezione delle immagini (0.7.0)

Ogni nuova domanda usa una moneta indipendente REAL/AI al 50%: nessuna quota per
partita, compensazione o limite alle serie consecutive. Gli strati editoriali
conservano caratteristiche comparabili nel lungo periodo. Prima delle estrazioni,
il numero di round viene limitato alle capacità distinte di entrambe le classi;
non si completa una classe esaurita con l'altra. La demo (12 immagini per classe)
garantisce al massimo 12 nuove domande indipendenti. Le sessioni già assegnate
restano invariate. [Algoritmo, prova e limiti](docs/campionamento-stratificato-v2.0.0.md).
`npm run benchmark:sampling` misura frequenze, storia, varianza binomiale e
stratificazione aggregata, usando le vecchie quote soltanto come controllo negativo.

## Metadati editoriali (0.5.0)

La scheda privata in `/admin` distingue contesto rappresentato, fatti verificati
e giudizi editoriali. Ogni salvataggio conserva motivazione e snapshot con
controllo della revisione, senza approvare l'immagine o esporre indizi al
giocatore. La migrazione additiva `0004_image_curation.sql` lascia invariato il
catalogo demo e ammette immagini senza scheda. Contratto API, vocabolari,
procedura di revisione e limiti: [metadati editoriali v1.0.0](docs/metadati-editoriali-v1.0.0.md).

## Pipeline e revisione (fase 2)

Python 3.12 offline/CI, mai backend Python nel Worker:

```sh
python3 -m pipeline.run --provider commons --config pipeline/search.example.json --fixture pipeline/fixtures.json
# Solo dopo configurazione di contatto, termini, rete e destinazione:
# python3 -m pipeline.run --provider met --config pipeline/search.example.json --live
# --download è opzionale: richiede --live e download_hosts esplicitamente autorizzati.
```

Connettori separati: Commons, Openverse, Met, Library of Congress (query HABS/HAER/HALS), Smithsonian (SMITHSONIAN_API_KEY) e NASA. Ogni provider ha termini, limiti e schemi propri: validare esempi reali prima di abilitare un job. Fixture e mock non certificano l’accesso live. Massimo 50 risultati, quattro query controllate, timeout 20s, retry/backoff e User-Agent con contatto. Limiti chiamate Met/LoC maggiori perché richiedono dettagli per asset. Nessun motore generalista o scraping. Pianificazione inattiva, workflow manuale disabilitato salvo ENABLE_IMAGE_PIPELINE=true; artifact privati scadono dopo 7 giorni. Configurare destinazione di revisione e quote prima di aggiungere cron.

Quarantena `.pipeline/` privata e ignorata da Git. Deduplica fonte/URL prima del download, SHA-256 dopo download, dHash percettivo solo come suggerimento. Non rimuovere crediti: gli originali restano integri, il download crea un derivato WebP dell’intero fotogramma (massimo 1600 px), conservando originale, prove e attribuzioni in quarantena. Verificare gli obblighi editoriali prima di approvare; nessun credito visibile viene ritagliato. I metadati di provenienza non sono incorporati nel file pubblico per evitare spoiler: restano nel database e vengono mostrati dopo la risposta. Nessuna etichetta REAL approvata automaticamente. Met richiede isPublicDomain sul singolo asset; NASA e istituzioni pubbliche non implicano diritti liberi. CC0/PD verificato, CC BY/SA richiedono prove e obblighi corretti; ambigui restano in revisione.

Admin: configurare un token casuale >=32 caratteri in `.dev.vars` (mai committarlo): `ADMIN_TOKEN=...`. Aprire `/admin`; autenticazione HTTP Basic (utente `admin`, password token), sempre HTTPS fuori localhost. API supporta anche Bearer. Import JSON con: type, title, description, author, source_url, source_id, provider, license_name, license_url, evidence, explanation, categories (ID), difficulty; per AI anche ai_model, ai_prompt, generation_date (YYYY-MM-DD), owner_declaration=true. I contenuti e gli eventi inventati devono essere verificati dall’editore prima dell’approvazione. Il file JPEG/PNG/WebP va caricato separatamente; SVG non accettati. Il menu privato consente filtri, prove, licenza, modifica categorie/difficoltà e audit della decisione. Protezione server-side su pagina, API e upload.

I bucket `*-local` sono dichiarati soltanto nel profilo env.local e vengono usati con --local --env local, non nel deploy remoto. L’approvazione copia soltanto dallo storage quarantena allo storage approvato dell’ambiente corrente; non avvia deploy/import produzione. Le fixture demo e il catalogo verificato sono separati dal campo `demo`.

## Allenamento e A tempo (fase 3)

Categorie multiple e sottocategorie, difficoltà, 1–50 domande in allenamento o 60/120/180 secondi a tempo. Il server campiona senza ripetizioni con etichette REAL/AI indipendenti al 50% per domanda; limita preventivamente la lunghezza o segnala catalogo insufficiente. Le sessioni usano D1 e un cookie tecnico HttpOnly/SameSite, Secure in HTTPS. L’ID nel sessionStorage serve solo a ritrovare la partita: da solo non autorizza letture o risposte. Timestamp, assegnazione domande, scadenza, punteggio (100/corretta, 0/errata) e replay sono validati nel Worker/SQL. A parità conta il minor tempo totale di risposta. Nessuna classifica pubblica o nickname raccolto per il gioco singolo.

API: POST `/api/sessions` con mode training/timed, count, duration, difficulty e categories; GET `/api/sessions/:id`; POST `/api/sessions/:id/answer` con roundId/choice. Solo dopo la risposta vengono inviate soluzione, spiegazione e crediti. Foto servite tramite round opachi assegnati. Doppio click/retry con stessa scelta è idempotente; una scelta diversa è rifiutata. Refresh riprende la domanda corrente; errori di rete offrono ripresa. Il countdown del browser è indicativo: alla scadenza il server rifiuta ulteriori risposte.

Statistiche private `/api/admin/stats`: conteggi per categoria e suggerimenti per immagine da almeno 30 risposte. Nessun cambio automatico della difficoltà. Risposte in categorie multiple possono contribuire a più aggregazioni. Test HTTP aggiuntivi: con Wrangler locale attivo, `python3 tests/game.integration.py` (modifica soltanto una sessione D1 locale per verificare la scadenza, mai risorse remote).

## PvP e consegna (fase 4)

Aprire `/pvp` in due schede o browser: creare stanza, copiare il codice di 12 caratteri, entrare dal secondo client e avviare dall’host. Entrambi vedono stessa immagine e scadenza; la soluzione rimane sul server fino a entrambe le risposte o timeout. D1 conserva sfida, giocatori anonimi, risposte e risultati. DO usa backend SQLite e WebSocket hibernation; HTTP consente ripresa durante le disconnessioni. Non rispondere costa il tempo massimo del round, i punti dipendono solo dalla correttezza. Il token stanza è privato della scheda e non compare negli URL.

```sh
npm run test:integration
python3 scripts/local-data.py backup
python3 scripts/local-data.py restore-test
```

L’integrazione avvia un Worker con stato **locale isolato** sulla porta 8788 e prova anche due veri client WebSocket con riconnessione e timeout. Nessun browser aggiuntivo necessario. Dati test in `.wrangler/integration`; log privati in `artifacts/`. I test schema/API e `npm run build` restano separati dalla pipeline Python.

Configurazione anteprime, credenziali, guardia sui binding, backup e rilascio in [docs/cloudflare.md](docs/cloudflare.md). `node scripts/check-preview.mjs` blocca volontariamente le preview finché non sono indicati DB/bucket di test verificati. Il modello con segnaposto è separato dalla config attiva. L’accesso Cloudflare e l’isolamento remoto non sono certificati da un test locale o dry-run.

Stato finale e limiti effettivi: [docs/verification.md](docs/verification.md). Le quattro PR iniziali erano dipendenti; lo stato delle consegne successive è riportato nel documento di verifica. Nessuna verifica locale equivale a una pubblicazione Cloudflare riuscita.


## Demo Cloudflare senza bucket R2

La demo pubblica genera SVG nel Worker e collega il D1 già creato `real-or-slop-local` (ID `98a3e712-d9f9-4510-91ab-2b80329be753`, confermato dal proprietario). La configurazione principale non richiede R2. L’account ID e il database ID sono pubblici identificativi di risorse, non credenziali.

Impostare nella dashboard esistente **Build: npm run build**, **Deploy: npm run deploy:demo**, branch main e root /. Il rilascio demo applica schema e fixture idempotenti al D1 verificato, poi pubblica il Worker con provisioning automatico disabilitato. La build da sola non esegue migrazioni o seed remoti. Controllo senza rete: npm run deploy:check. Packaging senza modifiche remote: npm run deploy:demo -- --dry-run.

Il profilo locale mantiene R2 emulato per i test di moderazione; npm run dev/db:migrate/db:seed lo selezionano automaticamente con --local. I test del gioco verificano anche la demo senza binding R2. Non creare bucket a pagamento per risolvere l’errore 10085: [procedura e limiti](docs/cloudflare.md#demo-remota-senza-r2--correzione-errore-10085).
