# Schede Statistiche e Impostazioni — specifica 1.0.1

Stato: decisioni dell'owner del 2026-11-11 e del 2026-11-12 (sezione 1); testo approvato dall'owner il 2026-11-12, vigente. Realizzata
nell'app 1.13.0 con la migrazione 0044. Creata: 2026-11-12T11:00:00Z. Completa la dashboard `/admin` di
`docs/dashboard-admin-wizard-real.v1.3.0.md`, che passa da quattro a cinque sezioni. Aggiornata: 2026-11-12T18:00:00Z (solo lo stato;
precedente: `docs/statistiche-impostazioni.v1.0.0.md`).

## 1. Decisioni dell'owner

- «In impostazioni voglio solo "bottoni" e non "display"»: le Impostazioni contengono soltanto comandi.
- «Le statistiche di gioco e di spesa le metterei in una scheda separata, assieme all'avviso sullo sbilanciamento.»
- «La qualità delle foto dovrebbe essere già dov'è il selettore dei modelli.»
- Nelle Impostazioni: soglie dello studio SLOP, durata massima di una partita aperta; le opzioni del gioco sono state superate dai
  livelli fissi nel codice («Sono scritti nel codice e risolviamo il problema»).
- «È possibile vedere anche quante partite si stanno giocando al momento?»: sì, nella scheda Statistiche.

## 2. Impostazioni (solo comandi)

- **Modelli:** modello di testo, modello di immagini e **qualità delle immagini**, tra quelle ammesse dal modello scelto. Se si sceglie un
  modello che non ammette la qualità salvata, si torna a `medium`. Lo studio SLOP e la rigenerazione della sezione Database usano questa
  qualità e la mostrano in sola lettura.
- **Contesto dei modelli**, **Vocabolario dei tag**, **Classifica** (verifica di un codice, nascondere o mostrare una voce): come prima.
- **Studio SLOP:** REAL approvate o pubblicate per aprire lo studio (predefinito 50, da 1 a 1000) e REAL con tutti i tag del tema
  (predefinito 10, da 1 a 200). Restano stime da verificare sui primi temi reali.
- **Partite:** durata massima di una partita aperta in ore (predefinito 24, da 1 a 168). Oltre questo tempo una partita non conclusa non
  trattiene più le copie ritirate (`docs/database-immagini.v1.0.1.md`, sezione 4) e non conta più tra le partite aperte.
- Il conteggio delle chiamate a pagamento lascia le Impostazioni e va nelle Statistiche.
- Dati: tabella `app_settings` (migrazione additiva `0044_app_settings.v1.0.0.sql`); una riga mancante vale il predefinito del codice.

## 3. Statistiche (solo visualizzazione)

Periodo a scelta: ultimi 7 giorni, ultimi 30 (predefinito), da sempre; pulsante «Aggiorna».

- **Adesso:** partite in corso adesso, cioè con una foto mostrata, una risposta o una preparazione negli ultimi **5 minuti**, in totale e
  per livello; partite aperte (iniziate e non concluse entro la durata massima delle Impostazioni). Il secondo numero è più alto del primo
  perché conta anche chi ha lasciato una partita a metà.
- **Partite del periodo**, per livello: iniziate, concluse, non concluse, scadute prima dell'inizio, punteggio medio delle concluse.
- **Risposte delle partite concluse:** foto giocate, REAL e SLOP riconosciute, accuratezza bilanciata, foto scadute; voci in classifica
  (e quante nascoste).
- **Chiamate a pagamento:** per tipo (tag e didascalia, prompt SLOP, immagini) numero, token in ingresso e in uscita, esiti incerti
  evidenziati; tabella delle ultime 200 chiamate del periodo con filtri per tipo ed esito. Nessun importo: il limite che conta è quello
  del progetto OpenAI.
- **Equilibrio del catalogo:** REAL e SLOP pubblicate e approvate, quota di REAL tra le pubblicate con una barra e la fascia 40–60%,
  avviso non bloccante fuori fascia (`docs/libreria-immagini.v1.8.0.md`, sezione 6), livelli giocabili e quante foto servono agli altri.
- API `GET /api/admin/library/stats?period=7|30|all`, gratuita.

## 4. Verifiche

Test d'integrazione `tests/stats.v1.0.0.integration.py` (qualità, soglie usate dallo studio, durata delle partite aperte, statistiche con
partite di prova); nel browser `tests/library_browser.v1.11.0.integration.py` (comandi delle Impostazioni, scheda Statistiche),
`tests/slop_browser.v1.2.0.integration.py` e `tests/database_browser.v1.2.0.integration.py` (qualità dalle Impostazioni).

## 5. Limiti

- «Adesso» è una stima: una partita resta «in corso» fino a 5 minuti dopo l'ultima azione del giocatore.
- Le statistiche delle risposte si calcolano dai round ancora presenti: eliminare definitivamente una foto toglie anche i suoi round dalle
  partite passate, quindi i totali possono calare.
