# Statistiche e Impostazioni — specifica 2.1.0

Stato: approvata dall'owner il 2026-11-14, implementata nell'app 1.25.0 (in revisione). Aggiornata: 2026-11-14T16:00:00Z. La 2.1.0 sostituisce la soglia
del tema con quella del gruppo e aggiunge i gruppi all'equilibrio del catalogo (specifica `generazione-slop`). La 2.0.0 era la
versione consolidata (riordino della documentazione dell'owner del 2026-11-14): riunisce
senza strati `statistiche-impostazioni.v1.0.1` e le aggiunte successive (soglie dei batch automatici, formati, cancellazione delle voci
di classifica), che restano nella cronologia git.

## 1. Decisioni dell'owner (2026-11-12)

- «In impostazioni voglio solo "bottoni" e non "display"»: le Impostazioni contengono soltanto comandi.
- Statistiche di gioco e di spesa in una scheda separata, con l'avviso sullo sbilanciamento del catalogo; anche le partite in corso adesso.
- La qualità delle immagini sta accanto al selettore dei modelli.

## 2. Impostazioni (solo comandi)

- **Modelli:** modello di testo, modello di immagini (con la data di dismissione dove nota) e qualità delle immagini tra quelle ammesse;
  se il modello scelto non ammette la qualità salvata, si torna a `medium`. Lo studio SLOP e la rigenerazione del Database la usano.
- **Contesto dei modelli:** i tre testi con le versioni, il ripristino e la proposta del codice (specifica `libreria-immagini`,
  sezione 7).
- **Vocabolario dei tag:** elenco per categoria con il numero di immagini, cambio di categoria con conferma, alias, «Unisci».
- **Classifica:** verifica di un codice partita (soprannome, livello, punteggio, data), Nascondi, Mostra, Cancella (per sempre, per le
  richieste di cancellazione).
- **Studio SLOP:** REAL per aprire lo studio (predefinito 50, da 1 a 1000), REAL di un gruppo per generare (5, da 1 a 200; sostituisce la soglia del tema, 2026-11-14), proposte
  automatiche attive o spente, soglia di proposta in percentuale di spread (33%, da 1 a 100).
- **Partite:** durata massima di una partita aperta in ore (24, da 1 a 168): oltre, una partita non conclusa non trattiene più le copie
  ritirate e non conta tra le aperte.
- Dati in `app_settings`; una riga mancante vale il predefinito del codice.

## 3. Statistiche (solo visualizzazione)

Periodo: ultimi 7 giorni, ultimi 30 (predefinito) o da sempre; «Aggiorna». API `GET /api/admin/library/stats?period=7|30|all`, gratuita.

- **Adesso:** partite in corso (una foto mostrata, una risposta o una preparazione negli ultimi 5 minuti), in totale e per livello;
  partite aperte entro la durata massima.
- **Partite del periodo**, per livello: iniziate, concluse, non concluse, scadute prima dell'inizio, punteggio medio delle concluse.
- **Risposte delle partite concluse:** foto giocate, REAL e SLOP riconosciute, accuratezza bilanciata, foto scadute; voci in classifica
  e nascoste.
- **Chiamate a pagamento:** per tipo (analisi, prompt SLOP, immagini) numero, token in ingresso e in uscita, esiti incerti evidenziati;
  le ultime 200 chiamate del periodo con filtri per tipo ed esito. Nessun importo.
- **Equilibrio del catalogo:** REAL e SLOP pubblicate e approvate, quota di REAL tra le pubblicate con la fascia 40–60% e un avviso non
  bloccante fuori fascia, livelli giocabili e foto mancanti agli altri, formati delle copie pubblicate di REAL e SLOP.
- **Gruppi** (genere e decennio): REAL, SLOP, nuove, spread, REAL mancanti alla soglia; per i gruppi con SLOP pubblicate, le medie
  delle misure delle copie (lato lungo, rumore, nitidezza, contrasto, saturazione) di REAL e SLOP affiancate, con un avviso non
  bloccante quando divergono di oltre il 25%.

## 4. Limiti

- «Adesso» è una stima: una partita resta in corso fino a 5 minuti dopo l'ultima azione.
- Le statistiche si calcolano dai round presenti: eliminare una foto o la manutenzione dei 12 mesi possono far calare i totali.
