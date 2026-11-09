# Mappa canonica — versione canonica 16.0.0

Snapshot: `docs/MASTER.v16.0.0.md`. Percorsi relativi alla radice del repository.
Aggiornato: 2026-11-09T12:00:00Z. Base main `9c4aa39`.
Le sezioni precedenti rimangono vigenti per gli ambiti non modificati.

## Si approva la copia di gioco (16.0.0)

Aggiornato: 2026-11-09T12:00:00Z. Specifica: `docs/copie-di-gioco.v2.0.0.md`, app 0.32.0, schema 0032
(`editorial_review_game_copies`, vista `editorial_review_effective_images` ricreata con le stesse
colonne). Moduli: `shared/game-copy.v1.0.0.ts` (ricetta), `src/game-copy.v1.0.0.ts` (codifica nel
browser e `ensureReviewCopies` dopo upload, acquisizione e generazione), `worker/review-inbox.ts`
(`/game-copy`, approvazione solo sulla copia), `worker/editorial-cycle.ts` (ammissione solo con copia),
`src/review.ts` (scheda che mostra e prepara la copia). Sostituisce la sezione 15.1.0: nessuna copia
all'ammissione, nessuna tabella `editorial_game_copies`.

## Copie di gioco uniformi (15.1.0)

Aggiornato: 2026-11-09T11:00:00Z. Specifica: `docs/copie-di-gioco.v1.0.0.md`, app 0.31.0,
schema 0032 (`editorial_game_copies`, una copia immutabile per immagine). Moduli:
`shared/game-copy.v1.0.0.ts` (ricetta), `src/game-copy.v1.0.0.ts` (codifica nel browser),
`worker/editorial-cycle.ts` (`/game-copy`, gate di pubblicazione), `worker/storage.ts` (serve la
copia, altrimenti il file ammesso ripulito da `shared/media-clean.v1.0.0.ts`). Supera il limite
sul formato dei file indicato nella sezione 15.0.0.

## Bozze, SLOP scollegate e trasparenza (15.0.0)

Aggiornato: 2026-11-09T09:45:00Z. Specifica: `docs/lotti-editoriali.v1.6.2.md` (approvata).
Base main `9c4aa39`: app 0.28.1, schema 0031 in produzione (0029 lotti e scarti, 0030
istantanee di rimozione, 0031 tag per foto). Nel catalogo di produzione restano solo le
24 immagini demo; le 6 rifiutate degli esperimenti storici sono state eliminate.

Stato effettivo: lotti, Esplora Commons (`worker/commons-editorial.v1.0.0.ts`, originali
fino a 12 MB o 32 Mpx, altrimenti miniatura), tag manuali (`worker/tags.v1.0.0.ts`,
`shared/tags.v1.0.0.ts`, segnaposto `untagged` derivato, gate su approvazione, ammissione e
pubblicazione). Nessuna proposta di tag a pagamento.

Fasi successive, ciascuna in una PR:
1. bozze REAL in D1 (nuova migrazione additiva, tabella mutabile), conferma atomica che
   cancella la bozza, ripresa dell'acquisizione; in parallelo una piccola PR per il gioco:
   file serviti senza metadati identificativi, marchio «RS» sovrapposto, blocco di tasto
   destro, trascinamento e pressione prolungata;
2. bozze SLOP e prompt dal modello linguistico, con budget e conferma;
3. generazione delle immagini, tag proposti dalle SLOP, copertura dei temi.

Limite noto: il formato del file (JPEG per le REAL, WebP/PNG per le SLOP) resta un indizio
finché le immagini del gioco non vengono ricodificate in modo uniforme.
Rinviati (specifica, sezione 14): ricontrollo delle fonti Commons, alias dei tag,
anteprime con D1/R2 separati, Topic Discovery.

## Lotti editoriali (14.0.0)

