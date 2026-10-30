# Verifiche effettive

## Catalogo diretto D1/R2 senza Google Drive — 2026-10-30

- La PR #15 comprende il caricamento diretto di metadati, originali e copie per il gioco, senza dipendenze Google. Originali byte per byte nel prefisso privato `originals/` di QUARANTINE, protetti dalla sostituzione; nessuna migrazione di schema o nuovo bucket necessario oltre a quelli del catalogo.
- Anteprima reale sul lotto locale di dieci candidate: file, fonti, licenze e checksum controllati senza richieste di rete e senza leggere i file da Drive. I riferimenti Drive preesistenti non entrano nel payload.
- Lint, 10 file di test Node, test Python e build TypeScript/Vite superati. Integrazione locale D1/R2 completa superata: recupero dopo POST interrotto prima del file, ripetizione della CLI senza duplicati, originali privati immutabili, collisioni di fonte/file rifiutate, conferme editoriali e retry dopo approvazione senza modifiche. Restano funzionanti campionamento, curatela, studio, sessioni, preload e PvP.
- Il pannello permette di completare la spiegazione anche per le immagini REAL. CI installa la dipendenza Pillow già prevista dalla pipeline per verificare i file reali. Originali e copie già salvati su Drive non vengono cancellati; Google Drive non è più parte del flusso operativo.
- L’import remoto rimane subordinato al Worker aggiornato, ai binding R2 verificati e al token dell’environment corretto. Nessuna pubblicazione, creazione bucket o scrittura D1/R2 remota effettuata da questa sessione.

## Inclusione NC e ND — 2026-10-30

- La PR #15 include ora le sei famiglie CC BY/BY-SA/BY-NC/BY-ND/BY-NC-SA/BY-NC-ND 2.0/3.0/4.0, per l’uso non commerciale e senza adattamenti confermato dal proprietario. L’elenco condiviso contiene 386 identità pubblicate; nomi, vincoli, versioni e giurisdizioni vengono conservati.
- Lint, 10 file di test Node, 17 test Python e build TypeScript/Vite superati. I casi comuni di accettazione includono NC/ND e le combinazioni NC-SA/NC-ND; i casi negativi continuano a coprire identità inesistenti e URL ambigui.
- La suite di integrazione locale esercita 24 licenze/alias ammessi attraverso importazione, upload, conferme umane, approvazione e controllo di nome/URL in D1. I vincoli NC/ND non comportano approvazioni automatiche. La pipeline conserva anche i diritti originali del provider; i filtri espliciti restano selettivi.
- Revisione amministrativa e documentazione indicano i vincoli: uso non commerciale e assenza di adattamenti condivisi. Verificata la FAQ ufficiale CC sul cambio di formato anche con ND. Il trattamento tecnico delle immagini non è stato modificato; nessun editor o elaborazione creativa aggiunti.

## Prima estensione CC BY/BY-SA — commit f94f08b, superata dall’inclusione NC/ND

- Branch `codex/cc-legacy-licenses` da main `8b93a3a`: elenco condiviso di 130 identità CC0/PDM e CC BY/BY-SA 2.0/3.0/4.0 con varianti pubblicate, estratte dal registro ufficiale CC. Versione e giurisdizione sono preservate anche nei link HTTP o `deed`/`legalcode`; nessuna riclassificazione automatica delle immagini esistenti.
- Lint, 10 file di test Node e 16 test Python, TypeScript/Vite/asset e controllo diff superati. Casi condivisi tra TS/Python per le identità e gli alias ammessi, NC/ND, port inesistenti, host falsificati e URL ambigui; filtri della pipeline verificati senza upgrade di versione o perdita di giurisdizione.
- Integrazione Worker/D1/R2 locale superata: importazione di otto forme 2.0/3.0, upload, rifiuto senza ciascuna conferma umana, approvazione e verifica dei nomi/URL effettivamente conservati in D1. CC BY-SA 3.0 DE rimane tale; NC/ND e port sconosciuti restano bloccati. Restano funzionanti rifiuto delle licenze mancanti, audit, concorrenza, curatela/studio, campionamento, Allenamento/A tempo, preload e due client WebSocket PvP.
- Completate anche l’integrazione della demo senza binding R2, `npm run deploy:check` e il packaging `npm run dry-run`, senza pubblicazione remota. Nessuna regressione di navigazione/asset, sessioni, preloading o PvP nei due profili locali.
- Nessuna migrazione di schema, nuova dipendenza, importazione del catalogo remoto o modifica ai bucket. Documentazione e avviso al revisore aggiornati; la compatibilità tecnica della licenza non sostituisce la verifica dei diritti della singola immagine. Nessun merge o deploy remoto eseguito.

