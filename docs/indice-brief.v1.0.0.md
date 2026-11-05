# Indice testuale dei brief — v1.0.0

Implementazione della issue #44. Protocollo operativo: [v3.0.0](protocollo-editoriale.md).
L'indice serve alla pianificazione della varietà prima delle acquisizioni. Non
valuta fotografie, autenticità, diritti, approvazione, divertimento o difficoltà.
Il rapporto riproducibile è in [rapporto-indice-brief.v1.0.0.json](rapporto-indice-brief.v1.0.0.json).

## Catalogo e migrazione

Il catalogo canonico è [briefs.v1.1.0.json](../data/editorial/briefs.v1.1.0.json):
100 bozze, ID stabili, revisione individuale **2**. È il nuovo default del CLI
`pipeline.v2.brief_catalog`. Versione del protocollo e schema JSON restano
invariati. Non sono aggiunti campi italiani o localizzazioni parallele.

[briefs.v1.json](../data/editorial/briefs.v1.json) rimane integro e leggibile
esplicitamente con `--catalog`; non è incorporato dall'indice. I cicli già
congelati mantengono file, hash, revisione e istruzioni. Provare a riesportare
la selezione inglese nella cartella di un vecchio ciclo fallisce senza
modificarlo. Per nuove selezioni usare cartelle nuove.

[brief-migration.v1.0.0.json](../data/editorial/brief-migration.v1.0.0.json)
registra hash del file originale, hash canonici di entrambi i cataloghi e di
ciascuna voce, revisione di partenza/arrivo, campi cambiati e conservati.
Le descrizioni sono state tradotte individualmente in fase di implementazione,
conservando soggetto, relazioni e contesto. Non provengono da foto REAL né da
un'API di traduzione. I prompt e le due query erano già inglesi: restano
identici. Questa revisione richiede review; non attribuisce approvazioni al
proprietario e mantiene tutti gli stati `draft`.

[brief-tags.v1.0.0.json](../data/editorial/brief-tags.v1.0.0.json) contiene le
16 identità canoniche inglesi `snake_case`, definizioni, mappatura completa dei
tag storici e sinonimi da normalizzare esplicitamente. `paesaggi` diventa
`landscapes` (argomento); `paesaggio` diventa `landscape_context` (contesto).
Unirli perderebbe una distinzione già usata dal catalogo. La migrazione deduplica
le destinazioni ma questi 16 tag non richiedono fusioni.

Un nuovo tag richiede una definizione e una revisione esplicita del vocabolario
versionato; prima verificare se esiste un sinonimo. Valori sconosciuti,
italiani, sinonimi registrati, duplicati e formati diversi vengono rifiutati.
La validazione di descrizione/prompt blocca indicatori italiani e richiede
parole funzionali inglesi: è una guardia conservativa, **non un classificatore
linguistico** né una prova della fedeltà della traduzione. Una review editoriale
resta necessaria, soprattutto per altre lingue e nuovi vocaboli.

Le nuove ideazioni chiedono descrizioni/prompt inglesi e li validano prima del
congelamento; il recupero degli snapshot storici conserva il contratto precedente.
Le due `search_queries` sono inglesi nel catalogo migrato. Una query alternativa
può usare un'altra lingua per trovare fonti REAL: non si applica a description,
tags o prompt, non aggiunge campi e non cambia il limite storico di due query.

## Encoder e rappresentazione

Il testo canonico è `description`, normalizzata NFKC/spazi, seguita da
`\nMedium: photograph` oppure `\nMedium: artwork`. Non contiene tag,
`slop_prompt`, query, stato, ID o materiali REAL. Il digest del contenuto completo
è comunque nella chiave cache: ogni modifica della voce viene tracciata.

| Encoder | Impiego | Dimensioni / licenza / costo |
| --- | --- | --- |
| `Xenova/all-MiniLM-L6-v2` | Encoder testuale locale preaddestrato; mean pooling, L2, ONNX q8 CPU | 384; Apache-2.0; nessuna tariffa API, calcolo locale |
| `real-or-slop/tfidf` v1.0.0 | Baseline lessicale, parole ASCII minuscole, TF grezza, IDF smussata | Vocabolario del corpus (nel rapporto); implementazione locale, nessun servizio o costo API |
| `real-or-slop/fixture-hash` v1.0.0 | Test di trasporto/cache deterministici | 32; **non semantico**, mai sostitutivo di MiniLM |