Aggiornato: 2026-11-08T21:00:00Z. Specifica: `docs/lotti-editoriali.v1.4.0.md`.
Base main `ca07046` (app 0.23.2, schema 0028). Il lotto riusa
`editorial_workspace_topics` come identità; la migrazione additiva 0029 aggiunge stato e
note del lotto e gli scarti delle proposte; la 0030 aggiunge l'istantanea di rimozione dei
lotti senza foto e ammette la cancellazione dei soli link mai acquisiti di quei lotti. Fasi: (1) lotti, Esplora Commons, scarto e
conversione dei link Commons verso pagine `File:`; (2) vocabolario e tag per foto con
`untagged`; (3) piano e generazione SLOP con margine; (4) pubblicazione per lotto e
avvisi di composizione. Ogni fase aggiorna questa sezione con lo stato effettivo.

Moduli: `worker/editorial-workspace.ts` (lotti, proposte, scarti),
`worker/commons-editorial.v1.0.0.ts` (API Commons, ricerca, categorie),
`shared/editorial-link-batch.v1.0.0.ts` (normalizzazione dei link),
`src/editorial-workspace.v1.0.0.ts` (dashboard). Topic Discovery, memoria semantica e
banche prompt congelate restano leggibili come storico e non servono ai nuovi lotti.

## Dashboard amministrativa a sezioni (13.0.0)

Specifica: `docs/admin-dashboard-navigation.v1.0.0.md`.
App proposta 0.22.0, a partire da 0.21.0 già integrata. Il frontend `/admin`
presenta sei sezioni: Panoramica, Argomenti, Produzione immagini, Revisione,
Pubblicazione, Impostazioni. Stato e conteggi della Panoramica provengono dalle
API amministrative autenticate, non da metriche simulate.
I moduli React-free preesistenti vengono montati una volta e mantenuti nel DOM:
il cambio sezione modifica la visibilità, senza ricreare form o scartare input.

La revisione e l'ammissione documentale restano nello stesso modulo; la
pubblicazione ne usa i controlli originari, ora isolati visivamente. Il selettore
Demo/Produzione e il budget restano sotto Impostazioni; gestione argomenti e
Topic Discovery sotto Argomenti; upload/REAL/SLOP e diagnosi nella Produzione.
Le API e i gate economici non cambiano, né si eseguono operazioni automatiche.

Nessuna migrazione di database. Prima di qualunque merge, verificare desktop e
mobile, cambio viste senza perdita di input, percorso review→admit→publish,
interruttore catalogo, budget, Topic Discovery, protezione admin e test CI.
La PR e le anteprime non autorizzano deploy o produzione.

## Budget condiviso e reset esplicito (12.0.0)

Aggiornato: 2026-11-08T07:01:53Z. Specifica: `docs/budget-dashboard.v1.0.0.md`.
Base main `7975604`, app 0.19.0 e schema 0026 già rilasciati. L'owner ha
richiesto il pulsante di reset e autorizzato **5 USD aggiuntivi** nella sessione
corrente. Implementare, verificare e rilasciare il delta senza una nuova richiesta
di permesso; configurare le funzioni owner-first entro questo unico budget.
La #76 rimane esclusa. Nessuna inferenza a pagamento nei test o all'attivazione.

Il reset apre un periodo con disponibilità pari a `EDITORIAL_BUDGET_RESET_USD`
(5 USD), sostituendo il residuo senza accumularlo. Non cancellare/rimborsare
prenotazioni, ricevute o esiti incerti, né dichiarare una ricarica dell'account
OpenAI. Testo, immagini ed embedding condividono la stessa disponibilità;
l'assegnazione di ciascuna nuova prenotazione al periodo è atomica e immutabile.
I costi mostrati sono stime prudenziali, non fatturazione verificata.

Il pulsante privato richiede conferma esplicita e funziona senza un argomento
selezionato o le funzioni AI attive. Il server controlla importo configurato,
ID idempotente e periodo atteso: doppi invii o schede obsolete non moltiplicano
il budget. Nessun reset mentre una chiamata AI risulta prepared/submitting.
Limiti monetari giornalieri/per-run sono nel periodo; conteggi di chiamate,
generazioni e deduplica delle operazioni rimangono storici. Il cap condiviso
DB protegge anche le prenotazioni legacy; i relativi gate restano spenti.

