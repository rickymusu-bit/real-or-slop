# Sezione Database — specifica 2.0.0

Stato: vigente. Aggiornata: 2026-11-14T12:00:00Z. Versione consolidata (riordino della documentazione dell'owner del 2026-11-14): riunisce
senza strati `database-immagini.v1.0.1` e le modifiche delle app 1.17–1.24 (cestino, schede, ordinamento, anteprima, tag di partenza),
che restano nella cronologia git. Stati e regole della libreria: `docs/libreria-immagini.v2.0.0.md`.

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
  convertono come quelli scritti a mano e compaiono come pillole rimovibili. Il filtro «Batch automatico in corso» arriva dal riquadro
  dei batch.
- **Ordinamento:** data di aggiunta, visualizzazioni o accuratezza, decrescente o crescente, ricordato nel browser; per l'accuratezza le
  foto mai viste vanno in fondo.
- **Schede:** miniatura (copia di gioco), origine e stato, casella di selezione. Tocco breve: dettaglio. Pressione prolungata: anteprima
  grande (`docs/dashboard-admin-wizard-real.v2.0.0.md`, sezione 3).
- **Selezione multipla:** sposta nel cestino (con conferma se ci sono pubblicate), analizza con IA, approva (con la conferma dei diritti
  delle REAL), pubblica, ritira, aggiungi o togli un tag; nel cestino ripristina o elimina definitivamente.

## 3. Dettaglio

- Origine, stato, dimensioni dell'originale, copia di gioco con formato e peso; visualizzazioni e classificazioni corrette con la
  percentuale; partite in corso che la includono; avvisi (licenza ND, copia mancante con «Prepara la copia di gioco»).
- **Campi:** titolo, descrizione, spiegazione, fonte, autore, licenza e, per le SLOP, prompt e modello; tag per categoria con aggiunta e
  rimozione; «Tag di partenza» per le SLOP generate; avviso se una REAL non ha il tag di Tempo. Ogni modifica si salva subito.
- **Azioni:** Inquadratura (nuove e approvate), Analizza con IA (nuove con copia, mai analizzate o non riuscite), Ripristina i tag
  generati, Approva, Pubblica nel gioco, Modifica e Ritira dal gioco (pubblicate), Elimina (nel cestino), Ripristina ed Elimina
  definitivamente (cestino).
- **Rigenerare una SLOP** (nuova o approvata): dal prompt del campo, con modello e qualità delle Impostazioni, nel formato della copia
  attuale; una conferma copre generazione e analisi. L'immagine torna nuova senza copia, il browser prepara la copia, parte una nuova
  analisi; le statistiche ripartono da zero. I file precedenti escono dalla quarantena; la vecchia copia resta nel bucket del gioco finché
  le partite in corso la usano.

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
