# Generazione SLOP — specifica 16.2.0

Stato: decisa il 2026-11-23, da implementare; fino al rilascio il codice segue la specifica 15.0.0
(`git show v1.57.0:docs/generazione-slop.md`). Aggiornata: 2026-11-23T06:30:00Z.

## 1. Un solo wizard

Decisione dell'owner del 2026-11-22: **niente generazione manuale**. Ogni SLOP nasce dal wizard «Genera SLOP» della galleria, che
segue una sola pipeline (passi aggiornati dalla decisione del 2026-11-23, sezioni 2 e 3):

1. **Galleria**: il wizard si apre dalla galleria, nella stessa scheda;
2. **REAL**: estrazione corretta su affollamento e dettaglio, che l'owner modifica togliendo o aggiungendo REAL;
3. **Descrizioni**: per ogni REAL scelta la descrizione per assi, salvata sulla REAL; quelle mancanti si chiedono al modello e
   l'owner le corregge;
4. **Trasformazioni**: per ogni SLOP da generare il codice estrae gli assi da cambiare e il modello scrive descrizione di arrivo e
   cambiamenti (prima conferma); l'owner li corregge;
5. **Generazione** sul server (seconda conferma);
6. **Revisione**: inquadratura, trattamento, approvazione e pubblicazione delle SLOP accettate, e i processi senza SLOP.

Spariscono la scrittura diretta di prompt e brief, le SLOP senza REAL di partenza e le rotte dei batch manuali (`POST batches`,
`PUT batches/:id`, `POST batches/:id/{images,run,stop}`). I processi manuali già registrati restano consultabili; quelli senza SLOP
compaiono fra le eccezioni e si accettano o si chiudono come gli altri.

L’avviso in Statistiche confronta i conteggi di REAL e SLOP approvate o pubblicate e mostra a parte le SLOP nuove. Un batch genera da
1 a 10 SLOP. Le foto non hanno tag (decisione del 2026-11-20): la galleria le raggruppa. Un batch alla volta: se ne esiste già uno,
Gallerie e il wizard delle altre gallerie offrono un accesso al batch aperto. La revisione del batch mostra le SLOP che si trovano
ancora nella galleria di origine; una SLOP spostata si revisiona dalla galleria di destinazione.