La migrazione additiva 0027 non crea periodi né altera dati storici. Prima del
rilascio: backup fresco, restore rehearsal, test di concorrenza/esaurimento,
provider fittizi, browser desktop/mobile e CI. Dopo il rilascio aprire il primo
periodo con il residuo precedente più i 5 USD aggiuntivi e attivare soltanto i percorsi owner-first ed embedding.
Nessun cron, backfill automatico o ripristino di immagini eliminate.

## Completamento corrente #64 — snapshot e geometria EXIF (11.0.0)

Aggiornato: 2026-11-08T03:46:09Z. Specifica: `docs/snapshot-preferenze-geometria.v1.0.0.md`.
L'owner ha autorizzato di procedere con rilascio e completamenti nella sessione
corrente. Main 0a595bf con migrazioni 0024–0025 è già rilasciato; schema 0026 e
questo incremento vanno verificati prima del successivo rilascio. Non richiedere
una nuova autorizzazione per le azioni già comprese nel procedere dell'owner.
L'attivazione di spese richiede limiti numerici: la scelta del budget è pendente.

I ranker REAL e SLOP conservano snapshot immutabili con versione dell'algoritmo,
parametri, conteggi, provenienza dei voti/profili e hash degli input. Lo stesso
stato viene riusato senza duplicazioni; modifiche dei voti producono nuovi stati.
Le chunk JSON limitate conservano anche tracce grandi entro i limiti delle righe D1.
Snapshot e cronologia non certificano utilità dei suggerimenti o apprendimento
misurato. I seed SLOP congelati e i confini della decisione 10.0.0 restano invariati.

La geometria legge EXIF in modo limitato e controllato, risolve le orientazioni
1–8 e distingue dimensioni codificate da dimensioni di visualizzazione. Originali,
SHA, revisione, voti, provenienza/licenza rimangono invariati. TIFF/EXIF incompleti
o incoerenti restano unknown, con diagnostica. La lettura dei file storici avviene
su azione amministrativa esplicita senza chiamate AI, con hash corrente verificato;
il risultato è un audit append-only, non una riscrittura dei metadata storici.

La migrazione additiva 0026 aggiunge stati, chunk e audit geometrici. Nessun cron,
riimportazione o ripristino delle immagini eliminate. Testare immutabilità,
concorrenza, correzioni dei voti, esclusioni di diritti/provenienza dal gusto,
orientamenti/byte order, metadata invalidi, originali invariati e UI desktop/mobile.

## Decisione corrente #64 — significato prima della distanza (10.0.0)

Aggiornato: 2026-11-08T02:30:59Z. Specifica: `docs/scoperta-argomenti-prudenti.v1.0.0.md`.
La decisione esplicita dell'owner nella sessione corrente sostituisce la ricerca
obbligatoria di cluster vuoti/zone poco coperte proposta nella #64. Le sezioni
9.0.0 e precedenti rimangono contesto storico per gli ambiti non sostituiti.

Topic Discovery propone prima argomenti comprensibili, specifici e fotograficamente
plausibili. Una prima autovalutazione negativa/incompleta impedisce l'embedding;
una seconda revisione controlla ammissibilità e duplicati. Entrambe sono stime del
modello, separate dal voto dell'owner. Una proposta molto distante può essere
inammissibile; episodi distinti possono essere validi anche con coseno elevato.
Nessuna ricerca di vettori arbitrari o generazione per riempire regioni vuote.

La distanza resta diagnostica secondaria di confronto con lo storico; mai una
percentuale di qualità o prova di novità. Separare vicini dello stesso lotto e
vicini storici. I contatori descrivono il corpus, senza attestare automaticamente
maturità, qualità o copertura in base al numero di vettori. La valutazione utile
richiede dati sufficientemente rappresentativi e giudizi dell'owner; nessun
benchmark di efficacia reale su un corpus ancora in popolamento.

