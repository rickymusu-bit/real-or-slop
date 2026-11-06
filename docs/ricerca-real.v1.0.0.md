---
version: 1.0.0
created_at: 2026-11-06T14:00:00Z
status: implementation-in-pr-not-activated
source_issue: 56
---

# Discovery REAL: decisioni prima dell'implementazione

Base: main `67ecf49` e audit #57 nella PR #58 `77f6cb8`. La PR #58 è ancora
draft: questa implementazione ne dipende come base documentale, senza integrarla.
Le PR #51/#52/#55 restano draft e non vengono importate o modificate.

## Delta adottato nel nuovo percorso

Il nuovo CLI `pipeline.real.run` cerca fotografie tramite intenzioni esplorative,
non tramite match obbligatorio a un catalogo di brief. Il percorso v3 e i run
v1/v2/v4 esistenti conservano contratti ed esecutori. Questa specifica versiona
la discovery 1.0.0, non rinumera lo schema dossier 2.0.0 o gli eventi 4.0.0.

| Conflitto | Decisione per i nuovi run #56 |
| --- | --- |
| 144 celle / margini uniformi #53 | 432 combinazioni nominali, nessuna quota di copertura; scheduler seedato con esplorazione positiva e resa umana separata dagli errori HTTP |
| Neutralità e tre intensità | `low` significativo, `medium/high` marcati non significativi; tutte le combinazioni sono rappresentabili, quelle non significative non sono pianificate |
| Brief precompilati e query identiche | A genera strategie concrete inglesi; B le adatta a ciascuna fonte; vecchi cataloghi/freeze restano immutati |
| Intenzione vs risultato | Emozioni multiple, valenza, intensità e temi osservati sono separati dal target; nessun filtro automatico di match |
| SLOP condivisa | Intenzione e piano autonomo opzionale congelati prima del retrieval; piano assente significa ramo SLOP assente, nessun partner generato automaticamente |
| Opere/crop/caption/licenza della #55 | Non adottati implicitamente. La nuova discovery riguarda fotografie e conserva il fotogramma; trasferimento al flusso v3 usa contratti e policy vigenti, con review separata |
| Chiamate GPT | Responses dirette, modello GPT-6.1 esplicito, output strutturato, gate client/server e prenotazioni atomiche nel ledger esistente; nessun retry implicito di invii incerti |

I tre livelli descrivono l'effetto potenziale: low = attenzione lieve e quotidiana;
medium = richiamo visivo chiaro ma non dominante; high = richiamo forte/saliente,
senza richiedere gravità, sofferenza o spettacolarità. Non sono misure di reazioni
reali. Nuove categorie richiedono una nuova versione di tassonomia e revisione.

## Interfacce e confini

Schema JSON e tassonomia sono versionati in `shared/real-discovery*.v1.0.0.json`.
`pipeline/real/contracts.py` valida input/output; `planning.py` implementa A/B,
cache e ricevute; `providers.py` compone solo HTTP ammesso e normalizza risultati;
`acquisition.py` riusa il downloader con allowlist e crea attestazioni pendenti;
`review.py` separa dossier, profilo cieco e shortlist; `store.py` conserva freeze,
revisioni e invii; `run.py` orchestra; `benchmark.py` confronta a pari budget.

Il profilo del provider specifica lingua, parametri, filtri e limiti realmente
supportati. GPT sceglie solo testo, modalità e categoria proposta. Parametri,
endpoint, offset/pagine e allowlist sono scelti dal codice. Una categoria Commons
è risolta contro l'API prima dell'uso; se inesistente si registra un fallback
testuale, mai un ID inventato. Openverse è discovery: la fonte originaria deve
essere verificata separatamente.

La verifica documentale richiede autore, fonte, licenza riconosciuta, autenticità,
assenza di modifiche semantiche e attestazione esplicita degli obblighi/diritti.
Nessuna risposta del provider o del VLM può produrre questa attestazione.
Il VLM vede solo pixel e rubrica; la shortlist usa tutti i profili disponibili,
senza soglia di aderenza al target, e propone al massimo cinque immagini.
L'approvazione finale è sempre una decisione umana distinta; nessun nuovo
endpoint pubblica immagini o modifica il campionamento del gioco.

Richieste, output, errori, revisione, modelli, istruzioni, hash e timestamp sono
privati. Zero hit, rate limit, errori, parziali, licenze ambigue, autenticità
incerta e rifiuti umani hanno eventi distinti. Un checkpoint interrotto durante
un invio è incerto, non ritentato automaticamente. I nuovi run non modificano
checkpoint precedenti; una riformulazione usa una nuova revisione.

## Dipendenze e dismissione

