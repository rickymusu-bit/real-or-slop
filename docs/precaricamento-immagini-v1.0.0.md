# Precaricamento e timer — v1.0.0

Applicazione **0.10.0**, prompt 5; implementa la parte di caricamento delle [istruzioni approvate](istruzioni-codex-tema-precaricamento-v1.0.0.md). Tema Digital Gallery, valori REAL/AI, regole di punteggio e campionamento Bernoulli restano invariati. Nessun servizio o variante di immagine inventata; nessuna risorsa remota creata.

## Flusso delle modalità

**Allenamento:** il server espone la domanda e una finestra autenticata di tre URL. Il client scarica e decodifica la domanda corrente prima di abilitarla, poi anticipa le due successive. Per le nuove sessioni il timestamp di presentazione viene registrato da `ready`, non da un GET o dal download. Il retry conserva lo stesso round: non aggiunge punti, risposte, immagini o nuove estrazioni. Un errore persistente offre un altro tentativo oppure l'annullamento; non è inclusa una sostituzione automatica dell'immagine. Il motivo viene segnalato al server quando raggiungibile.

**A tempo:** una nuova sessione nasce `preparing`, senza deadline di gioco. Il manifest contiene tutti i round assegnati, fino a 50 e comunque limitati dal catalogo distinto per entrambe le classi. Il client scarica e verifica con `Image.decode()` ogni file; conserva tutti i byte compressi e una finestra di bitmap. Dopo la verifica mostra il pulsante “Inizia il countdown”. Soltanto `start`, con conferma ed elenco completo dei round, imposta `started_at` ed `expires_at` in un batch D1 atomico. Retry e start concorrenti restituiscono la stessa deadline. Il primo round è presentato allo start, i successivi dopo decodifica e `ready`.

La preparazione a tempo ha TTL di **10 minuti**, verificata dal server nelle letture/azioni e nello start condizionale; non esiste uno scheduler di cancellazione delle righe D1. Una preparazione scaduta diventa `invalidated`, senza `completed=1`. Non parte un countdown su file mancanti o corrotti. Se il budget non permette la preparazione completa, il gioco non parte: non viene dichiarato pronto un sottoinsieme.

Durante una sessione attiva il countdown continua anche con caricamenti, errori o riconnessione. Si può riprovare senza proroga oppure annullare tutta la partita con `invalidated`. In questo caso punteggio pubblico 0, nessun risultato valido o credito di completamento, risposte grezze conservate per audit ed escluse dalle statistiche editoriali. L'ultima risposta e il completamento sono un unico batch: un annullamento concorrente non può trasformare retroattivamente un completamento già registrato.

**PvP:** il Durable Object conserva `preparing` per ciascun nuovo round, una chiave media opaca e una finestra di preparazione di **45 secondi**. I due client scaricano lo stesso file e lo decodificano prima di inviare `media-ready`, vincolato al numero del round. Solo entrambe le conferme attivano `startedAt` e una deadline comune. Conferme duplicate, refresh o riconnessione non riavviano il tempo; pacchetti di round precedenti sono rifiutati. Le immagini sono scaricabili durante la preparazione, ma la soluzione resta segreta. Se un client manca, fallisce o abbandona, la policy è annullare la sfida o registrare l'abbandono, non penalizzare chi aspetta con un timeout di risposta. Dopo uno start valido rimane la normale regola del tempo massimo per chi non risponde.

La deadline di preparazione usa l'allarme DO, oltre ai controlli nelle richieste. Il rientro conserva identità, round, chiave e conferme. Una revisione monotona del DO impedisce al frontend di applicare snapshot più vecchi ricevuti dopo quelli nuovi. Confermare il prossimo round dopo il reveal rimane distinto dal dichiarare il file pronto.

## Gestore di immagini

`src/preload.ts` è condiviso da singolo e PvP, con fetch/decoder iniettabili nei test. Limiti predefiniti in `shared/preloading.ts`:

| Risorsa | Limite |
|---|---:|
| Download concorrenti | 2, configurabili fino a 4 |
| Timeout di una richiesta/decodifica avviata | 20 secondi |
| Singolo file acquisito | 12.000.000 byte |
| Byte compressi conservati dal gestore | 32 MiB |
| Bitmap conservate dal gestore | 24 MiB stimati, 4 byte/pixel |
| Dimensioni di una bitmap | 6 milioni di pixel |
| Finestra preferita | corrente + 2 successive |

Le richieste allo stesso URL condividono il lavoro, la domanda attiva ha priorità sulle richieste ancora in coda. Il fetch legge il corpo con un limite per file; `decode()` deve riuscire con dimensioni positive. Il nodo attivo è inserito soltanto dopo decodifica, eager/high-priority, mai un placeholder spacciato per il soggetto. Non si modificano qualità, colore o formato in funzione dell'etichetta. PNG/JPEG/WebP esistenti restano utilizzabili; gli SVG sono le fixture geometriche demo già previste, non nuovi upload accettati.