La descrizione confermata continua nella memoria semantica e nel confronto di
pertinenza già esistente. Non propagarla automaticamente alle query REAL o ai
prompt SLOP: REAL usa titolo e preferenze per pianificare keyword; SLOP mantiene
solo titolo e feedback storici congelati prima delle REAL. Eventuali esperimenti
con la descrizione sono separati, espliciti e da valutare prima di cambiare default.

La migrazione additiva 0025 conserva valutazioni del modello distinte dalle
scelte umane e un registro idempotente per lotto. Non cambiare gate, tetti,
secret, dati remoti o pipeline storiche. Restano fino a due chiamate testo e
cinque embedding per richiesta esplicita, senza chiamate reali nei test.
Verificare corpus vuoto, outlier esclusi, alta somiglianza con episodio diverso,
risposte invalide/incerte, replay concorrenti e isolamento REAL/SLOP nel browser.

## Aggiornamento #64 / #78 — conferma delle descrizioni 9.0.0

Aggiornato: 2026-11-07T23:12:00Z. La specifica corrente è
`docs/topic-description-confirmation.v1.0.0.md`; in questo ambito sostituisce il
ramo title-only della versione 8.0.0 e della memoria semantica 2.0.0.

Per nuovi argomenti senza descrizione, la richiesta esplicita dell'owner prepara
una proposta GPT inglese di massimo 500 caratteri, modificabile e con ambiguità
visibili. Non creare il tema definitivo, il seed SLOP o un embedding prima di
**Approva e registra**. Rigenera e Annulla sono azioni separate; la rigenerazione
richiede una nuova conferma di costo. Una descrizione già scritta dall'owner
segue direttamente la registrazione/indicizzazione senza riscrittura GPT.

La migrazione additiva 0024 introduce bozze private e ricevute dedicate `describe`;
non ricostruisce tabelle storiche. Approvazione vincolata a ID, titolo e hash della
proposta; testo confermato, tema e memoria pending sono salvati atomicamente.
Una bozza superata o annullata non può essere approvata. Deduplicazione normalizzata
prima dei costi, prenotazione sul ledger esistente, nessun retry di esiti incerti.
I gate sono `WORKSPACE_AI_ENABLED`, `ENABLE_REAL_DISCOVERY_PAID` e i limiti REAL
Discovery esistenti; l'embedding usa i propri tetti. Discovery OFF non blocca
questo flusso. Errori o budget assente consentono una descrizione manuale senza
perdere il titolo. Non attivare credenziali, gate, budget, merge o deploy.

Testare HTTP con il vero Worker/D1/R2 e API simulate, doppio clic/concorrenza,
proposte stale, testo modificato, annullamento, budget/gate assenti ed esiti
incerti; verificare editor e ripresa dopo refresh su desktop/mobile.
La #76 non rientra in questa consegna, su istruzione esplicita dell'owner.

## Completamento #64 — contratto corrente 8.0.0

Aggiornato: 2026-11-07T19:21:24Z. `docs/editorial-intelligence.v2.0.0.md` è il riferimento corrente
per la dashboard owner-first e sostituisce, in questo ambito, le indicazioni
precedenti che descrivono ancora il suggeritore vettoriale come futuro.

La migrazione additiva 0023 conserva revisioni semantiche immutabili, embedding
per proposte, controlli di novità, pertinenza fotografica separata, diagnostica
retrieval, scelta manuale prima della ricerca e prenotazioni atomiche del deficit
SLOP. L'owner può modificare descrizioni e indicizzare singoli temi storici/pending
anche con Topic Discovery OFF. Esiti incerti non vengono ritentati. Il ripristino
di una revisione riusa vettori compatibili già archiviati.

Il suggeritore usa lo storico dei temi e i vettori compatibili, mostra i vicini e
fa distinguere a GPT parafrasi da eventi/prospettive differenti. Non usa gusti REAL
o SLOP. Il profilo resta pixel-only; il confronto con il tema è successivo e non
attesta provenienza, licenza o fatti storici. SLOP legge soltanto il seed congelato
prima delle REAL; i nuovi formati dipendono dall'ID del tema, mai dalle REAL.

