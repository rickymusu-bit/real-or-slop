# Sezione Database della dashboard — specifica 1.0.0

Stato: **proposta**, realizzata nell'app 1.10.0 (migrazione 0041), da approvare dall'owner con la PR. Creata: 2026-11-11T09:30:00Z.
Estende `docs/libreria-immagini.v1.8.0.md` (sezioni 2, 6 e 9) e `docs/dashboard-admin-wizard-real.v1.3.0.md` (sezione «Navigazione»);
riprende lo spread di `docs/wizard-slop.v1.4.1.md` (sezioni 2 e 3).

## 1. Richiesta dell'owner (2026-11-11)

«Voglio poter filtrare il database per uno o più tags, per foto real, slop o entrambe. Per ogni foto, voglio vedere una miniatura,
la lista completa di tags, le volte che è stata visualizzata e le volte che è stata accuratamente classificata. Poi posso modificare
i tag e la didascalia di una foto, oppure cancellarla. Nel caso di una slop, posso anche modificare il prompt e rigenerarla (le
statistiche si resettano in questo caso). Se modifico una foto pubblicata, la modifica avrà effetto solo dopo che ogni partita in
cui la foto è inclusa sarà terminata. Una foto appena inizia la modifica viene tolta dalla pubblicazione (così non viene inclusa in
nessuna nuova partita) e terminata la modifica va nello stato di approvata. Poi in un'altra scheda voglio vedere i grafici sulla
distribuzione delle foto tra le due categorie e per ogni tag (come è stato fatto per lo studio slop). Qui però voglio vedere la
separazione tra approvate e pubblicate (va bene fare due barre impilate nella visualizzazione condivisa). E anche vedere lo spread.»

## 2. Contraddizioni con le regole vigenti e scelte

