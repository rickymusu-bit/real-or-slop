# Affidabilità del trasporto editoriale v2.0.0

Seconda PR del protocollo #34, successiva alla base sperimentale #35.
Recupera soltanto correzioni tecniche della PR obsoleta #29: nessuna sua rubrica,
classifica, fotografia di riferimento, workflow o configurazione di spesa.

Un checkpoint può contenere una prenotazione prima dell'invio del job. Alla
ripresa il trasporto condiviso ricontrolla gate pagato e lease tramite la stessa
prenotazione idempotente server: una prenotazione vecchia non autorizza un nuovo
invio dopo la chiusura del gate. Contatori e costo locale non vengono incrementati
due volte. Il test copre entrambi i flussi indipendenti v2 con gate aperto/chiuso.

I download dei checkpoint usano uno User-Agent applicativo, mantengono verifica
hash/dimensioni e non seguono redirect. Errori HTTP Files/checkpoint espongono
solo il codice di stato, senza corpo della risposta, chiavi o fallback di modello
o trasporto. Dopo un annullamento riuscito l'errore precedente resta nel campo
storico `error_before_cancellation` e non fa apparire fallita la cancellazione.

Le modifiche condivise valgono anche per il recupero dei run storici, senza
riattivarne la politica editoriale. Il pilota rapido e i ritagli Terra restano
sincroni: questa PR non invia Batch, non esegue inferenze e non cambia gate,
risorse remote, migrazioni o catalogo.

Verifica locale del 2026-11-04: **124 test Python passati**, inclusi gate chiuso
dopo prenotazione nei due flussi v2, replay senza doppio addebito, annullamento
conservando l'errore storico, upload HTTP senza esposizione della chiave e
download del checkpoint con hash verificato. Nessuna richiesta OpenAI eseguita.