Verifica aggiuntiva: `npm run test:editorial` e
`ROS_TEST_BROWSER=1 npm run test:editorial`, con D1/R2 veri locali e tutte le API
simulate. La CI esegue anche il browser desktop/mobile fino alla pubblicazione
bilanciata di fixture. Nessuna inferenza a pagamento, migrazione remota, deploy o
merge è autorizzata implicitamente. Documentare i limiti di corpus non indicizzati
e formati sconosciuti; non certificare la neutralità del catalogo reale con fixture.

Le sezioni storiche seguenti rimangono contesto per i contratti precedenti;
per le estensioni appena elencate prevale questa sezione e la specifica 2.0.0.

## Delta proposto in PR #64 — studio editoriale owner

Aggiornato: 2026-11-07T13:15:33.448Z. Specifica e stato: `docs/admin-workspace.v1.0.0.md`.
Questa PR aggiunge il workspace privato `/admin`, la tabella di argomenti e proposte in `migrations/0019_editorial_workspace.v1.0.0.sql`, il Worker `worker/editorial-workspace.ts` e i validatori `shared/editorial-workspace.v1.0.0.ts`.
I link dell'owner sono proposte da acquisire, mentre gli upload entrano come file REAL *pending* e senza attestazione di origine o diritti. Per ora **nessuno dei tre learner è attivato**: Topic Discovery, REAL Preference e SLOP Prompt Preference sono separati nel contratto, con ordine di implementazione e isolamento specificati nel documento. Nessun costo, cron, deploy, ricerca GPT o pubblicazione vengono attivati. La migrazione 0019 non va applicata automaticamente in produzione.

Le indicazioni legacy sotto rimangono descrizioni dei percorsi precedenti: il nuovo workflow owner-first della #64 ha precedenza per i futuri cicli una volta approvato e rilasciato; nessun run precedente è riscritto.

## Nuovo percorso owner-first #64 (PR in bozza)

Aggiornato: 2026-11-07T13:53:33.858Z. Il nuovo sistema in `docs/editorial-intelligence.v1.0.0.md` aggiunge la migrazione 0020, `worker/editorial-intelligence.v1.0.0.ts`, `worker/editorial-learning.v1.0.0.ts`, `worker/commons-editorial.v1.0.0.ts`, `worker/workspace-ai.v1.0.0.ts`, i validatori e la UI `src/editorial-intelligence.v1.0.0.ts` all'admin owner-first della PR #65. Topic Discovery, REAL Preference e SLOP Prompt Preference sono separati, con input e feedback distinti e gate API espliciti. Non è attivo in produzione: ancora da verificare CI, migrazioni, preview e test E2E. I vecchi quadrati delle pipeline legacy restano storici. L'issue non è chiusa.

## Addendum #64: revisione proporzionale senza crop (PR di completamento)

Aggiornato: 2026-11-07T14:58:05.001Z. La procedura ordinaria per le nuove copie di revisione in `pipeline/v2/presentation.py` utilizza **`--method preserve`** e `pipeline/v2/preserve_v1_0_0.py`, come descritto in `docs/presentazione-proporzionale.v1.0.0.md`. Mantiene il rapporto d'aspetto, non ingrandisce e registra hash/EXIF/operazioni senza cambiare gli originali. I metodi `terra` e `center` con crop quadrato restano solo per riprodurre studi legacy. Il pannello admin ha un motivo distinto per provenienza/autenticità incerta, da escludere dall'apprendimento delle preferenze. Questa PR non autorizza deploy, migrazioni o chiamate API.

## Miglioramento della profilazione visiva #64

Aggiornato: 2026-11-07T15:06:47.075Z. Per immagini REAL e SLOP in coda, la dashboard admin crea in browser una **copia proporzionale senza crop** di massimo 1152 px e 1,5 MB, da inviare al modello esclusivamente con autorizzazione esplicita. Il Worker verifica SHA dell'originale archiviato, geometria e hash della miniatura prima della chiamata API. I profili si riferiscono ai pixel della derivata e sono legati all'hash originale per le preferenze. Vedi `docs/profilazione-visiva.v1.0.0.md`. Nessun file sorgente viene sostituito e nessuna funzione viene attivata in produzione dalla PR.