Le bitmap fuori finestra vengono rilasciate e gli object URL revocati; l'immagine attiva resta protetta. Il timer continua mentre eventuali bitmap evinte vengono ridecodificate dai byte locali. Allenamento e PvP scartano anche i byte non più necessari; A tempo conserva l'intero batch verificato. Uscire dalla modalità o terminare la partita annulla coda/richieste, rilascia riferimenti e URL. Il browser può conservare risorse proprie: questi budget non sono una misura del processo, della GPU o del garbage collector; esistono allocazioni transitorie durante decodifica.

Il limite della cache non è un tetto di traffico fatturabile: richieste in volo, file rifiutati, compressione HTTP e retry possono consumare ulteriori byte. L'interfaccia avvisa sul traffico prima di creare la partita e mostra progresso e byte dei file acquisiti. Non si promettono “zero latenza” o memoria assoluta costante.

## API, sicurezza e persistenza

Le nuove sessioni e stanze usano protocollo **2**. Migrazione additiva `0006_media_preparation.sql`: stato/versione/durata/start/TTL/causa su `game_sessions`, esito su `challenges`, registro `media_events` e filtro delle statistiche per escludere annullamenti. Approvazione, catalogo, difficoltà, hash e assegnazioni esistenti non vengono riscritti.

| Endpoint singolo | Contratto |
|---|---|
| `GET /api/sessions/:id` | Stato; non presenta round del protocollo 2 |
| `GET /api/sessions/:id/manifest` | Solo `id`, `number`, URL e alt neutri dei round: tutti in A tempo, prossimi tre in Allenamento |
| `GET /api/sessions/:id/media/:roundId` | File assegnato, senza timestamp/punteggio; finestra verificata per Allenamento |
| `POST /api/sessions/:id/start` | `{prepared:true, roundIds:[...]}`: elenco completo, senza duplicati; start atomico/idempotente |
| `POST /api/sessions/:id/ready` | `{roundId}`: solo primo round non risposto, timestamp idempotente |
| `POST /api/sessions/:id/report` | `{reason:"media_unavailable"}`: audit del guasto, massimo 10 segnalazioni/minuto per sessione |
| `POST /api/sessions/:id/invalidate` | Stesso motivo ammesso: transizione terminale, mai estensione di tempo |
| `POST /api/sessions/:id/answer` | Rifiuta preparazione, round non pronti/futuri, scadenza e annullamento; replay della stessa scelta conservato |

Tutti richiedono il cookie proprietario verificato; il solo ID in sessionStorage non autorizza. Start, invalidazione, ordine delle risposte e completamento sono protetti anche dalle condizioni SQL al momento della scrittura. Le risposte di stato/reveal restano `no-store`. L'assegnazione fino a 50 round usa un inserimento JSON parametrizzato e i crediti finali una sola query, senza oltrepassare limiti per-request con una query per immagine.

Il PvP riutilizza `/api/rooms/:code/action` con `start`, `media-ready`, `media-failed`, `answer`, `next` e `leave`; readiness/errore/next portano `round`. I media hanno una chiave per round nel query string, autenticazione Bearer e controllo del round corrente. Token e clock client non sono autorità. Il valore `ready` dopo reveal non vale come conferma di decodifica.

Le risposte media autorizzate usano cache **private, 300 secondi**, con `Vary: Cookie` o `Vary: Authorization`; URL opachi distinti per round, nessun percorso REAL/AI o filename della fonte. Nessuna cache pubblica di manifest, soluzioni, prompt o crediti. La copia locale già acquisita non può essere revocata retroattivamente. La risposta corretta non viene anticipata: il preload non include classe, titolo, fonte, licenza, prompt o metadati editoriali.

Il countdown visivo usa deadline/serverNow e `performance.now()`, e viene risincronizzato sulle risposte del server. Rimane indicativo: ritardi di rete e scheduling esistono; il server decide se la risposta arriva in tempo. Nessuna pausa client o proroga viene usata per correggerli.

## Compatibilità e rollback operativo

Le sessioni precedenti restano protocollo 1: stessi round e deadline, GET con presentazione originaria, nessun ricampionamento. Gli snapshot DO precedenti mantengono il round già attivo e il protocollo precedente anche per le riprese. Il nuovo frontend supporta entrambi; un timer legacy può essere già avviato durante il caricamento e non viene azzerato.

Applicare lo schema prima del Worker aggiornato; distribuire frontend e backend compatibili insieme, soltanto dopo l'approvazione del rilascio. Il rollback supportato dell'attivazione usa **`PRELOAD_PROTOCOL=legacy`**: solo nuove sessioni/stanze tornano al protocollo 1; quelle già assegnate continuano a usare la propria versione. Rimuovere l'override ripristina il default 2. È un comando operativo per il proprietario, non una variazione Cloudflare eseguita in questa consegna.

