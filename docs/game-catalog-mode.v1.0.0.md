# Selettore del catalogo giocabile — v1.0.0

Aggiornato: 2026-11-08T08:08:38.708Z. Versione applicativa proposta: 0.21.0.

## Contratto

La schermata privata `/admin` presenta Demo (fixture sintetiche) e Produzione
(solo REAL e AI/SLOP già pubblicate). GET/POST `/api/admin/game-catalog-mode`
sono protette dall'autenticazione amministrativa esistente e dal controllo
same-origin per le scritture. La POST richiede `mode`, `revision` e
`confirm: true`: la revisione è vincolata con CAS e ogni cambio crea un evento
audit immutabile. Un doppio invio o una scheda obsoleta non sovrascrive lo stato.

D1 `game_catalog_control` contiene la modalità attiva, inizializzata a demo
dalla migrazione additiva 0028. `DATA_MODE=demo` resta il default di build e
non è una seconda fonte di verità per le partite dopo la migrazione. L'endpoint
pubblico `/api/health` espone il solo booleano demo: il frontend aggiorna
le spiegazioni, la home, i crediti e il gioco. Nessuna credenziale privata è
esposta.

L'attivazione di Produzione viene impedita se il binding R2 non esiste o se
manca almeno una immagine REAL oppure una SLOP approvata e pubblicata nel
catalogo reale. I conteggi sono una precondizione minima, non un'affermazione
di sufficienza per qualsiasi numero di round, filtro di categoria o valutazione
editoriale: il preflight per la partita resta separato e può ridurne i round.

`catalog()` e la selezione delle categorie leggono un'unica preferenza per
ogni richiesta di nuova partita. Ogni partita acquisisce le proprie immagini;
rilevare la sua modalità dalle immagini assegnate evita che un cambio successivo
modifichi il gameplay o la resa dei media. Le SVG demo sono servite sulla base
del campo immutabile `images.demo`, non della modalità globale corrente.
Il PvP resta temporaneamente disabilitato, ma i suoi dati storici rimangono
compatibili con questa regola.

## Rilascio e verifiche

La nuova migrazione 0028 va applicata e verificata con backup/recovery D1
prima del deploy del codice che legge `game_catalog_control`. Il comando
`deploy:demo` continua a proteggere i binding Cloudflare e a richiedere
approvazione esplicita per migrazioni nuove. Non modificare variabili e secret,
non cambiare namespace R2, non pubblicare immagini né abilitare cron.

Verifiche da eseguire: npm run build, npm run lint, npm test, suite di
integrazione editoriale e prova manuale desktop/mobile dell'admin e della home.
Controllare: autenticazione, origine della richiesta, inventario incompleto,
revisione obsoleta, idempotenza, cambio avanti/indietro, nuovi round e
continuità di una partita creata prima del cambio. Nessuna spesa AI.
