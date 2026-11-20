# Partita a livelli e classifica — specifica 3.2.2

Stato: implementata nel ramo 1.51.0, da rilasciare. Aggiornata: 2026-11-20T18:00:00Z.

**Decisioni dell'owner del 2026-11-15, da implementare** (issue rickymusu-bit/real-or-slop#136). Fino al rilascio il resto di questa specifica
descrive il comportamento in produzione (app 1.26.0); chi implementa aggiorna le sezioni e toglie questo riquadro.

- **Foto:** tutte le copie di gioco sono 4:5 verticali, mostrate intere (specifica `copie-di-gioco` 9.0.0).
- **Lista di fine partita:** per le SLOP, accanto al prompt, l'elemento inventato («luogo: da Parigi a Marsiglia»). Proposta ancora
  da confermare dall'owner: non si implementa senza la sua conferma.

La migrazione 0061 azzera partite e classifica al rilascio delle gallerie. Le nuove partite possono usare tutte le REAL pubblicate,
comprese quelle estratte come riferimenti temporanei per un batch SLOP.

## 1. Decisioni dell'owner

- Una sola modalità: una foto alla volta con un tempo per foto; tolti allenamento senza tempo, coppia di foto e PvP (2026-11-11).
- Quattro livelli scritti nel codice, non nelle Impostazioni (2026-11-12).
- Punteggio = foto × (2 × accuratezza bilanciata − 1), così una sola classifica raccoglie livelli diversi (2026-11-12).
- Esito immediato di ogni risposta, verificato dal server; tempo scaduto = foto non riconosciuta; solo una partita arrivata all'ultima
  foto è conclusa e ha punteggio (2026-11-12).
- Lasciando la pagina la foto si oscura e il tempo continua (2026-11-12).
- Foto intera nel suo formato su ogni schermo, esplorabile; pulsanti REAL e SLOP sempre visibili; niente swipe (2026-11-13).
- Niente didascalie (2026-11-13). Alla fine, per ogni REAL la descrizione e le fonti, per ogni SLOP il prompt in inglese (2026-11-12 e
  2026-11-14).
- Nei risultati la descrizione delle REAL è il testo editoriale preparato per il gioco, con autore e link alla foto originale (2026-11-19).
- Classifica nella home con soprannome controllato e codice partita; nessuna precedenza alle foto non ancora viste: «contiamo sul gran
  numero di foto» (2026-11-12).

## 2. Livelli

| Livello | Foto | Secondi per foto | Punteggio massimo |
|---|---|---|---|
| Facile | 10 | 20 | 10 |
| Medio | 15 | 15 | 15 |
| Difficile | 20 | 10 | 20 |
| Esperto | 25 | 5 | 25 |

Ogni posizione del lotto è REAL o SLOP con una moneta; un livello è giocabile solo con almeno tante REAL e tante SLOP pubblicate quante
sono le sue foto, altrimenti resta disattivato con il motivo.

## 3. Partita

1. Il giocatore sceglie il livello (`/gioca`); il server estrae il lotto e registra per ogni round la copia di gioco da servire.
   REAL e SLOP sono indipendenti: nessuna esclusione tra una SLOP e la foto che l’ha ispirata (decisione del 2026-11-16).
2. Il browser scarica la prima foto; «Inizia» avvia la partita entro il tempo di preparazione.
3. Il server consegna **una foto alla volta**, mai una successiva. Il tempo parte quando il browser la mostra e lo segnala.
4. **Foto:** intera nel suo formato, esplorabile con dita, mouse, rotella o doppio tocco, «Foto intera» per tornare all'inizio
   (specifica `copie-di-gioco`, sezione 5). Nessun testo accompagna la foto. Marchio «RS» sovrapposto.
5. **Risposta:** pulsanti REAL e SLOP sempre visibili, tasti R e S sul computer. Il server risponde subito giusto o sbagliato con
   l'origine; il browser mostra l'esito per circa un secondo (segno, bordo, breve vibrazione dove esiste), poi la foto successiva.
6. **Tempo scaduto:** «Tempo scaduto» per un istante, foto non riconosciuta; una risposta arrivata entro mezzo secondo dalla scadenza vale
   ancora (ritardo di rete).
7. **Pagina lasciata:** la foto si oscura («Mostra la foto» per tornare), il tempo continua. Una partita ripresa dopo aver ricaricato
   continua dalla foto di turno.
8. **Fine:** punteggio, REAL e SLOP riconosciute, accuratezza bilanciata, foto scadute; modulo per la classifica; lista delle foto intere
   con la risposta data. Per le REAL, la **descrizione editoriale** unisce elementi visibili e contesto documentato. Seguono titolo,
   autore, licenza, link «Foto originale» e indicazione dell’adattamento al 4:5 e della ricompressione. Se manca la descrizione editoriale si
   mostrano i crediti disponibili. Il testo Commons resta nel catalogo. Per le SLOP si mostra il prompt.

Le risposte non arrivano mai al browser prima della risposta del giocatore. Le partite già iniziate continuano con le copie dei loro
round anche se nel frattempo una foto viene modificata o ritirata.

## 4. Punteggio

Accuratezza bilanciata (BA) = media tra quota di REAL riconosciute e quota di SLOP riconosciute (con una sola origine nel lotto,
l'accuratezza semplice). Punteggio = foto × (2 × BA − 1), con un decimale: zero per chi risponde a caso o sempre uguale, negativo sotto il
caso, pari alle foto del livello senza errori.

## 5. Classifica

- **Soprannome** da 3 a 20 caratteri (lettere, cifre, spazi, trattini, punti), facoltativo, chiesto alla fine di una partita conclusa.
  Rifiutate le parole indecorose in italiano e in inglese, anche mascherate (`m3rda`, `m.e.r.d.a`); le parole brevi o ambigue solo come
  parola intera. Casella obbligatoria «Ho almeno 14 anni, oppure un genitore mi ha dato il permesso», verificata anche dal server, e
  invito a non usare nome e cognome.
- **Codice partita** di 10 caratteri senza simboli ambigui, mostrato una volta come `XXXX-XXXX-XX`, da fotografare; il database conserva
  solo l'impronta SHA-256. Serve per la verifica nelle Impostazioni e per le richieste di cancellazione.
- **Home:** ultimi 7 giorni e di sempre, primi 10, con soprannome, livello e punteggio; per ogni giocatore (cookie anonimo) solo la voce
  migliore; una partita entra una sola volta. L'owner può nascondere, mostrare o cancellare una voce.
- Gli indirizzi `/allenamento`, `/tempo` e `/pvp` portano a `/gioca`.

## 6. Limiti

- Il cookie distingue i giocatori solo per browser: chi lo cancella o cambia dispositivo compare più volte.
- Il codice prova il possesso di una schermata, non l'identità.
- Con un catalogo piccolo chi gioca spesso riconosce le foto; la difesa scelta è il numero di foto pubblicate.
- Sul telefono le foto orizzontali sono piccole e alcuni indizi si vedono solo ingrandendo, per REAL e SLOP allo stesso modo.