1. **Modifica e approvazione.** `docs/libreria-immagini.v1.8.0.md` e il codice fino all'app 1.9.0 riportavano a `nuova` ogni
   immagine approvata modificata («l'approvazione copre ciò che vede il giocatore»). La richiesta dice che, terminata la modifica,
   la foto è approvata: **una modifica a un'immagine approvata la lascia approvata**. Le modifiche si salvano subito e l'owner
   le fa sapendo che cosa vedrà il giocatore; una foto approvata deve conservare almeno un tag. Le immagini `nuove` restano nuove
   finché non vengono approvate.
2. **Inizio e fine della modifica.** Non esiste uno stato «in modifica»: «Modifica» su una foto pubblicata la **ritira subito**
   dalla pubblicazione (stato `approvata`); da lì ogni salvataggio la lascia approvata, quindi la modifica è «terminata» a ogni
   salvataggio. La ripubblicazione resta un passo separato, come vuole la decisione 7 di `docs/wizard-slop.v1.4.1.md`.
3. **«La modifica avrà effetto solo dopo che ogni partita… sarà terminata».** Le partite già avviate conservano la versione con cui
   sono iniziate (sezione 4): didascalia e copia di gioco. Le partite nuove non includono più la foto finché non viene
   ripubblicata; quando lo è, mostrano la versione modificata.
4. **Rigenerazione e analisi.** Una SLOP rigenerata è un'immagine nuova: i suoi tag finali devono venire dall'analisi, come
   stabilisce la decisione 6 di `docs/wizard-slop.v1.4.1.md`. Quindi la rigenerazione rimette l'immagine in stato `nuova`, senza
   copia di gioco, e **consente una nuova analisi** (la regola «una generazione per immagine» vale per il file). Una sola conferma
   copre generazione e analisi, come nella pagina 4 dello studio SLOP; le chiamate restano registrate una per una. L'immagine
   torna approvata quando l'owner la approva, dopo aver visto copia, tag e didascalia nuovi.
5. **Cancellare.** «Elimina» sposta nel cestino, come in tutta la libreria (sezione 2 della specifica 1.8.0); per una pubblicata
   prima la ritira, con conferma. L'eliminazione definitiva di un'immagine ancora usata da una partita in corso **aspetta** che
   la partita finisca: cancellerebbe i round di quella partita.

## 3. Scheda «Immagini»

- **Filtri:** stato (tutte, nuove, approvate, pubblicate, cestino), origine (REAL e SLOP, REAL, SLOP), ricerca nel titolo e **uno o
  più tag**, combinati con «con tutti i tag» (predefinito) o «con almeno un tag». I tag scritti nel filtro si convertono come
  quelli scritti a mano (`DBB Paris` → `dbb-paris`) e compaiono come pillole rimovibili. Restano caricamento, Commons, selezione
  multipla e cestino della libreria.
- **Scheda di ogni foto:** miniatura (copia di gioco), origine e stato, titolo, **tutti i tag** come pillole colorate per categoria,
  **visualizzazioni** e **classificazioni corrette** con la percentuale, e il numero di partite in corso che la includono.
- **Statistiche.** Visualizzazioni: round del gioco singolo presentati al giocatore (anche senza risposta, anche scaduti) più le
  risposte della sfida PvP (una per giocatore, compreso il tempo scaduto). Classificazioni corrette: risposte giuste nei due modi.
  Si contano **solo i round giocati con la copia di gioco attuale**: rigenerare una SLOP le azzera senza cancellare nulla.
- **Dettaglio:** statistiche, avviso delle partite in corso; per una pubblicata i campi sono in sola lettura con «Modifica»,
  «Ritira dal gioco» ed «Elimina (nel cestino)». Per una SLOP modificabile: prompt modificabile, menù della qualità del modello di
  immagini scelto nelle Impostazioni (ultima scelta, all'inizio `medium`) e «Rigenera l'immagine (a pagamento)».
- **Rigenerazione:** conferma esplicita senza importi; il generatore riceve solo il testo del prompt, nello stesso orientamento
  dell'immagine sostituita; poi il browser prepara la copia di gioco e parte l'analisi. I file precedenti escono dalla quarantena;
  la vecchia copia resta nel bucket del gioco finché le partite in corso la usano. Rifiuti (4xx) senza addebito, esiti incerti
  registrati e mai ripetuti, come nello studio SLOP.

## 4. Partite in corso

- Ogni round del gioco singolo registra didascalia e copia di gioco che serve (`game_rounds.caption`, `game_rounds.copy_key`); ogni
  sfida PvP registra le sue immagini e copie (`challenge_images`), oltre a conservarle nello stato della stanza come già faceva.
  Il gioco serve didascalia e file del round, non quelli attuali dell'immagine.
- **Partita in corso:** gioco singolo in preparazione o attivo, sfida PvP attiva, avviati da meno di **24 ore**. Il limite serve
  perché un allenamento lasciato aperto non scade mai e terrebbe per sempre un file ritirato; oltre le 24 ore quella partita può
  trovare l'immagine non più disponibile.
- **Ritiro:** la foto esce subito dalla pubblicazione. Se nessuna partita in corso usa la copia, la copia lascia subito il bucket del
  gioco; altrimenti entra in `retired_copies` e viene cancellata quando l'ultima di quelle partite è finita (controllo a ogni
  elenco della libreria e a ogni eliminazione definitiva). Ripubblicare la stessa copia la toglie da `retired_copies`.

## 5. Scheda «Distribuzione»

- **Insieme:** numero di REAL e di SLOP approvate o pubblicate con le percentuali, spread complessivo, quota di REAL tra le
  pubblicate (con l'avviso non bloccante del rapporto 40–60% della sezione 6 della specifica 1.8.0) e una barra condivisa.
- **Per tag:** una riga per tag, con la barra delle SLOP a sinistra dello zero e quella delle REAL a destra; ogni barra impila le
  **pubblicate** (piene) e le **approvate** (tratteggiate, stesso colore), con uno spazio di 2 px tra le parti. Colori: quelli del
  sito per REAL e SLOP; la categoria del tag è un punto colorato accanto al nome. Lo **spread** (REAL − SLOP, approvate e pubblicate
  insieme, come nello studio SLOP) è scritto in una colonna a destra.
- Filtri per categoria, ordinamento per spread, numero di immagini o nome, ricerca, vista compatta dei primi *n* tag o completa,
  suggerimento al passaggio del puntatore o con la tastiera (tag, categoria, i quattro conteggi, spread) e **vista a tabella**.
- I colori di REAL e SLOP superano i controlli di distinguibilità per daltonismo e di contrasto, ma sono più chiari della fascia
  consigliata dal validatore della palette: sono i colori del marchio del sito e restano; l'identità è comunque detta da posizione
  (sinistra/destra), legenda, suggerimento e tabella, e lo stato dalla trama.

## 6. Dati e API

- Migrazione additiva `0041_database_section.v1.0.0.sql`: colonne `caption` e `copy_key` in `game_rounds` e `copy_key` in
  `challenge_answers` (riempite dalle immagini attuali per le righe esistenti), tabelle `challenge_images` e `retired_copies`, indici.
- `GET /api/admin/library?tags=a,b&match=all|any` (resta `tag=` per un solo tag): ogni immagine porta `stats {views, correct}` e
  `in_play`. `GET /api/admin/library/distribution`. `POST /api/admin/library/:id/regenerate {confirm, prompt, quality, revision}`.
  `POST /trash/empty`, l'azione in blocco `delete` e `DELETE /:id` rispondono anche con `postponed`.
- Codice: `worker/in-play.v1.0.0.ts`, `worker/library.v1.10.0.ts`, `worker/slop-generation.v1.1.0.ts` (chiamata al generatore
  condivisa), `worker/game.ts`, `worker/room.ts`, `src/library.v1.10.0.ts`, `src/database-chart.v1.0.0.ts`, `src/database.v1.0.0.css`.

## 7. Verifiche

Test d'integrazione `tests/database.v1.0.0.integration.py` e `tests/library.v1.2.0.integration.py` (filtri, statistiche dal gioco
singolo e dal PvP, modifica durante una partita con didascalia e file conservati, eliminazione rinviata, rigenerazione con
statistiche azzerate, distribuzione) e nel browser, desktop e mobile, `tests/database_browser.v1.0.0.integration.py` e
`tests/library_browser.v1.9.0.integration.py`. Solo modelli finti.

## 8. Rischi

- Il limite di 24 ore è una stima: un allenamento ripreso dopo un giorno può trovare un'immagine ritirata (il gioco la segnala
  come non disponibile, come già accade per un file mancante).
- Le statistiche partono dai round registrati: le partite precedenti alla migrazione 0041 contano sulla copia che l'immagine aveva
  al momento della migrazione.
- Il PvP resta sospeso nell'interfaccia del sito; il suo codice registra comunque immagini e copie.
