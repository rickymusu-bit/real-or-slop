# Real or Slop

[Istruzioni Codex](AGENTS.md) · [Mappa canonica e contratti correnti](MASTER.md) ·
[Indice vigente/proposta/storica/archivio](docs/indice-documentazione.v1.1.0.md).
L'[audit #57](docs/audit-architettura.v1.0.0.md) distingue main dalle PR in bozza;
il [piano di integrazione](docs/piano-integrazione-editoriale.v1.0.0.md) prepara
la #56 senza adottare anticipatamente la v4.

Nuovo percorso [discovery REAL #56](docs/ricerca-real.v1.0.0.md): intenzioni
tema/emozione/intensità, strategie GPT e adattamento Commons/Openverse distinti,
query HTTP validate, dossier separati dai profili ciechi e review individuale.
`npm run benchmark:real -- --out .pipeline/real/fixture` esegue solo fixture locali;
`npm run discovery:real -- prepare --seed 56 --out .pipeline/real/run-001` prepara
un run senza rete. Il nuovo percorso richiede gate espliciti per qualsiasi
inferenza pagata e non pubblica immagini. Pipeline storiche e dati sono conservati;
le diagnostiche delle issue #44–#50 non sono prerequisiti della discovery.

Il protocollo editoriale corrente è **v3.0.0: brief condivisi**. Un brief originale,
congelato prima della ricerca, guida una candidata REAL e una SLOP generata dal
solo testo. Nessuna foto REAL, titolo o sua descrizione entra nel generatore.
Il proprietario valuta ogni immagine; il confronto affiancato si usa quando
entrambe sono disponibili. Una coppia completa non è richiesta per l'ammissione.

Tutte le immagini già trovate o generate restano conservate in attesa delle sue
selezioni. Quelle approvate entrano individualmente nel database, senza cercare
o generare un corrispondente; diritti e provenienza si verificano separatamente.

[Coda unica di revisione](docs/coda-revisione-unica.md) ·
[Protocollo di riferimento](docs/protocollo-editoriale.md) ·
[Criteri editoriali e contesto obbligatorio](docs/criteri-editoriali.md) ·
[Catalogo iniziale: 100 brief in bozza](data/editorial/briefs.v1.json) ·
[Pilota a cinque brief](docs/pilota-brief-condivisi-2026-11-04.md).

Il catalogo dei brief cresce separatamente dalle immagini: selezioni riproducibili
con preferenza per tag nuovi, cinque brief per ciclo predefinito, massimo
25 brief / 50 immagini complessive. API dirette, formato finale 1024×1024,
ritaglio assistito da Terra e profilo dei file finali. Sfondo e contesto visibile
per tutti i soggetti; le opere d'arte si mostrano intere nel proprio ambiente,
con cornice quando presente. Gallerie e confronti su Drive privato.

```sh
# Controllo locale del catalogo e preparazione di un piccolo ciclo, senza API:
python3 -m pipeline.v2.brief_catalog --check
python3 -m pipeline.v2.brief_catalog --count 5 --seed 34 --out .pipeline/v2/ciclo-001
```

I brief iniziali sono bozze originali redatte come seed editoriale, non immagini
approvate. La selezione non avvia generazioni o download. La ricerca REAL è
ancora assistita; licenze, autenticità e approvazioni restano da verificare per
ogni immagine. Nessun fine-tuning o apprendimento automatico dai voti è attivo.

Il codice dello studio usa contratti dati e archivio privato v2. Le candidate
non possono essere pubblicate dal vecchio flusso. I gate pagati e di produzione
restano disabilitati: il merge del protocollo non avvia cron, addebiti o deploy.
La [scoperta multicanale](docs/scoperta-multicanale-v2.1.0.md) è un supporto alla
ricerca; gli hit non certificano automaticamente la provenienza REAL.

Le specifiche v1/v2, il [benchmark da 200](docs/benchmark-200-risultati-2026-11-04.md),
i paragrafi sottostanti su immagini sorgenti SLOP, Batch, graduatorie, soglie e
preferenze restano **storici**, per audit e compatibilità. Non definiscono il
protocollo corrente. `npm run benchmark:editorial-v2` verifica 120 fixture locali,
non produce un nuovo lotto editoriale o risultati con giocatori.

Studio SLOP (0.14.2): apre il lotto più recente con tutte le fotografie e le
generazioni archiviate, inclusi gli scarti, affiancando ogni SLOP alla fotografia
sorgente del prompt. La coda Approva/Rifiuta contiene soltanto candidate idonee.
La creazione manuale resta disponibile in una sezione avanzata.
[Migrazione 0012 e recupero](docs/archivio-privato-generazioni-v1.0.0.md).

Pipeline OpenAI Batch (0.14.0): lotti fino a 20 fotografie, quattro fasi riprendibili
(valutazione → brief → generazione → valutazione cieca). Prima prova da due foto /
una SLOP, tetto cumulativo configurabile per rispettare i **5 USD complessivi**.
[Architettura, configurazione e avvio controllato](docs/pipeline-batch-openai-v1.0.0.md).
Migrazione additiva **0011**, non applicata da questa modifica; nessuna attivazione
pagata, nuovo cron o pubblicazione automatica. Gli invii Batch possono richiedere
24 ore per fase. La raccolta dalle fonti resta separata da OpenAI.

Revisione editoriale: `/admin` mostra un’immagine e due pulsanti, **Approva / Rifiuta**. Preparazione automatica e preferenze con esplorazione del 25%: [specifica v1.0.0](docs/revisione-visiva-preferenze-v1.0.0.md). La gestione tecnica resta in `/admin?advanced=1`. La pagina privata `/admin/similarity` verifica duplicati e possibili scene ripetute separatamente fra REAL e fra SLOP, con SHA, dHash e DINOv2, confronti affiancati, storico e scansioni incrementali: [procedura e limiti](docs/controllo-somiglianze-v1.md). Per installare il runtime CPU: `ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci`.

> Regole di gioco aggiornate: [tempi per immagine, oscuramento e PvP sospeso](docs/gioco-tempi-protezione-v1.0.0.md).
> Le nuove partite A tempo non usano più un countdown complessivo. La documentazione PvP sottostante è storica: la modalità pubblica è sospesa, codice e dati sono conservati.

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
Python offline → quarantena privata → revisione autenticata → approvazione → pubblicazione 50/50
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

Impostare **Build command: `npm run build`** al posto di `None`. Per la demo attuale impostare **Deploy command: `npm run deploy:demo`**, mantenendo branch `main` e root `/`; vedere la sezione demo con catalogo R2 sotto. Per Workers l’output è configurato in `wrangler.jsonc` con `assets.directory: "./dist"`, non cambiando la root in `/dist`. Non pubblicare la `index.html` sorgente: fa riferimento a TypeScript da compilare.

Wrangler esegue anche un hook `build.command: "npm run build"`: un deploy da checkout pulito ricrea `dist/` prima del packaging, anche se il comando build della dashboard è ancora `None`. Con il build esplicito in dashboard la compilazione viene ripetuta intenzionalmente prima del deploy, per verificare gli asset effettivamente inclusi. `dist/` resta generata e ignorata da Git; non servono token nei file del progetto.

Al momento della diagnosi, `main` al commit `a5a04d0` conteneva solo `README.md`: l’app TypeScript/Vite + Worker è nella PR #4. La correzione mantiene quell’architettura e ne include i commit; serve portare il codice applicativo su main tramite revisione e merge approvato. Modificare soltanto la dashboard mentre main contiene solo il README non può produrre un sito. Vedere [diagnosi e impostazioni](docs/cloudflare.md#correzione-del-rilevamento-degli-asset).

Wrangler 4.152.0 fissato nel lockfile (minimo richiesto dalle specifiche: 4.135.0). Non usare deploy per ottenere preview. La configurazione attiva non contiene ID o bucket inventati: il D1 principale usa l’ID reale confermato dal proprietario; il profilo local usa invece gli emulatori. Prima della preview assegnare risorse di TEST verificate al blocco `previews`; verificare schema effettivo Wrangler. Account, autorizzazioni e quote devono essere configurati dal proprietario. L’integrazione GitHub–Cloudflare esistente viene mantenuta. Le modifiche a main possono avviare il rilascio: il merge richiede approvazione esplicita anche per la pubblicazione.

Piano Workers Free; nessun upgrade o billing autorizzato. D1, R2 Standard e build hanno quote separate. Superare le franchigie R2 può costare; non attivare automaticamente. Dominio personalizzato facoltativo, DNS e acquisti separati.

## Dati e privacy

Niente dati identificativi obbligatori. Sessioni anonime, nickname facoltativo; nessun analytics o cookie pubblicitario. Fonte/licenza/spiegazione soltanto dopo la risposta. Crediti delle immagini pubbliche devono rispettare attribuzioni e share-alike. Le immagini IA del catalogo futuro sono create per un gioco di fantasia. Informativa nell'app. Prima di un lancio pubblico definire titolare, contatti e tempi di conservazione effettivi.

Specifiche versionate in `docs/specification-v1.1.0.md`. Versione app distinta: vedere `CHANGELOG.md`. Le PR #10, #11 e #12 sono state integrate dopo approvazione esplicita; il precaricamento successivo resta in una PR in bozza. Nessun comando di deploy eseguito in questa fase.

## Precaricamento e timer (0.10.0)

Allenamento anticipa le prossime due immagini e abilita le risposte dopo decode.
A tempo prepara tutti i file prima di mostrare “Inizia il countdown”: il server
assegna la deadline soltanto allo start idempotente. PvP prepara lo stesso round
per entrambi e parte dopo le due conferme, con attesa massima di 45 secondi.

Cache e richieste hanno limiti espliciti; errori offrono retry o annullamento
senza risultato valido. Un timer attivo continua durante retry e riconnessione.
Le assegnazioni legacy e le etichette indipendenti restano invariate. Applicare
la migrazione `0006_media_preparation.sql` prima del backend aggiornato.

[Protocollo, budget, API, rollback e benchmark](docs/precaricamento-immagini-v1.0.0.md).
`npm run benchmark:preloading` usa Chromium esistente e fixture locali con banda
modellata; non misura una rete mobile fisica. Nessuna risorsa remota necessaria.

## Digital Gallery (0.9.0)

Tema scuro con palette REAL turchese / SLOP viola, Space Grotesk Bold e Inter
locali con licenza OFL, immagini integre e pulsanti simmetrici. Le API mantengono
`REAL`/`AI`. Home, impostazioni, gioco, risultati e PvP condividono il nuovo tema;
le indicazioni demo rimangono esplicite. Accessibilità da tastiera, contrasto,
progresso e movimento ridotto sono verificati in Chromium già disponibile.

`npm run test:gallery` esegue controlli browser locali e salva screenshot in
`artifacts/gallery/`. Eseguire in sequenza con le altre suite Wrangler.
[Design, font, verifiche e misure](docs/digital-gallery-v1.0.0.md).
La 0.9.0 cambia soltanto l'interfaccia; la preparazione dei timer è aggiunta dalla
0.10.0 descritta sopra.

## Pipeline editoriale storica REAL / SLOP (0.11.0)

Fino a 20 fotografie diversificate al giorno, valutate sui pixel con una sola
classifica 0–100. Prima metà candidata REAL; seconda metà sorgenti private per
reinterpretazioni **solo testuali**: descrizione → brief creativo → prompt aperto
→ OpenAI text-to-image → valutazione cieca del risultato. Il generatore sviluppa
liberamente composizione, luce, materiali e atmosfera, conservando la natura
fotografica del gioco. Nessuna chiamata pagata è attiva per default.

Studio `/admin/slop` e admin mostrano fonte, sorgente privata, dossier, tentativi,
valutazioni e stato. Revisione umana obbligatoria, nota facoltativa. Le approvazioni
attendono separatamente; un'azione amministrativa esplicita pubblica gruppi
bilanciati, con vincoli atomici D1. Il catalogo è 50/50, le singole partite
mantengono le monete indipendenti. Le sorgenti SLOP non sono riutilizzabili come REAL.

La difficoltà preassegnata è rimossa, senza valore sostitutivo. I vecchi valori
restano solo nell'archivio privato; sessioni, risposte e audit sono preservati.
Una futura misura empirica userà `error_rate = risposte_errate / risposte_valide`,
con numerosità, incertezza e ripetizioni controllate; nessun livello è implementato.

Migrazioni nuove **0007 / 0008**, da provare prima localmente. Le migrazioni conservano
il catalogo preesistente e si bloccano prima di rimuovere la colonna se lo stock non è già bilanciato; occorrono
backup e rilascio coordinato prima di qualsiasi operazione remota. Il rilascio
esistente richiede `EDITORIAL_SCHEMA_RELEASE_APPROVED=true` soltanto quando
ci sono migrazioni nuove da applicare; a schema aggiornato pubblica normalmente.
Nessun deploy, migrazione remota, secret Actions o schedule pagato viene attivato
qui. I modelli sono configurabili; `/v1/models` ha elencato `gpt-6.1-terra`, senza
eseguire inferenze a pagamento.

```sh
# Manifest locale completo; entrambi senza rete/pagamenti/scritture remote:
python3 -m pipeline.editorial .pipeline/lotto/manifest.json
python3 -m pipeline.editorial .pipeline/lotto/manifest.json --simulate
```

[Architettura versionata](docs/pipeline-editoriale-real-slop-v1.0.0.md),
[Studio v2](docs/studio-generazione-slop-v2.0.0.md),
[configurazione, migrazioni, prima prova e recupero](docs/coda-automatica.md),
[variabili senza segreti](pipeline/editorial.env.example).
Le prescrizioni precedenti sulla difficoltà e sui vecchi template sono storiche
e superate; diritti, originali privati, demo, autenticazione e preload restano.

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

Connettori separati: Commons, Openverse, Met, Library of Congress (query HABS/HAER/HALS), Smithsonian (SMITHSONIAN_API_KEY) e NASA. Ogni provider ha termini, limiti e schemi propri: validare esempi reali prima di abilitare un job. Fixture e mock non certificano l’accesso live. Massimo 50 risultati, quattro query controllate, timeout 20s, retry/backoff e User-Agent con contatto. Limiti chiamate Met/LoC maggiori perché richiedono dettagli per asset. Nessun motore generalista o scraping. Il workflow storico di sola raccolta è manuale e disabilitato salvo ENABLE_IMAGE_PIPELINE=true; artifact privati scadono dopo 7 giorni. Il workflow separato per la coda automatica è descritto sotto e ha destinazione, quote e attivazione proprie.

Quarantena `.pipeline/` privata e ignorata da Git. Deduplica fonte/URL prima del download, SHA-256 dopo download, dHash percettivo solo come suggerimento. Non rimuovere crediti: gli originali restano integri, il download crea un derivato WebP dell’intero fotogramma (massimo 1600 px), conservando originale, prove e attribuzioni in quarantena. Verificare gli obblighi editoriali prima di approvare; nessun credito visibile viene ritagliato. I metadati di provenienza non sono incorporati nel file pubblico per evitare spoiler: restano nel database e vengono mostrati dopo la risposta. Nessuna etichetta REAL approvata automaticamente. Met richiede isPublicDomain sul singolo asset; NASA e istituzioni pubbliche non implicano diritti liberi. CC0/PD verificato, CC BY/SA richiedono prove e obblighi corretti; ambigui restano in revisione.

Sono ammesse **CC BY, CC BY-SA, CC BY-NC, CC BY-ND, CC BY-NC-SA e CC BY-NC-ND 2.0, 3.0 e 4.0**, incluse le varianti territoriali pubblicate, oltre a CC0 e Public Domain Mark verificato. Pipeline e moderazione condividono lo stesso elenco: link HTTP o a `deed`/`legalcode` vengono ricondotti all’identità HTTPS della **stessa versione e giurisdizione**, mai convertiti in 4.0. Il sito è destinato a uso non commerciale e senza adattamenti delle immagini: NC/ND sono ammesse rispettando questi vincoli. Rimangono esclusi URL e identità non censiti. I filtri di raccolta nominano la licenza esatta (es. `CC BY-SA 3.0 DE`); gli esempi configurati per CC0/4.0 non si ampliano automaticamente. Obblighi, limiti e fonte dell’elenco in [docs/licenze-immagini.md](docs/licenze-immagini.md).

Admin: configurare un token casuale >=32 caratteri in `.dev.vars` (mai committarlo): `ADMIN_TOKEN=...`. Aprire `/admin`; autenticazione HTTP Basic (utente `admin`, password token), sempre HTTPS fuori localhost. API supporta anche Bearer. Import JSON con: type, title, description, author, source_url, source_id, provider, license_name, license_url, evidence, explanation, categories (ID); per AI anche ai_model, ai_prompt, generation_date (YYYY-MM-DD), owner_declaration=true. I contenuti e gli eventi inventati devono essere verificati dall’editore prima dell’approvazione. Il file JPEG/PNG/WebP va caricato separatamente; SVG non accettati. Il menu privato consente filtri, prove, licenza, modifica categorie e audit della decisione. Protezione server-side su pagina, API e upload.

**Importazione diretta senza Google Drive:** `python3 scripts/import-queue.py .pipeline/manifest.json --base https://IL-SITO.workers.dev` controlla il lotto senza rete; aggiungere `--apply` per caricare originali privati e copie per il gioco nella quarantena R2 e le schede in D1. Servono il Worker aggiornato, il binding `QUARANTINE` e il segreto `REAL_OR_SLOP_ADMIN_TOKEN`. Retry e upload interrotti riprendono dalla stessa candidata; non vengono approvate o pubblicate immagini automaticamente. Originali conservati in R2 e backup del catalogo indipendenti da Google: [procedura completa](docs/importazione-diretta-r2.md).

**Coda editoriale, revisione umana:** il workflow combina raccolta,
classifica unica e, solo con abilitazione esplicita, generazione e importazione
private. Il cron quotidiano è dormiente e richiede il nuovo flag
`ENABLE_EDITORIAL_SCHEDULE=true` oltre alle altre abilitazioni. Secret, policy e budget sono distinti fra
esecutore, Actions e Worker. [Attivazione controllata e limiti](docs/coda-automatica.md).

I bucket `*-local` sono dichiarati soltanto nel profilo env.local e vengono usati con --local --env local, non nel deploy remoto. L’approvazione copia soltanto dallo storage quarantena allo storage approvato dell’ambiente corrente; non avvia deploy/import produzione. Le fixture demo e il catalogo verificato sono separati dal campo `demo`.

## Allenamento e A tempo (fase 3)

Categorie multiple e sottocategorie, 1–50 immagini in entrambe le modalità. Allenamento misura il tempo soltanto per il riepilogo; A tempo usa 10/20/30 secondi per immagine (default 20). Il server campiona senza ripetizioni con etichette REAL/AI indipendenti al 50% per domanda; limita preventivamente la lunghezza o segnala catalogo insufficiente. Le sessioni usano D1 e un cookie tecnico HttpOnly/SameSite, Secure in HTTPS. L’ID nel sessionStorage serve solo a ritrovare la partita: da solo non autorizza letture o risposte. Timestamp, assegnazione domande, scadenza, punteggio (100/corretta, 0/errata) e replay sono validati nel Worker/SQL. In Allenamento il tempo non cambia punti né spareggi. Nessuna classifica pubblica o nickname raccolto per il gioco singolo.

API: POST `/api/sessions` con mode training/timed, count, roundSeconds e categories; GET `/api/sessions/:id`; POST `/api/sessions/:id/answer` con roundId/choice. Solo dopo la risposta vengono inviate soluzione, spiegazione e crediti. Foto servite tramite round opachi assegnati. Doppio click/retry con stessa scelta è idempotente; una scelta diversa è rifiutata. Refresh riprende la domanda corrente; errori di rete offrono ripresa. Il countdown del browser è indicativo: alla scadenza il server rifiuta ulteriori risposte.

Statistiche private `/api/admin/stats`: conteggi descrittivi per categoria e immagine, senza livelli o suggerimenti di difficoltà. Risposte in categorie multiple possono contribuire a più aggregazioni. Test HTTP aggiuntivi: con Wrangler locale attivo, `python3 tests/game.integration.py` (modifica soltanto una sessione D1 locale per verificare la scadenza, mai risorse remote).

## PvP archiviato temporaneamente (fase 4 storica)

La modalità pubblica è sospesa; le API stanze rispondono 503 e la cronologia è preservata. Le seguenti sono istruzioni storiche per una futura riattivazione, non disponibili nel sito attuale.

Aprire `/pvp` in due schede o browser: creare stanza, copiare il codice di 12 caratteri, entrare dal secondo client e avviare dall’host. Entrambi vedono stessa immagine e scadenza; la soluzione rimane sul server fino a entrambe le risposte o timeout. D1 conserva sfida, giocatori anonimi, risposte e risultati. DO usa backend SQLite e WebSocket hibernation; HTTP consente ripresa durante le disconnessioni. Non rispondere costa il tempo massimo del round, i punti dipendono solo dalla correttezza. Il token stanza è privato della scheda e non compare negli URL.

```sh
npm run test:integration
python3 scripts/local-data.py backup
python3 scripts/local-data.py restore-test
```

L’integrazione avvia un Worker con stato **locale isolato** sulla porta 8788 e verifica Allenamento, A tempo per immagine, compatibilità storica e blocco delle API PvP. I test unitari conservano la copertura dell’attore PvP. Nessun browser aggiuntivo necessario. Dati test in `.wrangler/integration`; log privati in `artifacts/`. I test schema/API e `npm run build` restano separati dalla pipeline Python.

Configurazione anteprime, credenziali, guardia sui binding, backup e rilascio in [docs/cloudflare.md](docs/cloudflare.md). `node scripts/check-preview.mjs` blocca volontariamente le preview finché non sono indicati DB/bucket di test verificati. Il modello con segnaposto è separato dalla config attiva. L’accesso Cloudflare e l’isolamento remoto non sono certificati da un test locale o dry-run.

Stato finale e limiti effettivi: [docs/verification.md](docs/verification.md). Le quattro PR iniziali erano dipendenti; lo stato delle consegne successive è riportato nel documento di verifica. Nessuna verifica locale equivale a una pubblicazione Cloudflare riuscita.


## Demo Cloudflare con catalogo R2

La configurazione del Worker `real-or-slop` mantiene `DATA_MODE=demo` e il D1 esistente `real-or-slop-local` (ID `98a3e712-d9f9-4510-91ab-2b80329be753`). Il proprietario ha confermato la configurazione di questi binding, ora versionati anche in `wrangler.jsonc`:

| Binding | Bucket privato |
| --- | --- |
| `QUARANTINE` | `real-or-slop-quarantine` |
| `IMAGES` | `real-or-slop-approved` |

La demo continua a servire le fixture SVG. Il catalogo reale può essere caricato e revisionato in D1/R2 senza passare automaticamente alle partite di produzione. Gli originali restano privati nel prefisso `originals/` di QUARANTINE; le immagini approvate vanno in IMAGES. Google Drive è escluso dal flusso.

Nella dashboard esistente mantenere **Build: `npm run build`**, **Deploy: `npm run deploy:demo`**, branch `main`, root `/` e Node 24. Il comando di rilascio è stato aggiornato per verificare account, Worker, D1, modalità demo e i due bucket esatti; rifiuta risorse aggiuntive o destinazioni diverse. Legge le migrazioni D1 già applicate: se lo schema è aggiornato pubblica senza migrazioni o seed, conservando variabili e segreti esistenti. Nuove migrazioni richiedono approvazione esplicita del rilascio dello schema; il loro completamento è ricontrollato prima del deploy. Il provisioning automatico resta disabilitato. Nessun bucket o database viene creato dal comando.

Controllo senza rete: `npm run deploy:check`. Packaging senza modifiche remote: `npm run deploy:demo -- --dry-run`. L’admin richiede `ADMIN_TOKEN` come segreto del Worker; l’importatore usa lo stesso valore tramite `REAL_OR_SLOP_ADMIN_TOKEN`. Un deploy mantiene i binding dichiarati nel repository anche se erano stati aggiunti dalla dashboard.

Sviluppo locale con `--local --env local`: solo emulatori `*-local`. CI verifica sia la moderazione con R2 emulato sia il gioco senza R2, ricavando per quest’ultimo una configurazione temporanea locale priva di bucket. Le preview restano bloccate fino alla configurazione di risorse di test distinte. [Procedura di rilascio](docs/cloudflare.md), [importazione diretta](docs/importazione-diretta-r2.md).
