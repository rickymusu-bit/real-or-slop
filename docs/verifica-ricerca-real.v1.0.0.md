---
version: 1.0.0
created_at: 2026-11-06T16:00:00Z
status: local-verification-not-activated
source_issue: 56
---

# Verifica e dipendenze della nuova discovery

Base main `67ecf494ba8fe86d551525e1db330d1f31764975`; base documentale #58
`77f6cb877f7e8b3958669ca9c621ed28d5f9942d`. #58 e #51/#52/#55 ancora draft,
non integrati. La PR #56 si basa sulla #58; il suo delta applicativo è separato.
Nessuna PR o issue preesistente viene chiusa, integrata o modificata.

## Cosa è implementato

- Contratto JSON e tassonomia 1.0.0: 432 combinazioni, 408 significative;
  intenzioni e attributi osservati distinti, neutralità e multi-emozione coperte.
- A strategie e B adattamento GPT separati, schema strutturato, cache su modello/
  istruzioni/input/revisione/hash, ricevute private e nessun reinvio incerto.
- Adapter Commons/Openverse con profili e parametri deterministici, risoluzione
  categorie, fallback testuale, paginazione limitata, zero/errori/429/parziali
  distinti, call allowance persistente e stop fonte dopo errore.
- Acquisizione esplicita con allowlist e originali conservati; attestazioni
  documentali umane, hash prima dei profili, VLM cieco e shortlist di 3–5 dove
  disponibili. Cache SHA/dHash/DINOv2 riusata, niente nuova inferenza embedding.
- Review per immagine/revisione/SHA e export esplicito, senza pubblicazione,
  coppie obbligatorie, modifiche di gioco o migrazioni.
- Prenotazione atomica autenticata nel ledger D1 esistente, gate chiuso di
  default; test locale con API modello finta e nessuna chiave OpenAI usata.

## Verifiche riproducibili

Ambiente: Node 24.19.0, npm 11.9.0, Python 3.12.14 e venv con Pillow 12.0.0.
Dipendenze già installate dal lockfile nella baseline #57; nessuna dipendenza
aggiunta o cambiata. `PATH` include `/tmp/ros-issue57-venv/bin`, XDG usa `/tmp`.

```sh
npm run lint
npm test
npm run build
npm run deploy:check
npm run dry-run
npm run test:integration
ROS_TEST_BATCH=1 npm run test:integration
ROS_TEST_V2=1 npm run test:integration
ROS_TEST_PROFILE= npm run test:integration
ROS_TEST_REAL=1 npm run test:integration
npm run benchmark:real -- --out .pipeline/real/fixture-comparison
# Ripetere lo stesso comando fixture deve restituire lo stesso rapporto.
git diff --check
```

Lint, test, build, controllo deployment e packaging passati. Le cinque suite
di integrazione sono passate separatamente con migrazioni/seed D1 e R2 emulati:
generale, Batch, v2, senza R2 e nuove prenotazioni REAL. CI conserva le verifiche
preesistenti e aggiunge solo il profilo locale REAL; workflow di acquisizione e
cron esistenti non modificati. Avviso build preesistente sui chunk oltre 500 kB.
Suite completa: 18 file Node e 192 test Python passati. Dopo l'ultimo adeguamento
dello schema Responses sono stati ripetuti i 25 test Python specifici e il
benchmark due volte; esiti invariati. Verificati 84 link locali, snapshot 2.0.0
identici agli ingressi e snapshot 1.0.0 integri; `git diff --check` passato.

Nuova copertura: 25 test Python, più prove Node per autenticazione/gate e
parametri di prenotazione, più integrazione HTTP/D1 per concorrenza, cache,
budget per run/giorno e ledger condiviso. Le prove coprono errori provider,
output GPT invalido, URL/ID inventati, categoria mancante/esistente, 429,
parziali, ripresa, licenza ambigua, autenticità incerta, zero giudizi, review
idempotente e revoca a pending, hash originali/finali, suggerimenti DINOv2,
assenza di approvazioni/pagamenti/pubblicazioni automatiche e limiti della fixture.

Il [rapporto fixture](benchmark-ricerca-real.v1.0.0.json) è stato generato e
ripetuto dal CLI, non redatto come prova di efficacia. Entrambe le braccia hanno
allowance di 30 richieste, 20 risultati/pagina, una pagina, cinque strategie,
due fonti e otto immagini sintetiche. La baseline esegue dieci ricerche distinte;
l'adattamento fixture collassa query identiche e ne esegue due. Il rapporto
segnala esplicitamente che i conteggi effettivi differiscono. Giudizi simulati,
zero approvazioni umane reali; nessun vantaggio editoriale misurato o dedotto.