L'audit #57 è il prerequisito progettuale già consegnato. #44/#45 (indice/cluster),
#46 (varietà visiva), #48 (suggeritore), #49 (dashboard) e #50/#28 (metriche gioco)
non bloccano #56. #47 resta utile per lo studio reale, ma il confronto di query
generiche/adattate è implementabile senza embedding. Della #53 si riusano i 12+12
slug; l'intera PR #55, caption e ricette non sono prerequisiti della discovery.

Si possono rimuovere in seguito orchestratori obsoleti, non interi alberi
`pipeline/` o `pipeline/v2/`: direct, provider, licenze, storage, payload e lettori
storici sono ancora riusati. Prima di rimuovere v1/Batch occorre:

1. Inventariare run/job pendenti e completarne o conservarne il recupero.
2. Estrarre le utilità effettivamente condivise, mantenendo fixture e checksum.
3. Rendere i vecchi entrypoint esplicitamente legacy, poi rimuovere solo i percorsi
   di nuova produzione ormai sostituiti, con test sui lettori storici.
4. Proporre separatamente la dismissione del workflow v1: il cron/gate esistente
   non si modifica in questa issue. Non chiudere PR/issue automaticamente.
5. Conservare migrazioni, tabelle, originali, cataloghi, freeze, licenze, ricevute
   e audit; la dismissione di codice non è autorizzazione a cancellare dati.

Questa PR implementa #56 e documenta la rimozione possibile; non effettua quella
rimozione né attiva API pagate, cron, deploy, migrazioni remote o pubblicazione.
Benchmark fixture dimostra riproducibilità/contabilità, non una resa editoriale
reale: campione fotografico e giudizi umani restano necessari prima dell'attivazione.

## Uso locale e formato delle consegne

```sh
# Nessuna rete, nessun modello:
npm run discovery:real -- matrix
npm run discovery:real -- prepare --topic animals --emotion compassion --intensity medium --out .pipeline/real/run-001
npm run discovery:real -- plan --out .pipeline/real/run-001
# Oppure selezione seedata (history è una lista di eventi feedback del contratto):
npm run discovery:real -- prepare --seed 56 --out .pipeline/real/seed-56
# Confronto completo con immagini/trasporti/giudizi SINTETICI, interamente offline:
npm run benchmark:real -- --out .pipeline/real/fixture-comparison
```

`prepare --slop-plan FILE` ammette il piano text-only v2 esistente: viene
congelato prima del retrieval, ma questo CLI non genera SLOP. Senza quel file
il ramo sintetico è assente. Non lo si aggiunge dopo aver visto REAL nello
stesso run. La directory del run è privata (0700), i file 0600; `.pipeline/`
resta ignorata da Git. I receipt contengono hash e payload, non credenziali.
Il chiamante mantiene il lock del workspace per l'intera operazione.

Solo dopo autorizzazioni/configurazione pertinenti, il percorso operativo è:

1. `plan --execute --model MODELLO_GPT_6_1 --base WORKER --run-id ID --out RUN`:
   A produce fino a cinque strategie, B fino a tre varianti per fonte. Nessun
   fallback di modello. `--revision N` produce nuove ricevute, non sostituisce
   quelle precedenti. Il modello deve coincidere con quello configurato sul server.
2. `retrieve --live --out RUN --max-calls 30 --page-size 20 --max-pages 1`:
   budget HTTP cumulativo del run, Commons/Openverse isolati, risposte parziali
   conservate. 429 registra `Retry-After` e ferma la fonte; una nuova revisione
   esplicita è necessaria per ritentare, nessun loop di retry o attesa implicita.
3. `acquire --live --out RUN --download-host HOST` (ripetibile per più host):
   massimo 20 asset, downloader esistente con controllo redirect, timeout e limite
   12 MB. Questi download GET mantengono il backoff limitato del downloader legacy.
   Licenza non riconosciuta significa nessun download automatico. Gli originali
   restano integri; errori/incertezze non producono nuovi tentativi su resume.
4. Compilare `RUN/documentary-input.r1.v1.0.0.json`: è una bozza modificabile,
   mai sovrascritta dal CLI. Lo snapshot template originale resta separato e
   immutabile. Collegare prove alla fonte originaria, verificare origine senza
   modifiche generative, autore, licenza e obblighi; aggiungere revisore e timestamp.
   Per Openverse non basta la landing dell'indice. Non cambiare le prove solo
   per superare il validatore: uno schema non certifica fatti o diritti.
5. `document --manifest FILE --out RUN`, poi
   `profile --execute --model MODELLO_GPT_6_1 --base WORKER --run-id ID --out RUN`.
   Nessuna immagine con gate documentali pendenti viene inviata al VLM. Originale
   e variante whole-frame sono distinti; il profilo è legato allo SHA della variante.
   `shortlist.rN.v1.0.0.json` propone al massimo cinque immagini, meno se disponibili,
   senza riempitivi o filtri di match all'intenzione.