MiniLM usa la revisione immutabile
`751bff37182d3f1213fa05d7196b954e230abad9` e il runtime già presente
`@huggingface/transformers@3.8.1`. Pesi/tokenizer sono distribuiti dal
[repository ONNX](https://huggingface.co/Xenova/all-MiniLM-L6-v2/tree/751bff37182d3f1213fa05d7196b954e230abad9);
[model card originale](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2).
È un encoder solo testuale per similarità di frasi inglesi, senza spazio condiviso
con immagini. Nessun requisito SigLIP/CLIP/DINOv2 per questa fase.
Il limite documentato è 256 token: il codice controlla la tokenizzazione e
rifiuta input più lunghi, invece di perdere silenziosamente il contesto finale.
La cache dei file del modello misurata in questa prova occupa circa 23,7 MB;
la memoria del runtime ONNX è aggiuntiva. Non è un limite di memoria garantito.
CPU, ONNX e quantizzazione possono introdurre piccole differenze numeriche tra
piattaforme: registrare l'ambiente e non promettere identità bit a bit universale.

TF-IDF registra vocabolario, IDF, formula, tokenizer e hash del corpus di fit
nella propria identità. Una modifica del corpus invalida tutti i suoi vettori;
MiniLM conserva gli hit delle voci invariate. TF-IDF non riconosce bene sinonimi
e parafrasi; MiniLM può appiattire negazioni, relazioni, composizione o soggetti
rari. Entrambi possono riflettere bias del testo.

Il confronto usa [18 annotazioni / 8 terne](../data/editorial/brief-annotations.v1.0.0.json)
create in fase di implementazione, condivise fra i due encoder e le due
rappresentazioni. La variante strutturata include soggetto, contesto e
composizione annotati separatamente. Il rapporto conserva motivazioni,
similarità originali e margini. Sono annotazioni dell'autore dell'implementazione,
**non una valutazione umana indipendente o cieca**. Il campione è piccolo e
intenzionale: non basta per concludere che MiniLM superi la baseline o che
la struttura migliori la varietà. Manteniamo il testo neutrale come default,
per evitare annotazioni aggiuntive e bias non validati. Una validazione editoriale
indipendente può guidare una successiva revisione della rappresentazione.

## Esecuzione e recupero

Prerequisiti: Node 24, Python 3.12, dipendenze già presenti nel lockfile:

```sh
ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci
python3 -m pipeline.v2.brief_catalog --check --english
npm run index:briefs -- --dry-run
npm run index:briefs -- --fixture
npm run index:briefs -- --encoder tfidf
# Solo download gratuito dei pesi fissati; non esegue inferenze remote:
NODE_USE_ENV_PROXY=1 npm run index:briefs -- --allow-model-download
# Con modello in cache: indicizzazione e confronto interamente offline:
npm run index:briefs
npm run index:briefs -- --compare
npm run index:briefs -- --encoder tfidf --compare
```

Nessun adapter di API a pagamento è implementato; costo API stimato **0 USD**
per ciascun comando. Compute, disco e traffico del proprio ambiente possono
avere costi infrastrutturali. Il download richiede il flag esplicito, rete e
proxy dell'ambiente; senza flag, un modello assente produce errori e un codice
di uscita non zero. Non cambia encoder e non usa una fixture di nascosto.
`NODE_USE_ENV_PROXY=1` abilita il supporto proxy nativo di Node 24 quando serve.

`--dry-run` valida il catalogo e le voci cache, conta mancanti/errori, non carica
ONNX e non scrive cache o snapshot. `--fixture` è offline anche con cache vuota;
la sua identità è separata da quella degli encoder semantici.

Default privati e ignorati da Git:

- `.pipeline/brief-embeddings/cache/`: record immutabili `<chiave>.v1.0.0.json`;
- `.pipeline/brief-embeddings/snapshots/`: snapshot completi e confronti;
- `.pipeline/brief-models/`: modello/tokenizer per inferenza locale.

`--catalog`, `--cache`, `--out` e `--model-cache` permettono copie isolate.
Ogni record include ID/revisione/status/medium, digest del contenuto e del testo,
encoder/revisione/runtime/configurazione, rappresentazione, normalizzazione,
dimensione, timestamp ISO 8601, stato `complete`, checksum e vettore finito L2.
La chiave composita copre tutti questi input. Lo snapshot conserva anche hash
del catalogo e copertura. Il suo ID è deterministico per gli stessi input;
il primo timestamp di ciascun record viene riusato dalla cache.

I JSON sono creati con `wx`, directory 0700 e file 0600: contenuti diversi non
sovrascrivono file esistenti. Una voce corrotta o incompatibile produce un errore
leggibile e non viene sostituita. Per ricostruire usare una nuova cartella cache
**e** snapshot, conservando la precedente per audit. In caso di interruzione i
record completi restano recuperabili; lo snapshot completo si scrive solo con
copertura totale. Il report CLI elenca processati, hit, errori con ID/chiave,
operazioni pianificate, copertura e costo stimato; gli errori hanno stato `error`
e uscita 1. Non sono memorizzati come vettori validi o successi fittizi.

## Verifica e limiti

`npm test` include test Node e Python per i 100 record, schema mancante,
lingua legacy, tassonomia e nuovi tag, query localizzate, integrità della
migrazione, snapshot congelati, vettori malformati, cache corrotta,
revisioni/modello/rappresentazione, ripresa e dry-run. Il test Python con SemVer
nel nome è invocato esplicitamente: `unittest discover` ignora nomi modulo con
punti. La CI esistente esegue questi controlli senza scaricare modelli.
`npm run lint` verifica anche lo script. `npm run build` verifica TypeScript e
asset: i dati e l'encoder testuale non sono importati da frontend o Worker.

Le distanze testuali non misurano da sole composizione o varietà dei pixel,
non certificano ammissibilità REAL e non sono una soglia di match. Le fasi
successive #45–#50 potranno leggere snapshot identificati e immutabili;
questa modifica non implementa ancora metriche di copertura, dashboard o
valutazione empirica con giocatori. Rimangono necessarie l'approvazione umana
e le verifiche separate di provenienza e diritti. I due spazi testuale/visivo
non sono direttamente confrontabili.
