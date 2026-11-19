# Foto e gallerie — specifica 8.6.0

Stato: implementata nel ramo 1.46.0, da rilasciare. Aggiornata: 2026-11-19T23:44:53Z.

## 1. Decisioni dell'owner

- Filtrare per uno o più tag e per origine; per ogni foto miniatura, tag, visualizzazioni e classificazioni corrette; modificare i tag o
  cancellare; per una SLOP modificare il prompt e rigenerarla, con le statistiche azzerate; una scheda con la distribuzione di REAL e
  SLOP, approvate e pubblicate impilate, con lo spread (2026-11-11).
- La modifica di una pubblicata la ritira subito; le partite in corso finiscono con la versione con cui sono iniziate; finita la
  modifica la foto resta approvata (2026-11-11).
- La sezione non carica file e non cerca su Commons; ordinamento per data di aggiunta, visualizzazioni o accuratezza; le schede mostrano
  solo miniatura, origine e stato (2026-11-13).
- Con le foto spuntate si possono cambiare stato o galleria da una barra che lascia visibile la griglia (2026-11-19).
- Tag, inquadratura, trattamento e analisi IA si gestiscono dal dettaglio aperto toccando una foto (2026-11-19).

## 2. Finestra della galleria

Nella galleria aperta si cercano ID, titolo REAL, descrizione o prompt e si filtrano origine, stato e tag. Filtri e ordinamento sono richiudibili.
La griglia 4:5 ha due colonne su mobile. «Carica altre foto» aggiunge le pagine successive nello stesso ordine. La barra di selezione occupa una riga separata sotto la griglia e rimane accessibile durante lo scorrimento.


- **Viste:** Tutte, Nuove, Approvate, Pubblicate, Cestino, con i conteggi; «Svuota cestino» elimina le foto nel cestino della galleria aperta.
- **Filtri:** origine (REAL e SLOP, REAL, SLOP) e uno o più tag combinati con «con tutti i tag» o «con almeno un tag»; i tag scritti si
  convertono come quelli scritti a mano e compaiono come pillole rimovibili. Non esiste un filtro per gruppo (decisione del 2026-11-17); il parametro API `group` è rifiutato. Il filtro «Batch automatico in corso» arriva dal riquadro dei batch. Decisione dell’owner del 2026-11-17: rimossi dalla dashboard i tre checkbox «Copia da rifare in 4:5», «REAL senza descrizione» e «Senza Genere, Colore o Supporto», insieme al loro stato e ai parametri inviati dal browser.
- **Ordinamento:** data di aggiunta, visualizzazioni o accuratezza, decrescente o crescente, ricordato nel browser; per l'accuratezza le
  foto mai viste vanno in fondo.
- **Schede:** miniatura (copia di gioco), origine e stato, casella di selezione. Tocco breve: dettaglio. Pressione prolungata: anteprima
  grande (specifica `dashboard-admin-wizard-real`, sezione 3).
- **Conflitti di categoria** (app 1.25.1): dopo un'analisi o un completamento, dal dettaglio o dopo una rigenerazione, il
  messaggio elenca i tag che il modello ha proposto in una categoria diversa da quella del vocabolario («mugshot» proposto come Genere,
  nel vocabolario è Altro). Prevale il vocabolario, quindi l'immagine può restare senza quella categoria: l'owner sposta il tag dal
  vocabolario. Il 2026-11-14 il completamento della foto segnaletica di King era rimasto senza Genere per questo motivo.
