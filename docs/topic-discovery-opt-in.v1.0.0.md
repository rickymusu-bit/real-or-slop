# Topic Discovery opzionale — v1.0.0

Aggiornato: 2026-11-07T17:27:47.248Z. Issue #64.

## Decisione editoriale

Durante il popolamento iniziale di Real or Slop l'owner sceglie **personalmente** tutti gli argomenti. Il suggeritore Topic Discovery è disattivato di default, indipendente dagli altri due sistemi editoriali.

La dashboard `/admin` contiene il comando "Attiva Topic Discovery" / "Disattiva Topic Discovery" e lo stato esplicito. Il toggle scrive sul database D1 tramite `POST /api/admin/editorial/intelligence/topic-discovery/settings`, autenticato come tutte le altre API admin, con `{ "enabled": true | false }`. La nuova migrazione additiva `0021_topic_discovery_opt_in.v1.0.0.sql` crea un singolo registro con valore iniziale **false**.

### Con Topic Discovery spento

- L'owner può registrare argomenti, allegare REAL manuali, chiedere ricerche mirate Commons per argomento, revisionare REAL e SLOP e gestire la generazione SLOP; nessun percorso dipende dallo stato del suggeritore.
- La UI disabilita il comando `Suggerisci 5 argomenti`; anche la chiamata diretta `POST /suggest` risponde 409 senza invocare il modello.
- Non vengono prodotti suggerimenti, embedding o altri risultati dal motore di scoperta. I precedenti dati del progetto e lo storico degli argomenti restano disponibili.

### Con Topic Discovery acceso

- Il comando suggerimenti diventa utilizzabile **solo se** sono soddisfatti gli altri gate per l'API e il budget; in assenza di credenziali il pulsante resta disabilitato e l'endpoint non effettua chiamate a pagamento.
- Attivare il toggle **non** richiama GPT, non genera embedding, non scarica fotografie, non abilita un cron, non modifica il modello REAL o SLOP, non avvia importazioni o pubblicazioni.
- Una chiamata già iniziata prima della disattivazione non può essere revocata retroattivamente; il gate blocca nuove richieste dal momento della lettura dello stato.

## Spazio degli embedding

Il toggle non implementa ancora la ricerca vettoriale. Titoli degli argomenti e, nella futura evoluzione del contratto, descrizioni semantiche in inglese verranno conservati per un'eventuale indicizzazione esplicita e versionata. **Non è necessario produrre embedding mentre il suggeritore è spento**: il backfill potrà essere autorizzato più avanti. Nessuna classificazione topic/emozione/intensità è richiesta.

## Prove e rilascio

- Test SQLite: singleton inizialmente OFF, ON/OFF persistente, valori non validi bloccati.
- Test TS: lettura/scrittura senza contatti esterni.
- Test HTTP Worker: 409 con OFF, 503 con ON ma senza gate API, controllo admin 401, payload errato 400, stato persistente e inserimento manuale invariato.
- Nessuna migrazione applicata in remoto, nessuna chiave, costo API, deploy o merge automatico.

Versione semantica del contratto opzionale: `1.0.0`. La migrazione 0021 si applicherà dopo la 0020 al successivo rilascio approvato.