6. `review --manifest DECISIONI --out RUN`: decisioni con `candidate_id`, `sha256`,
   `decision` (approved/rejected/pending), `reviewer`, `revision` consecutiva e
   `confirm_reviewed:true`. Nessuna pubblicazione. `export --out RUN` produce
   un envelope con manifest fotografico compatibile con l'ingresso v2 per una
   successiva revisione/importazione esplicita. Non trasferisce automaticamente
   approvazioni o caption e non rende il catalogo giocabile. Le fixture non sono
   esportabili al flusso reale.

Gli snapshot di lavoro sono envelope `{sha256,payload}`. Per leggere un piano
o una shortlist usare `payload`; i manifest documentali e le decisioni forniti
al CLI sono normali liste JSON. Campi `features` opzionali hanno solo contratto
`dinov2-small-q8-cls-v1`, SHA dei pixel finali, dHash e vettore normalizzato a
384 dimensioni: si riusano cache e comparatore esistenti. Senza cache non si
scarica un nuovo modello. SHA identico segnala duplicato conservato; dHash/DINOv2
producono suggerimenti di review, non cancellazioni o rifiuti automatici.

Per baseline live a pari budget usare le stesse strategie canoniche estratte da
`strategies.rN.v1.0.0.json` (solo payload) in un run separato con la medesima
intenzione: `plan --baseline --strategies FILE --out RUN_BASELINE` funziona offline.
`benchmark --baseline-dir RUN_BASELINE --out RUN_ADATTATO` rifiuta intenzioni,
strategie o policy HTTP diverse. Espone anche differenze fra chiamate effettive:
cache e query duplicate possono consumare meno del budget massimo. Non confondere
pari allowance con numero identico di richieste eseguite. Le metriche distinguono
fonte, hit, errori, ammissibilità, profili, duplicati, giudizi finali, distribuzioni
osservate e prenotazioni. Giudizi mancanti ⇒ resa approvata `null`, non zero.
Non è inclusa una metrica di copertura embedding opzionale senza dati reali.

## Gate e contabilità

Il client richiede `ENABLE_REAL_DISCOVERY_PAID=true`, `REAL_OR_SLOP_ADMIN_TOKEN`,
`OPENAI_API_KEY` e `--execute`; il Worker richiede separatamente:

- `ENABLE_REAL_DISCOVERY_PAID=true` e `REAL_DISCOVERY_MODEL` esplicito;
- `REAL_DISCOVERY_CALL_USD` (prenotazione conservativa per chiamata),
  `REAL_DISCOVERY_RUN_USD`, `REAL_DISCOVERY_DAILY_USD`, `REAL_DISCOVERY_TOTAL_USD`;
- `REAL_DISCOVERY_MAX_CALLS` positivo e al massimo 2000.

Nessuno di questi gate viene configurato dalla PR. Endpoint autenticato
`POST /api/admin/editorial/real-discovery/reserve`: inserimento condizionale
atomico in `editorial_usage` esistente, namespace `real-`, classe contabile
`evaluation`. I totali condivisi includono gli usi legacy, nessuna nuova migrazione.
Stessa prenotazione concorrente ⇒ una sola concessione nuova; il client non
inoltra il modello se il server risponde `already_reserved:true`, per evitare
un doppio invio dopo un ack perso. Resta possibile una prenotazione senza invio:
non si presume un rimborso. La stima prenotata non è una fattura né un tetto
account OpenAI; il proprietario deve dimensionarla per input/output del modello.

## Evidenze API e limiti

Profili in `shared/real-discovery-providers.v1.0.0.json`, con URL e SHA delle
fonti consultate: paraminfo MediaWiki per search/categorymembers/imageinfo;
serializer ufficiale Openverse fissato al commit
`3b0bae91bc171a87675b5ffe2e89860d5c5aecd1`. I parametri sono un sottoinsieme
conservativo, non tutte le capacità del servizio. Non sono stati introdotti
filtri basati su ID o categorie non risolti. Commons e Openverse da questo
ambiente restituiscono HTTP 403: source verification non equivale a live readiness.
Prima del pilota controllare nuovamente API, contatto/User-Agent, accesso,
quote, condizioni d'uso e disponibilità dei modelli. I GET di documentazione
non sono stati presentati come ricerche fotografiche riuscite.

Rollback: lasciare chiuso il nuovo gate e tornare agli entrypoint precedenti per
nuovi cicli compatibili, conservando run/ledger/cache. Nessun cambiamento a
produzione, gioco, caption, schema D1/R2 o asset è necessario per tornare indietro.
