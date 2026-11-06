# Correzione: confronto separato REAL e SLOP — 2026-11-05

L’utente ha chiarito il perimetro: cercare duplicati e foto troppo simili fra le
REAL e, separatamente, fra le SLOP. Corretti acquisizione delle coppie,
confronti manuali, elenco/storico, conteggi, checkpoint e raggruppamenti del gioco.
Le impronte sono riutilizzate; le eventuali vecchie coppie incrociate non vengono
applicate. La pagina distingue i due gruppi e filtra la seconda immagine manuale
in base all’origine della prima. Nessuna migrazione aggiuntiva.

Verifiche passate: 17 file TypeScript, 167 test Python, lint, build e integrazione
D1/R2 completa. I nuovi test usano impronte identiche fra origini diverse per
provare che non si creino coppie miste né fusioni percettive fra REAL e SLOP;
entrambi i gruppi continuano a produrre segnalazioni al proprio interno.

Scansione reale corretta: **29 REAL / 406 coppie e 29 SLOP / 406 coppie**, totale
**812 confronti**, zero coppie oltre le soglie attuali, zero immagini pendenti.
Gli 841 confronti REAL–SLOP precedentemente inclusi sono esclusi. Nessuna nuova
inferenza o modifica a file, categorie, approvazioni o decisioni editoriali.

Rilasciato dal commit `e2fd5a3`, versione Cloudflare
`261c6075-bac0-4642-9209-ca5b2a6a34b0`. Health, asset aggiornati e protezione
admin verificati sul sito. Il report iniziale con 1.653 coppie riportato sotto
riguarda il perimetro precedente e non descrive la verifica corrente.

---

# Controllo somiglianze — 2026-11-05

Implementato il [controllo di duplicati e scene simili](controllo-somiglianze-v1.md):
SHA-256, dHash, DINOv2 small q8 con revisione fissata, estrazione privata nel
browser o nella CLI, confronti affiancati e manuali, filtri/categorie, scansione
incrementale, decisioni concorrenti con storico immutabile e rappresentanti delle
scene nelle nuove partite. Il workflow di acquisizione esistente esegue il
controllo dopo start/resume, rispettando i gate precedenti.

Verifiche completate:

- `npm test`: 17 file TypeScript e 167 test Python, inclusi validazione vettori,
  confronto percettivo/visivo, gruppi transitivi e reversibili, preferenze,
  eccezioni umane alla deduplica percettiva e migrazione additiva 0017.
- `npm run test:integration`: D1/R2 locali, API somiglianze autenticata, categorie,
  file vincolati allo SHA, impronte riutilizzate, retry, decisioni concorrenti,
  storico conservato e confronti manuali. Suite precedenti e gioco passati.
- `ROS_TEST_PROFILE= npm run test:integration`: passato anche senza binding R2.
- `npm run lint`, `npm run build`, `npm run deploy:check`, `git diff --check` e
  packaging Wrangler `npm run dry-run`: passati.
- Estrazione reale CPU con pesi pubblici DINOv2 su fixture locale: vettore
  di 384 dimensioni, norma L2 1 e dHash calcolato. Circa 5 secondi per la prima
  estrazione comprensiva di caricamento/scaricamento del modello.

Rilascio autorizzato completato il 5 novembre 2026:

- Backup D1 ripristinato e controllato prima della migrazione; due bucket R2,
  539 oggetti / 796.401.824 byte, checksum locali e originali conservati.
- Migrazione 0017 applicata. Versione Cloudflare
  `e66acdd3-1b9d-40f6-96ee-890d8fa4c886`, sorgente commit `c7fde30`.
- Runtime pubblicato come gzip da circa 5,05 MB, ricostruito nei 21,6 MB
  originali tramite DecompressionStream e wasmBinary. Verificati uguaglianza
  SHA-256, compilazione WASM e inferenza DINOv2 con backend web. Il test su input
  fisso ha coseno circa 0,99589 rispetto al backend nativo.
- Health e asset pubblicati 200; pagina e API admin 401 senza credenziali.
  Runtime scaricato dal sito e ricostruito con checksum identico all’originale.
- Catalogo reale: 58 immagini / 1.653 confronti; 58 impronte DINOv2+dHash salvate,
  nessuna immagine pendente, zero coppie oltre soglia e zero decisioni umane
  create. Tutti i file confrontati hanno SHA corrispondente al backup.
- `npm test` ripetuto dopo l’adattamento del runtime: 17 file TypeScript e
  167 test Python passati. Lint e build passati.

Limiti: soglia coseno 0,88 iniziale e non calibrata su coppie etichettate;
nessuna prova interattiva browser di questa nuova pagina. Massimo coseno nel
catalogo circa 0,6433; nessuna garanzia di assenza assoluta di scene ripetute.
Le immagini attuali non hanno categorie: il confronto globale le comprende tutte.
Il token admin non è stato cambiato; impronte calcolate sul backup autorizzato e
registrate attraverso le API Cloudflare dell’account configurato. Il primo
rifiuto della copia privata è stato risolto soltanto dopo l’autorizzazione
esplicita dell’utente. Nessun merge su main o cambio alle abilitazioni GitHub.

