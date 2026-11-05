# Controllo di duplicati e scene simili — v1

La pagina privata `/admin/similarity`, collegata dalla revisione e dalla gestione
avanzata, confronta l’archivio privato e le fotografie pubblicate. Le illustrazioni
demo sono escluse. La scansione confronta separatamente **REAL con REAL** e **SLOP con SLOP**.
Il confronto REAL–SLOP è escluso anche nei confronti manuali e nei gruppi di
scene usati dal gioco. All’interno di ciascuna origine comprende tutte le
categorie tematiche, anche quelle non classificate; il filtro editoriale mostra le coppie che coinvolgono almeno
un’immagine della categoria scelta. Le categorie esistenti sono lette dal
catalogo; le integrazioni manuali sono conservate separatamente per questa revisione.

## Estrazione e confronto

- SHA-256 lega ogni risultato ai byte effettivi. Il server verifica il file R2
  prima di accettare una nuova impronta. Le protezioni esistenti contro importazioni
  identiche restano attive.
- dHash a 64 bit con riduzione in aree e luminanza fissa. Distanza <=5 segnala
  una possibile variazione dello stesso fotogramma; non decide automaticamente.
  Questo calcolo ha un contratto proprio e non sovrascrive i dHash storici.
- DINOv2 small ONNX q8, revisione fissata
  `8b1f705a3a7f6f062f6bdd21986c1583d3ef105d`, token CLS a 384 dimensioni
  normalizzato L2. Modello `onnx-community/dinov2-small`, contratto
  `dinov2-small-q8-cls-v1`. La similarità coseno >=0,88 propone una coppia.

**0,88 è una soglia iniziale, non calibrata sul catalogo reale.** Il valore non
esprime una probabilità di duplicazione. Cambiamenti di prospettiva, occlusioni,
illuminazione e composizione possono produrre falsi negativi; temi e stili comuni
possono produrre falsi positivi. La pagina permette anche confronti manuali per
coppie sfuggite al recupero automatico. Nessuna verifica di assenza assoluta di
duplicati viene dichiarata a fine scansione.

L’estrazione avviene sul dispositivo dell’amministratore, oppure sul processo
locale della CLI. Le immagini non vengono inviate a un servizio di inferenza.
Il primo utilizzo scarica i pesi pubblici da Hugging Face; il runtime WASM è un
asset locale della build. Il modulo di inferenza è caricato soltanto all’avvio
dell’analisi, fuori dal bundle iniziale delle partite. Non sono necessarie GPU o
chiamate OpenAI. Il runtime è pubblicato come asset gzip di circa 5,05 MB e ricostruito nel
browser nei 21,6 MB originali prima dell’inizializzazione ONNX. È caricato
solo quando serve l’analisi, tramite DecompressionStream e wasmBinary.

## Scansione iniziale e nuove acquisizioni

In admin, **Analizza catalogo** avvia o riprende la scansione. Ogni immagine ha un
checkpoint per ID, SHA e versione della politica di confronto. La versione
`dinov2-small-q8-cls-v1:same-origin-v1` invalida i checkpoint della precedente
scansione incrociata, conservando le impronte già estratte. Le impronte vengono riutilizzate per SHA e
modello; un nuovo ID con byte già analizzati viene comunque confrontato. La
scansione e il confronto sono paginati: non si considera verificato solo il primo
lotto di risultati. Errori e file mancanti restano da riprovare. **Interrompi**
arresta il lavoro dopo l’elaborazione in corso.

Dopo una scansione completa riuscita, il browser memorizza l’attivazione locale:
aprire nuovamente la pagina analizza i nuovi file. Non si promette un’elaborazione
in background quando la pagina è chiusa.

Per l’acquisitore e gli import manuali:

```sh
ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci
npm run scan:similarity -- --base https://IL-SITO
```

La CLI legge `REAL_OR_SLOP_ADMIN_TOKEN` dall’ambiente, rifiuta redirect e URL con
credenziali e usa HTTPS fuori localhost. Le immagini sono elaborate in memoria;
la cache `.pipeline/similarity-model/` contiene i pesi pubblici. Le impronte
sono archiviate nel database privato del sito. Un errore lascia il lavoro
riprendibile e restituisce un codice di uscita non zero.

Il workflow esistente `review-queue.yml` esegue la CLI dopo acquisizione/ripresa,
nel rispetto dei gate già esistenti. Nessun nuovo cron è aggiunto. Status e
cancel non avviano scansioni. Gli import eseguiti fuori da quel workflow si
controllano con la CLI o aprendo la pagina privata.

## Decisioni e gioco

- **Tieni entrambe**: considera la coppia distinta, annullando anche il
  raggruppamento percettivo automatico per quella coppia nelle nuove partite.
  I file con identici byte mantengono comunque un solo rappresentante.
- **Stessa scena**: crea una relazione confermata. Le relazioni sono transitive;
  le nuove partite scelgono un rappresentante del gruppo.
- **Preferisci la prima/seconda**: raggruppa la scena e dà priorità alla scelta
  come rappresentante. Preferenze multiple nello stesso gruppo vengono risolte
  stabilmente per ID. Non vengono eliminate immagini o modificate approvazioni.