## Decisione #64 — Memoria semantica incrementale, Discovery facoltativo

Aggiornato: 2026-11-07T17:50:01.887Z. Vedere `docs/topic-discovery-semantic-learning.v2.0.0.md`. Il motore **Topic Discovery resta OFF per default**, con switch owner-only `/admin` in migrazione 0021; nessun suggerimento automatico.

Il popolamento manuale ora registra titolo e descrizione semantica e invoca **l'API reale degli embedding per ogni nuovo argomento**, se `OPENAI_API_KEY` e i budget dedicati sono configurati. Questa indicizzazione è **indipendente dal toggle Discovery**. I vettori risultanti (o lo stato `pending/uncertain`) sono registrati nella nuova migrazione 0022 con testo, hash, modello, versione e dimensioni; un argomento accettato dai suggerimenti viene trattato allo stesso modo. Se non si configura il servizio, non viene fabbricato un vettore: il testo resta memorizzato e la UI segnala `pending`.

La raccolta dei feedback REAL e SLOP resta nei rispettivi registri e influenza gli ordinamenti/prompt successivi, senza addestramento di pesi a ogni voto. Il futuro suggeritore potrà usare il corpus di embedding; **la ricerca vettoriale non è ancora implementata**. Non attivare automaticamente secrets, migrazioni remote, spese o deploy. La CI e l'approvazione visiva precedono il merge.

## Ingressi e autorità

`AGENTS.md` contiene le istruzioni operative. Questo file identifica le decisioni
correnti senza duplicarne i contratti. In caso di conflitto registrare la decisione
secondo AGENTS; non scegliere semplicemente il numero di versione più alto.