---

# Cropping assistito — 2026-11-04

Scelta del proprietario recepita: Terra è il metodo predefinito del comando di
presentazione v2, con modello `gpt-6.1-terra`; la baseline centrale richiede
`--method center`. Pianificazione predefinita senza chiamate, costi e invii ancora
espliciti. Verificato il comando reale senza override di modello o metodo;
120 test Python passati dopo questa modifica.

[Implementazione e prova](cropping-assistito-v2.md): 16 chiamate Responses sincrone
a `gpt-6.1-terra`, quattro immagini già quadrate saltate, 20 varianti 1024×1024 RGB.
Sette scelte diverse dal centro e sei segnalazioni, inclusa un'astensione; zero
valutazioni umane registrate e nessuna superiorità misurata. Originali intatti,
profili nuovi pendenti, nessuna pubblicazione. Stima dai token 0,060506 USD con
le tariffe archiviate del pilota, prenotazione aggiuntiva 0,288 USD.

119 test Python passati, compresi limiti del ritaglio, scelta strutturata,
astensione, budget prima delle chiamate, invii incerti senza retry, ripresa
idempotente e rifiuto di varianti alterate. Ripresa del run reale senza permesso
di rete completata senza nuove chiamate. Chromium sulla nuova galleria a larghezze
1440 e 390: 20 confronti, 60 immagini caricate, nessun overflow o errore JavaScript,
voto salvato ed esportato; il voto di prova è stato rimosso. Screenshot e JSON
nell'artifact privato. `git diff --check` superato. Le verifiche
TypeScript, integrazione Worker e gioco nelle sezioni successive si riferiscono
ai rispettivi interventi precedenti: questo aggiornamento modifica Python e
documentazione, non Worker o interfaccia di produzione.

---

# Pilota rapido reale — 2026-11-03

Aggiornamento presentazione: 20 varianti locali 1024×1024 RGB WebP q85, con
ritaglio auditabile e confronto dell'inquadratura precedente. Originali intatti,
profili non trasferiti, revisione pendente, zero nuove API pagate. Test dedicati
su rapporti diversi e coordinate dopo orientamento EXIF. Due keyword provate
sulla ricerca immagini connessa senza filtro di dominio; hit ancora non acquisiti.

[Rapporto del pilota](benchmark-editoriale-v2-pilota-2026-11-03.md): completati
10 output SLOP e 20 profili in sincrono, insieme a 10 candidate fotografiche.
Costo stimato dai token 0,530162 USD, senza verifica della fattura. Tutti i dossier
restano in quarantena. Il gate pagato locale è stato richiuso. Nessuna modifica
alla produzione, a risorse Cloudflare remote o al catalogo.

Sono state corrette la rappresentazione dei diritti pendenti (licenza nulla,
approvazione bloccata), la tracciabilità sincrona tramite request ID reali e la
configurazione esplicita dei limiti di output/reasoning. Le sezioni sottostanti
conservano i risultati precedenti all'esecuzione del pilota.

---

# Protocollo editoriale v2 — 0.15.0, sperimentale non attivato

Verifica locale del 2026-11-03, base `bad071d0a92449a099af4d61663ed7e0794b2bcb`.
Specifica corrente: [v2.0.0](pipeline-editoriale-real-slop-v2.0.0.md).
Il vincolo aggiunto dal proprietario esclude ogni fotografia sorgente SLOP.
La nuova pipeline non usa ranking, soglie, categorie di acquisizione o preferenze
storiche. Il trasporto Batch è condiviso, la politica editoriale è separata.

Verifiche eseguite con esito positivo:

- `npm test`: 16 file di test TypeScript e 107 test Python, inclusi contratti
  condivisi, immagini ordinarie ammissibili, ibridi esclusi, valutazione cieca,
  separazione dei flussi, recupero, costi, deduplica e migrazione additiva.
- `npm run lint`, `npm run build`, `npm run deploy:check`, `git diff --check`.
- `npm run test:integration`, `ROS_TEST_BATCH=1 npm run test:integration`,
  `ROS_TEST_V2=1 npm run test:integration`,
  `ROS_TEST_PROFILE= npm run test:integration`: emulatori locali separati,
  autenticazione, D1/R2 privati, lease/CAS, dossier immutabili, revisione umana,
  budget atomici concorrenti, compatibilità storica e gioco senza spoiler.
- `npm run test:gallery`: Chromium già installato, layout 360/390/768/1440,
  navigazione, tastiera, timer, anteprime e revisione privata v2. L'interfaccia
  v2 usa fixture browser esplicite; autenticazione e revisione reale sono
  verificate separatamente contro D1/R2 locali. Screenshot in `artifacts/gallery/`.
