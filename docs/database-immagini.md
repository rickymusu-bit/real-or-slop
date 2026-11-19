# Foto e gallerie — specifica 8.2.0

Stato: implementata nel ramo 1.45.0, da rilasciare. Aggiornata: 2026-11-19T19:19:49Z.

## 1. Decisioni dell'owner

- Filtrare per uno o più tag e per origine; per ogni foto miniatura, tag, visualizzazioni e classificazioni corrette; modificare i tag o
  cancellare; per una SLOP modificare il prompt e rigenerarla, con le statistiche azzerate; una scheda con la distribuzione di REAL e
  SLOP, approvate e pubblicate impilate, con lo spread (2026-11-11).
- La modifica di una pubblicata la ritira subito; le partite in corso finiscono con la versione con cui sono iniziate; finita la
  modifica la foto resta approvata (2026-11-11).
- La sezione non carica file e non cerca su Commons; ordinamento per data di aggiunta, visualizzazioni o accuratezza; le schede mostrano
  solo miniatura, origine e stato (2026-11-13).

## 2. Finestra della galleria

Nella galleria aperta si cercano ID, titolo REAL, descrizione o prompt e si filtrano origine, stato e tag. Filtri e ordinamento sono richiudibili.
La griglia 4:5 ha due colonne su mobile. «Carica altre foto» aggiunge le pagine successive nello stesso ordine. La barra di selezione
resta disponibile durante lo scorrimento.


- **Viste:** Tutte, Nuove, Approvate, Pubblicate, Cestino, con i conteggi; «Svuota cestino» elimina le foto nel cestino della galleria aperta.
- **Filtri:** origine (REAL e SLOP, REAL, SLOP) e uno o più tag combinati con «con tutti i tag» o «con almeno un tag»; i tag scritti si
  convertono come quelli scritti a mano e compaiono come pillole rimovibili. Non esiste un filtro per gruppo (decisione del 2026-11-17); il parametro API `group` è rifiutato. Il filtro «Batch automatico in corso» arriva dal riquadro dei batch. Decisione dell’owner del 2026-11-17: rimossi dalla dashboard i tre checkbox «Copia da rifare in 4:5», «REAL senza descrizione» e «Senza Genere, Colore o Supporto», insieme al loro stato e ai parametri inviati dal browser.
- **Ordinamento:** data di aggiunta, visualizzazioni o accuratezza, decrescente o crescente, ricordato nel browser; per l'accuratezza le
  foto mai viste vanno in fondo.
- **Schede:** miniatura (copia di gioco), origine e stato, casella di selezione. Tocco breve: dettaglio. Pressione prolungata: anteprima
  grande (specifica `dashboard-admin-wizard-real`, sezione 3).
- **Conflitti di categoria** (app 1.25.1): dopo un'analisi o un completamento, dal dettaglio, in gruppo o dopo una rigenerazione, il
  messaggio elenca i tag che il modello ha proposto in una categoria diversa da quella del vocabolario («mugshot» proposto come Genere,
  nel vocabolario è Altro). Prevale il vocabolario, quindi l'immagine può restare senza quella categoria: l'owner sposta il tag dal
  vocabolario. Il 2026-11-14 il completamento della foto segnaletica di King era rimasto senza Genere per questo motivo.