Non rimuovere le colonne/migrazioni e non ridistribuire un Worker vecchio che ignora `preparing`/`invalidated` finché esistono partite v2. Mantenere il backend compatibile e lasciarle terminare/scadere, con i rispettivi allarmi e controlli. Non riscrivere le deadline per effettuare un rollback. La migrazione non elimina audit, risposte o immagini; la conservazione definitiva dei dati resta una decisione operativa prima di un lancio pubblico.

## Verifiche e benchmark

`npm ci`, lint, test Node/Python, build, integrazione locale con e senza R2 e `npm run test:gallery` verificano il flusso reale. I test del gestore coprono deduplica, concorrenza/priorità, decode, cache, budget, timeout, cancellazione e cambio round. Worker/D1 verificano manifest privati, timestamp, readiness, start concorrenti, scadenza, TTL, audit, annullamento/risposta e sessioni legacy. Il DO ha anche clock iniettabile per verificare l'assenza di un client oltre 45 secondi senza sleep o dipendere dalla velocità della CI. Il browser verifica ritardi, file corrotti prima/dopo start, retry, deadline invariata, annullamento, due client PvP, layout e accessibilità.

`npm run benchmark:preloading` usa un Chromium già installato, nessuna libreria browser nuova e nessun server remoto. Il browser esegue veri fetch e `Image.decode()`; CDP consegna fixture locali con latenza e **budget di banda condiviso** modellati. Profili: 4G 100 ms + 1.500.000 byte/s; 3G lenta 400 ms + 50.000 byte/s. Sono modelli controllati, non misure di un operatore mobile. Il riferimento “prima” scarica/decodifica in sequenza al bisogno; “dopo” verifica tutti i byte prima dello start e mantiene tre bitmap. I costi delle API di start e la memoria del processo non sono inclusi.

Fixture: 24 SVG originali da 1.127 byte e 50 JPEG sintetici deterministici da 168.235 byte (1200×800). Si verificano 24/50 file, non si forza una partita demo da 24/50 round: il catalogo demo di 12 immagini per classe continua a garantire solo 12 round indipendenti. Nessun vincolo di quote viene reintrodotto per il benchmark.

| Profilo / fixture | Prima: primo file al bisogno | Dopo: preparazione completa | Dopo: primo file già verificato |
|---|---:|---:|---:|
| 4g-model / 24 file | 116.2 ms | 1.269 s | <1 ms |
| 4g-model / 50 file | 225.4 ms | 5.809 s | <1 ms |
| slow-3g-model / 24 file | 427.8 ms | 5.150 s | <1 ms |
| slow-3g-model / 50 file | 3779.3 ms | 168.653 s | <1 ms |

L'attesa “dopo” misura l'attivazione della prima immagine già verificata: valori sotto un millisecondo riflettono cache e risoluzione del timer, non latenza di rete nulla. La preparazione è esplicita e può durare minuti con molti file e poca banda. I byte compressi conservati sono 27.048 per gli SVG e 8.411.750 per i JPEG; bitmap mantenute stimate 11.520.000 byte, contro 192.000.000 se si trattenessero tutte le 50 bitmap 1200×800. Il riferimento sequenziale ne trattiene una: l'obiettivo è contenere il costo del preloading, non affermare che richieda meno RAM del caricamento singolo.

Risultati JSON in `artifacts/preloading/benchmark.json`; screenshot in `artifacts/gallery/`, ignorati da Git. Nessuna installazione ripetuta di Chromium, deploy o risorsa Cloudflare. Lint/test/integrazione restano separati dal benchmark lento.

Il costo della build del frontend passa da CSS **12,88 kB / 3,85 kB gzip** e JavaScript **49,47 kB / 15,91 kB gzip** della 0.9.0 a CSS **13,10 kB / 3,91 kB gzip** e JavaScript **60,51 kB / 19,77 kB gzip**. Font e file immagine restano invariati; nessuna dipendenza aggiunta. Le misure di rete delle fixture non includono questi asset dell'interfaccia.

## Limiti espliciti

La readiness è una dichiarazione del client autenticato: il server verifica identità, round, elenco e stato, ma non può attestare fisicamente la decodifica nel browser. Il preload rende possibile ispezionare le immagini con DevTools prima del timer; risposte/crediti restano segreti. Anche l'annullamento dichiarato può essere abusato. Non è un protocollo antifrode per classifiche di alto valore, che non sono abilitate.

Un reload attivo può perdere la cache in memoria; il server mantiene il timer e il client riprova o annulla. File troppo grandi/corrotti richiedono curatela, non una compensazione delle etichette o un fallback verso immagini non approvate. Allenamento offre retry, non sostituzioni automatiche. Non si generano AVIF/srcset o versioni compresse fittizie. Immagini reali di produzione, throughput mobile fisico, GPU e screen reader diversi da Chromium/AX non sono certificati da queste fixture locali.