Dalla decisione dell’owner del 2026-11-18 (#157) ogni REAL appartiene a una galleria. Le gallerie hanno titolo, descrizione e soglie di
affollamento e dettaglio; titolo e descrizione accompagnano le richieste al modello come contesto. **Niente Indicazioni SLOP di
galleria** (decisione dell'owner del 2026-11-22). Il wizard è disponibile quando la galleria ha almeno una REAL approvata o pubblicata.

Le REAL non hanno descrizione editoriale (decisione del 2026-11-20). Hanno invece, dal 2026-11-23, una **descrizione per assi**
interna alla generazione delle SLOP: non compare nel gioco, nei risultati o nei crediti e non arriva mai al browser del giocatore.

## 2. Dalla REAL alla SLOP: gli assi

**Decisione dell'owner del 2026-11-23.** La SLOP non si genera più da un prompt ispirato alla REAL: si ottiene **modificando la REAL**
con il generatore di immagini (`images/edits`), secondo una descrizione di arrivo che cambia alcuni assi e conserva gli altri. Sostituisce
le proposte delle REAL (decisioni del 2026-11-21 e del 2026-11-22) e il principio per cui la REAL ispira la SLOP senza esserne la base.

**Perché.** Prove del 2026-11-22 e del 2026-11-23 sulla galleria delle console Nintendo, 24 SLOP con `gpt-image-2.6-sunburst`
(fuori dal Worker, con l'autorizzazione dell'owner). Generata dal solo prompt, una console nota perde dettagli strutturali (slot della
cartuccia, interruttore diventato tasto); modificando la REAL restano corretti. La modifica però conserva tutto ciò che il testo non
cambia: con lo sfondo conservato la SLOP sembrava un altro scatto della stessa sessione e il punto di vista ruotava poco o niente, perché
il generatore si ancora agli oggetti dello sfondo. Su un fondo neutro, o con un ambiente nuovo, le rotazioni riescono. Le regole che
seguono vengono da questi risultati; per eventi, luoghi e persone non sono ancora state provate e vanno verificate sui primi batch.

### Assi

Otto assi descrivono una foto: **tipo del soggetto** (prodotto e modello), **aspetto del soggetto** (edizione, colore, finitura,
decorazioni, stato d'uso, configurazione come aperto o chiuso, acceso o spento, parti inserite), **persone**, **ambiente** (luogo,
superficie, sfondo e altri oggetti), **punto di vista** (altezza, angolo, distanza, orientamento, inquadratura), **luce**, **tecnica**
(apparecchio e modo di scattare) e **resa** (colore o bianco e nero, saturazione, contrasto, grana, compressione, età dell'aspetto).

### Descrizione della REAL

- **Chiamata.** Nel passo 3, per una REAL o per tutte le REAL scelte senza descrizione: una chiamata a pagamento per REAL, confermata
  con il massimo, mai ripetuta in automatico (`POST /:id/description {confirm, request}`, tipo `prompts`). Il modello di testo riceve
  l'originale intero, titolo e descrizione della fonte (ipotesi, non istruzioni), titolo e descrizione della galleria e il testo
  modificabile «Descrizione delle REAL per le SLOP».
- **Risposta** (schema rigido): per ogni asse una descrizione concreta e visiva, senza giudizi, con il modello o l'edizione quando sono
  riconoscibili e le parti strutturali visibili del soggetto (tasti, interruttori, slot, porte, scritte); una descrizione complessiva;
  tre indicazioni con il motivo: **foto da museo o da catalogo** (fondo neutro, vetrina o allestimento da studio), **esemplare unico o
  famoso** (un reperto esposto, un oggetto unico o noto per la sua storia, non un esemplare qualsiasi di un prodotto di serie; un numero
  di inventario non basta) e **sfondo riconoscibile** (oggetti, luoghi o scritte dello sfondo che permetterebbero di riconoscere la
  foto; un fondo neutro, un muro o un tessuto qualsiasi non lo sono).
- **Conservazione.** Una descrizione per REAL, salvata e riusata per tutte le sue SLOP. L'owner corregge gratis testo e indicazioni
  (`PATCH /:id/description`); una nuova richiesta la sostituisce. Si cancella con la REAL. Il dettaglio della REAL nella galleria la
  mostra in sola lettura.

### Estrazione degli assi

Il codice sceglie, per ogni SLOP, quali assi cambiano; luce, tecnica, resa e tipo del soggetto restano quelli della REAL salvo le
eccezioni sotto. Niente blocco degli assi per galleria (decisione del 2026-11-23: per ora tutti gli assi sono sbloccati); luce,
tecnica e resa si valuteranno dopo. Regole diverse per ogni galleria sono una teoria dell'owner da provare (2026-11-23): finché non
è provata, le regole sotto valgono per tutte le gallerie.

**Il punto di vista cambia sempre** (decisione dell'owner del 2026-11-23, su indicazione del legale che ha verificato la valutazione
sulle licenze, specifica `privacy-note-legali`, sezione 6). Cambiarlo non vuol dire solo ruotare a destra o a sinistra intorno al
soggetto: si può cambiare l'altezza della camera rispetto al soggetto (dall'alto, alla sua altezza, dal basso) o la distanza
(più vicino o più lontano, con l'inquadratura che ne segue). Il codice sceglie a caso quali di queste tre componenti cambiano,
almeno una. Il cambio deve essere visibile: nelle prove il generatore ha ridotto o ignorato più volte le rotazioni richieste. Sono
state verificate soprattutto le rotazioni; altezza e distanza vanno verificate sui primi batch.

**Almeno due trasformazioni su tre** fra soggetto, punto di vista e sfondo (decisione dell'owner del 2026-11-23): il punto di vista
e una seconda, scelta così:

- **Foto da museo o da catalogo, ed esemplare unico:** cambia il **soggetto**. Resta il luogo (fondo, ripiano, vetrina), perché una
  foto da catalogo resta tale; gli altri oggetti esposti si tolgono o si sostituiscono.
- **Sfondo riconoscibile**, nelle altre foto: cambia lo **sfondo**, con il suo ambiente.
- **Negli altri casi** la seconda trasformazione si sceglie a caso fra soggetto e sfondo.
- **Esemplare unico:** cambia anche il **tipo del soggetto**, con un altro modello della galleria, e la **condizione distintiva resta**:
  dal Game Boy bruciato della galleria si passa a un Game Boy Advance bruciato.
- Le persone della REAL non restano mai: si sostituiscono con persone inventate o si tolgono, e il numero può cambiare (specifica
  `contenuti-e-trasparenza`).

### Descrizione di arrivo e cambiamenti

Il modello di testo riceve la descrizione della REAL, gli assi da cambiare e da conservare, titolo e descrizione della galleria, le
descrizioni di arrivo già scritte nel batch per la stessa REAL (per variare) e il testo modificabile «Trasformazioni SLOP». Non riceve
l'immagine. Restituisce in inglese la **descrizione di arrivo**, asse per asse e complessiva, come se descrivesse una foto esistente,
e un breve elenco ordinato di **cambiamenti** concreti e visibili (soggetto, poi ambiente, poi punto di vista). Regole nel codice:

- gli assi da cambiare cambiano in modo netto: messe una accanto all'altra, REAL e SLOP non devono sembrare due scatti della stessa
  sessione;
- **aspetto del soggetto:** edizioni, colori e decorazioni plausibili, anche mai esistiti, coerenti con le abitudini del produttore e
  con l'epoca: per esempio un'edizione speciale del Game Boy Color a tema Charizard (decisione dell'owner del 2026-11-23). Un
  colore estraneo al prodotto e alla sua epoca, come un Super Famicom blu nelle prove, non è plausibile. Il tipo del soggetto, quando
  cambia, è un modello realmente esistito;
- **punto di vista:** cambiano le componenti estratte (rotazione, altezza, distanza); si sposta la camera, non l'oggetto. Il soggetto mantiene posizione e allineamento rispetto al piano d'appoggio e
  ai bordi della scena, e tutte le linee della scena cambiano prospettiva insieme; la descrizione dice che cosa entra ed esce
  dall'inquadratura;
- **ambiente:** quello nuovo non contiene oggetti riconoscibili della REAL; luce e riflessi sul soggetto si adattano alla scena;
- parti strutturali corrette per il modello del soggetto;
- **scritte:** restano solo i loghi e le marcature stampati che fanno parte del design del prodotto; contenuto dello schermo,
  etichette, adesivi, scritte a mano, numeri di serie, date impresse e scritte dell'ambiente si tolgono o si sostituiscono;
- il genere della REAL resta: una foto amatoriale non diventa una foto pubblicitaria da studio, una foto da catalogo resta tale;
- si applicano le regole della specifica `contenuti-e-trasparenza`.

Prima della seconda conferma l'owner corregge descrizione di arrivo e cambiamenti (`POST auto/proposal {batch, slot, target?,
changes?}`, gratuito, si salva da solo). La descrizione di arrivo approvata è l'ancoraggio che il valutatore controlla.

## 3. I passi del wizard

1. **Galleria.** Il wizard è quello della galleria aperta; un batch aperto altrove si raggiunge con il suo collegamento.
2. **REAL.** `POST auto/preview {gallery_id, size}` estrae gratis fino a `size` REAL approvate o pubblicate della galleria con
   originale in quarantena, **corretta su affollamento e dettaglio** (`shared/idea-sampling.ts`): ogni asse è diviso in tre fasce
   (0–33, 34–66, 67–100); per ogni fascia si confronta la quota fra le REAL misurate della galleria con quella fra le REAL da cui sono
   già nate SLOP accettate della galleria; il peso di una REAL è, per ogni asse, il rapporto fra le due quote, tra 0,25 e 4, e i due
   assi si moltiplicano. Contano solo le misure della formula in vigore; una REAL senza misura pesa 1. Senza correzione si
   sceglierebbero più spesso le REAL più semplici e la semplicità diventerebbe un indizio dell'origine. L'estrazione è solo una
   proposta: le REAL estratte arrivano già selezionate e l'owner ne toglie o aggiunge fra tutte quelle disponibili (`GET
   auto/candidates?gallery=`, con misura e descrizione). Selezione e scelte restano nella scheda del browser fino alla prima conferma.
   Tocco o pressione prolungata su una miniatura apre l’originale intero con la descrizione della fonte.
3. **Descrizioni** (sezione 2). Per ogni REAL scelta la sua descrizione per assi con le tre indicazioni, modificabile, oppure
   «Chiedi al modello».
4. **Trasformazioni.** L'owner indica quante SLOP generare da ogni REAL descritta, da 1 a 10 in tutto per batch. `POST auto/prepare
   {gallery_id, slots, count, request, confirm: true}` è la prima conferma, del massimo di una chiamata per SLOP. `request` è un UUID
   del browser e diventa l'ID del batch: la stessa conferma inviata due volte crea un solo batch. Il Worker ricontrolla che ogni REAL
   sia approvata o pubblicata nella galleria, con l'originale e la descrizione; congela modelli, qualità, tolleranza, tentativi massimi
   e versioni dei contesti; crea un processo per SLOP con il riferimento alla REAL ed estrae gli assi (sezione 2), che il processo
   conserva. Il Workflow scrive le descrizioni di arrivo in ordine; ogni risposta non valida o il rifiuto motivato del modello lasciano
   il processo fra le eccezioni. L'owner le corregge (sezione 2).
5. **Generazione.** Le trasformazioni restano disponibili per un’ora dalla preparazione, anche dopo il ricaricamento. `POST auto/start
   {batch, count, confirm: true}` conferma il numero esatto di trasformazioni valide e il massimo rimanente di `2N × count` chiamate,
   con `N` tentativi massimi: una generazione e una valutazione per tentativo. Nessuna analisi segue l’accettazione. La preconferma
   mostra modelli, qualità, tentativi e tolleranza. Il server ricontrolla appartenenza, disponibilità, revisioni e scadenza: un
   cambiamento della galleria, delle REAL o delle loro descrizioni invalida le trasformazioni. `POST auto/cancel {batch}` ferma la
   preparazione prima del passo successivo. L’annullamento o la scadenza rimuovono i riferimenti temporanei; la conferma rimuove quelli
   dei processi che non generano. Gli altri restano fino alla fine del processo: all'accettazione della SLOP il riferimento sparisce e
   la REAL conta una SLOP nata in più; alla chiusura di un processo senza SLOP il riferimento sparisce. Conferme concorrenti
   acquisiscono una sola volta la transizione. La generazione continua sul server anche se la pagina si chiude; «Interrompi» la ferma
   prima del passo successivo.
6. **Revisione.** Le SLOP accettate compaiono nel wizard con l'immagine intera valutata e la copia 4:5, preparata nel browser;
   «Inquadratura», i comandi del trattamento, «Approva», «Pubblica» e «Cestino». Tutti i tentativi restano consultabili con la loro
   valutazione. I processi senza SLOP stanno in cima al wizard finché l'owner non li accetta o li chiude (sezione 4). «Apri nella
   galleria» apre la griglia filtrata sul batch. Il batch si chiude quando ogni SLOP è decisa e ogni eccezione chiusa.

## 4. Generazione, valutazione e ripresa

Il Workflow prosegue anche se si chiude la dashboard. Ogni passo a pagamento acquisisce una richiesta persistente prima dell’invio
e registra l’esito in `paid_calls`. Con un’interruzione, i passi mai acquisiti possono essere ripresi dall’owner entro la conferma
già data. I passi con esito incerto non si ripetono automaticamente. Lo stop ferma la fase prima del passo successivo.

**Generatore** (`images/edits`). Riceve l'originale intero della REAL, ridotto nel Worker a 2048 pixel sul lato lungo e senza
metadati, e il testo composto da un'intestazione fissa nel codice («trasforma questa foto nella foto descritta; ciò che i cambiamenti
non nominano resta com'è»), dalla descrizione di arrivo approvata e dai cambiamenti. Il formato dell'uscita segue le proporzioni della
REAL: 1536 pixel sul lato lungo, lati multipli di 16. Ogni tentativo riparte dalla REAL, mai dalla candidata precedente. Il testo
inviato al generatore si salva come prompt della SLOP (dashboard e ricerca; non compare nei risultati del gioco).

**Valutazione.** La Responses API riceve l’intera candidata corrente prima di cropping o trattamento, l’ID del tentativo, la
descrizione di arrivo approvata e i cambiamenti, titolo e descrizione della galleria, il testo corrente e la tolleranza congelata, e
anche la REAL, ridotta come per il generatore (decisione dell'owner del 2026-11-23): serve a verificare che il punto di vista sia
cambiato in modo visibile, condizione posta dal legale, che le altre trasformazioni richieste ci siano, che le scritte della REAL non
siano state riprodotte e che le due foto non sembrino della stessa sessione. Un punto di vista non cambiato è un difetto critico. Il
modello usa versioni congelate della base e del contesto di valutazione, senza conversazioni precedenti. La
credibilità fotografica ha priorità sui dettagli secondari. Oltre alla credibilità controlla le parti strutturali del soggetto, la
coerenza prospettica fra soggetto e scena (un oggetto ruotato rispetto ai bordi del piano o della vetrina è un difetto), luce e riflessi
coerenti con l'ambiente e le scritte. I difetti critici e gli assi richiesti non cambiati impediscono l’accettazione automatica. Una
correzione valida aggiunge un'indicazione fotografica ai cambiamenti approvati e conserva la descrizione di arrivo. Una riprogettazione
richiede revisione umana. Sono configurabili da 1 a 5 tentativi e tolleranza da 0 a 2. A tolleranza zero, i difetti minori richiedono
un altro tentativo entro il limite.

Un solo batch automatico aperto. Quando termina la generazione si passa alla revisione. Le candidate accettate entrano in libreria
come nuove, senza altre chiamate. Il browser prepara poi la copia di gioco 4:5 con la ricetta WebP comune.
La SLOP eredita la galleria. Per il trattamento si copiano solo formato e misure anonime della REAL: bianco e nero, seppia o colore
derivano da queste (specifica `copie-di-gioco`).
Le REAL restano utilizzabili nelle estrazioni successive e nelle partite.

I processi esauriti, in revisione, falliti o incerti dopo l’avvio della generazione restano in evidenza con immagini, prompt e
valutazioni fino alla decisione dell’owner. «Accetta comunque il tentativo N» permette di accettare qualsiasi candidata intera
salvata e valutata di un processo concluso o sospeso anche in presenza di segnalazioni, elencate nella conferma. Una sola richiesta
acquisisce la decisione, senza chiamate a pagamento. Se il file manca si ripristina lo stato precedente.
La scelta dell’owner si registra separatamente dalla valutazione. Chiusura e manutenzione permettono poi di eliminare le candidate
temporanee dopo sette giorni. Copia, approvazione e pubblicazione restano passaggi distinti.

## 5. Rilascio e dati

La migrazione 0060 aggiunge gallerie, premesse, riferimenti temporanei e contesto per la proposta. Su decisione dell’owner
del 2026-11-18, la migrazione 0061 azzera il D1 attuale al rilascio. Vengono rimossi catalogo, gallerie, tag, batch, tentativi,
partite, classifica, chiamate registrate, impostazioni e loro contesti. La migrazione elimina il registro madre–figlia e richiede
una galleria per ogni immagine e batch. Agisce esclusivamente sul D1.

Il **flusso manuale**, con brief e prompt scritti dall'owner, è stato tolto il 2026-11-22: i suoi processi già registrati conservano il
brief, che fa da vincolo se l'owner ne accetta una candidata fra le eccezioni. Nessuna migrazione: cambia solo il codice.

La SLOP è identificata dal suo ID e non viene analizzata. Per la copia si conservano formato e misure anonime; i riferimenti alle
REAL si eliminano alla fine di ogni processo (sezione 3). Nessun registro permanente: di una REAL resta solo quante SLOP accettate ne
sono nate, non quali.

La migrazione 0069 aggiunge `real_ideas` (idea, genere, cambiamenti, stato, galleria, modello e
versioni del contesto, date), `images.ideas_reason`, `slop_gallery_sources.idea_id`, i trigger che conservano i riferimenti fino
alla fine del processo e la parte `real_ideas` del contesto dei modelli. La migrazione 0070
elimina `galleries.slop_instructions` e la revisione registrata sulle idee, e sostituisce «Premessa e prompt di galleria» con la
nuova proposta, che sviluppa l'idea, se il testo in vigore era ancora quello salvato dalla 0066.

**Da implementare (decisione del 2026-11-23).** Una nuova migrazione:

- aggiunge le descrizioni delle REAL (una per REAL: descrizione per assi, descrizione complessiva, le tre indicazioni con il motivo,
  modello, versioni del contesto, data e se l'owner l'ha corretta), cancellate con la REAL, e il conteggio delle SLOP accettate nate da
  ogni REAL, che sostituisce le idee usate nell'estrazione corretta;
- aggiunge ai processi gli assi estratti, la descrizione di arrivo e i cambiamenti, al posto di premessa e idea per i nuovi processi
  (quelli già registrati conservano premessa e brief);
- elimina `real_ideas`, `images.ideas_reason` e `slop_gallery_sources.idea_id` con i loro trigger, conservando quelli che tengono i
  riferimenti fino alla fine del processo;
- sostituisce i contesti «Idee SLOP delle REAL» e «Premessa e prompt di galleria» con «Descrizione delle REAL per le SLOP»
  (`real_description`) e «Trasformazioni SLOP» (`slop_transform`), di cui salva le proposte del codice come prime versioni; il
  contesto ritirato «Descrizione delle REAL» (`analysis`) resta escluso. Salvare le proposte è un'eccezione esplicita alla regola che
  le proposte non si salvano da sole, come per la 0066. La valutazione riceve una nuova proposta del codice.

Nei test si usano solo il Worker e lo storage locali con OpenAI simulato. Il rilascio segue le regole di `AGENTS.md`.
