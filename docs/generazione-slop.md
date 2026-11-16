# Generazione delle SLOP: riferimenti REAL, valutazione e batch — specifica 5.11.0

Stato: vigente; la 5.10.0 è in produzione con l'app 1.35.0, la 5.11.0 è per l'app 1.35.1. Aggiornata: 2026-11-16T18:16:17Z. La 5.11.0: edifici e luoghi reali nominati o inventati caso per caso, mai riprodotti fedelmente (decisione dell'owner del 2026-11-16). La 5.10.1: si accetta dopo la revisione anche un tentativo con i vincoli editoriali non confermati ma senza difetti critici. La 5.10.0: le incertezze su ciò che i pixel non possono verificare non bloccano l'accettazione e l'owner può accettare la candidata di un processo in revisione (decisioni dell'owner del 2026-11-16). La 5.9.0: la copia di gioco della SLOP accettata la prepara il browser alla revisione, non più il Workflow (decisione dell'owner del 2026-11-16). La 5.8.0: un passo
fermato dalla piattaforma chiude solo la sua REAL, un batch in revisione con SLOP ancora da generare si riprende, copia della SLOP in un passo
a sé, limite di CPU di cinque minuti. La 5.7.0: copia della SLOP
accettata preparata dal Worker. La 5.6.0 sposta il ciclo
su Cloudflare (Workflow), fuori dal browser (decisione dell'owner del 2026-11-15). La 5.5.1 scrive brief e
prompt con una richiesta per REAL e sblocca un batch rimasto «in scrittura».
La 5.5.0 fa analizzare REAL e SLOP intere invece del ritaglio 4:5, tiene in evidenza, con ogni tentativo, i processi finiti senza
SLOP finché l'owner non li chiude e con tolleranza 0 fa rigenerare invece di fermare il ciclo (decisioni dell'owner del 2026-11-15). La 5.4.0 rende modificabile il contesto del valutatore, blocca brief e prompt con il contesto delle gemelle e conta nel massimo le
riscritture confermate di brief e prompt. La specifica 4.0.0 e l'issue #136 descrivono una pipeline precedente, **superata su somiglianza alla REAL,
cambiamento singolo, seconda analisi visiva della REAL nella generazione e numero di generazioni**. Rimangono validi, salvo diversa indicazione qui, il 4:5 e il trattamento leggero di
`docs/copie-di-gioco.md` 9.1.3; tag e contesti in `docs/libreria-immagini.md`; contenuti in `docs/contenuti-e-trasparenza.md`.
Le versioni precedenti sono nella cronologia Git.

## 1. Obiettivo e principi non negoziabili

- **Obiettivo principale: credibilità fotografica.** Una SLOP deve poter essere scambiata per una fotografia autentica della tecnica,
  dell'epoca e della situazione rappresentata. Non basta l'aderenza letterale a un prompt. Il valutatore può sbagliare: l'accettazione
  automatica è una stima editoriale, non una certificazione, e precede sempre la normale approvazione dell'owner.
- **REAL come riferimento, non come modello da copiare.** La REAL fornisce ancoraggi tematici, semantici e fotografici per contribuire
  al bilanciamento del catalogo. La SLOP può avere soggetti, numero di persone, azione, punto di vista, luce, stagione, composizione
  e ambientazione differenti. La somiglianza visiva non è un obiettivo né un requisito di qualità.
- **Nessun obbligo di cambiare un solo elemento.** Il precedente campo `change {element,from,to}` e la relativa UI vengono rimossi
  dalla pipeline nuova. Il modello progetta liberamente una scena coerente con gli ancoraggi editoriali: non conta quanti aspetti
  cambiano rispetto alla REAL.
- **Vincoli editoriali, non imitazione.** La coerenza semantica e contestuale è un requisito minimo del brief, non un punteggio da
  massimizzare. Se la fotografia è credibile e rispetta questi vincoli, si può accettare anche quando differisce dal prompt operativo.
- **SLOP integralmente sintetiche;** niente editing parziale della REAL per produrre il contenuto. Le persone della SLOP sono
  inventate secondo `contenuti-e-trasparenza`. Nessuna SLOP e la propria REAL di origine compaiono nella stessa partita.
- **Edifici e luoghi reali** (decisione dell'owner del 2026-11-16): il brief decide caso per caso se nominare un luogo reale o
  inventarne uno dello stesso tipo, stile, epoca e regione (la gemella della REAL di Brown Chapel a Selma può essere un'altra
  chiesa, fittizia e simile). Non chiede mai di riprodurre fedelmente un edificio reale, la sua architettura esatta o le sue
  iscrizioni: un ancoraggio obbligatorio può nominare un luogo, non la fedeltà del suo aspetto. Il valutatore non giudica la
  fedeltà all'aspetto reale e non la chiede nei prompt rivisti: un edificio plausibile di quel tipo, stile, epoca e regione rispetta
  l'ancoraggio, e una differenza da quello reale non è un difetto, né un motivo di revisione, né rende falsi i vincoli editoriali.
  Il 2026-11-16 un brief aveva reso obbligatoria la chiesa reale e il valutatore ne aveva chiesto l'architettura esatta, poi
  aveva mandato in revisione la candidata per i mattoni rossi. La regola è nella parte fissa delle istruzioni, nel codice.
- **Selezione REAL qualitativa:** usare gli otto principi della issue #138 (non filtri rigidi, soggetti centrati obbligatori o
  benchmark per singolo generatore). La selezione editoriale rimane all'owner; per ora nessun avviso nel wizard.
- **Tutte le chiamate API a pagamento richiedono autorizzazione esplicita** e registrazione; nessun retry automatico di chiamate
  con esito incerto. Le immagini non pubblicate non sono accessibili nel gioco.

## 2. Legame con la REAL e bilanciamento

- `generation_source` identifica la **REAL di riferimento**, non un vincolo di somiglianza. Il nome storico «gemella» resta solo
  dove necessario per la compatibilità; la UI preferisce «SLOP da REAL di riferimento».
- Una REAL approvata o pubblicata può alimentare al massimo **una SLOP attiva** (`new`, `approved`, `published`) secondo le
  regole esistenti; una candidata scartata durante il loop **non** occupa quel posto. Cestinare la SLOP lo libera.
- La proposta di riequilibrio resta basata sulle REAL approvate/pubblicate e sulle SLOP con un'origine associata, con soglia
  configurata e batch massimi di 10. I tentativi falliti non contano come SLOP.
- L'ancoraggio semantico mira a una **copertura aggregata** di tema, genere fotografico, epoca e ambiente, non alla corrispondenza
  esatta di tutti i tag. I tag effettivi della SLOP sono prodotti **dall'immagine accettata**, non copiati dal brief. Il sistema
  confronta gli ancoraggi richiesti con i tag rilevati e segnala le divergenze all'owner; non falsifica i tag per far quadrare i conti.
- La qualità editoriale del catalogo non è rappresentata dal solo rapporto REAL/SLOP: monitorare in futuro distribuzioni e
  riconoscibilità delle categorie, senza aggiungere vincoli di matching non approvati.

## 3. Pipeline di una REAL

Il flusso si divide in **catalogazione della REAL** e **generazione SLOP**. La comprensione visiva della REAL avviene
normalmente **una volta sola nel wizard di caricamento**, insieme ai tag; una descrizione strutturata e correggibile resta
associata alla REAL e può essere riusata quando occorre riequilibrare il catalogo.

`Caricamento REAL: originale intero + metadati Commons → UNA chiamata multimodale (tag + descrizione contestualizzata) → REAL catalogata`

`Generazione SLOP: tag REAL + descrizione salvata → UNA chiamata testuale (brief + prompt iniziale) → [genera → valuta immagine SLOP INTERA → (accetta | rigenera | correggi prompt)] → nuova SLOP in libreria → copia 4:5 e trattamento; tag SLOP dall'immagine intera → revisione owner → pubblicazione`

1. **Analisi REAL durante il caricamento, una sola chiamata multimodale.** Il modello che produce i tag REAL riceve la **copia
   intera**, cioè l'originale caricato e mai il ritaglio 4:5 (decisione dell'owner del 2026-11-15, perché tag e descrizione
   devono coprire tutta la fotografia), il titolo e il contesto disponibile di Wikimedia Commons, più il vocabolario dei tag.
   La copia di gioco non serve all'analisi della REAL.
   Nella medesima risposta strutturata produce:
   - `tags`: categorie e tag secondo le regole ordinarie dell'analisi, senza dedurre dalla fonte ciò che deve essere giudicato
     esclusivamente dai pixel (in particolare Genere, Colore e Supporto);
   - `real_description.visible`: soggetti, azioni, ambiente, composizione e aspetto fotografico **osservabili**;
   - `real_description.documented_context`: contesto (luogo, epoca, evento, circostanze) **solo** se documentato nei metadati o
     nella descrizione Commons fornita, distinguendolo dalle caratteristiche direttamente osservabili;
   - `real_description.uncertainties`: eventuali dettagli non identificabili o elementi della fonte poco affidabili.
   La descrizione è **neutra, fattuale, modificabile**, priva di interpretazioni sull'autenticità o di riferimenti a
   generazione artificiale. Se Commons è lacunoso, completare il racconto *visivo*, non inventare contesto storico o geografico.
   I dati originali Commons restano disponibili, non sono sovrascritti da questa descrizione. Il testo generato è **un campo
   editoriale privato** distinto dalla descrizione/didascalia già eventualmente visibile al giocatore nel riepilogo.