- **Seleziona tutte (N)** (decisione dell'owner del 2026-11-15): seleziona tutte le immagini già caricate nella vista con i filtri
  correnti; sparisce quando sono già tutte selezionate. «Deseleziona» nella barra le toglie.
- **Selezione multipla:** sposta nel cestino (con conferma se ci sono pubblicate), analizza con IA, completa Genere, Colore e Supporto
  (a pagamento, con conferma del numero di chiamate; solo le immagini che ne hanno diritto, specifica `libreria-immagini`, sezione 5),
  approva (con la conferma dei diritti
  delle REAL), pubblica, ritira, aggiungi o togli un tag; nel cestino ripristina o elimina definitivamente.

### Gallerie

Dalla finestra delle foto si aprono le pagine dedicate «Carica REAL» e «Genera SLOP». «Foto della galleria» riapre la finestra.

La sezione «Gallerie» mostra fino a tre foto recenti e il conteggio fuori dal cestino per galleria. «Nuova galleria» apre il modulo
per titolo, descrizione e Indicazioni SLOP. Dalla finestra della galleria, «Modifica galleria» permette anche di chiedere una proposta
al modello dopo aver confermato una chiamata. L’owner può rivedere e salvare il testo proposto. Dal dettaglio e dalla selezione multipla si possono spostare le REAL in
un’altra galleria, anche quando sono pubblicate o nel cestino. Le immagini conservano il proprio stato. Il dettaglio delle SLOP
mostra la galleria ereditata dal batch.

- **Elimina galleria** (decisione dell’owner del 2026-11-19). Il pulsante è nel modulo «Modifica galleria». La conferma nomina
  la galleria ed elenca foto REAL e SLOP, cestino e generazioni. L’eliminazione definitiva cancella queste righe insieme dal D1.
  Gli oggetti privati, le copie di gioco e le candidate sono registrati in una coda nella stessa operazione. Il Worker li elimina
  da R2 e la manutenzione ritenta quelli rimasti. Le altre gallerie restano accessibili.
- Se una foto appartiene a una partita in corso o la galleria ha una generazione in corso, l’operazione viene respinta e si può
  riprovare al termine. Il cestino si apre da «Filtri e ordinamento» nella finestra della galleria.

## 3. Dettaglio

- Origine, stato, dimensioni dell'originale, copia di gioco con formato e peso; visualizzazioni e classificazioni corrette con la
  percentuale; partite in corso che la includono; avvisi (licenza ND, copia mancante con «Prepara la copia di gioco», categorie mancanti); misure della copia e, per una SLOP trattata, misure anonime di riferimento e scarto dall'obiettivo.
- **Campi:** descrizione per entrambe le origini; titolo solo per le REAL; fonte, autore e licenza solo per le REAL; prompt e modello solo per le SLOP; tag per categoria con aggiunta e
  rimozione; nessun riquadro «Tag di partenza» sulle SLOP, identificate dall’ID abbreviato e con i soli tag effettivi dell’immagine; avviso se una REAL non ha il tag di Tempo. Ogni modifica si salva subito. La migrazione 0058 rimuove i titoli SLOP e la copia dei tag di partenza dai metadati delle figlie, conservando i titoli REAL e i parametri tecnici del trattamento. Rimossa «Spiegazione dopo la risposta», inutilizzata dal gioco; l’API rifiuta il campo e i metadati dell’origine sbagliata. La migrazione 0057 elimina anche le colonne obsolete di didascalie e vista iniziale.
- **Azioni:** Inquadratura (nuove e approvate), comandi del trattamento per le SLOP (specifica `copie-di-gioco`, sezione 4.3),
  Completa Genere, Colore e Supporto, Analizza con IA (nuove con copia, mai analizzate o non riuscite), Ripristina i tag
  generati, Approva, Pubblica nel gioco, Modifica e Ritira dal gioco (pubblicate), Elimina (nel cestino), Ripristina ed Elimina
  definitivamente (cestino).
- **Rigenerare una SLOP:** richiede un nuovo processo nello studio con conferma ed esame dell’immagine intera.
- **Descrizione REAL privata:** elementi visibili, contesto documentato e incertezze, modificabili indipendentemente dai tag, anche per una pubblicata. Per una REAL storica senza descrizione, compilazione manuale o analisi combinata tag+descrizione con conferma separata.
- **Analisi combinata:** azione in gruppo «Analisi combinata tag e descrizione» (decisione
  dell'owner del 2026-11-15): per le REAL selezionate fuori dal cestino e senza descrizione privata, una chiamata a pagamento per foto
  sull'originale intero, dopo una conferma che dichiara il massimo; sostituisce i tag, non ritira le pubblicate. Le immagini con un'analisi interrotta o con
  esito incerto sono incluse: la conferma dice quante sono e che potrebbero essere già state addebitate. Restano escluse solo quelle
  con un'analisi in corso da meno di dieci minuti. Se nessuna selezionata è senza descrizione privata, il messaggio lo dice (il
  testo di Commons non conta).
- **Vecchie copie:** azione in gruppo «Rifai la copia di gioco» (nella pagina, una foto alla volta,
  gratis, per qualunque selezione: la pagina deve restare aperta), anche per rifare con il browser le copie preparate dal Worker
  con la 1.32–1.33. Le copie senza misure della versione corrente si misurano in background aprendo la galleria.
- **Trattamento di una SLOP:** «Senza/Con trattamento» e «Regola il trattamento», con i cursori e l'anteprima nella pagina
  (specifica `copie-di-gioco`, sezione 4.4). Le pubblicate sono ritirate con conferma e restano approvate; le partite in corso mantengono i propri byte. Controllare il nuovo crop prima di ripubblicare.

## 4. Statistiche delle foto

Visualizzazioni: round in cui la foto è stata mostrata al giocatore, anche senza risposta o scaduti. Classificazioni corrette: risposte
giuste. Si contano solo i round giocati con la copia attuale; le partite oltre 12 mesi vengono cancellate dalla manutenzione, quindi
le statistiche coprono al massimo un anno.

## 5. Distribuzione nelle Statistiche

- **Insieme:** REAL e SLOP approvate o pubblicate con le percentuali, spread complessivo, quota di REAL tra le pubblicate con l'avviso
  della fascia 40–60%.
- **Per tag:** una riga per tag, SLOP a sinistra dello zero e REAL a destra; ogni barra impila pubblicate (piene) e approvate
  (tratteggiate); categoria come punto colorato accanto al nome; spread in una colonna a destra. Filtri per categoria, ordinamento per
  spread, numero o nome, ricerca, vista compatta o completa, suggerimento al passaggio del puntatore o con la tastiera, vista a tabella.
- I colori di REAL e SLOP sono quelli del marchio; l'identità è detta anche da posizione, legenda, suggerimento e tabella.

## 6. API

`GET /api/admin/library?status=&origin=&tags=a,b&match=all|any&batch=` (ogni immagine con `stats`, `in_play`, `generation`),
`GET /api/admin/library/distribution`, `GET /:id` e `GET /:id/{file,original}`, `PATCH /:id` con `revision`,
`POST /:id/{approve,publish,withdraw,trash,restore,analyze,regenerate,copy}` («Modifica» usa `withdraw`), `POST /bulk`,
`GET /galleries/:id`, `POST /trash/empty?gallery=<id>`, `DELETE /:id`, `DELETE /galleries/:id` con `confirm: true` e `revision`. Con `gallery`, `offset`, `sort` e `order` la lista restituisce una pagina
di 72 foto e il prossimo offset (`next`, nullo all’ultima pagina). I conteggi sono per galleria quando richiesta. Le eliminazioni rispondono anche con `postponed`.

