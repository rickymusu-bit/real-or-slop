# Sezione Database — specifica 2.6.0

Stato: vigente; la 2.5.0 è in produzione con l'app 1.28.0, la 2.6.0 è per l'app 1.29.0. Aggiornata: 2026-11-15T17:58:54Z. La 2.6.0 aggiunge il filtro
«REAL senza descrizione» e l'azione in gruppo «Analisi combinata tag e descrizione». La 2.3.0: i tag di partenza di una SLOP
sono quelli della REAL di cui è la gemella, con «Apri la REAL di origine»; il filtro per categoria della Distribuzione torna a
comprendere Tempo e Genere, persi con la 1.25.0. La 2.2.0 mostra i conflitti di categoria dopo analisi e completamento (app 1.25.1). La 2.1.1 chiama «REAL di riferimento» la foto delle misure del trattamento. La 2.1.0 aggiunge il filtro
per gruppo, il completamento di Genere, Colore e Supporto, le misure della copia e i comandi del trattamento delle SLOP (specifiche
`libreria-immagini` 3.0.0, `copie-di-gioco` 7.0.0, `generazione-slop` 2.0.0). La 2.0.0 era la versione consolidata (riordino della documentazione dell'owner del 2026-11-14): riunisce
senza strati `database-immagini.v1.0.1` e le modifiche delle app 1.17–1.24 (cestino, schede, ordinamento, anteprima, tag di partenza),
che restano nella cronologia git. Stati e regole della libreria: specifica `libreria-immagini`.

**Stato del ramo 1.27.0:** implementata la pipeline della specifica `generazione-slop` 5.3.0; produzione ancora 1.26.0 fino al rilascio autorizzato.

## 1. Decisioni dell'owner

- Filtrare per uno o più tag e per origine; per ogni foto miniatura, tag, visualizzazioni e classificazioni corrette; modificare i tag o
  cancellare; per una SLOP modificare il prompt e rigenerarla, con le statistiche azzerate; una scheda con la distribuzione di REAL e
  SLOP, approvate e pubblicate impilate, con lo spread (2026-11-11).
- La modifica di una pubblicata la ritira subito; le partite in corso finiscono con la versione con cui sono iniziate; finita la
  modifica la foto resta approvata (2026-11-11).
- La sezione non carica file e non cerca su Commons; ordinamento per data di aggiunta, visualizzazioni o accuratezza; le schede mostrano
  solo miniatura, origine e stato (2026-11-13).

## 2. Scheda «Immagini»

- **Viste:** Tutte, Nuove, Approvate, Pubblicate, Cestino, con i conteggi; «Svuota cestino» nella vista Cestino.
- **Filtri:** origine (REAL e SLOP, REAL, SLOP) e uno o più tag combinati con «con tutti i tag» o «con almeno un tag»; i tag scritti si
  convertono come quelli scritti a mano e compaiono come pillole rimovibili; **gruppo** (genere e decennio) e «senza Genere, Colore o
  Supporto». Il filtro «Batch automatico in corso» arriva dal riquadro dei batch.
- **Ordinamento:** data di aggiunta, visualizzazioni o accuratezza, decrescente o crescente, ricordato nel browser; per l'accuratezza le
  foto mai viste vanno in fondo.
- **Schede:** miniatura (copia di gioco), origine e stato, casella di selezione. Tocco breve: dettaglio. Pressione prolungata: anteprima
  grande (specifica `dashboard-admin-wizard-real`, sezione 3).
- **Conflitti di categoria** (app 1.25.1): dopo un'analisi o un completamento, dal dettaglio, in gruppo o dopo una rigenerazione, il
  messaggio elenca i tag che il modello ha proposto in una categoria diversa da quella del vocabolario («mugshot» proposto come Genere,
  nel vocabolario è Altro). Prevale il vocabolario, quindi l'immagine può restare senza quella categoria: l'owner sposta il tag dal
  vocabolario. Il 2026-11-14 il completamento della foto segnaletica di King era rimasto senza Genere per questo motivo.
- **Selezione multipla:** sposta nel cestino (con conferma se ci sono pubblicate), analizza con IA, completa Genere, Colore e Supporto
  (a pagamento, con conferma del numero di chiamate; solo le immagini che ne hanno diritto, specifica `libreria-immagini`, sezione 5),
  approva (con la conferma dei diritti
  delle REAL), pubblica, ritira, aggiungi o togli un tag; nel cestino ripristina o elimina definitivamente.

## 3. Dettaglio

- Origine, stato, dimensioni dell'originale, copia di gioco con formato e peso; visualizzazioni e classificazioni corrette con la
  percentuale; partite in corso che la includono; avvisi (licenza ND, copia mancante con «Prepara la copia di gioco», immagine fuori
  dai gruppi); gruppo; misure della copia e, per una SLOP trattata, REAL di riferimento e scarto dall'obiettivo.
- **Campi:** titolo, descrizione, spiegazione, fonte, autore, licenza e, per le SLOP, prompt e modello; tag per categoria con aggiunta e
  rimozione; «Tag di partenza» per le SLOP generate (i tag della REAL di origine, con «Apri la REAL di origine»); avviso se una REAL non ha il tag di Tempo. Ogni modifica si salva subito.
- **Azioni:** Inquadratura (nuove e approvate), comandi del trattamento per le SLOP (specifica `copie-di-gioco`, sezione 4.3),
  Completa Genere, Colore e Supporto, Analizza con IA (nuove con copia, mai analizzate o non riuscite), Ripristina i tag
  generati, Approva, Pubblica nel gioco, Modifica e Ritira dal gioco (pubblicate), Elimina (nel cestino), Ripristina ed Elimina
  definitivamente (cestino).
- **Rigenerare una SLOP:** richiede un nuovo processo nello studio con conferma, brief ed esame dell’immagine intera. Prima cestinare la SLOP attiva della REAL; nessuna sostituzione diretta che scavalchi la valutazione.
- **Descrizione REAL privata:** elementi visibili, contesto documentato e incertezze, modificabili indipendentemente dai tag, anche per una pubblicata. Per una REAL storica senza descrizione, compilazione manuale o analisi combinata tag+descrizione con conferma separata.
- **REAL senza descrizione:** filtro «REAL senza descrizione» e azione in gruppo «Analisi combinata tag e descrizione» (decisione
  dell'owner del 2026-11-15): per le REAL selezionate fuori dal cestino e senza descrizione privata, una chiamata a pagamento per foto
  sull'originale intero, dopo una conferma che dichiara il massimo; sostituisce i tag, non ritira le pubblicate. Le immagini con
  esito incerto restano escluse e si ripetono dalla scheda.
- **Vecchie copie:** filtro «Copia da rifare in 4:5», azione in gruppo «Rifai la copia in 4:5». Le pubblicate sono ritirate con conferma e restano approvate; le partite in corso mantengono i propri byte. Controllare il nuovo crop prima di ripubblicare.

## 4. Statistiche delle foto

Visualizzazioni: round in cui la foto è stata mostrata al giocatore, anche senza risposta o scaduti. Classificazioni corrette: risposte
giuste. Si contano solo i round giocati con la copia attuale; le partite oltre 12 mesi vengono cancellate dalla manutenzione, quindi
le statistiche coprono al massimo un anno.

## 5. Scheda «Distribuzione»

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
`POST /trash/empty`, `DELETE /:id`. Le eliminazioni rispondono anche con `postponed`.