2. **Conservazione e compatibilità.** Tag e descrizione REAL vengono salvati **insieme come esito della stessa chiamata**
   (modello, hash dell'originale, revisione e data); la descrizione può essere modificata senza invalidare automaticamente
   i tag, e viceversa. Tag e descrizione descrivono la foto intera, anche ciò che il ritaglio 4:5 lascia fuori; l'owner
   controlla nel wizard che il ritaglio non escluda soggetti o fatti **fondamentali** per il significato della fotografia.
   Le REAL già presenti senza `real_description` rimangono utilizzabili nel catalogo: per avviare una nuova generazione
   SLOP occorre prima aggiungere/correggere manualmente la descrizione oppure richiedere **con conferma a pagamento**
   una nuova analisi combinata tag+descrizione. Nessuna analisi o backfill massivo automatico.
3. **Brief e prompt iniziale: unica chiamata SOLO TESTUALE.** Nello studio o nel batch il modello riceve i **tag aggiornati
   della REAL** e la **descrizione salvata** (comprensiva di contesto documentale e incertezze), senza una nuova immagine.
   Produce in un'unica risposta strutturata:
   - `brief.required[]`: pochi ancoraggi tematici e fotografici **obbligatori**, verificabili nell'output;
   - `brief.preferred[]`: preferenze non vincolanti;
   - `brief.flexible[]`: elementi liberi; nessuna somiglianza obbligatoria alla REAL;
   - `brief.exclusions[]`: esclusioni editoriali e contenutistiche;
   - `prompt`: descrizione **in inglese** di una nuova fotografia plausibile, con soggetti, azione, composizione, ambiente
     e resa fotografica concreti, senza cliché o enfasi cinematografica.
   L'owner può modificare brief e prompt prima della generazione, oppure richiedere con nuova conferma a pagamento
   di rigenerarli: ogni riscrittura confermata aggiunge la sua chiamata al massimo del batch. La chiamata non parte se il
   contesto in vigore di «Brief e prompt per le SLOP» è ancora quello delle gemelle (specifica `libreria-immagini`, sezione 7). Il brief è congelato per l'intero loop (versione/hash), mentre il prompt può essere revisionato dal
   valutatore. Se il brief cambia dopo l'avvio, parte un nuovo processo. Un output non valido blocca il passaggio
   alle chiamate successive, senza inventare campi. Il modello di prompt non sceglie il formato.

4. **Generazione della candidata integrale.** Il generatore riceve il prompt operativo e la dimensione scelta da `copie-di-gioco`;
   produce un'immagine completamente sintetica, nel **suo formato originale di generazione**. Il file intero resta privato fino
   alla decisione. **Non ritagliare né trattare l'immagine prima della valutazione.** Il generatore e il valutatore non devono
   essere condizionati dal riquadro 4:5 in cui la fotografia sarà successivamente mostrata nel gioco.
5. **Valutazione multimodale sull'immagine INTERA.** Vede la fotografia generata completa, mai un ritaglio 4:5,
   e il brief immutabile e il prompt operativo. Le istruzioni sono la base comune, il contesto modificabile «Valutazione delle SLOP»
   e una parte fissa nel codice (decisioni, tolleranza, difetti critici mai accettati, ancoraggi ed esclusioni copiati alla lettera);
   il tentativo registra le versioni dei contesti usate. Distingue: (I) credibilità
   fotografica, (II) plausibilità fisica e contestuale, (III) rispetto dei soli ancoraggi editoriali obbligatori. L'aderenza a
   dettagli secondari del prompt non è un requisito. Deve riportare difetti **osservabili** e incertezze, senza proclamare
   «foto autentica» o dedurre identità, licenze, provenienza o verità storica dai pixel.
6. **Decisione del valutatore:** `accept`, `retry_same_prompt`, `revise_prompt`, `replan_scene`, `review_needed`. I cambiamenti
   proposti al prompt sono ammessi solo se mantengono il brief; il server verifica almeno struttura, vincoli dichiarati e revisioni.
   Una rigenerazione con lo stesso prompt è appropriata per anomalie occasionali; la revisione per istruzioni ambigue o ricorrenti;
   la riprogettazione per scene sistematicamente troppo difficili. Ogni nuova generazione consuma un tentativo.
7. **Candidato accettato:** solo **dopo la valutazione dell'immagine intera**, la candidata accettata viene registrata come `new` con
   originale. Il ritaglio 4:5 e il trattamento leggero della copia di gioco li prepara il browser, all'apertura della revisione
   (studio o batch automatico). Senza copia non può essere approvata né pubblicata. Conserva
   copia, prompt finale, brief, REAL di riferimento, modello, qualità, configurazione e tracciabilità dell'esito.
   L'analisi dei tag usa l'immagine SLOP intera (l'originale accettato, non la copia 4:5: decisione dell'owner del 2026-11-15) e distingue le evidenze visive dai desideri del prompt. L'owner verifica
   che il ritaglio non comprometta il risultato; eventuali correzioni di crop o trattamento **non producono feedback automatico
   per riscrivere il prompt e non forzano il generatore a comporre per il 4:5**. Approvare e pubblicare restano azioni
   separate dell'owner. Nessuna pubblicazione automatica.

Il valutatore può proporre la revisione del prompt **nella propria risposta strutturata**, senza obbligare a una chiamata ulteriore.
Se l'owner cambia il brief tra due esecuzioni, deve partire un processo nuovo (mai mutare retroattivamente un processo in corso).

## 4. Contratto di valutazione e tolleranze

La valutazione **non** consiste nella media di tre numeri che compensi un difetto grave. Impiega un giudizio qualitativo:
- **Difetti critici (rifiuto):** deformazioni anatomiche evidenti, errori fisici o geometrici vistosi, testo centrale insensato,
  composizione o resa immediatamente artificiale, contraddizioni contestuali decisive, violazioni contenutistiche o mancato
  rispetto di un ancoraggio editoriale obbligatorio.
- **Difetti minori (tollerabili):** imperfezioni sottili che potrebbero esistere in una fotografia genuina e non compromettono
  credibilità, plausibilità né ancoraggi. La soglia di tolleranza editoriale è configurabile, separatamente dai tentativi.
- **Incertezza** (decisione dell'owner del 2026-11-16): `review_needed` solo per un dubbio concreto su qualcosa di **visibile**
  che il valutatore non riesce a risolvere (per esempio un monumento o un'insegna che forse contraddice il luogo). I fatti che i
  pixel non possono mai verificare (luogo esatto, data, identità, persone inventate) vanno in `uncertainty_notes` e non fermano
  l'accettazione: il server non trasforma più in `review_needed` un `accept` con sole note d'incertezza. Il primo batch automatico
  ne aveva fermati 4 su 10 senza alcun difetto, solo per queste note. Difetti critici e ancoraggi mancanti restano bloccanti.

Output strutturato minimo per tentativo: `attempt_id`, `decision`, `critical_findings[]`, `minor_findings[]`,
`editorial_constraints_met`, `uncertainty_notes[]`, `action_reason`, `revised_prompt` (solo se pertinente).
Ogni rilievo cita un punto o una regione dell'immagine e una conseguenza osservabile; niente spiegazioni inventate.
Il giudizio sulla **naturalità fotografica dell'immagine intera** va distinto dall'aderenza al brief. Una valutazione effettuata mostrando il brief e
l'immagine nella stessa chiamata può essere influenzata dal testo: non chiamarla «valutazione cieca». Se si vorrà una valutazione
davvero cieca, servono richieste separate o un disegno sperimentale esplicito.

## 5. Numero di cicli e rapporto con la difficoltà

- Impostazione owner **`max_generation_attempts`**, intero da **1 a 5**, predefinito **3**. Un tentativo = **una generazione di
  immagine più la relativa valutazione**. Il primo tentativo conta; mai ciclo illimitato.
- L'owner sceglie il limite prima di avviare studio o batch; viene fissato nello snapshot dell'esecuzione. Lo stesso limite vale
  anche se la sessione viene ripresa. Una soglia di tolleranza qualitativa è impostazione **distinta**.
- Più tentativi aumentano le opportunità di ottenere una candidata credibile, **non garantiscono** che l'immagine risulti più
  difficile da distinguere per il giocatore, né trasformano il limite in una «difficoltà» misurata. Questa potrà essere stimata
  solo dalle statistiche dei giocatori, con campioni adeguati. Non attribuire livelli automatici di difficoltà in base ai cicli.
- **Stop anticipato** alla prima candidata che supera tutte le condizioni editoriali e di credibilità, senza consumare i tentativi
  residui. Nessuna chiamata superflua per «migliorare comunque» un'immagine già accettata.
- **Esaurimento tentativi:** il processo termina `exhausted`, senza SLOP nuova/approvata/pubblicata e senza occupare la REAL;
  anteprima e motivazioni all'owner, eventuale riavvio solo con una **nuova conferma di spesa**. `review_needed` blocca il processo
  fino alla decisione umana, non consuma automaticamente nuovi tentativi. L'owner decide tra «Accetta il tentativo N» e «Chiudi: ho
  visto» (sezione 6).
- Il limite vale per il **numero di generazioni**, non per durata e non per una promessa di successo.

## 6. Stato, spese, ripresa e conservazione

- **Il ciclo gira su Cloudflare** (decisione dell'owner del 2026-11-15, app 1.31.0): un Workflow (`SlopBatchWorkflow`,
  `worker/slop-runner.ts`, binding `SLOP_RUNNER`) scrive i brief mancanti, esegue i tentativi (generazione e valutazione
  dell'immagine intera) una REAL alla volta, si ferma alla prima accettazione e analizza i tag della SLOP accettata
  sull'originale. Il browser lo avvia dopo la conferma del massimo (`POST batches/:id/run {confirm, phase: briefs|images}` dallo
  studio; `auto/start` per il batch automatico, che fa tutto) e ne segue l'avanzamento: chiudere la dashboard o cambiare app sul
  telefono non ferma nulla. La copia di gioco 4:5 della SLOP accettata la prepara invece il browser, alla revisione (decisione
  dell'owner del 2026-11-16: il Worker gestisce ciò che riguarda OpenAI, il browser tutto il resto; specifica `copie-di-gioco`).
- **Un runner per batch:** il batch registra istanza, stato (`running`, `stopping`, `done`, `stopped`, `failed`) e ora dell'ultimo
  passo (migrazione 0052); un secondo avvio mentre il runner è vivo è rifiutato. Un runner fermo da oltre quindici minuti è
  considerato morto: lo studio permette un nuovo avvio e il batch automatico mostra «Riprendi sul server» (`auto/resume`), che
  riparte da dove si era fermato entro il massimo confermato all'inizio. «Riprendi sul server» compare anche per un batch
  automatico in revisione che ha ancora SLOP da generare (REAL di riferimento con brief da scrivere, pronto o da ritentare): una revisione con SLOP ancora da
  generare non si chiude da sola.
- **Un passo fermato dalla piattaforma** (limite di CPU, interruzione) chiude solo la sua REAL: il tentativo resta in corso e dopo
  dieci minuti diventa incerto, tra i processi «Da vedere»; le altre REAL proseguono. Solo un problema dell'account OpenAI ferma
  l'intera esecuzione. Il 2026-11-16 un passo interrotto per CPU aveva fermato tutto il batch, lasciando 6 REAL mai tentate.
- **Passi del runner per una SLOP accettata:** tentativo (generazione, valutazione, registrazione nella libreria), poi analisi dei
  tag. La copia di gioco la prepara il browser alla revisione (dal 2026-11-16; nella 1.33 era un passo del runner). Limite di CPU di cinque minuti per passo (Workers Paid,
  `limits.cpu_ms` in `wrangler.jsonc`, dal 2026-11-16).
- **Mai una chiamata ripetuta:** ogni passo a pagamento ha la sua rivendicazione (brief, tentativo, analisi) e Cloudflare non lo
  ritenta; se un passo viene rieseguito dopo un'interruzione trova la rivendicazione e non invia nulla, e quel passo finisce incerto.
- **Interrompi:** il runner termina prima del passo a pagamento successivo; quello in corso finisce (stato `stopping`, poi
  `stopped`). Fermare un batch automatico lo porta in revisione.
- Anteprime e sviluppo locale hanno Workflow con nomi propri (`real-or-slop-slop-batch-preview`, `-local`): non toccano mai le
  istanze di produzione.

- **Conferma preventiva del tetto massimo** delle chiamate del batch, non del numero esatto effettivo: con una REAL **già
  catalogata e dotata di descrizione**, la generazione SLOP richiede al massimo **`1 brief+prompt testuale + N immagini
  + N valutazioni + 1 analisi tag SLOP = 2 + 2N`** chiamate (N=3 → al massimo 8). L'analisi congiunta tag+descrizione REAL
  è **già stata pagata durante il caricamento** e non si ripete. Per una REAL storica senza descrizione occorre un'operazione
  **separata** e autorizzata prima di avviare il processo (+1 eventuale analisi combinata), da mostrare nel preventivo totale.
  La successiva analisi dei tag SLOP avviene solo se una candidata è accettata. Rigenerazioni manuali del brief/prompt richiedono
  nuova conferma, che dichiara la chiamata in più: il massimo mostrato diventa la somma, per REAL, di `max(1, chiamate di brief e
  prompt) + 1 + 2N`, e non scende mai sotto le chiamate fatte. Il preventivo distingue i tipi di chiamata e i modelli; il costo monetario resta gestito dal limite OpenAI.
- Ogni chiamata a pagamento è registrata **prima** dell'invio con ID univoco, tipo, immagine, processo e tentativo. I passi e gli
  output sono persistenti con stati `pending / completed / failed / uncertain`. Nessuna chiamata `uncertain` viene ripetuta
  automaticamente; la singola foto è sospesa, il resto del batch può proseguire. Problemi di account OpenAI fermano il batch.
- Concorrenza: impedire che doppio clic, due schede o ripresa dopo refresh inviino la stessa chiamata; sequenza per foto
  idempotente a livello applicativo. Registrare prima dell'invio **non prova** che un esito di rete incerto non abbia consumato
  crediti: comunicarlo senza promesse assolute.
- Processi `draft`, `prompting`, `ready`, `running`, `retry`, `accepted`, `exhausted`, `review_needed`, `failed`, `uncertain`, `closed`; una chiamata pendente interrotta resta sospesa e la manutenzione la marca incerta dopo dieci minuti.
- **Una richiesta per REAL anche per brief e prompt** (app 1.30.3): studio e batch automatico chiedono brief e prompt di ogni REAL con
  una richiesta separata, come già i tentativi. Il 2026-11-15 un batch di 10 scritto con un'unica richiesta di circa tre minuti si è
  interrotto quando il browser del telefono ha chiuso la connessione («clientDisconnected»): 2 brief scritti, uno incerto, 7 mai
  iniziati e il batch bloccato su «in scrittura». Lo stato dei brief del batch segue ora i suoi processi: qualcuno da scrivere →
  `none`; almeno uno utilizzabile → `done`; altrimenti `failed`; un brief fallito o incerto non blocca gli altri. Una scrittura
  rimasta `running` per oltre dieci minuti torna a seguire i processi alla lettura del batch: il brief interrotto resta `uncertain`
  (mai ripetuto, tra quelli «Da vedere») e gli altri si possono scrivere. Nel batch automatico ogni brief si scrive una sola volta.
- Ogni tentativo conserva privatamente prompt, modello, qualità, esito, motivi, eventuale bozza di revisione e riferimento alla
  candidata per consentire ripresa e revisione; **i tentativi rifiutati non entrano nella libreria delle immagini e non sono
  pubblicati**, né generano nuove REAL/SLOP attive. Le anteprime temporanee sono cancellate sette giorni dopo l'accettazione o la chiusura del processo; la cancellazione della REAL o SLOP elimina anche processi, tentativi e file collegati. Non creare
  archivi permanenti delle eliminazioni in contrasto con `AGENTS.md`.
- Conservare l'esito e l'identità del processo accettato con la nuova SLOP per audit editoriali; le anteprime della libreria
  riportano solo contenuti privati all'owner. Nessun criterio o risposta corretta viene inviato al giocatore prima della scelta.
- **Processi senza SLOP** (decisione dell'owner del 2026-11-15): `exhausted`, `review_needed`, `failed` e `uncertain` sono
  eccezioni che richiedono l'attenzione dell'owner. Lo studio li mostra in cima a ogni passaggio («Da vedere»), con un contatore
  sulla scheda «Generazione SLOP», qualunque sia il batch, manuale o automatico: per ogni tentativo l'immagine candidata intera, il
  prompt usato e la valutazione, più brief ed errore del processo. Restano finché l'owner non sceglie «Chiudi: ho visto»
  (`POST processes/:id/close`, stato `closed`); la manutenzione non cancella le loro candidate. Sette giorni dopo la chiusura,
  o dopo un'accettazione, la manutenzione cancella le candidate e, per i chiusi, il processo. Cancellare la REAL dal cestino
  elimina subito processi, tentativi e file.
- **Accettare dopo la revisione** (decisione dell'owner del 2026-11-16): per un processo `review_needed`, «Accetta il tentativo N»
  (`POST processes/:id/accept {confirm, attempt}`) registra la candidata come SLOP `new` nel batch del processo, come
  un'accettazione automatica, con la valutazione segnata «Accettata dall'owner dopo la revisione»; poi una chiamata a pagamento
  analizza i tag dell'originale intero (la conferma dichiara quella chiamata). Solo un tentativo valutato, con la candidata intera
  ancora salvata e senza difetti critici; mai due volte, mai se la REAL ha già una SLOP attiva. Un ancoraggio mancante è un difetto
  critico ed è elencato come tale; i vincoli editoriali «non rispettati» senza difetti critici sono un dubbio del valutatore (un
  edificio forse diverso da quello reale, un monumento forse fuori posto), che decide l'owner: la conferma lo avverte di rileggere le
  incertezze (decisione dell'owner del 2026-11-16, dopo il secondo batch, in cui 2 SLOP su 10 erano bloccate così). Se
  l'analisi non riesce la SLOP resta accettata e l'analisi si ripete dal Database. La copia 4:5 la prepara il browser alla revisione
  del batch. Un tentativo la cui immagine è stata pagata ma non salvata (passo interrotto prima della quarantena) non ha nulla da
  accettare: si chiude.
- Un batch automatico in revisione si chiude con «Chiudi revisione» dopo aver deciso le immagini nuove; i suoi processi senza SLOP
  restano comunque tra quelli «Da vedere».
- Il batch automatico continua a girare con la dashboard aperta, al massimo uno alla volta. Se una REAL esaurisce i tentativi,
  le altre proseguono; il risultato dell'intero batch mostra accettate, esaurite, sospese e ancora da rivedere.

## 7. Studio e interfaccia amministrativa

Quattro passaggi: **REAL** (scelta da 1 a 10, con tag e descrizione già disponibili), **Brief e prompt** (prodotti insieme in una chiamata testuale e poi revisionabili),
**Generazione e valutazione dell'immagine intera** (avanzamento per foto e per tentativo, decisione, difetti e correzione del prompt),
**Revisione** (solo candidate accettate automaticamente, più eventuali casi sospesi visibili separatamente).
Mostrare il numero massimo di tentativi, la tolleranza, il preventivo massimo delle chiamate e il totale effettivo.

Tolleranza: 0 rigorosa (nessun difetto minore), 1 normale (imperfezioni sottili e fotograficamente plausibili), 2 permissiva (difetti minori che non compromettono credibilità). I difetti critici sono sempre bloccanti. Con 0 una candidata con soli difetti minori non si accetta e non ferma il ciclo: consuma un nuovo tentativo con lo stesso prompt o con quello rivisto (decisione dell'owner del 2026-11-15); se i tentativi finiscono il processo è esaurito e resta tra quelli «Da vedere». Il codice lo garantisce anche quando il valutatore risponde «accept» elencando difetti minori. Con 1 e 2 la distinzione dipende dal giudizio del valutatore.

In revisione: originale della SLOP **intero**, poi copia 4:5 preparata dopo l'accettazione (con/senza trattamento), prompt finale, ancoraggi, tag effettivi,
divergenze tematiche, dettagli della valutazione, Inquadratura, Analizza, Approva, Pubblica, Cestino. Nessun tasto per cestinare
la REAL dalla revisione della SLOP. La rigenerazione manuale non scavalca i controlli e richiede conferma di una nuova esecuzione.
Una SLOP `new` non è automaticamente una SLOP `published`.

**Compatibilità preesistente:** i vecchi batch e le immagini già generate restano visualizzabili; i batch in pausa sono
gestiti senza doppie chiamate. Non tentare di riprendere un vecchio batch con un formato di stato incompatibile: segnalarlo e
richiedere un'esplicita scelta operativa. Nessuna migrazione remota, deploy o conversione distruttiva senza autorizzazione owner.

## 8. Descrizione REAL, prompt testuale, modelli e controlli

- **Al caricamento:** la chiamata **multimodale già usata per taggare la REAL** restituisce anche la descrizione strutturata
  `visible`, `documented_context`, `uncertainties`. È neutra, contestuale, modificabile e non ha conoscenza delle
  immagini sintetiche. Le istruzioni della parte «Tag» e le regole di schema distinguono obbligatoriamente le osservazioni
  visive dalle informazioni Commons. Nessuna seconda chiamata per descrivere la stessa REAL.
- **Al momento della SLOP:** una richiesta **solo testuale** riceve la descrizione salvata e i tag e restituisce **insieme**
  `brief` e `prompt`. Il brief è distinto dal prompt **nei dati**, non nelle chiamate; non ricevere la REAL come immagine
  durante la generazione SLOP. Le istruzioni «Prompt per le SLOP» possono parlare esplicitamente di sintesi e valutazione;
  **non** vanno riutilizzate nella chiamata di catalogazione delle REAL.
- Il modello deve proporre vincoli essenziali **minimi**, senza imporre fedeltà ai dettagli visivi della REAL. Credibilità,
  varietà e pertinenza tematica sono prioritarie; prompt in inglese, descrizioni di tecnica e luce concrete, niente
  formulazioni «cinematic» o illuminazione artificiosa.
- Il valutatore può **cambiare la scena**, purché il brief immutabile sia rispettato; non imporre conservazione di persone,
  pose e posizione dei soggetti rispetto alla REAL.
- I modelli sono selezionabili dalle Impostazioni. Predefiniti proposti dalla #136: `gpt-6.1-sol` testo e
  `gpt-image-2.5-flare` `high`, salvo decisione diversa dell'owner. La capacità di visione è necessaria al modello
  di **analisi REAL** e al **valutatore SLOP**, non a quello che scrive brief e prompt.
- Il valutatore non certifica autenticità: non usare una percentuale di probabilità REAL come verità.
- I test usano solo modelli finti e verificano: **una** chiamata tag+descrizione REAL con immagine e contesto Commons,
  provenienza dei fatti distinta dalla visione, edit indipendente dei tag e della descrizione, salvataggio atomico della
  risposta, **una** chiamata testuale brief+prompt senza immagine, aggiornamento del brief, REAL senza descrizione preesistente,
  nessun backfill implicito, nessuna contaminazione del contesto REAL con istruzioni sulle SLOP, decisioni `accept`,
  `retry_same_prompt`, `revise_prompt`, `replan_scene`, `review_needed`, `exhausted`, tetto chiamate, gestione errori
  e ripresa, valutazione **dell'immagine SLOP integrale**, 4:5 solo dopo accettazione, nessuna candidata rifiutata nel gioco.

## 9. Fuori dallo scopo immediato e decisioni future

- La selezione delle REAL rimane qualitativa come da issue #138, senza nuovi filtri automatici nel wizard.
- La difficoltà effettiva di riconoscimento non è il numero dei tentativi; eventuali livelli si fondano sui dati reali delle partite.
- Nessun training del valutatore né benchmark esteso obbligatorio per ogni generatore.
- Le modalità di generazione completamente indipendenti dalle REAL e il cambio del modello valutatore sono scelte future separate.
- L'esposizione nel resoconto di fine partita delle motivazioni di generazione non è approvata: non introdurla senza decisione owner.

## 10. Sequenza delle PR di implementazione

1. **PR A — specifiche:** allineare `AGENTS.md`, `MASTER.md`, `generazione-slop`, `copie-di-gioco` e le specifiche collegate;
   senza modificare codice, database o produzione.
2. **Backend e persistenza (implementati 1.27.0, migrazione 0050):** **estendere l'analisi REAL per produrre tag+descrizione insieme** e salvare il campo
   editoriale; **unica chiamata testuale descrizione+tag → brief+prompt**; brief bloccato, processo/tentativi, chiamate
   registrate, valutatore e decisioni strutturate, limiti e compatibilità batch, fake API e test. Migrazione additiva,
   senza conversione delle REAL esistenti.
3. **Browser e studio (implementati 1.27.0):** nel wizard REAL mostrare e correggere la descrizione prodotta coi tag; nello studio usare
   descrizione+tag salvati, ciclo visibile, impostazioni dei tentativi/tolleranza, valutazione SLOP integrale e 4:5 dopo
   l'accettazione, avanzamento e revisione owner, test desktop/mobile.
4. **PR D — rilascio:** solo dopo CI, anteprima esaminata e autorizzazione esplicita dell'owner; valutare la migrazione dei batch in
   pausa e le impostazioni persistenti in produzione. Un merge su main avvia automaticamente il deploy.

Le PR B e C non vanno unite senza anteprima e approvazione. Questa specifica non autorizza da sola spese API o deploy.
