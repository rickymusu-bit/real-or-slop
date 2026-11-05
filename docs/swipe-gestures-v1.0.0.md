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
- Movimento prevalentemente verticale: nessuna risposta; `touch-action: pan-y` conserva lo scorrimento verticale.
- Anteprima REAL/SLOP solo mentre si trascina, senza mostrare indizi sull'origine. Una volta rilasciato si ripristina la posizione originaria.
- Tutte le risposte passano per gli **stessi pulsanti esistenti**: invio server, timer, stato di caricamento, doppie risposte, validazione del round, disabilitazione dopo timeout e PvP rimangono di competenza del codice esistente.
- Lo swipe è inattivo finché i pulsanti non sono abilitati o quando il contenuto è oscurato. Una sequenza di trascinamento non deve aprire per errore lo zoom.
- La funzione `swipeDecision` è indipendente dal DOM e coperta da test unitari; i controlli visuali verificano le due direzioni anche su viewport mobile con input mouse simulato.

## Ambito

Il frontend modifica `src/play.ts`, `src/pvp.ts`, `src/style.css`, `scripts/check-gallery.mjs` e aggiunge il modulo versionato `src/swipe-v1.0.0.ts` con test associati. Nessuna modifica al protocollo degli endpoint, al database, ai dati editoriali, alle didascalie o alla gestione delle partite sul server. Nessuna pubblicazione automatica.
