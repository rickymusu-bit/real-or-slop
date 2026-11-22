# Statistiche e Impostazioni — specifica 4.9.0

Stato: implementata nel ramo 1.57.0, da rilasciare. Aggiornata: 2026-11-22T18:00:00Z.

## 1. Decisioni dell'owner (2026-11-12)

- «In impostazioni voglio solo "bottoni" e non "display"»: le Impostazioni contengono soltanto comandi.
- Statistiche di gioco e di spesa in una scheda separata, con l'avviso sullo sbilanciamento del catalogo; anche le partite in corso adesso.
- La qualità delle immagini sta accanto al selettore dei modelli.

## 2. Impostazioni (solo comandi)

I gestori dei comandi sono attivi prima delle richieste iniziali della dashboard. Salvare un modulo numerico (soglie dello studio SLOP,
partite) riscrive solo i campi di quel modulo con i valori salvati: un valore scritto e non ancora salvato in un altro modulo resta. La verifica del codice partita funziona anche mentre
si caricano contesti o modelli: mostra l’esito nella scheda corrente, senza ricaricare la pagina né inserire il codice nell’URL.

- **Modelli:** modello di testo, modello di immagini (con la data di dismissione dove nota) e qualità delle immagini tra quelle ammesse;
  se il modello scelto non ammette la qualità salvata, si torna a `high`. Il wizard SLOP la conserva nello snapshot del batch.
- **Contesto dei modelli:** i cinque testi (Base, Misura delle REAL, Idee SLOP delle REAL, Premessa e prompt di galleria, Valutazione delle SLOP) con le versioni, il
  ripristino e la proposta del codice; un avviso quando il testo in vigore dei prompt è stato scritto per le gemelle e blocca lo
  studio (specifica `libreria-immagini`, sezione 7).
- **Classifica:** verifica di un codice partita (soprannome, livello, punteggio, data), Nascondi, Mostra, Cancella (per sempre, per le
  richieste di cancellazione).
- **Generazione SLOP:** tentativi massimi (1–5, default 3), tolleranza (0–2, default 1). Il resto si sceglie nel wizard «Genera SLOP» della galleria (specifica `generazione-slop`). Nessuna proposta da attivare o spegnere; lo sbilanciamento è solo una notifica. La 0055 rimuove `slop_auto_enabled`, rifiutato dall’API. La 0056 elimina anche i vincoli e le chiavi legacy dei gruppi, conservando le impostazioni attive.
- **Partite:** durata massima di una partita aperta in ore (24, da 1 a 168): oltre, una partita non conclusa non trattiene più le copie
  ritirate e non conta tra le aperte.
- **Fonti Commons:** REAL controllate ogni notte su Wikimedia Commons (50, da 0 a 500; 0 sospende il controllo), richiesta
  dell'owner del 2026-11-20. Le regole del controllo sono nella specifica `libreria-immagini`, sezione 9.
- **Misure delle REAL** (decisioni dell'owner del 2026-11-21): soglie predefinite di affollamento (67, da 0 a 100) e di dettaglio
  (100, da 0 a 100; 100 non pone limiti), valide per le gallerie senza soglie proprie. Salvarle aggiorna anche il segnaposto del modulo
  della galleria. Regole e calcolo nella specifica `libreria-immagini`, sezione 10.
- Dati in `app_settings`; una riga mancante, o un valore fuori dai limiti, vale il predefinito del codice.

## 3. Statistiche (solo visualizzazione)

«Distribuzione delle immagini» mostra REAL e SLOP approvate e pubblicate nel totale (specifica `database-immagini`); la vista per tag
è stata tolta con i tag il 2026-11-20.

Periodo: ultimi 7 giorni, ultimi 30 (predefinito) o da sempre; «Aggiorna». API `GET /api/admin/library/stats?period=7|30|all`, gratuita.

- **Adesso:** partite in corso (una foto mostrata, una risposta o una preparazione negli ultimi 5 minuti), in totale e per livello;
  partite aperte entro la durata massima.
- **Partite del periodo**, per livello: iniziate, concluse, non concluse, scadute prima dell'inizio, punteggio medio delle concluse.
- **Risposte delle partite concluse:** foto giocate, REAL e SLOP riconosciute, accuratezza bilanciata, foto scadute; voci in classifica
  e nascoste.
- **Chiamate a pagamento:** per tipo («Analisi e misure delle REAL»: le analisi storiche fino al 2026-11-20 e le misure di
  affollamento e dettaglio dal 2026-11-21; proposte editoriali e prompt SLOP; immagini; valutazioni) numero, token in ingresso e in uscita, esiti incerti evidenziati;
  le ultime 200 chiamate del periodo con filtri per tipo ed esito. Nessun importo.
- **Equilibrio del catalogo:** REAL e SLOP pubblicate e approvate, quota di REAL tra le pubblicate con la fascia 40–60% e un avviso non
  bloccante fuori fascia, livelli giocabili e foto mancanti agli altri. Le copie nuove sono tutte 4:5.
- **Equilibrio:** conteggi indipendenti di REAL e SLOP approvate/pubblicate, SLOP nuove da decidere e REAL madri disponibili.
  Il campionamento automatico usa le REAL eleggibili della galleria. Ogni batch congela modelli, qualità, tentativi e tolleranza alla preparazione delle proposte.
  Nessuna statistica o misura aggregata per gruppi di genere/decennio, nessuna soglia di gruppo (decisione del 2026-11-17).

## 4. Limiti

- «Adesso» è una stima: una partita resta in corso fino a 5 minuti dopo l'ultima azione.
- Le statistiche si calcolano dai round presenti: eliminare una foto o la manutenzione dei 12 mesi possono far calare i totali.

## Ciclo editoriale SLOP

Impostazioni `max_generation_attempts` (1–5, default 3) ed `editorial_tolerance` (0 rigorosa, 1 normale, 2 permissiva; default 1). Snapshot prima delle chiamate. Default testo `gpt-6.1-sol`, immagini `gpt-image-2.5-flare` qualità `high`, in partenza. Al rilascio la 0061 elimina le impostazioni salvate e le statistiche pregresse. Statistiche includono evaluation, processi accettati/esauriti/sospesi e tentativi; la tabella dei formati sparisce perché le copie nuove sono tutte 4:5. Nessun punteggio di difficoltà derivato dai tentativi.

