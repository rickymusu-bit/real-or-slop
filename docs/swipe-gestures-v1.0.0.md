---
version: 1.0.0
created_at: 2026-11-05T20:20:00+01:00
status: proposed-in-pull-request
---

# Gestures di risposta — Swipe v1.0.0

## Contratto utente

In Allenamento, A tempo e PvP il giocatore può scegliere la classe trascinando l'immagine:
- **Verso sinistra: REAL** (il pulsante a sinistra).
- **Verso destra: SLOP** (il pulsante a destra, valore server `AI`).

La stessa interazione supporta dito, mouse e penna tramite Pointer Events. I pulsanti REAL/SLOP e i tasti R/I rimangono sempre disponibili. Un semplice click/tap sull'immagine mantiene lo zoom accessibile via dialog. La pressione Invio/Spazio sull'immagine continua ad aprirlo.

## Protezioni

- Spostamento orizzontale minimo: clamp tra 55 e 120 pixel, circa il 23% della larghezza dell'immagine. Trascinamenti brevi non inviano risposte.
- Direzione verticale bloccata per tutta la gesture: nessuna risposta anche se il dito devia successivamente in orizzontale; `touch-action: pan-y` conserva lo scorrimento verticale.
- Anteprima REAL/SLOP solo mentre si trascina, senza mostrare indizi sull'origine. Una volta rilasciato si ripristina la posizione originaria. La soglia usa la larghezza iniziale; la decisione usa le coordinate del rilascio, anche dopo un ritorno verso il centro.
- Tutte le risposte passano per gli **stessi pulsanti esistenti**: invio server, timer, stato di caricamento, doppie risposte, validazione del round, disabilitazione dopo timeout e PvP rimangono di competenza del codice esistente.
- Lo swipe è inattivo finché i pulsanti non sono abilitati o quando il contenuto è oscurato. Una sequenza di trascinamento non deve aprire per errore lo zoom.
- Perdita della cattura, annullamento, secondo contatto, pagina nascosta e perdita del focus annullano la gesture. Cambio domanda, timeout e riconnessione rimuovono i listener globali e l'anteprima. Il click nativo finale di un trascinamento viene assorbito anche quando la gesture è disattivata prima del rilascio; tap successivi e attivazione da tastiera conservano lo zoom.
- Al rilascio si ricontrollano il countdown locale sincronizzato col server, lo stato del round e i pulsanti. La validazione definitiva rimane sul server.
- `swipeDecision` e le sequenze di eventi sono coperte da test unitari: direzioni, soglie, scroll, coordinate finali, cancellazione, multitouch, scadenza e risposte duplicate. `npm run test:gallery` usa Chromium con mouse nativo su desktop e touch emulato a 360/390 px, incluse entrambe le direzioni, scroll effettivo, tap e tastiera per zoom, gesture interrotte, scadenza e input ripetuti.

## Limiti di verifica

Il touch emulato non sostituisce una prova fisica su Android/iOS o con penna. Il PvP pubblico è già sospeso e resta tale: il codice frontend e il collegamento ai suoi pulsanti sono verificati con fixture, ma gesture e reconnect non sono verificabili end-to-end dalla pagina pubblica corrente. La PR resta draft in attesa dei controlli reali previsti prima del merge.

## Ambito

Il frontend modifica `src/play.ts`, `src/pvp.ts`, `src/style.css`, `scripts/check-gallery.mjs` e aggiunge il modulo versionato `src/swipe-v1.0.0.ts` con test associati. Nessuna modifica al protocollo degli endpoint, al database, ai dati editoriali, alle didascalie o alla gestione delle partite sul server. Nessuna pubblicazione automatica.
