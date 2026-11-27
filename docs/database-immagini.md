# Foto e gallerie — specifica 11.1.0

Stato: implementata nel ramo 1.69.0, da rilasciare. Aggiornata: 2026-11-27T15:29:55Z.

Decisione dell’owner del 2026-11-25: tutta l’interfaccia amministrativa è in inglese, incluse gallerie, wizard REAL, pipeline SLOP, assi, parametri, conferme, errori, statistiche, impostazioni e schema della pipeline. I nuovi testi dei modelli sono in inglese; le scritte visibili nelle foto si trascrivono nella lingua originale. Titoli, descrizioni delle fonti, regole personalizzate e dati storici conservano la lingua salvata. Il sito pubblico resta in italiano.

## 1. Decisioni dell'owner

- Filtrare per origine; per ogni foto miniatura, visualizzazioni e classificazioni corrette; modificare o cancellare; per una SLOP modificare il prompt e rigenerarla, con le statistiche azzerate; una scheda con la distribuzione di REAL e
  SLOP, approvate e pubblicate impilate, con lo spread (2026-11-11).
- La modifica di una pubblicata la ritira subito; le partite in corso finiscono con la versione con cui sono iniziate; finita la
  modifica la foto resta approvata (2026-11-11).
- La sezione non carica file e non cerca su Commons; ordinamento per data di aggiunta, visualizzazioni o accuratezza; le schede mostrano
  solo miniatura, origine e stato (2026-11-13).
