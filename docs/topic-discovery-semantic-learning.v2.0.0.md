# Memoria semantica incrementale indipendente da Topic Discovery — 2.0.0

Aggiornato: 2026-11-07T17:49:06.040Z.

## Scopo

**Topic Discovery** è il motore facoltativo che *propone* nuovi argomenti. Resta disattivato per impostazione predefinita e non è necessario per popolare il catalogo.

**Memoria semantica** è il sistema che apprende dall'inserimento di un argomento da parte dell'owner. Non è disattivata insieme a Topic Discovery: ogni nuovo input crea immediatamente un testo semantico persistente e, quando le credenziali e i limiti di spesa sono configurati, invia subito una richiesta reale all'API Embeddings e conserva il vettore. Accettare un argomento precedentemente suggerito segue lo stesso percorso.

Si tratta di **indicizzazione incrementale e aggiornamento di dati**, non di aggiornamento dei pesi di un modello. I giudizi editoriali REAL e SLOP continuano a essere registrati e consumati dinamicamente dai rispettivi modelli di preferenza.

## Formato dell'argomento

- Titolo: massimo 200 caratteri, normale validazione esistente.
- Descrizione in linguaggio naturale: facoltativa in questa prima fase per compatibilità con la dashboard e i dati storici, massimo 500 caratteri, preferibilmente in inglese. Non sono richiesti campi obbligatori per data, luogo o tipo di evento.
- Testo inviato al provider: template `Topic: ...\nDescription: ...`, versione `1.0.0`, con hash SHA-256. Se manca la descrizione il testo contiene un marcatore esplicito `not yet supplied`, evitando di inventare fatti. Una futura modifica della descrizione richiederà una nuova revisione semantica e un nuovo embedding.
- Modello iniziale: `text-embedding-3-small`, vettore da 1536 dimensioni. Il modello può essere configurato per `text-embedding-3-large`, mantenendo 1536 dimensioni per confronto omogeneo. Per risultati confrontabili fra loro il modello deve rimanere lo stesso o essere rigenerata l'intera raccolta.
- Database: `editorial_topic_semantics` (migrazione additiva 0022), con testo sorgente, descrizione, SHA, versione del template, modello, stato, vettore numerico, dimensioni, numero di token e timestamp.

## Comportamento immediato

Alla registrazione dall'admin, **il testo viene salvato comunque**. Se l'API Embeddings è pronta, la chiamata è avviata sulla stessa richiesta POST. Il server usa il registro dei costi esistente e controlla tetti per singola chiamata, giorno e totale prima di inviare qualsiasi dato all'API.

Sono possibili quattro risultati importanti:
- `ready`: è stato ricevuto, validato e archiviato un vettore reale.
- `pending`: testo archiviato, API/limiti non configurati o budget insufficiente; nessun vettore inventato.
- `uncertain`: richiesta inviata o riservata ma risultato non attestabile; non ritentare automaticamente per evitare duplicati fatturati.
- `failed`: configurazione incompatibile con il modello registrato; serve intervento controllato.

La dashboard mostra lo stato e non dichiara "embedding calcolato" quando non è vero. Una duplicazione identica dell'argomento non causa una seconda chiamata. Non parte alcun job automatico di backfill: gli argomenti storici potranno essere indicizzati più avanti con una procedura distinta e approvata.

## Configurazione (nessuna credenziale nel repository)

`OPENAI_API_KEY` (secret già usato dalle altre funzioni); `TOPIC_EMBEDDING_MODEL` (facoltativo, predefinito `text-embedding-3-small`); `TOPIC_EMBEDDING_CALL_USD`, `TOPIC_EMBEDDING_DAILY_USD` e `TOPIC_EMBEDDING_TOTAL_USD` obbligatori per abilitare le chiamate automatiche sugli input. Il servizio rimane pronto a registrare testi anche senza configurazione. Topic Discovery resta **OFF** e il suo toggle non modifica queste condizioni.

**Diversamente dai suggerimenti GPT, la generazione dell'embedding è autorizzata dall'azione stessa di registrazione dell'argomento**. Il budget deve essere configurato esplicitamente: i costi delle embeddings API sono normalmente per token, quindi la prenotazione per chiamata deve essere sufficientemente conservativa. Nessuna API è stata chiamata nello sviluppo o nei test.

## Verifiche e limiti

- Unit test TypeScript per testo, budget non configurato, trasporto finto con vettore corretto, ripetizioni e risultati incerti.
- Test SQLite per stato OFF, relazione con gli argomenti, vettore effettivo obbligatorio per `ready`.
- Integrazione HTTP locale per creazione, descrizione conservata, stato `pending` con gate non configurati, senza influenza sullo stato di Topic Discovery.
- La ricerca dei vicini semantici, la misura di copertura dello spazio e l'algoritmo finale del suggeritore sono ancora da implementare. Salvare vettori non equivale da solo ad avere un Topic Discovery vettoriale operativo.
- Il salvataggio della descrizione attualmente avviene al momento della creazione: modifica successiva, sincronizzazione degli argomenti storici e retry controllato dei `pending` sono estensioni successive, **da non dichiarare implementate**.
- Nessuna migrazione remota, deploy o chiave API viene attivata da questa PR. La migrazione 0022 è successiva alla 0021.