- **Rimetti da verificare**: ritira l’effetto della decisione; il gruppo viene
  ricalcolato e può dividersi.

I gruppi percettivi e di scene sono separati per origine: una somiglianza fra
REAL e SLOP non crea una relazione e non esclude le immagini dalle partite.
Eventuali vecchie coppie incrociate restano storiche e non sono applicate. Le
protezioni già esistenti sull’identità dei file e sulle etichette contraddittorie
restano controlli di integrità distinti dal confronto visivo. Gli scarti e la capacità vengono determinati prima delle monete 50/50.
Sessioni già assegnate e vecchi giudizi restano invariati. Le relazioni con un
file eliminato o una presentazione cambiata diventano storiche e perdono effetto.

Decisioni concorrenti usano revisione e SHA di entrambe le immagini. Solo una
transizione riesce per revisione. Lo storico è append-only e identifica il
token amministrativo condiviso con un’impronta, non una persona individuale.

## Rilascio

La migrazione additiva `0017_image_similarity.sql` introduce soltanto tabelle e
viste private. La versione del Worker deve essere rilasciata dopo la migrazione;
il vecchio Worker continua a funzionare sul nuovo schema.

Il 5 novembre 2026, dopo autorizzazione esplicita dell’utente, sono stati eseguiti:

- Backup D1 e ripristino in SQLite locale: integrità OK, zero errori di chiavi
  esterne. La migrazione è stata provata sul ripristino prima dell’applicazione.
- Backup dei due bucket R2: **539 oggetti, 796.401.824 byte**, con inventario e
  checksum locali. Copie private in `.pipeline/similarity-audit/backup/`, escluse
  da Git; nessun originale rimosso o sovrascritto.
- Applicazione di **0017**, con schema precedente compatibile. Il seed previsto
  dal comando di rilascio ha scritto zero righe nel catalogo esistente.
- Rilascio manuale del Worker dal commit `c7fde30`, versione Cloudflare
  `e66acdd3-1b9d-40f6-96ee-890d8fa4c886`:
  <https://real-or-slop.rickymusu.workers.dev/admin/similarity>.
- Prima scansione dell’archivio corrente: **58 immagini, 1.653 coppie**, tutte le
  impronte verificate e salvate. **Zero coppie oltre le soglie attuali**, zero
  immagini ancora da analizzare e zero decisioni umane inventate. Il massimo
  coseno osservato è circa 0,6433. Questo risultato non certifica l’assenza
  assoluta di duplicati o scene ripetute.

Le 58 immagini correnti sono prive di categorie assegnate; il confronto globale
le include tutte. Le categorie possono essere integrate nella pagina privata.
Il token amministrativo non è disponibile in questo runtime: la scansione
iniziale è stata eseguita sulle copie verificate del backup e registrata tramite
le API D1 dell’account Cloudflare già configurato, senza cambiare autenticazione.

Un primo caricamento del runtime WASM non compresso ha incontrato un errore
nel trasferimento degli asset. Il rilascio è riuscito dopo la compressione gzip:
verificati checksum dei byte ricostruiti, compilazione WebAssembly e inferenza
DINOv2 con il backend web WASM. Una prova su input fisso ha prodotto coseno
circa 0,99589 fra vettori CLS del backend WASM e quello nativo. Le differenze
numeriche fra backend restano un limite della quantizzazione.

Controlli sul sito pubblicato: health 200, asset correnti 200, runtime gzip 200
con byte ricostruiti identici, pagina e API admin protette con 401 per richieste
senza credenziali. Restano non eseguite la prova interattiva nel browser e la
calibrazione su coppie reali etichettate. Il rilascio è manuale; non sono stati
eseguiti merge su main o modifiche alle abilitazioni del workflow GitHub.

API protette: `/api/admin/similarity`, `/assets`, `/assets/:id/image`,
`/assets/:id/features`, `/assets/:id/categories`, `/pairs`,
`/pairs/:id/decision`, `/pairs/:id/history`. Nessuna impronta, relazione o nota è
inclusa nelle risposte pubbliche del gioco.

## Correzione del perimetro — 5 novembre 2026

L’utente ha chiarito che i due gruppi da controllare sono REAL e SLOP e che le
coppie fra origini diverse devono essere escluse. La scansione aggiornata
confronta **29 REAL fra loro (406 coppie)** e **29 SLOP fra loro (406 coppie)**:
**812 confronti**, senza le 841 coppie REAL–SLOP precedentemente incluse.
Impronte riutilizzate; nessuna nuova inferenza o modifica alle immagini.
La pagina distingue esplicitamente i due gruppi e impedisce anche di creare
una coppia manuale mista. Le categorie tematiche sono filtri aggiuntivi.

La correzione non richiede una migrazione: il modello delle impronte resta
invariato e la nuova versione del checkpoint registra il perimetro aggiornato.

Correzione rilasciata dal commit `e2fd5a3`, versione Cloudflare
`261c6075-bac0-4642-9209-ca5b2a6a34b0`. Scansione corretta completata:
812 confronti interni ai due gruppi, zero coppie segnalate alle soglie attuali
e nessuna immagine ancora da analizzare. Test unitari e integrazione D1/R2
passati, compreso il rifiuto di coppie miste con impronte identiche.