- Con le foto spuntate si possono cambiare stato o galleria da una barra che lascia visibile la griglia (2026-11-19).
- Inquadratura e trattamento si gestiscono dal dettaglio aperto toccando una foto (2026-11-19; l'analisi IA è stata tolta il 2026-11-20).
- **Niente tag** (2026-11-20): le foto di una galleria hanno in gran parte gli stessi tag, quindi i filtri per tag non servivano.
  Spariscono filtro, pillole, sezione del dettaglio, completamento, ripristino e distribuzione per tag (specifica `libreria-immagini`).
- **Crowding e detail rimossi** (2026-11-26): nessun punteggio, soglia, avviso o comando di misura. Le misure tecniche fotografiche restano disponibili al trattamento.

## 2. Finestra della galleria

Nella galleria aperta si cercano ID, titolo REAL, descrizione o prompt e si filtrano origine e stato. Filtri e ordinamento sono richiudibili.
La griglia 4:5 ha due colonne su mobile. «Carica altre foto» aggiunge le pagine successive nello stesso ordine. La barra di selezione occupa una riga separata sotto la griglia e rimane accessibile durante lo scorrimento.


- **Viste:** Tutte, Nuove, Approvate, Pubblicate, Cestino, con i conteggi; «Svuota cestino» elimina le foto nel cestino della galleria aperta.
- **Filtri:** origine (REAL e SLOP, REAL, SLOP). I parametri API `tag`, `tags`, `match` e `incomplete` sono rifiutati. Non esiste un filtro per gruppo (decisione del 2026-11-17); il parametro API `group` è rifiutato. Il filtro «Batch automatico in corso» arriva dal riquadro dei batch. Decisione dell’owner del 2026-11-17: rimossi dalla dashboard i tre checkbox «Copia da rifare in 4:5», «REAL senza descrizione» e «Senza Genere, Colore o Supporto», insieme al loro stato e ai parametri inviati dal browser.
- **Ordinamento:** data di aggiunta, visualizzazioni o accuratezza, decrescente o crescente, ricordato nel browser; per l'accuratezza le
  foto mai viste vanno in fondo.
- **Schede:** miniatura (copia di gioco), origine e stato, casella di selezione. Le REAL mostrano anche il numero di SLOP
  generate e salvate dalla 1.66.0 più gli usi storici verificati dalla 0079, comprese candidate poi scartate; gli edit non contano. Tocco breve: dettaglio. Pressione prolungata: anteprima
  grande (specifica `dashboard-admin-wizard-real`, sezione 3).
- **Descrizione visiva.** Una REAL senza descrizione ha un'icona sulla miniatura. «Descrivi le REAL» include tutte quelle fuori dal
  cestino ancora da descrivere nella galleria aperta, anche se un filtro o la paginazione le nascondono. Si legge la descrizione
  dal dettaglio della foto, dove si può generare se manca (specifica `libreria-immagini`, sezione 11).
- **Indici rimossi** (2026-11-26). Nessun comando «Index descriptions», conteggio di foto da indicizzare o ricerca semantica. Descrizioni e profili restano disponibili alla pipeline (specifica `libreria-immagini`, sezioni 12 e 13).
- **Seleziona tutte (N)** (decisione dell'owner del 2026-11-15): seleziona tutte le immagini già caricate nella vista con i filtri
  correnti; sparisce quando sono già tutte selezionate. «Deseleziona» nella barra le toglie.
- **Selezione multipla** (decisione dell’owner del 2026-11-19). La barra sotto la griglia offre «Approva», «Pubblica», «Nel cestino»
  e «Cambia galleria». Le proposte SLOP
  si scrivono e si chiedono solo nel wizard «Genera SLOP» (decisione del 2026-11-22). «Approva» agisce sulle nuove. «Togli dalla pubblicazione» compare quando la selezione include almeno una
  pubblicata e riporta solo le pubblicate allo stato approvato, dopo conferma. Pubblicare una nuova la approva prima. Si applicano i
  controlli di copia di gioco e diritti. Le partite in corso terminano con la copia già assegnata. «Cambia galleria» apre la scelta della destinazione.
  Nel Cestino si possono ripristinare, eliminare definitivamente o spostare in un’altra galleria le foto selezionate.

### Gallerie

Dalla finestra delle foto si aprono le pagine dedicate «Carica REAL» e «Genera SLOP». «Foto della galleria» riapre la finestra.

La sezione «Gallerie» mostra fino a tre foto recenti e il conteggio fuori dal cestino per galleria. «Nuova galleria» apre il modulo
per titolo e descrizione. «Modifica galleria» permette di rivedere questi stessi campi. Si possono spostare sia le REAL sia le SLOP
dal dettaglio o dalla selezione multipla, conservando lo stato e i dati delle foto. Una SLOP spostata resta documentata come generata dal
suo batch originario, ma esce dalla sua revisione operativa.

- **Elimina galleria** (decisione dell’owner del 2026-11-19). Il pulsante è nel modulo «Modifica galleria». La conferma nomina
  la galleria ed elenca foto REAL e SLOP, cestino e generazioni. L’eliminazione definitiva cancella queste righe insieme dal D1.
  Gli oggetti privati, le copie di gioco e le candidate sono registrati in una coda nella stessa operazione. Il Worker li elimina
  da R2 e la manutenzione ritenta quelli rimasti. Le altre gallerie restano accessibili.
- Se una foto appartiene a una partita in corso o la galleria ha una generazione in corso, l’operazione viene respinta e si può
  riprovare al termine. Il cestino si apre da «Filtri e ordinamento» nella finestra della galleria.

- **Fonti sparite da Commons** (2026-11-20, specifica `libreria-immagini`, sezione 9): la scheda della galleria nella sezione
  Gallerie conta le REAL il cui file non risulta più su Commons; nella griglia la foto porta l'etichetta «Fonte rimossa». È solo una
  segnalazione: stato e pubblicazione non cambiano.
- **REAL oltre soglia** (2026-11-21): nella griglia il simbolo ⚠ con il testo degli assi oltre soglia; avviso anche nell'anteprima a
  pressione prolungata. Stato, pubblicazione ed estrazioni non cambiano.

## 3. Dettaglio

- Origine, stato, dimensioni dell'originale, copia di gioco con formato e peso; visualizzazioni e classificazioni corrette con la
  percentuale; partite in corso che la includono; avvisi (licenza ND, copia mancante con «Prepara la copia di gioco»); misure della copia e, per una SLOP trattata, colore del trattamento (a colori, bianco e nero o seppia), misure anonime di riferimento e scarto dall'obiettivo.
- **Campi:** titolo, descrizione della fonte, fonte, autore e licenza solo per le REAL; prompt e modello solo per le SLOP, che non hanno descrizione (2026-11-20); nessun tag. Le SLOP sono identificate dall’ID abbreviato. Ogni modifica si salva subito. La migrazione 0058 rimuove i titoli SLOP e la copia dei tag di partenza dai metadati delle figlie, conservando i titoli REAL e i parametri tecnici del trattamento. Rimossa «Spiegazione dopo la risposta», inutilizzata dal gioco; l’API rifiuta il campo e i metadati dell’origine sbagliata. La migrazione 0057 elimina anche le colonne obsolete di didascalie e vista iniziale.
- **Azioni:** per nuove e approvate il dettaglio offre «Inquadratura» e i comandi del trattamento per le
  SLOP (specifica `copie-di-gioco`, sezione 4.3). Per le REAL il dettaglio mostra anche la descrizione visiva privata.
  Per le pubblicate, «Modifica foto» rende disponibili questi comandi nella stessa finestra dopo il ritiro confermato. Sono disponibili
  anche «Approva», «Pubblica nel gioco», «Togli dalla pubblicazione»,
  «Elimina (nel cestino)», «Ripristina» ed «Elimina definitivamente» secondo lo stato della foto.
- **Proposte SLOP (REAL):** rimosse dal dettaglio (decisione del 2026-11-25), perché obsolete. La generazione si gestisce dalla pipeline della galleria, con descrizioni, parametri, particolarità e scene. I dati e le API precedenti restano per compatibilità, senza riquadri di proposte sulle REAL.
- **Rigenerare una SLOP:** richiede un nuovo batch del wizard «Genera SLOP», con conferma ed esame dell’immagine intera.
- **Fonte su Commons (REAL):** sopra il corpo del dettaglio, l'ultima data in cui il controllo notturno ha trovato il file oppure,
  se manca, la data della prima mancanza con le azioni possibili (verificare, ritirare o cestinare, correggere la pagina della fonte).
- **Copie e misure:** «Inquadratura» mostra il riquadro 4:5 sulla foto adattata. Il riquadro si centra sull’asse in cui supera la foto
  per pareggiare le bande nere. Durante la preparazione
  della copia e il salvataggio di inquadratura o trattamento, l’avviso al centro blocca la finestra fino all’esito. Le
  misure mancanti delle copie si calcolano in background all’apertura della galleria.
- **Trattamento di una SLOP:** «Senza/Con trattamento» e «Regola il trattamento», con i cursori e l'anteprima nella pagina
  (specifica `copie-di-gioco`, sezione 4.4). Le pubblicate sono ritirate con conferma e restano approvate; le partite in corso mantengono i propri byte. Controllare il nuovo crop prima di ripubblicare.

## 4. Statistiche delle foto

Visualizzazioni: round in cui la foto è stata mostrata al giocatore, anche senza risposta o scaduti. Classificazioni corrette: risposte
giuste. Si contano solo i round giocati con la copia attuale; le partite oltre 12 mesi vengono cancellate dalla manutenzione, quindi
le statistiche coprono al massimo un anno.

## 5. Distribuzione nelle Statistiche

- **Insieme:** REAL e SLOP approvate o pubblicate con le percentuali, spread complessivo, quota di REAL tra le pubblicate con l'avviso
  della fascia 40–60%.
- **Barra complessiva:** SLOP a sinistra dello zero e REAL a destra; ogni barra impila pubblicate (piene) e approvate (tratteggiate),
  con lo spread a destra e il suggerimento al passaggio del puntatore o con la tastiera. La distribuzione per tag non esiste più
  (2026-11-20); l'API `distribution` restituisce soltanto `totals`.
- I colori di REAL e SLOP sono quelli del marchio; l'identità è detta anche da posizione, legenda, suggerimento e tabella.

## 6. API

`GET /api/admin/library?status=&origin=&q=&batch=&gallery=` (ogni immagine con `stats`, `in_play`, `generation`),
`GET /api/admin/library/distribution`, `GET /:id` e `GET /:id/{file,original}`, `PATCH /:id` con `revision`,
`POST /:id/{approve,publish,withdraw,trash,restore,regenerate,copy,measure,ideas}` («Modifica» usa `withdraw`), `GET /:id/measures`,
`PATCH /ideas/:id` (`idea`, `genre`, `changes`, `approve: true`), `DELETE /ideas/:id`, `POST /bulk` (incluse `set-approved`, `set-published` e `gallery`),
`GET /galleries`, `GET /galleries/:id`, `PATCH /galleries/:id` con titolo, descrizione e revisione, `POST /trash/empty?gallery=<id>`, `DELETE /:id`, `DELETE /galleries/:id` con `confirm: true` e `revision`. Con `gallery`, `offset`, `sort` e `order` la lista restituisce una pagina
di 72 foto e il prossimo offset (`next`, nullo all’ultima pagina). I conteggi sono per galleria quando richiesta. Le eliminazioni rispondono anche con `postponed`.


## 7. Lavorazioni della nuova pipeline

Migrazioni 0073 e 0074: `galleries.pipeline_settings`, `images.pipeline_profile`, `images.pipeline_scene`, `pipeline_jobs`.
Le lavorazioni temporanee collegano una REAL alla candidata solo durante la revisione. Ogni operazione è acquisita una volta;
la candidata entra in libreria solo all'accettazione dell'owner. I riferimenti di lavorazione vengono eliminati al termine;
profili e scene previsti non contengono un ID permanente della REAL di partenza. Trigger registrano i file da rimuovere nella
coda durevole. Le gallerie con operazioni accodate/in corso non possono essere eliminate.

Il passo 4 del wizard consente selezione singola o di tutte le SLOP con copia pronta e approvazione in gruppo, con conferma
del controllo delle copie, osservazione automatica e indicazione degli errori parziali. L’API bulk esistente ricontrolla ogni foto.
Le SLOP approvate dal passo 4 del wizard escono da quel passo e restano qui, pronte per la pubblicazione esplicita.
L'uscita dal wizard non cancella originali, copie o osservazioni. Le REAL già usate restano selezionabili; il contatore aiuta
l'owner a distribuire l'uso. Approvare una SLOP avvia automaticamente l’osservazione dell’originale mancante: al massimo una
chiamata per foto, già autorizzata dall’approvazione. La barra di selezione indica il massimo; il dettaglio mostra lo stato.
Non ci sono pulsanti «Observe SLOP» o conferme separate. Progresso bloccante e ripresa dopo reload seguono solo la coda già
registrata sul server. Approvazione singola, in gruppo e pubblicazione in gruppo di foto nuove condividono il flusso.
Cache e claim durevole impediscono chiamate duplicate e retry incerti (migrazione 0080, specifica `generazione-slop` 19.0.0).
Gli adeguamenti necessari al pregresso sono eseguiti dall’agente tramite API, senza comandi temporanei nell’admin.

Migrazione 0079: i contatori includono gli usi precedenti verificabili da generazione e successiva valutazione concluse prima
della 0078. Edit contati una volta, baseline numerica anonima e nessuna genealogia REAL–SLOP. Gli usi senza prove restano esclusi.