## Vecchie issue: cosa serve davvero

| Issue/lavoro | Necessario prima di #56? | Trattamento |
| --- | --- | --- |
| #57 / #58 | Audit e contratti di confine sì; merge non eseguito | Audit consegnato e usato come base; test di protezione aggiunti qui |
| #44 / PR #51 | No | Migrazione inglese dei vecchi brief e indice opzionali; nuovi metadati #56 sono inglesi senza migrare il vecchio seed |
| #45 / PR #52 | No | Cluster e coverage semantiche restano diagnostiche facoltative |
| #46 | No | Nuova analisi di varietà opzionale; deduplica già esistente riusata |
| #47 | Non come implementazione precedente | Benchmark fotografico ancora utile prima dell'attivazione; confronto generic/adapted e metriche già predisposti qui |
| #48 | No | Suggeritore dei brief è distinto dai due stadi di query |
| #49 | No | Dashboard futura può leggere gli snapshot, non è una dipendenza del CLI |
| #50 / #28 | No | Statistiche gioco e verifica formativa restano lavori indipendenti |
| #53 / PR #55 | Solo concetti/slugs riusati, non tutta la PR | Tassonomia mantenuta con provenienza; matrice 2D, caption, ricette e licenza v4 non importate in blocco |
| #54 | No | Swipe indipendente |

Non equivale a dichiarare inutili o completate le issue precedenti. Nessuna
chiusura automatica. Il cambiamento di priorità è documentato senza riscrivere
i loro requisiti o appropriarsi delle verifiche dichiarate nei branch.

## Rimozione delle pipeline obsolete

È possibile una dismissione successiva e selettiva. **Non è sicuro cancellare
ora `pipeline/*.py` o `pipeline/v2/` interi**:

| Componente | Perché è ancora necessario | Condizione prima della rimozione |
| --- | --- | --- |
| `pipeline/editorial.py` | `PipelineStop`, scrittura privata, payload/risposte e timestamp usati anche da v2/#56 | Estrarre utilità senza importare ranking/preferenze, testare compatibilità |
| `pipeline/providers.py`, `run.py`, `licenses.py`, `importer.py` | HTTP/client, download controllato, normalizzazione, diritti e trasferimenti | Conservare/estrarre le interfacce condivise; non eliminare gli archivi |
| `pipeline/v2/direct.py`, `engine.py`, `protocol.py` | API diretta, file originali/varianti e validatori riusati | Separare eventuale orchestrazione Batch dalle utilità; preservare dossier storici |
| `pipeline/batch*.py` e API Worker corrispondenti | Recupero di job/checkpoint preesistenti e dipendenze transitive v2 | Inventario dei run remoti, strategia di recupero/sola lettura e fixture prima di rimuovere nuovi invii |
| Vecchi workflow | Coda v1 ancora configurata con cron/gate | Dismissione operativa separata e autorizzata; non modificarli con una pulizia di codice |
| Migrazioni/cataloghi/freeze/dati/asset | Audit e compatibilità, non codice duplicato | Conservare; nessuna cancellazione richiesta per dismettere un orchestratore |

Non sono stati interrogati i run remoti: non si può attestare che siano tutti
conclusi. La specifica descrive l'ordine di dismissione. La #56 aggiunge il
percorso sostitutivo senza trasformare una domanda sulla rimozione in cancellazione.

## Limiti prima del live

Source verification dei profili: API paraminfo MediaWiki e sorgente ufficiale
Openverse fissato con commit/SHA. Accesso alle API di ricerca Commons e Openverse
da questo ambiente: **HTTP 403**. Non certificati retrieval live, autenticità/
diritti di fotografie reali, qualità emotiva, costi reali, bias, efficacia formativa
o stato dei gate/risorse remoti. Prima dell'attivazione servono accesso API,
pilota autorizzato e giudizi umani documentati; il software non li inventa.

Nessun deploy, merge, cron, modifica di secret, migrazione D1/R2 remota,
inferenza pagata, pubblicazione o eliminazione di asset eseguita. Nuovi gate
rimangono assenti/disabilitati; le automazioni di PR/preview eventualmente già
configurate sul push sono esterne alle verifiche locali. Nessun lettore o dato
storico è stato rimosso.
