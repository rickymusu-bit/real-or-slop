# Partita a livelli e classifica — specifica 1.0.1

Stato: decisioni dell'owner del 2026-11-11 e del 2026-11-12 (sezione 1); testo approvato dall'owner il 2026-11-12, vigente. Realizzata
nell'app 1.12.0 con la migrazione 0043. Creata: 2026-11-12T09:00:00Z. Sostituisce le modalità Allenamento e A tempo e il PvP. Usa le
copie 4:5 di `docs/copie-di-gioco.v3.0.1.md` e la conservazione di didascalia e copia nei round di `docs/database-immagini.v1.0.1.md`.
Aggiornata: 2026-11-12T18:00:00Z (solo lo stato; precedente: `docs/gioco-a-livelli.v1.0.0.md`).

## 1. Decisioni dell'owner

- Una sola modalità di gioco, «per ora»: una foto alla volta con X secondi per foto. Tolti la coppia di foto, l'allenamento senza
  tempo e il PvP («Una modalità pvp sarebbe bello, però non saprei come implementarla»).
- Quattro livelli, che cambiano tempo per foto e numero di foto, **scritti nel codice e non nelle Impostazioni** («Tendenzialmente
  non si dovrebbero modificare i parametri delle difficoltà»).
- Punteggio = foto × (2 × accuratezza bilanciata − 1), così una sola classifica raccoglie livelli diversi.
- Se il tempo di una foto scade si passa da soli alla successiva, o ai risultati se era l'ultima. Una partita non arrivata
  all'ultima foto non è conclusa e non dà punteggio.
- Esito immediato di ogni risposta, verificato dal server: il ritardo di rete è accettabile perché il tempo si ferma alla risposta.
- Lasciando la pagina foto e didascalia si oscurano, il tempo continua; se scade vale il punteggio fatto fin lì.
- Swipe su telefono (destra REAL, sinistra SLOP) senza pulsanti visibili; su computer pulsanti sotto la foto e tasti R e S.
- Alla fine la lista scorrevole delle foto: fonti per le REAL, prompt originale in inglese per le SLOP.
- Classifica nella home, con il livello; soprannome chiesto alla fine con il controllo sulle parole indecorose; un codice partita
  da fotografare come prova. Nessuna precedenza alle foto non ancora viste: «contiamo sul gran numero di foto».
- Proposte accettate: esito visibile per circa un secondo, poi la foto successiva; in classifica il miglior punteggio di ogni
  giocatore; classifiche degli ultimi 7 giorni e di sempre, primi 10.

## 2. Livelli

| Livello | Foto | Secondi per foto | Punteggio massimo |
|---|---|---|---|
| Facile | 10 | 20 | 10 |
| Medio | 15 | 15 | 15 |
| Difficile | 20 | 10 | 20 |
| Esperto | 25 | 5 | 25 |

Definiti in `shared/levels.v1.0.0.ts`. Ogni posizione del lotto è REAL o SLOP con una moneta (campionatore esistente), quindi un
livello è giocabile solo con almeno tante REAL e tante SLOP pubblicate quante sono le sue foto; altrimenti resta disattivato con il
motivo.

## 3. Partita

1. Il giocatore sceglie il livello; il server estrae il lotto e registra per ogni round didascalia e copia.
2. Il browser scarica solo la prima foto; «Inizia» avvia la partita.
3. Il server consegna **una foto alla volta**: quella di turno, mai una successiva. Il tempo della foto parte quando il browser la
   mostra e lo segnala; finché la foto non è mostrata non si può rispondere.
4. La risposta va al server, che risponde subito giusto o sbagliato e l'origine. Il browser mostra l'esito sulla foto per circa
   un secondo (✓ o ✗, bordo verde o rosso, una breve vibrazione dove esiste), poi scarica e mostra la foto successiva.
5. Tempo scaduto: «Tempo scaduto» per un istante e si passa alla successiva; la foto conta come non riconosciuta. Una risposta
   partita in tempo ma arrivata entro **mezzo secondo** dopo la scadenza vale ancora (ritardo di rete).
6. Fine: punteggio, REAL e SLOP riconosciute, accuratezza bilanciata, foto scadute; modulo per la classifica; lista delle foto con
   la risposta data, la didascalia, per le REAL titolo, autore, licenza e fonte, per le SLOP il prompt in inglese.