## Precaricamento e timer — 0.10.0

- PR #12 integrata dopo approvazione esplicita; branch `codex/11-precaricamento-immagini` da main `153f251`. La consegna del prompt 5 resta in una nuova PR in bozza, senza merge o pubblicazione.
- Gestore condiviso con download/decode, deduplica, priorità, due richieste concorrenti, timeout di 20 secondi, cache compressa limitata a 32 MiB e bitmap conservate a 24 MiB stimati. Finestra corrente + due immagini; byte dell'intera sessione A tempo conservati dopo verifica, bitmap rilasciate fuori finestra. Nessuna risposta abilitata prima della decodifica.
- Allenamento con manifest di tre URL e timestamp dopo `ready`; A tempo con stato `preparing`, manifest completo e start D1 atomico/idempotente, TTL di 10 minuti e nessuna proroga su retry o reload. Annullamento distinto dal completamento; statistiche escludono invalidazioni. Anche l'ultima risposta e il completamento sono un unico batch, in gara con l'annullamento.
- PvP con stato per-round `preparing`, media opaco comune e conferme di entrambi prima della deadline, finestra massima 45 secondi e annullamento senza penalità per il client assente. Stesso round dopo riconnessione, nessuna nuova estrazione per client o retry; esiti terminali non possono essere trasformati da un `leave` tardivo. Clock iniettabile nei test DO, produzione con tempo server.
- `npm ci`, lint, `npm test`, esecuzione esplicita **44 test Node**, **12 Python**, build e controllo diff superati. Migrazione additiva testata con deadline/assegnazioni/completamenti precedenti invariati; statistiche corrette su annullamento. Campionamento Bernoulli non modificato. Inserimenti/crediti aggregati limitano query e parametri per lotti fino a 50 round.
- Integrazione reale locale con R2 emulato e demo senza R2: manifest privati e neutri, nessuna presentazione/risposta anticipata, finestra Allenamento, due start concorrenti con una sola deadline/audit, expiry, TTL, retry/segnalazioni, race risposta-annullamento, sessioni legacy, moderazione/curatela/studio e due client WebSocket PvP con riconnessione, pacchetti obsoleti, deadline e punteggi condivisi.
- Chromium già installato: layout 360/390/768/1440, preparazione ritardata senza timer attivo, tutte le immagini verificate prima dello start, file corrotti prima e dopo avvio, risposte bloccate, retry senza spostare deadline, annullamento senza risultato, due client PvP, tastiera/zoom/focus, movimento ridotto e nessuna richiesta esterna delle pagine. Screenshot correnti in `artifacts/gallery/`, inclusi `preparing-timed-360.png` e `active-load-error-360.png`.
- Benchmark con fetch e decode reali Chromium, consegna CDP locale con latenza e banda **condivisa** modellate: 24 SVG da 1.127 byte e 50 JPEG da 168.235 byte. Modello 3G lenta, 50 JPEG: primo file al bisogno 3.779,3 ms; preparazione completa 168,653 s; prima attivazione dalla cache <1 ms. Compressed cache 8.411.750 byte, bitmap mantenute 11.520.000 byte, non tutte le 50 bitmap. Non è una misura di rete mobile fisica o RSS, né una promessa di latenza nulla. Tabella completa nel [protocollo](precaricamento-immagini-v1.0.0.md); JSON in `artifacts/preloading/benchmark.json` ignorato da Git.
- Packaging dry-run e controllo configurazione eseguiti senza pubblicazione. `PRELOAD_PROTOCOL=legacy` è una possibilità operativa per nuove partite, non una configurazione remota applicata; partite già assegnate conservano la propria versione. Limiti: readiness dichiarata dal client, ispezione dei media prima del countdown possibile, annullamenti abusabili, fixture sintetiche. Nessuna classifica di alto valore, sostituzione automatica o servizio Cloudflare aggiunto.