- **Seleziona tutte (N)** (decisione dell'owner del 2026-11-15): seleziona tutte le immagini già caricate nella vista con i filtri
  correnti; sparisce quando sono già tutte selezionate. «Deseleziona» nella barra le toglie.
- **Selezione multipla** (decisione dell’owner del 2026-11-19). La barra sotto la griglia offre «Approva», «Pubblica», «Nel cestino»
  e «Cambia galleria». «Approva» agisce sulle nuove. «Togli dalla pubblicazione» compare quando la selezione include almeno una
  pubblicata e riporta solo le pubblicate allo stato approvato, dopo conferma. Pubblicare una nuova la approva prima. Si applicano i
  controlli di copia di gioco, tag e diritti. Le partite in corso terminano con la copia già assegnata. «Cambia galleria» apre la scelta della destinazione.
  Nel Cestino si possono ripristinare, eliminare definitivamente o spostare in un’altra galleria le foto selezionate.

### Gallerie

Dalla finestra delle foto si aprono le pagine dedicate «Carica REAL» e «Genera SLOP». «Foto della galleria» riapre la finestra.

La sezione «Gallerie» mostra fino a tre foto recenti e il conteggio fuori dal cestino per galleria. «Nuova galleria» apre il modulo
per titolo, descrizione e Indicazioni SLOP. Dalla finestra della galleria, «Modifica galleria» permette anche di chiedere una proposta
al modello dopo aver confermato una chiamata. L’owner può rivedere e salvare il testo proposto. Si possono spostare sia le REAL sia le SLOP
dal dettaglio o dalla selezione multipla, conservando lo stato e i dati delle foto. Una SLOP spostata resta documentata come generata dal
suo batch originario, ma esce dalla sua revisione operativa.

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
- **Azioni:** per nuove e approvate il dettaglio offre «Aggiungi tag», rimozione dei tag, «Inquadratura» e i comandi del trattamento per le
  SLOP (specifica `copie-di-gioco`, sezione 4.3). Con una copia pronta e l’IA disponibile offre anche analisi o nuova analisi confermata.
  Per le pubblicate, «Modifica foto» rende disponibili questi comandi nella stessa finestra dopo il ritiro confermato. Sono disponibili
  anche «Completa Genere, Colore e Supporto», «Ripristina i tag generati», «Approva», «Pubblica nel gioco», «Togli dalla pubblicazione»,
  «Elimina (nel cestino)», «Ripristina» ed «Elimina definitivamente» secondo lo stato della foto.
- **Rigenerare una SLOP:** richiede un nuovo processo nello studio con conferma ed esame dell’immagine intera.
- **Descrizione editoriale REAL:** elementi visibili e contesto documentato compaiono nei risultati. Le incertezze restano nel catalogo.
  Questi campi si modificano indipendentemente dai tag, anche per una pubblicata. Per una REAL senza descrizione si possono compilare
  i campi a mano oppure avviare l’analisi combinata con conferma separata.
- **Analisi combinata:** dal dettaglio di una REAL senza descrizione editoriale e fuori dal cestino, con conferma di una chiamata a
  pagamento sull’originale intero. Sostituisce i tag. Se l’analisi precedente è interrotta o incerta, la conferma segnala il possibile
  addebito già avvenuto. La foto pubblicata resta nel gioco.
- **Copie e misure:** «Inquadratura» prepara la copia con il ritaglio o l’adattamento alla larghezza scelto. Durante la preparazione
  della copia, il salvataggio di inquadratura o trattamento e l’analisi, l’avviso al centro blocca la finestra fino all’esito. Le
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
- **Per tag:** una riga per tag, SLOP a sinistra dello zero e REAL a destra; ogni barra impila pubblicate (piene) e approvate
  (tratteggiate); categoria come punto colorato accanto al nome; spread in una colonna a destra. Filtri per categoria, ordinamento per
  spread, numero o nome, ricerca, vista compatta o completa, suggerimento al passaggio del puntatore o con la tastiera, vista a tabella.
- I colori di REAL e SLOP sono quelli del marchio; l'identità è detta anche da posizione, legenda, suggerimento e tabella.

## 6. API

`GET /api/admin/library?status=&origin=&tags=a,b&match=all|any&batch=` (ogni immagine con `stats`, `in_play`, `generation`),
`GET /api/admin/library/distribution`, `GET /:id` e `GET /:id/{file,original}`, `PATCH /:id` con `revision`,
`POST /:id/{approve,publish,withdraw,trash,restore,analyze,regenerate,copy}` («Modifica» usa `withdraw`), `POST /bulk` (incluse `set-approved`, `set-published` e `gallery`),
`GET /galleries/:id`, `POST /trash/empty?gallery=<id>`, `DELETE /:id`, `DELETE /galleries/:id` con `confirm: true` e `revision`. Con `gallery`, `offset`, `sort` e `order` la lista restituisce una pagina
di 72 foto e il prossimo offset (`next`, nullo all’ultima pagina). I conteggi sono per galleria quando richiesta. Le eliminazioni rispondono anche con `postponed`.

