# Classifica REAL per argomento — 1.0.0

Aggiornato: 2026-11-07T15:37:39.950Z. Correzione nell'ambito della issue #64.

La scheda di un argomento mostrava fino a 200 candidate REAL pendenti provenienti anche da altri argomenti. Il modello delle preferenze personali è globale, ma **la shortlist deve essere locale all'argomento selezionato**.

La query della coda aggiunge il filtro sul campo `topic_id` dei metadati quando la dashboard invia un argomento. Il punteggio continua a essere calcolato sull'apprendimento globale dei tuoi giudizi REAL, per trasferire preferenze fra soggetti diversi. In assenza di un argomento selezionato rimane possibile consultare la coda complessiva.

Le foto proposte dall'owner, i file Commons acquisiti e le candidate trovate da GPT condividono già `topic_id`. Non vengono trasferite foto da un tema all'altro, né alterate le decisioni, le ricevute, i rapporti d'aspetto o il catalogo.

Test HTTP: un argomento nuovo senza foto non deve visualizzare le candidate già appartenenti a un altro. Nessun costo API o migrazione del database è richiesto.