Le risposte non arrivano mai al browser prima della risposta del giocatore: se il browser potesse verificare da solo l'esito,
potrebbe anche conoscerlo in anticipo. Una partita ripresa dopo aver ricaricato la pagina continua dalla foto di turno.

## 4. Punteggio

Accuratezza bilanciata (BA) = media tra la quota di REAL riconosciute e la quota di SLOP riconosciute; con una sola origine nel lotto
(raro) è l'accuratezza semplice. Punteggio = foto × (2 × BA − 1), con un decimale: zero per chi risponde a caso o sempre allo stesso
modo, negativo sotto il caso, pari alle foto del livello senza errori.

## 5. Classifica

- **Soprannome** da 3 a 20 caratteri (lettere, cifre, spazi, trattini, punti), chiesto alla fine di una partita conclusa, facoltativo.
  Rifiutate le parole indecorose in italiano e in inglese, anche scritte con cifre o separatori (`m3rda`, `m.e.r.d.a`); le parole
  brevi o ambigue solo come parola intera, per non bloccare «Annalisa» o «Nazionale». Nessun filtro è completo: l'owner può
  nascondere una voce.
- **Codice partita** di 10 caratteri senza simboli ambigui, mostrato una volta come `XXXX-XXXX-XX`, da fotografare. Il database
  conserva solo l'impronta SHA-256. Nelle Impostazioni → «Classifica» l'owner incolla un codice e vede soprannome, livello,
  punteggio e data della partita; può nascondere o mostrare ogni voce.
- **Pubblica**, nella home: ultimi 7 giorni e di sempre, primi 10, con soprannome, livello e punteggio; per ogni giocatore (cookie
  anonimo del gioco) solo la voce migliore. Una partita entra una sola volta; solo le partite concluse.

## 6. Dati e codice

- Migrazione `0043_levels_leaderboard.v1.0.0.sql`: ricostruisce `game_sessions` (modalità `levels`, colonna `level`, secondi da 1 a
  120, senza giocatore) e `media_events` (senza la colonna del PvP), conservando round e risposte; elimina le tabelle del PvP e
  `players`; crea `leaderboard`. In produzione le tabelle erano vuote al rilascio.
- Il Durable Object `GameRoom` del PvP è eliminato con la migrazione `v2` di Wrangler (`deleted_classes`).
- Codice: `shared/levels.v1.0.0.ts`, `worker/game.v2.0.0.ts`, `worker/leaderboard.v1.0.0.ts`, `worker/in-play.v1.1.0.ts` (senza PvP),
  `src/play.v2.0.0.ts`, home e pagina «Come funziona» in `src/main.ts`, Impostazioni in `src/library.v1.12.0.ts`. Le versioni
  precedenti `worker/game.ts` e `src/play.ts` restano come storico; `worker/room.ts` e `src/pvp.ts` sono rimossi.
- Indirizzi: `/gioca`; `/allenamento`, `/tempo` e `/pvp` portano a `/gioca`.

## 7. Verifiche

Test unitari `tests/levels.v1.0.0.test.ts`; d'integrazione `tests/game.v2.0.0.integration.py` (livelli, una foto alla volta,
tempo dalla foto mostrata, esiti, risposte ripetute, scadenze, punteggio, crediti, classifica, codici, voci nascoste) con il
catalogo di prova `tests/catalog_v1_0_0.py`; nel browser `tests/game_browser.v1.0.0.integration.py` su desktop (tasti R e S) e mobile
(swipe, pulsanti fuori vista), oscuramento, risultati, codice, classifica nella home e verifica del codice nelle Impostazioni.

## 8. Rischi e limiti

- Il cookie anonimo distingue i giocatori solo per browser: chi cancella i cookie o cambia dispositivo compare più volte.
- Il codice prova il possesso di una schermata, non l'identità: chi lo fotografa da un altro telefono può reclamarlo.
- Con un catalogo piccolo chi gioca spesso riconosce le foto; la difesa scelta è il numero di foto pubblicate.
- I pulsanti si nascondono solo con un puntatore «grossolano» (dito): su un computer con schermo touch restano visibili e lo swipe funziona comunque.
- La pagina «Come funziona» dichiara il soprannome pubblico; titolare, contatti e conservazione restano da definire prima del lancio.