## Digital Gallery — 0.9.0

- PR #11 integrata dopo approvazione esplicita, commit main `be86312`; branch `codex/10-digital-gallery` creato da quel main. La consegna del prompt 4 resta in una nuova PR in bozza, senza merge o pubblicazione.
- Palette approvata, marchio REAL or SLOP, Space Grotesk Bold e Inter locali OFL, pulsanti simmetrici REAL/SLOP con valori API REAL/AI invariati. Home, modalità, domande, risultati, pagine informative, PvP e controlli amministrativi aggiornati; demo sempre dichiarata.
- Nessuna modifica a Worker, schema, campionamento, dati, timer o protocollo delle sessioni. Precaricamento e fase di preparazione server-side restano al prompt 5; non viene dichiarato risolto il costo del caricamento durante il countdown.
- Lint, 30 test Node esistenti (7 file nell'esecuzione isolata), 11 test Python, build TypeScript/Vite/asset e controllo diff superati. Integrazione locale con R2 e profilo demo senza R2: curatela/studio, autenticazione, anti-spoiler, campionamento indipendente, Allenamento/A tempo, timer server e PvP con due WebSocket, riconnessione e timeout superati.
- `npm run test:gallery`: Chromium già installato, nessuna nuova dipendenza. Home/impostazioni/info/crediti e domande su viewport 1440×1000, 768×1024, 390×844 e 360×640; nessun overflow orizzontale, nessuno scroll verticale nelle domande verificate, immagini integre senza filtri e azioni simmetriche. Partite singole completate, timer a tempo visibile, due veri client PvP senza reveal anticipato. Verificati albero di accessibilità, tastiera, zoom con Spazio/Escape, focus, nomi REAL/SLOP, movimento ridotto, font locali e assenza di richieste esterne delle pagine. Screenshot/JSON in `artifacts/gallery/`, ignorati da Git.
- Contrasti: testo secondario/superficie 7,75:1, testo su REAL 11,56:1 e su SLOP 7,84:1, bordi dei controlli/superficie 3,29:1. Font WOFF2 complessivi 60.956 byte, con licenze e provenienza; CSS 12,88 kB / JS 49,47 kB. Misure e confronto con 0.8.0 nel [documento del tema](digital-gallery-v1.0.0.md).
- `npm run deploy:check` e packaging `npm run dry-run` eseguiti senza pubblicazione. Le suite Wrangler sono eseguite in sequenza per non ricostruire contemporaneamente lo stesso `dist/`. Limiti: fixture geometriche, Chromium/AX tree e non tutti gli screen reader; viewport bassi o zoom elevato possono richiedere scroll. Nessun benchmark di preloading, tema chiaro o risorsa Cloudflare aggiunti.

## Studio SLOP — 0.8.0

- PR #10 integrata dopo approvazione esplicita, commit main `be91f8a`; branch `codex/09-studio-generazione-slop` creato da quel main. Questa fase prepara una nuova PR in bozza, senza merge o deploy.
- Studio privato con concept, classificazioni condivise, fino a sei fatti con riferimenti, template versionati e spiegazione modificabile. Nessuna generazione automatica, API esterna, dipendenza aggiunta o riferimento archivistico inventato dal software. Esperto resta soltanto un template privato e non è importabile.
- Migrazione additiva `0005_slop_studio.sql`: vecchie tabelle e fixture preservate, schema JSON validato, audit del dossier immutabile. Controlli concorrenti reali su D1 locale: un solo aggiornamento per revisione e una sola importazione, senza candidati duplicati. Retry restituisce l'immagine già collegata.
- `npm run lint`, `npm test`, `npm run build` e `git diff --check` superati; esecuzione esplicita senza isolamento: **30 test Node**, **11 test Python**. Template, limiti, date reali/future, conferme, provenienza, compatibilità e rifiuto della quarta difficoltà pubblica verificati.
- Integrazione locale completa con R2 emulato: autenticazione/Origin, categorie coerenti, prompt integrale mantenuto anche negli spazi iniziali/finali, modello/data/dichiarazione, provenienza congelata, upload privato, approvazione/rifiuto, spiegazione corretta dal revisore con differenza nell'audit. L'immagine importata e approvata viene assegnata a una sessione locale di test per verificare media e payload reali senza anticipare prompt, modello o classificazioni.
- `npm run test:integration` e `ROS_TEST_PROFILE= npm run test:integration` superati: regressioni di moderazione, curatela, campionamento indipendente, Allenamento, A tempo e due client PvP con stessa sequenza/deadline, riconnessione e timeout. Il profilo senza R2 verifica il gioco demo, non l'upload. Corretta la vecchia fixture PNG di moderazione, che aveva soltanto 255 possibili contenuti e poteva collidere con test precedenti; ora usa 96 bit casuali nei pixel.
- Chromium già disponibile, nessuna installazione: compilazione concept/fatti, proposte, modifica prompt, salvataggio/cronologia, upload manuale, approvazione dalla coda esistente, provenienza bloccata, copia iterazione e template Esperto privato. Contenuto HTML nei titoli rimane testo; nessuna eccezione runtime o overflow a 390 px. Screenshot locali ignorati da Git: `artifacts/slop-studio-desktop.png` e `artifacts/slop-studio-mobile.png`.
- Limiti: fixture sintetiche, nessun corpus AI reale importato. Verità dei fatti, licenze, innocuità, fedeltà al prompt e comparabilità restano verifiche umane. Token condiviso, non account per revisore. Le liste mostrano gli ultimi 100 elementi/eventi senza cancellare la storia precedente. Demo remota senza R2: upload/approvazione richiedono storage configurato; questa fase non crea bucket, applica migrazioni remote o cambia risorse Cloudflare. [Procedura e contratto](studio-generazione-slop-v1.0.0.md).

## Correzione probabilistica — 0.7.0

- Aggiornamento della stessa PR #10, branch `codex/08-campionamento-stratificato`: nessuna nuova PR. Rimosso il vincolo di differenza massima 1 fra REAL/AI nella singola partita, incluso il precedente fallback che riempiva con la classe restante.
- Preflight dopo deduplica e filtri, N limitato allo stock di entrambe le classi; monete indipendenti generate prima delle scelte editoriali. Pesi e capacità per strato comuni, ampliamento preventivo e ottimizzatore editoriale conservato per le riserve. Diagnostica e avvisi non dipendono dai conteggi segreti della partita.
- **25 test Node** eseguiti esplicitamente senza isolamento, **10 test Python**, lint e build TypeScript/Vite/asset. Verificate tutte le 256 sequenze di 8 round, 12 REAL/12 AI, squilibri 9/3 e 10/2, storia ripetuta/mista, limiti preventivi e assenza di duplicati.
- Simulazione principale: **10.000 partite / 120.000 domande**, 59.915 REAL (**49,9292%**), varianza conteggio REAL **3,02123** contro 3 teorico. Dopo RRRRRR: **456/900 = 50,67%**; dopo ARRA: **2414/4976 = 48,51%**, entro sei errori standard. Il controllo negativo con quote mostra varianza 0 e probabilità 0 dopo RRRRRR.
- Stratificazione misurata sull'aggregato di 2.048 partite per catalogo: distanza categoria/medium **0,00561** nel catalogo 90/10 contro **0,80127** del vecchio selettore; tutti gli assi del catalogo comparabile sotto 0,02; nessun duplicato. Verificato separatamente l'ottimizzatore secondario su 512 partite con strati ampliati. [Contratto e risultati correnti](campionamento-stratificato-v2.0.0.md).
- Integrazione locale con/senza R2: assegnazioni D1 reali, riduzione a 2 round su fixture con 2 immagini distinte per classe, rifiuto dei cataloghi a classe unica, filtri, nessuno spoiler, timer e punteggi coerenti con gli esiti effettivi. Una sessione preassegnata di 4 round resta di 4 round senza ricampionamento. Media, storia e deadline PvP identici fra i client, anche dopo riconnessione.
- Le nuove partite demo possono garantire 12 domande, mentre il catalogo resta di 24 asset. Sessioni e stanze precedenti non vengono riscritte. Nessun comando di deploy, migrazione remota, merge o modifica alle risorse Cloudflare.
- Limiti: dati sintetici; hash percettivi e metadati richiedono curatela; l'ampliamento garantisce sempre le etichette indipendenti ma non inventa comparabilità tra profili assenti. Le misure per partita della 0.6.0 sottostante sono storiche e non criteri di correttezza attuali.

## Campionamento stratificato — 0.6.0 (storico, quote superate)

- PR #9 integrata dopo approvazione; nuova fase basata su `main` aggiornato (`4219f7a`), branch `codex/08-campionamento-stratificato`. Nessuna migrazione o dipendenza aggiunta, fixture demo invariate.
- Lint, `npm test`, TypeScript/Vite/asset e controllo diff superati. Esecuzione esplicita senza isolamento: **22 test Node**; **10 test Python**. Test per quote 1–50, assenza di duplicati, input immutati, seed riproducibili, ordine non alternato, tutte le dimensioni editoriali, interazione categoria/medium, metadati mancanti, classi scarse e strati disgiunti.
- `npm run benchmark:sampling`: 64 seed, 20 round, cinque cataloghi sintetici. Nel catalogo comparabile la variazione totale media categoria/medium scende da 0,5813 a 0,0703; con distribuzioni opposte 90/10, da 0,8 a 0,0 su tutti gli assi. Sessioni con duplicati esatti: 34/64 prima, 0/64 dopo. Plausibilità percepita bilanciata separatamente per evitare scorciatoie basate sulla sorpresa. Strati disgiunti segnalati, senza dichiarare un bilanciamento inesistente. [Risultati e limiti](campionamento-stratificato-v1.0.0.md).
- Integrazione Worker/D1/R2/DO locale: filtri categoria/difficoltà/ambiente/stato verificati sulle assegnazioni persistite, dHash vicini esclusi, distribuzioni di medium comparabili, avvisi generici senza metadati o soluzioni. Allenamento, A tempo e PvP condividono la selezione; timer e due client PvP conservano immagini/scadenze comuni e protezioni da replay.
- Import tecnico: header dHash non valido rifiutato; impronta valida normalizzata e conservata dopo upload privato; un upload successivo senza impronta azzera il dato obsoleto. Conferme umane e quarantena restano obbligatorie.
- Verificati sia `npm run test:integration` completo sia `ROS_TEST_PROFILE= npm run test:integration` senza R2; fixture aggiuntive locali rimosse a fine test. `npm run deploy:check` verifica soltanto la configurazione offline.
- Limiti: il selettore è un'ottimizzazione limitata delle distribuzioni osservate, non un certificato di assenza di ogni correlazione. dHash e metadati devono essere corretti e sufficienti; impronte mancanti o somiglianze non rilevate richiedono curatela. Nessuna calibrazione su fotografie reali o certificazione di quote CPU cloud. Nessun comando di deploy o migrazione remota eseguito.

## Metadati editoriali — 0.5.0

- Base aggiornata a `main` (`96763a4`); fase limitata ai metadati privati. Contratto e vocabolari documentati in [metadati editoriali v1.0.0](metadati-editoriali-v1.0.0.md).
- `npm ci --cache /tmp/real-or-slop-npm --no-audit --no-fund`, lint (incluso shared), `npm test` e build TypeScript/Vite/asset superati. Nessuna dipendenza aggiunta. Esecuzione esplicita del runner Node senza isolamento: **13 test Node**; suite Python: **10 test**.
- Migrazione additiva applicata a un database SQLite con catalogo preesistente: dati immagini/fonti/licenze/categorie/revisioni invariati, schede mancanti ammesse, chiavi esterne e vincoli controllati. Verificata immutabilità degli eventi e corrispondenza dei vocabolari SQL/API.
- `npm run test:integration` superato su Worker, D1, R2 e Durable Objects **locali**. Test REAL e AI: autorizzazioni GET/PUT/DELETE, origine estranea, campi sconosciuti, lunghezze/tipi, conferma dei fatti, creazione/modifica/cancellazione valori, snapshot audit, revisioni obsolete, due salvataggi concorrenti sia alla creazione sia all'aggiornamento. Una sola transazione riesce; l'altra riceve 409.
- La scheda non cambia provenienza, licenza, classe, difficoltà o approvazione. Conferme umane ancora necessarie; nessun import approvato automaticamente. Partita demo completa di 24 round con annotazioni presenti/assenti senza esposizione di indizi privati; test esistenti di timer, ownership, replay e PvP con due WebSocket superati.
- `ROS_TEST_PROFILE= npm run test:integration` superato anche senza binding R2. `npm run deploy:check` superato come sola verifica offline della configurazione.
- Chromium **già disponibile**, nessuna installazione: verifica browser autenticata del modulo, salvataggio, cronologia, blocco decisione con modifiche non salvate, nessuna eccezione JavaScript e nessun overflow orizzontale a 390 px. Screenshot locali in `artifacts/admin-curation-desktop.png` (1280×1000) e `artifacts/admin-curation-mobile.png` (390×844); artifact esclusi da Git. I candidati fixture senza upload mostrano l'assenza dell'anteprima, prevista fino al caricamento.
- Nessun merge, deploy, migrazione remota, import live, generazione immagini o nuova risorsa cloud. Restano da verificare dispositivi fisici e identità individuali dei revisori (il fingerprint identifica il token amministrativo condiviso). Le fasi successive dipendono dalla revisione e dal merge approvato di questa PR.

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

## Correzione binding della demo dopo il primo deploy remoto

- Log fornito dal proprietario: il build d9400cbf-9fed-4d1e-9108-23deb470fe5a genera correttamente index/JS/CSS; fallisce con errore R2 10085 per il bucket real-or-slop-quarantine-local inesistente. Il medesimo log documenta che Wrangler ha creato D1 real-or-slop-local automaticamente.
- ID D1 `98a3e712-d9f9-4510-91ab-2b80329be753` fornito dal proprietario, account `89bb1f60467dcfd2147871748f0f9645` verificato nel log: configurati come identificativi non segreti. Nessuna credenziale aggiunta e nessun’altra risorsa creata da questa sessione.
- Il deploy principale non include binding R2; il renderer SVG esistente copre le immagini demo. R2 emulato separato in env.local per upload/moderazione; comandi locali aggiornati con --local --env local.
- Lint e suite Node/Python superati. Integrazione HTTP/WebSocket passata sia nel profilo locale completo sia nella configurazione demo SENZA R2, sempre con database e Durable Objects locali. Verificate anche le immagini servite nella partita singola e nel PvP.
- `npm run deploy:check` superato: destinazione D1/account/Worker vincolata al rilascio demo approvato, nessuna rete. `npm run deploy:demo -- --dry-run` superato: packaging ASSETS + D1 + ROOMS, nessun binding R2, nessuna migrazione/seed remoto, provisioning automatico disabilitato.
- Il comando di rilascio demo applica separatamente le migrazioni versionate e il seed sintetico idempotente, quindi deploya con --no-experimental-provision e ambiente principale esplicito. Interrompe il flusso al primo errore; non attiva R2 o billing.
- Per eseguirlo nell’integrazione Cloudflare già esistente occorre impostare Deploy command `npm run deploy:demo` (Build resta npm run build, main e root / invariati). L’ambiente di questa chat non espone ancora credenziali/accesso API Cloudflare: il nuovo flusso remoto è preparato, non eseguito o certificato qui.