| Ambito | Fonte corrente | Ambito e limite |
| --- | --- | --- |
| Ciclo completo corrente | `docs/ciclo-editoriale.v1.0.0.md`, `pipeline/cycle.py`, `shared/editorial-cycle.v1.0.0.json` | Brief e prompt congelati prima del retrieval; voto REAL → SLOP sul deficit → voto SLOP → ammissione separata → pubblicazione bilanciata; `watch` esplicito |
| Ammissione del ciclo | `worker/editorial-cycle.ts`, migrazione `0018_editorial_cycle_admission.sql` | Conferme documentali dopo voto personale corrente, audit immutabile, eccedenze in attesa; nuovo schema ancora da rilasciare |
| Metodo editoriale storico | `docs/protocollo-editoriale.md`, versione interna 3.0.0 | Brief condivisi congelati, SLOP solo testo, revisione individuale, API dirette |
| Nuova discovery REAL #56 | `docs/ricerca-real.v1.0.0.md`, `pipeline/real/`; `shared/real-discovery*.v1.0.0.json` | Nuovo percorso esplicito in questa PR: 432 intenzioni nominali, A/B GPT, HTTP validato; nessun match obbligatorio a brief o quote di copertura |
| Ciclo e pilota REAL | `docs/ciclo-discovery-real.v1.0.0.md`, `pipeline/real/workflow.py`, `pilot.py` | Ripresa, feedback, galleria privata, dossier revisionati e consegna pending alla coda del sito; pilota GPT Commons eseguito; cinque dossier assistiti e profili completati; candidate nella coda del sito; review del proprietario pendente |
| Ledger nuovo percorso | `worker/real-discovery.ts`, tabella esistente `editorial_usage` | Endpoint autenticato di sola prenotazione, esteso a brief/generazione del ciclo; gate chiusi per default, ledger comune |
| Criteri del proprietario | `docs/criteri-editoriali.md`; `pipeline/v2/editorial_policy.py` | In main: contesto visibile, opere ambientate; nessuna adozione anticipata di v4 |
| Brief e freeze | `pipeline/v2/brief_catalog.py`, `pipeline/v2/briefs.py`; `data/editorial/briefs.v1.json` | Seed italiano draft; selezione 5 brief/10 immagini, massimo 25/50 |
| Dati e verifiche v2 | `shared/editorial-v2.json`, `shared/editorial-v2.ts`, `pipeline/v2/protocol.py`; `tests/editorial-v2-contract.json` | Schema 2.0.0 riusato dal metodo v3; non è la versione del metodo |
| Presentazione corrente | `docs/cropping-assistito-v2.md`; `pipeline/v2/direct.py`, `presentation.py`, `smart_crop.py` | 1024×1024, crop Terra con gate; profilo legato ai pixel finali |
| Origine e diritti | `docs/licenze-immagini.md`; `shared/licenses.json`, `shared/licenses.ts`, `pipeline/licenses.py` | Identità/versione/giurisdizione preservate; licenza distinta da autenticità |
| Consegna discovery alla review | `docs/discovery-coda-sito.v1.0.0.md`, `pipeline/real/inbox.py`, `scripts/sync-review-inbox.py` | Export prima del voto, upload QUARANTINE e verifica della coda esistente; nessuna pubblicazione |
| Revisione privata | `docs/coda-revisione-unica.md`, `docs/archivio-privato-generazioni-v1.0.0.md` | Inbox per singola immagine; giudizi non pubblicano né verificano diritti |
| Somiglianze | `docs/controllo-somiglianze-v1.md`; `shared/similarity.ts`, `worker/similarity.ts` | SHA/dHash/DINOv2; REAL–REAL e AI–AI, nessun confronto incrociato |
| Pubblicazione | `worker/editorial.ts`, `worker/moderation.ts`, `migrations/0008_editorial_publication.sql` | Percorso esplicito e bilanciato; studio v2 senza endpoint di pubblicazione |
| Gioco | `docs/gioco-tempi-protezione-v1.0.0.md`, `docs/campionamento-stratificato-v2.0.0.md`, `docs/precaricamento-immagini-v1.0.0.md` | REAL/AI indipendenti al 50%; timer server 10/20/30, PvP pubblico sospeso |
| Runtime, storage e rilascio | `wrangler.jsonc`, `docs/cloudflare.md`, `docs/importazione-diretta-r2.md` | D1/R2 esistenti; procedure remote richiedono autorizzazione |
| Verifiche | `.github/workflows/checks.yml`, `package.json`, `docs/verification.md` | CI riusata; verification contiene evidenze storiche, non certificazioni attuali |

Il ciclo completo 1.0.0 recepisce la richiesta corrente e supera, per nuovi run
avviati da `pipeline.cycle`, il brief opzionale e la separazione operativa dei
flussi. Rifiuti e pending determinano soltanto la capacità da sostituire; non si
cancellano REAL, SLOP o voti. I processi di discovery isolata e i relativi run
storici restano leggibili. Origine/licenza possono essere completate dopo la
review personale, ma restano obbligatorie prima del catalogo pubblico.

Il protocollo v3 resta il riferimento storico e il repository conserva esecutori
v1/Batch, studio v2 sperimentale e gate distinti. Presenza del codice non significa
attivazione. L'approvazione di un'immagine in archivio non conferma i diritti né pubblica.
Il nuovo ponte del ciclo richiede ammissione documentale e pubblicazione esplicite;
non converte automaticamente i voti storici.

La #56 sostituisce la discovery dei nuovi run scelti esplicitamente dal CLI:
non sostituisce il metodo per le esecuzioni storiche. Neutralità media/alta non
significative, intenzione/risultato separati, freeze SLOP opzionale prima di REAL.
Le decisioni sulle incompatibilità sono nella specifica, comprese le policy
v4 non importate. #44–#50 e l'intera #55 non sono prerequisiti del nuovo collector;
le diagnostiche rimangono opzionali. Non rimuovere pipeline legacy ancora usate.

## Stato delle proposte