- `npm run benchmark:editorial-v2`: 120 fixture dichiarate, 60 per origine,
  tutte in quarantena, 60 pseudo-REAL bloccate dalla provenienza non verificata,
  nessuna approvazione utilizzabile, `publication_ready: false`. Test separato
  di riproducibilità fra workspace e esclusione delle esposizioni ripetute nei
  dati di trasferimento. Report `artifacts/editorial-v2/report.json`.
- Esempi CLI di scoperta (24 query su due motori, nessuna chiamata di rete) e
  piano SLOP (6 idee autonome, nessuna chiamata o scrittura remota).

La migrazione **0013** è provata solo localmente e conserva tutti i dati storici.
I due gate v2 sono assenti dalla configurazione di produzione; il gate storico
non abilita la v2. Non esiste un endpoint di pubblicazione sperimentale e le sue
candidate non sono righe del catalogo. Sessioni, monete indipendenti 50/50,
preflight, timer e pubblicazione storica mantengono i rispettivi contratti.

Lo studio fotografico con 100–200 candidate vere, query libere effettivamente
prodotte da LLM, eventuali motori generalisti con condizioni verificate e test
umani su immagini/fonti/generatori nuovi **non è stato eseguito**. Non si
presentano le fixture come validazione editoriale o formativa. La preparazione
LLM delle query è un input esplicito e tracciato, non un'inferenza automatica.
La pubblicazione v2 richiederà un rilascio dedicato dopo quei risultati.
Nessuna inferenza pagata, migrazione remota, nuovo cron, deploy, riclassificazione
o eliminazione di asset è stata eseguita da questa implementazione.

---

# Galleria Studio e fotografia sorgente — 0.14.2

Aggiornamento 2026-11-03T15:18:33.817420+01:00.

La prova diretta è archiviata: 20 sorgenti e 10 generazioni, con 9 scarti.
La coda mostra una sola SLOP perché soltanto quella supera 65/100; le prime
dieci REAL sono sotto soglia. Questo non deve nascondere le immagini archiviate.

La nuova galleria carica il lotto più recente all’apertura dello Studio e mostra
30 immagini in 20 schede: 10 REAL e 10 coppie sorgente/generazione. Non dipende
dal caricamento di diagnostica o job Batch. Il confronto resta disponibile
anche per scarti e vecchi file non archiviati hanno un avviso esplicito.
La coda privata e la gestione avanzata includono la fotografia sorgente del
prompt attraverso il riferimento immutabile. Nessun riferimento aggiunto ai
payload pubblici. Test di rendering su lotto completo, scarti, file mancanti e
escaping; integrazione HTTP su riferimenti nella coda e nelle schede avanzate.

I cinque vecchi treni sono stati identificati per ID e titolo e rimossi dalla
coda mediante rifiuto amministrativo richiesto dal proprietario: file e audit
conservati, nessuna modifica al catalogo pubblicato.

---

# Verifiche effettive

## Prova diretta e archivio degli scarti — 0.14.1 da revisionare

`updated_at: 2026-11-02T21:26:37.707918+01:00`, rapporto `1.0.0`, branch
`fix/private-generated-archive`, base main `8a5f9fc`.

