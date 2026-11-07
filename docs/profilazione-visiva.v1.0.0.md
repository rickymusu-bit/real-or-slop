# Profilazione visiva delle fotografie grandi — 1.0.0

Aggiornato: 2026-11-07T15:06:28.313Z. Seguito della issue #64. Le funzioni richiedono un comando esplicito dell'amministratore.

## Problema risolto

Gli originali fotografici fino a 12 MB possono essere troppo grandi per l'invio diretto al modello. I nuovi file REAL proposti dall'amministratore e i file acquisiti da Commons devono comunque contribuire all'apprendimento delle preferenze.

La pagina `/admin` carica un file **privato** dalla coda di revisione tramite l'endpoint autenticato, legge i pixel e prepara nel browser una copia WebP integrale senza ritaglio. La riduzione è proporzionale, con massimo 1152 pixel sul lato maggiore e 1,5 MB. Sono previste varianti di compressione per fotografie difficili. L'originale **non viene modificato o sostituito**.

Il browser passa al server una miniatura in base64 solo dopo un click e la conferma della spesa. Il Worker confronta SHA-256 dei byte originali con il valore legato alla revisione, convalida firma binaria e dimensioni di origine e anteprima, il rapporto d'aspetto e il limite di byte. Il modello riceve **solo i pixel dell'anteprima** e il compito di descriverli, senza titolo/URL/autore/metadati. Il profilo risultante contiene hash originale e hash anteprima, insieme al metodo di preparazione, per consentire la revisione.

Non c'è garanzia crittografica che il browser non sia stato alterato dall'amministratore: il confronto del rapporto d'aspetto verifica una condizione necessaria ma non dimostra l'identità semantica. La trasformazione è però sempre eseguita dal codice della dashboard a partire dal file originale protetto. Non considerare il profilo una prova di autenticità o licenza.

## Controlli

- Nessun modello chiamato prima di aver letto e verificato i dati.
- Solo JPEG, PNG e WebP originali in quarantena; solo WebP per le anteprime browser.
- Limite originale: 12 MB; anteprima: 1,5 MB e massimo lato 1152; nessun crop o upscaling.
- Hash originale legato all'identità/revisione già approvata o pendente; nessuna nuova fotografia importata dall'anteprima.
- Nessun account o upload giocatori; solo la dashboard amministrativa può avviare il processo.
- Esiti `413`/`400` per dimensioni o rapporto non valido, prima della prenotazione di budget. Gli stati incerti delle chiamate API continuano a bloccare i retry.
- Test unitari delle dimensioni e test d'integrazione con profilo WebP, contenuto non autorizzato e distorsione del rapporto; l'API resta disabilitata per default.

## Limiti

È richiesta una conferma manuale per ogni profilo che richiede un modello. In questa versione non c'è ancora profilazione in batch, anteprima visiva simultanea con l'etichettatura né un sistema di classificazione delle foto già nel catalogo storico al di fuori della coda. Le copie reali vengono sempre inviate solo quando l'amministratore avvia il comando.
