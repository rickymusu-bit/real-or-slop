---
version: 1.0.0
created_at: 2026-11-03T11:56:28.644973+01:00
status: controlled-manual-test
---

# Confronto editoriale diretto su 20 fotografie

Il proprietario ha autorizzato il merge della PR #30 e una nuova prova con API
dirette su 20 fotografie, superando il precedente limite cumulativo di 5 USD.
La prova verifica la severità del classificatore con la rubrica corrente:
nessun abbassamento della soglia, nessun incremento artificiale dei punteggi.

Il workflow manuale sul ramo `ops/direct-20-2026-11-03` usa il file già
registrato `review-queue.yml`. Nessun cron. Raccolta con deduplicazione sullo
stato remoto prima di raggiungere il limite di 20; classifica unica, prime 10
assegnate a REAL e ultime 10 a sorgenti SLOP. Per confrontare 20 fotografie, il
preflight richiede 20 fotografie tecnicamente ammissibili prima di inviare
chiamate pagate: nessun riempitivo. La pipeline ordinaria mantiene il supporto
ai lotti incompleti.

Configurazione fissata per questa esecuzione:

| Parametro | Valore |
| --- | --- |
| Analisi e valutazione | gpt-6.1-terra, verificato nell'elenco modelli del progetto |
| Generazione | gpt-image-2, solo testo, 1024×1024, medium |
| Soglia comune | 65/100 |
| Tentativi per sorgente | 1, nessuna rigenerazione pagata |
| Limite valutazioni/brief | 40 (20 fotografie, 10 brief, 10 immagini finali) |
| Limite generazioni | 10 |
| Prenotazione per valutazione/brief | 0.50 USD |
| Prenotazione per generazione | 2.00 USD |
| Tetto per esecuzione/giornata | 40 USD |
| Tetto cumulativo temporaneo | 44.50 USD, comprese le precedenti prenotazioni di 4.50 USD |
| Licenza dichiarata delle generazioni | CC BY 4.0, previa revisione dei diritti |

Le prenotazioni sono stime conservative, non una fattura. Lo storico del ledger
rimane intatto. La soglia si applica alla media dei sei assi già in uso;
le singole valutazioni e le motivazioni restano nel registro privato.

Prima dell'esecuzione: esportazione D1, ripristino locale verificato, controllo
di preservazione di tutte le righe esistenti con 0012, backup dei file R2
referenziati, applicazione della sola migrazione additiva 0012 e aggiornamento
del backend. L'esecutore controlla la capacità `attempt_media_archive` prima
delle chiamate pagate. Il catalogo pubblico resta invariato.

Il controller temporaneo abilita il gate server soltanto per l'esecuzione e lo
chiude in `finally`, ripristinando i limiti precedenti. Le credenziali restano
nei secret GitHub/Cloudflare esistenti. Nessuna chiave o immagine privata viene
pubblicata negli artifact: solo riepilogo numerico con conservazione di 7 giorni.

Le immagini generate, anche sotto soglia, restano nell'archivio privato R2 e
sono visibili nello Studio amministrativo con motivazioni e provenienza.
Le candidate sopra soglia entrano soltanto nella revisione umana: nessuna
approvazione o pubblicazione automatica. L'esito va confrontato separatamente
per REAL e SLOP, mantenendo la classifica delle fotografie e i sei assi originali.