La prova pagata è stata eseguita con il percorso diretto nel ramo operativo
della PR #29, prima della correzione dell'archivio. Actions
[41513926222](https://github.com/rickymusu-bit/real-or-slop/actions/runs/41513926222),
20:52:01–20:54:34 del 2026-11-02, Europe/Rome. Due foto nuove, quattro analisi
e una generazione: candidata REAL 52.83/100 e SLOP 42.67/100, entrambe sotto
65. Zero nuove candidate pronte, nessuna approvazione o pubblicazione.

Il gate Worker è stato richiuso dal controller in finally, verificato false;
versione attiva e5d2f637-2a20-4f1c-b672-ed4b25fee08d. Catalogo invariato a
12 REAL + 12 AI. Prenotazioni conservative cumulative 4.50 USD, incluse 0.50 USD
del precedente invio Batch non eseguito. Non è il costo effettivo fatturato.
Nessuna nuova generazione o modifica di budget dopo la prova.

Difetto rilevato: preview della SLOP scartata non archiviata dal vecchio percorso
diretto; restano dossier e sorgenti, ma il file di quella prova non è recuperato.
La correzione per le prossime esecuzioni conserva originale e preview in R2
privato indipendentemente dallo stato e li rende visibili nello Studio.

Verifiche locali della correzione: lint, suite Node su 14 file, **89 test Python**,
build, deploy:check e packaging dry-run. Migrazione additiva 0012 provata su
copia SQLite con tutte le righe e colonne precedenti preservate. Mock per upload
degli scarti, hash/percorso alterati, errore dopo generazione e preflight contro
backend vecchio prima di qualsiasi chiamata pagata.

L'integrazione Worker/D1/R2 locale verifica file privati degli scarti, autenticazione,
GET prima dell'archivio, hash errato, upload ripetuto, disponibilità Studio e
assenza di import/pubblicazione. Fonte e file generati condividono i controlli di
integrità. Il profilo Batch usa provider fittizio; la demo senza R2 conserva
le modalità esistenti. Nessuna migrazione 0012, deploy della correzione, attivazione
pagata, nuovo cron o chiave eseguiti in produzione.

[Contratto API, recupero e rilascio](archivio-privato-generazioni-v1.0.0.md).

## OpenAI Batch — 0.14.0

`updated_at: 2026-11-02T16:40:00Z`, rapporto `1.0.0`. Branch
`feat/openai-editorial-batch`, base `adb20c4` / 0.13.0.

- Lint, suite Node su 14 file, **85 test Python**, build TypeScript/Vite,
  `deploy:check` e packaging Wrangler `--dry-run` superati. Il dry-run usa
  `XDG_CONFIG_HOME=/tmp/real-or-slop-config` per lo stato privato del runner.
- Nuovi test: quattro fasi per 20/2/1 e lotti dispari, classifica globale anche
  con shard, output fuori ordine/duplicati/estranei/mancanti/malformati, solo testo
  al generatore, valutazione cieca, scarti e rigenerazioni limitate, invii incerti
  adottati senza duplicazioni, ripresa senza nuove spese, scadenza parziale e
  annullamento asincrono con conservazione dei file, budget e credenziali.
- Schema SQLite: tutti i dati precedenti preservati dalla 0011, claim immutabili,
  quasi duplicati, proprietà delle sorgenti e rollback atomico delle prenotazioni.
- `ROS_TEST_BATCH=1 npm run test:integration`: Worker/D1/R2 reali **locali**, provider
  fittizio. Quattro job, una REAL e una SLOP preparate senza approvazione o
  pubblicazione; ripristino su filesystem vuoto, lease, CAS, riuso idempotente,
  prenotazioni concorrenti e limiti giornaliero/cumulativo verificati.
- Integrazione standard e profilo senza R2 superati: moderazione, provenienza,
  audit, preferenze, pubblicazione concorrente 50/50, Bernoulli, sessioni storiche,
  Allenamento/A tempo, preload e API PvP sospese.
- Chromium `test:gallery`: due pulsanti senza moduli, preview corrotta, doppio
  clic, coda esaurita, gioco/timer, oscuramento senza pausa, tastiera/accessibilità
  e layout 360/390/768/1440 verificati. Screenshot locali in `artifacts/gallery/`.
- Nessuna chiamata OpenAI a pagamento, deploy, migrazione remota, catalogo
  pubblicato, nuovo cron, modifica di secret/permessi o attivazione di budget.
  La 0011 e le nuove variabili sono da applicare/configurare in un rilascio
  separatamente approvato. Nessun nuovo pacchetto o servizio.

I test non certificano qualità editoriale, costo effettivo o quota live: il primo
lotto resta da due foto / una generazione dopo abilitazione e verifica delle stime.
La sequenza Batch può richiedere circa quattro giorni più i controlli periodici.
[Architettura e procedura](pipeline-batch-openai-v1.0.0.md).

### File interessati

- Orchestrazione: `pipeline/batch.py`, `batch_api.py`, `batch_engine.py`,
  `batch_store.py`, `batch_fixtures.py`; riuso in `pipeline/editorial.py` e
  configurazione `pipeline/editorial.env.example`.
- Backend/schema: `worker/editorial-batch.ts`, `editorial.ts`, `core.ts`,
  `moderation.ts`; `migrations/0011_editorial_batches.sql`.
- Interfaccia: `src/editorial.ts`, `src/review.ts`.
- Automazione: `.github/workflows/review-queue.yml`, `checks.yml`,
  `scripts/integration.py`; versione `package.json`, `package-lock.json`.
- Test: `tests/batch_pipeline_test.py`, `batch_api_test.py`, `batch_schema_test.py`,
  `batch.integration.py`, `editorial.integration.py`, `editorial_schema_test.py`.
- Documenti: `README.md`, `CHANGELOG.md`, `docs/pipeline-batch-openai-v1.0.0.md`,
  `coda-automatica.md`, `pipeline-editoriale-real-slop-v1.0.0.md`,
  `studio-generazione-slop-v2.0.0.md`, `revisione-visiva-preferenze-v1.0.0.md` e
  questo rapporto.

## Revisione visiva e preferenze — 0.13.0

`updated_at: 2026-11-02T16:07:51+01:00`, rapporto `1.0.0`. Branch
`feat/visual-review-preferences`, dipendente dalla PR #25 / 0.12.0.

- `/admin`: un'immagine e Approva/Rifiuta, senza note, categorie o checkbox.
  Vecchie schede, import, Studio e pubblicazione separati nella gestione avanzata.
  I pulsanti attendono la preview; un file rotto non viene etichettato come rifiuto.
- Preparazione automatica al collegamento di valutazione REAL/dossier SLOP:
  file e hash, originale, diritti documentati, spiegazione, categorie, valutazione
  e provenienza. Snapshot invalidati dalle modifiche e ricontrollati prima della
  decisione; la transazione verifica ancora token e stato della candidata.
- Decisione, audit e feedback una sola volta nello stesso batch D1. Migrazione
  additiva 0010 senza riscrivere storico o risposte; controlli di immutabilità.
- Modello bayesiano locale regolarizzato, esempi positivi/negativi, probabilità
  di esplorazione 25% da configurazione condivisa Python/TS. Preferenze su query,
  ordine privato e brief, nessuna correzione dei punteggi o dei ruoli. Snapshot
  privati congelati e recupero senza nuove chiamate per file già accettati.
- Lint, **14 file Node**, **62 test Python**, build, deploy:check e packaging
  dry-run superati. Worker/D1/R2 locale: auth, mancata preparazione, token falsi
  e obsoleti, modifica file, decisioni concorrenti, apprendimento positivo/negativo,
  approvazione senza pubblicazione, campionamento e compatibilità storica verificati.
- Demo senza R2 superata. Chromium: flusso due pulsanti con fixture UI, doppio
  clic contraddittorio, coda esaurita, preview corrotta senza feedback; test di
  Allenamento/A tempo, oscuramento senza pausa, accessibilità e layout preservati.
  Immagini e misure locali in `artifacts/gallery/`.
- Nessuna nuova chiave, dipendenza o servizio di training. Nessuna chiamata OpenAI
  a pagamento, modifica di budget/cron/credenziali, pubblicazione, migrazione o
  deploy remoto. Il modello parte neutro e apprende dalle nuove decisioni visive;
  i vecchi rifiuti non sono assunti retroattivamente come giudizi di gusto.

## Tempi per immagine e PvP sospeso — 0.12.0

`updated_at: 2026-11-02T15:25:07+01:00`, rapporto `1.0.0`.

- Migrazione additiva 0009: nuove modalità temporali e deadline per round,
  timeout distinti dalle risposte valide; cronologia, timestamp e assegnazioni
  delle vecchie sessioni 1/2 e del PvP preservati.
- Allenamento misura il tempo soltanto nel riepilogo; A tempo usa un countdown
  server di 10/20/30 secondi per immagine e non anticipa i media dei round futuri.
  Start/ready concorrenti e retry non prorogano la scadenza; risposte tardive
  e tentativi di preparare round futuri sono rifiutati dal Worker/SQL.
- Cambio scheda/focus: immagine coperta e zoom chiuso, riapertura esplicita,
  risincronizzazione dello stato al ritorno, nessuna pausa del timer e nessuna
  registrazione della navigazione. Menu contestuale/drag/callout limitati sulle
  immagini di gioco; nessuna garanzia contro screenshot o client modificati.
- PvP rimosso da home e navigazione, vecchio URL con avviso di sospensione,
  API pubbliche 503; attore, namespace/binding e storico conservati.
- Lint, 13 file Node, 54 test Python, build, deploy:check, packaging dry-run e
  integrazione locale Worker/D1/R2 superati. Demo senza binding R2 verificata
  separatamente, incluse le scadenze nuove e quelle storiche.
- Chromium esistente: viewport 360/390/768/1440, accessibilità e tastiera,
  cambio scheda reale, chiusura zoom, persistenza della copertura, scadenza in
  background, riapertura esplicita, timer indipendenti, retry dei file corrotti
  e assenza di richieste esterne. Screenshot e misure in `artifacts/gallery/`.
- Nessuna nuova dipendenza, deploy, migrazione remota, modifica di credenziali,
  attivazione di cron, pubblicazione del catalogo o chiamata OpenAI a pagamento.

## Ripresa Workers Builds — 0.11.1

`updated_at: 2026-11-02T09:43:07+01:00`, rapporto `1.0.0`.

- Individuato il fallimento automatico di main alla guardia globale
  `EDITORIAL_SCHEMA_RELEASE_APPROVED`: il deploy manuale 0.11.0 è rimasto online.
- Correzione limitata al comando di rilascio: lettura della cronologia D1 prima
  di qualsiasi scrittura. Schema corrente: solo deploy, niente seed o migrazioni;
  nuove migrazioni: approvazione obbligatoria e ricontrollo del completamento.
- Cronologia sconosciuta, incoerente, checkout meno recente del DB o lettura
  fallita interrompono il comando. Variabili e segreti del Worker conservati.
- Aggiunti sei test sui percorsi di rilascio e sul parsing delle risposte D1;
  lint, test e build locali superati. Sonda sul D1 reale soltanto in lettura:
  otto migrazioni applicate, zero pendenti, piano simulato con solo deploy.
- Nessuna modifica al codice del Worker, al frontend, alle immagini, al
  campionamento o alle migrazioni. Generazione e cron mantengono i propri gate;
  nessuna inferenza o generazione OpenAI usata per queste verifiche.

## Pipeline editoriale — 0.11.0

Versione del rapporto **1.0.0**, `updated_at: 2026-11-01T22:15:00Z`.
Branch `feat/editorial-real-slop-v1`, base `0ed9570` / main. Nessun AGENTS.md o
Master presente da aggiornare; README e specifiche esistenti sono conservati.

- Implementati classifica unica visiva 0–100, split 10/10 (o metà arrotondate per
  lotti ridotti), descrizione/brief/prompt aperto, generazione text-to-image e
  valutazione cieca, budget prenotati in D1, limiti e recupero da file accettati.
- Rimosse difficoltà operative e relativi filtri/template; 0007 archivia i valori
  storici e rimuove la colonna. Il guard verifica il bilanciamento **prima** della
  modifica incompatibile. 0008 aggiunge registro, dossier, ledger, coda e pubblicazioni
  atomiche, conservando il catalogo precedente se bilanciato. Sessioni/risposte/audit
  sono verificati invariati. Non eseguite migrazioni remote.
- Admin e Studio integrano dossier automatici, fonte/originali privati, note di
  revisione facoltative e pubblicazione esplicita 50/50. Le monete Bernoulli di
  Allenamento, A tempo e PvP restano indipendenti. Nessun modello o soglia approva
  automaticamente un'immagine.
- `npm run lint`, `npm run build`, `npm run deploy:check`, `git diff --check`:
  superati. Build: CSS 13,10 kB e JS 62,69 kB, asset locali verificati.
- Suite Node: **12 file**, tutti superati, incluse simulazioni statistiche,
  tutte le sequenze deterministiche previste e controllo negativo delle vecchie
  quote. Suite Python: **51 test**, tutti superati; fixture/mock, zero chiamate
  a pagamento. Inclusi ordinamento, lotti ridotti, deduplica, sorgenti escluse da
  REAL, conservazione del prompt, valutazione cieca, scarti, budget/API/credenziali,
  recupero senza rigenerare, migrazioni, pubblicazione e diagnostica dei punteggi.
- Integrazione Worker/D1/R2 **locale isolata**: superata. Registro e pubblicazioni
  concorrenti reali via HTTP, fonte privata con hash, note vuote/assenti, revisione
  obbligatoria e stock approvato in attesa, 50/50 per ambiente, normali import,
  licenze, Studio e curatela. La route pagata resta disabilitata nell'emulatore.
- Integrazione separata senza R2: superata, con controllo effettivo dei binding
  assenti. Demo, categorie, vecchie assegnazioni, proprietà dei cookie, anti-replay,
  Allenamento/A tempo, preload/decode/deadline/timeout e due client WebSocket PvP
  con riconnessione verificati. Nessuna risorsa remota utilizzata per i dati test.
- `npm run test:gallery`: Chromium esistente, nessuna nuova dipendenza. Viewport
  360/390/768/1440, assenza dei selettori di difficoltà, immagini integre, azioni
  simmetriche, tastiera, accessibility tree, timer/preparazione/retry e assenza
  di richieste esterne delle pagine verificati. Screenshot in `artifacts/gallery/`,
  non versionati. I dossier privati hanno copertura API e build TypeScript;
  la suite browser verifica le modalità pubbliche, non il giudizio editoriale umano.
- `npm run dry-run`: packaging riuscito, nessun deploy. `db:migrate` / `db:seed`
  locali e backup/restore dello schema aggiornato con `scripts/local-data.py`
  superati su stato separato. Non è una prova del ripristino remoto di produzione.
- `/v1/models` del progetto ha elencato `gpt-6.1-terra` e `gpt-image-2` il
  2026-11-01; nessuna inferenza/generazione live effettuata. L'uso effettivo dei
  parametri e la resa richiedono una prima prova autorizzata e limitata.
- Preparati ma **non attivati**: migrazioni remote, generazione API e importazione
  remota, nuovo catalogo, cron quotidiano (richiede il nuovo flag
  `ENABLE_EDITORIAL_SCHEDULE=true`) e altri gate espliciti. Nessun secret/permesso,
  billing, variabile Actions/Worker, merge o deploy modificato.
- Limiti: stime di costo conservative configurate dall'operatore, non fatture;
  autenticità, diritti, somiglianza semantica e attribuzioni richiedono revisione;
  dHash può produrre falsi positivi/negativi. Il backend precedente non è
  compatibile con gli insert dopo 0007: servono preflight, backup e rilascio
  coordinato con scritture amministrative sospese. Catalogo legacy sbilanciato:
  arresto prima della rimozione della colonna, nessun ritiro automatico.

[Architettura e procedure](pipeline-editoriale-real-slop-v1.0.0.md),
[variabili, migrazioni, prima esecuzione controllata e recupero](coda-automatica.md),
[Studio v2](studio-generazione-slop-v2.0.0.md).

### File modificati o aggiunti

- `.github/workflows/review-queue.yml`
- `CHANGELOG.md`
- `README.md`
- `docs/campionamento-stratificato-v2.0.0.md`
- `docs/coda-automatica.md`
- `docs/importazione-diretta-r2.md`
- `docs/metadati-editoriali-v1.0.0.md`
- `docs/pipeline-editoriale-real-slop-v1.0.0.md`
- `docs/protocollo-generazione-slop-v1.0.0.md`
- `docs/protocollo-selezione-real-v1.0.0.md`
- `docs/specification-v1.1.0.md`
- `docs/studio-generazione-slop-v1.0.0.md`
- `docs/studio-generazione-slop-v2.0.0.md`
- `docs/verification.md`
- `migrations/0007_retire_assigned_difficulty.sql`
- `migrations/0008_editorial_publication.sql`
- `package-lock.json`
- `package.json`
- `pipeline/automatic.py`
- `pipeline/editorial.env.example`
- `pipeline/editorial.py`
- `pipeline/importer.py`
- `scripts/check-gallery.mjs`
- `scripts/deploy-demo.mjs`
- `scripts/integration.py`
- `scripts/make-seed.py`
- `scripts/seed-publication.sql`
- `scripts/seed.sql`
- `shared/slop.ts`
- `src/admin.ts`
- `src/curation.ts`
- `src/editorial.ts`
- `src/play.ts`
- `src/pvp.ts`
- `src/slop.ts`
- `tests/automatic_pipeline_test.py`
- `tests/curation.integration.py`
- `tests/editorial.integration.py`
- `tests/editorial.test.ts`
- `tests/editorial_pipeline_test.py`
- `tests/editorial_schema_test.py`
- `tests/game.test.ts`
- `tests/legacy-seed.sql`
- `tests/preloading_schema_test.py`
- `tests/sampling.integration.py`
- `tests/schema_test.py`
- `tests/slop-fixtures.ts`
- `tests/slop.integration.py`
- `tests/slop.test.ts`
- `tests/slop_schema_test.py`
- `worker/core.ts`
- `worker/editorial.ts`
- `worker/game.ts`
- `worker/import.ts`
- `worker/moderation.ts`
- `worker/publication.ts`
- `worker/slop-validation.ts`
- `worker/slop.ts`

## Binding R2 confermati e comando di rilascio — 2026-10-30

- `wrangler.jsonc` collega QUARANTINE a `real-or-slop-quarantine` e IMAGES a `real-or-slop-approved`, secondo la configurazione confermata dal proprietario. Account, Worker, D1, modalità demo, profilo locale e isolamento delle preview sono conservati.
- `deploy:demo` mantiene il comando già usato da Workers Builds e richiede esattamente le risorse confermate; nessun provisioning automatico. Test dedicati rifiutano account/DB/Worker diversi, modalità produzione, bucket mancanti, aggiuntivi, locali o scambiati. `deploy:check`, lint, 11 file di test Node, 22 test Python e build superati.
- Integrazione locale del gioco senza R2 superata: configurazione temporanea derivata priva di bucket, controllo autenticato del runtime che conferma entrambi i binding assenti, campionamento, sessioni, preload e due client WebSocket PvP. La configurazione temporanea non viene usata dal rilascio e viene eliminata insieme alla copia del segreto di test.
- `npm run deploy:demo -- --dry-run` mostra i due binding R2 corretti e DATA_MODE=demo. Migrazioni/seed remoti, merge e pubblicazione non sono eseguiti; l’esistenza e i permessi Cloudflare dipendono dalla configurazione confermata e non sono certificati dal packaging locale.

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

## Pipeline v4.0.0 — implementazione isolata per #53

La specifica [v4.0.0](protocollo-editoriale.v4.0.0.md) conserva la v3 e aggiunge
matrice 12×12, freeze prima dei rami, eventi dalla coda unica e caption autonome.
La migrazione 0018 è stata verificata soltanto negli emulatori isolati. Il CLI e
il benchmark sono offline, con fixture chiaramente distinte dalle evidenze REAL.

Build, lint, suite Node/Python, HTTP locale D1/R2 e Chromium verificano hash,
resume, diritti, giudizi indipendenti, contatori, sorgenti/costi separati,
caption immutabile per round, server readiness, privacy, legacy e layout mobile.
Report [leggibile](benchmark-matrice.v4.0.0.md) e [JSON](benchmark-matrice.v4.0.0.json).
Nessun pilota REAL, inferenza remota, addebito, cron, migrazione remota o deploy
è stato eseguito; bozze, esempi e prior richiedono ancora review e calibrazione
prima dell’attivazione. Il PvP pubblico resta sospeso.


## 2026-11-06 — contesto tramite didascalia e fotogrammi interi (v4.1.0)

- Build, lint, suite Node, 178 test Python e sei test versionati del catalogo inglese passati.
- Integrazioni locali dedicate matrice e v2 passate, con configurazione `auto`/`whole_frame`, opere documentate, autenticazione, freeze, privacy, timer e compatibilità legacy.
- Fixture dirette verificano zero chiamate crop nel nuovo percorso, mantenimento di panorama/ritratto, hash dei pixel profilati, ripresa senza nuove chiamate e parametri `auto` nelle ricevute. Il percorso legacy quadrato rimane verificato.
- Il catalogo 4.0.0 e il freeze del pilota del 5 novembre restano invariati. Il catalogo corrente 4.1.0 registra revisioni e istruzioni nuove.
- Riesportate le dieci immagini del pilota dagli originali, area conservata 100%, senza altre API o spesa. Le cinque REAL hanno hash nuovi; profili dei vecchi ritagli e giudizi non sono trasferiti. Il quadro ha una didascalia documentata con autore e anno.
- Chromium a 390/1440 px verifica proporzioni effettive, `object-fit: contain`, immagini, zoom, filtri, note, persistenza, export e giudizi indipendenti. Scelte sintetiche rimosse. PDF di cinque pagine e ZIP verificato contro gli hash delle immagini.
- Nuova coorte privata: `ecc40ff42b42ad6b6ef9887a3a5ff04d1193efe8e84e7b4880d7ed36ceeda984`. Artifact in `artifacts/pilot-v4-2026-11-05-whole-frame/`; nessuna pubblicazione, migrazione remota o deploy.


## 2026-11-06 — SLOP con attribuzione e CC BY 4.0

Policy condivisa tra pipeline e Worker, attribuzione predefinita Real or Slop.
Le nuove inizializzazioni live registrano CC BY 4.0 prima degli invii e rifiutano
altre licenze esplicite; i checkpoint e le fixture storiche restano leggibili.
La selezione atomica di pubblicazione esclude SLOP con licenza diversa o credito
vuoto, contando le candidate bloccate nella diagnostica privata. Le REAL non
cambiano licenza. I crediti del gioco già espongono autore e link dopo la risposta.

Build, lint, suite Node e 179 test Python più sei test versionati passati. Il
percorso HTTP locale verifica anche le pubblicazioni concorrenti: nessuna nuova
SLOP pubblicata con licenza diversa da CC BY 4.0, mentre le non conformi rimangono
private. Il bilanciamento globale REAL/SLOP rimane invariato.

Le cinque SLOP del pilota hanno una dichiarazione di licenza separata dalle
ricevute originali, nei nuovi dossier privati; i crediti sono anche nel PDF e
nella galleria. Pixel e coorte non cambiano, nessun giudizio è stato aggiunto.
ZIP verificato contro gli hash; nessuna nuova generazione, spesa o pubblicazione.


## 2026-11-06 — intenzioni compositive indipendenti v4.2.0

Build, lint, suite Node e 181 test Python più sei test versionati passati.
L’integrazione locale matrice verifica anche il nuovo envelope con target di
punto di vista e roll, hash, corrispondenza al prompt e compatibilità dei dati
precedenti; timer, privacy e scoring restano invariati.

Il piano compositivo è deterministico con seed, copre sei profili prima di
ripeterli e distingue camera in piano da lieve roll nei due sensi. I test
verificano che le direttive siano nel prompt congelato, che il relativo piano
sia protetto dall’hash e che i vecchi cataloghi non ricevano nuove direttive.
La fixture con risultati REAL avvelenati continua a non influenzare SLOP.

Preparato offline un ciclo di cinque brief con seed 53: tre richieste con
camera in piano e due con roll lieve; i punti di vista includono frontale,
obliquo ed elevato. Sono target, non angoli misurati in nuove immagini.
Nessuna acquisizione o generazione live; nessun miglioramento empirico dichiarato.

Il PDF e la galleria del pilota conservano pixel e coorte originali, con nota
sul brief generico dell’aspirapolvere. Nessuna classificazione o decisione umana
aggiunta; anteprime aggiornate nella cartella Drive dedicata.
## 2026-11-06 — ricette fotografiche indipendenti v4.3.0

- Applicazione 0.19.0. `npm run build`, `npm run lint`, suite Node, 184 test
  Python e sei test versionati del catalogo inglese passati.
- `ROS_TEST_MATRIX=1 npm run test:integration` passato con Worker, D1 e R2
  isolati localmente: autenticazione, freeze, prompt oltre 2000 caratteri,
  rifiuto di ricette alterate, registrazioni, caption, pubblicazione, timer,
  sampling, gioco e precaricamento.
- Sei profili coerenti, senza ripetizioni nel singolo mazzo, con seed separato
  dalla composizione. Verificati rendering identico Python/TypeScript,
  corrispondenza del prompt nel payload `images/generations`, integrità del
  piano e ripresa senza invii aggiuntivi. Solo API simulate nei test.
- Descrizioni, query, tassonomia e 288 intenzioni REAL conservate. Otto opere
  identiche al catalogo 4.2, senza dispositivo o esposizione fotografica;
  280 nuovi prompt fotografici alla revisione 4. Compatibilità dei cicli
  4.1/4.2 verificata, senza aggiungere retroattivamente le nuove istruzioni.
- Piano offline di cinque brief con seed 53: quattro fotografie con ricette
  diverse e un'opera. L'esempio completo è in
  [esempio-prompt-fotografico.v4.3.0.md](esempio-prompt-fotografico.v4.3.0.md).
  Nessuna nuova immagine, spesa, approvazione o misura di riconoscibilità.
  Produzione e migrazioni remote invariate; la preview configurata viene
  attivata automaticamente dal push sulla PR.
