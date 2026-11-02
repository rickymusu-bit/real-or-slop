# Tempi di gioco e protezione delle immagini

- Versione: 1.0.0
- Aggiornato: 2026-11-02T15:25:07+01:00
- Stato: implementato; migrazione e rilascio remoto da approvare separatamente

Questa specifica sostituisce le regole sul countdown complessivo della modalità
A tempo contenute nella specifica v1.1.0 e nelle istruzioni sul precaricamento
v1.0.0. I documenti storici restano disponibili. La pipeline editoriale, la
pubblicazione bilanciata e il campionamento Bernoulli non cambiano.

## Allenamento

Il server misura sempre il tempo tra presentazione e risposta di ogni immagine.
Il riepilogo mostra il tempo complessivo di osservazione, compreso il tempo
trascorso fuori dalla pagina durante una domanda; caricamenti iniziali e lettura
dei feedback non si sommano al tempo di risposta. Non esiste un limite di risposta.
Il tempo è soltanto una misura descrittiva: non modifica i punti e non è uno
spareggio. Il punteggio rimane 100 per ogni risposta corretta.

## A tempo

Il giocatore sceglie da 1 a 50 immagini e 10, 20 o 30 secondi **per immagine**
(default 10 immagini e 20 secondi). Il catalogo può ridurre il numero effettivo
secondo le regole di deduplicazione e capacità già esistenti.

Le nuove sessioni hanno `timing_mode=per-image`, protocollo media 2 e nessuna
scadenza complessiva in `game_sessions.expires_at`. Ogni round conserva
`presented_at` e `expires_at`: `/start` avvia il primo, `/ready` i successivi,
dopo download e decodifica. La coppia di timestamp viene impostata una sola
volta tramite SQL condizionale; retry, richieste parallele, ricaricamenti e
cambi scheda non la spostano. Il tempo dichiarato dal client non viene usato.
`expiresAt` nell'API di stato indica la scadenza del **round corrente**.
Il client usa un clock monotono per visualizzarla e risincronizza lo stato con
il server al ritorno nella pagina; il Worker decide se una
risposta è in tempo, anche con JavaScript sospeso o connessione interrotta.

Il manifest e l'endpoint media rendono disponibile soltanto l'immagine corrente.
Non viene più scaricato l'intero lotto prima del primo countdown. Si riutilizzano
decodifica, controllo dei file e limiti di memoria del preloader; Allenamento
mantiene la propria finestra fino a tre immagini.

Alla prima richiesta successiva a una scadenza, il server marca il round
`timed_out=1` in un batch atomico, soltanto se non esiste una risposta. Non inventa
una risposta REAL o AI: la tabella `answers` e la vista delle risposte valide
rimangono prive di risposte fittizie. Un timeout vale zero punti, compare nel
riepilogo e permette di proseguire. La soluzione del round scaduto appare nei
crediti finali. Se era l'ultima immagine, la partita termina. Negli altri casi
il browser propone “Prossima immagine”: non avvia in background altri countdown
mentre l'utente è assente. Dopo una risposta accettata il countdown di quel round
termina; il feedback non consuma il tempo del successivo.

Il tempo è misurato alla presentazione dichiarata dal browser dopo decodifica,
non da una prova hardware che il giocatore abbia guardato l'immagine. Un client
modificato può ispezionare l'immagine corrente prima di dichiararsi pronto:
non sono offerte garanzie per competizioni con premi o di alto valore.

## Scheda nascosta e salvataggio

Durante il gioco `visibilitychange` verso `hidden`, perdita del focus della
finestra e `pagehide` coprono l'immagine con una superficie opaca e chiudono
l'eventuale ingrandimento. Le immagini ingrandite e normali condividono la
stessa protezione CSS. Tornare alla scheda non scopre automaticamente l'immagine:
serve “Mostra immagine”, possibile soltanto con pagina visibile e tempo residuo.
La copertura è locale, non cambia il punteggio, non segnala un utente come
scorretto e **non sospende né proroga mai il timer**. Se il tempo scade,
il vecchio round non può essere riaperto. Gli eventi di navigazione non sono
inviati o archiviati sul server. Gli ascoltatori sono rimossi uscendo dal gioco.

Sulle sole immagini di gioco sono limitati menu contestuale, trascinamento,
selezione e callout touch, anche nell'ingrandimento. Scroll e zoom restano
utilizzabili. Non vengono bloccati i menu su link, crediti o amministrazione.
Questi accorgimenti ostacolano il salvataggio diretto; non bloccano screenshot,
DevTools, copie da un browser modificato o fotografie dello schermo. Il supporto
al callout varia tra browser mobili. Nessun contenuto scaricato diventa impossibile
da copiare. La licenza CC BY 4.0 scelta per le nuove SLOP resta una licenza di
riutilizzo, distinta da questi accorgimenti durante il gioco.

## PvP sospeso

Navigazione e homepage offrono soltanto Allenamento e A tempo. Il vecchio URL
`/pvp` spiega la sospensione e indirizza ad A tempo. Tutte le API pubbliche
`/api/rooms` rispondono 503, incluse creazione, join, media e WebSocket.
Il codice del Durable Object, il binding ROOMS, le sue migrazioni e i dati
storici vengono conservati per una successiva ripresa; i test dell'attore
rimangono attivi. Nessun namespace o dato PvP viene eliminato.

## Migrazione e rilascio

`0009_per_image_timing.sql` aggiunge campi senza ricostruire tabelle o riscrivere
risposte. Le sessioni precedenti ricevono `timing_mode=legacy`: mantengono
assegnazioni, eventuale countdown complessivo, protocolli 1/2 e cronologia.
Le nuove sessioni Allenamento sono `unlimited`; quelle A tempo sono `per-image`.
Il frontend mostra il tempo complessivo soltanto riprendendo una partita storica.

Verifica locale: `npm run lint`, `npm test`, `npm run build`,
`npm run test:integration`, `ROS_TEST_PROFILE= npm run test:integration`,
`npm run test:gallery` (Chromium già installato). Non occorrono API a pagamento.

Per il futuro rilascio: fare backup D1, verificare la cronologia delle migrazioni,
applicare soltanto la 0009 al database previsto, poi rilasciare Worker e frontend
insieme e verificare le due modalità. La migrazione remota richiede autorizzazione
esplicita; questa modifica non la esegue. I budget editoriali e i cron restano
invariati e non vengono avviate generazioni. Un rollback del codice conserva
lo schema aggiunto; non cancellare le nuove sessioni né la cronologia. Un vecchio
Worker non interpreta le scadenze per immagine: preferire una correzione in
avanti, oppure un rollback che conservi questa compatibilità. Non ripristinare
il vecchio codice lasciando giocabili sessioni `per-image` senza tali controlli.