| Fonte | Stato verificato | Trattamento |
| --- | --- | --- |
| PR #51, `16e9efd` | Draft su main | Catalogo inglese e indice locale; non presenti in main |
| PR #52, `822b315` | Draft sulla #51 | Metriche di varietà; diagnostiche, non gate |
| #53 / PR #55, `0577284` | Draft sulla #52; protocollo 4.3.0, app 0.19.0 | Matrice 12×12, caption, whole-frame, licenza SLOP e ricette ancora proposte rispetto a main |
| PR #54, `a80a556` | Draft indipendente su main; app 0.16.0 | Swipe, nessuna dipendenza editoriale |
| #56 | Nuovo percorso implementato e verificato; integrazione autorizzata | Commons live 200 con User-Agent della pipeline; controllo manuale reale completato, pilota GPT completato (11/19 file per braccio); Openverse challenge 403; cinque candidate con dossier/profili, approvazione individuale pendente |
| #57 / PR #58 | Audit integrato in main | Merge autorizzato dopo Checks riusciti; snapshot storici conservati |

Le versioni 4.0–4.3 nella #55 formano una catena: leggere 4.3 insieme alle versioni
che eredita. Non importare le sue regole su crop, opere, caption o licenze in main
solo perché sono più recenti. Piano di integrazione e decisioni aperte:
`docs/piano-integrazione-editoriale.v1.0.0.md`.

## Navigazione dell'audit

- `docs/audit-architettura.v1.0.0.md`: ref osservate, file → responsabilità →
  interfacce → test, conflitti e rischi verificati.
- `docs/indice-documentazione.v1.6.0.md`: catalogo vigente/proposta/storica/archivio,
  sostituzioni per ambito; gli originali restano intatti.
- `docs/piano-integrazione-editoriale.v1.0.0.md`: ordine #51/#52/#55/#56,
  contratti candidati, test mancanti e suddivisione delle PR.
- `docs/checklist-issue-codex.v1.0.0.md`: template breve per nuove issue.
- `docs/ricerca-real.v1.0.0.md`: contratti, CLI, migrazione/dismissione e limiti API.
- `docs/benchmark-ricerca-real.v1.0.0.json`: confronto fixture riproducibile,
  nessuna efficacia reale misurata; resoconto in `docs/verifica-ricerca-real.v1.0.0.md`.
- `docs/benchmark-commons.v1.0.0.md`: controllo manuale di retrieval reale, piani
  e rapporti 1.0.0/1.1.0 conservati; non è un risultato GPT o un'approvazione.
- `docs/ciclo-discovery-real.v1.0.0.md`: comandi, attese e dismissione; prove in
  `docs/verifica-ciclo-real.v1.0.0.md`.
- `docs/benchmark-gpt-commons.v1.0.0.md`: pilota GPT live, ricevute e costi;
  review documentale rinviata dal proprietario.
- `docs/verifica-documentale-real.v1.0.0.md`: esiti sulle 29 candidate, cinque
  dossier/profili, supporto JPEG/MPO e conferma umana ancora pendente; metriche
  in `docs/benchmark-gpt-commons.v1.1.0.json`.
- `docs/ciclo-editoriale.v1.0.0.md`: nuovo ciclo, CLI, stati, rifiuti, limiti, ammissione e rilascio.
- `docs/discovery-coda-sito.v1.0.0.md`: destinazione obbligatoria `/admin`,
  import pending e verifiche delle cinque candidate sul sito.
- `docs/openverse-registrazione.v1.0.0.md`: guida OAuth; email scelta, registrazione bloccata
  dalla challenge, esito in `docs/openverse-registrazione-esito.v1.0.0.md`.
- `docs/openverse-accesso.v1.0.0.md`: challenge verificata e bozza di segnalazione;
  il proprietario ha scelto di non pubblicarla.

App nella base main: 0.15.0; questo delta porta `package.json` a 0.16.0. Metodo v3, dati v2 e istruzioni 3.0.0 sono
versioni diverse. Per adottare una modifica strutturale aggiungere una decisione
esplicita, aggiornare questa mappa e AGENTS con nuovi snapshot; preservare i vecchi.
