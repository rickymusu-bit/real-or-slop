# Descrizione GPT con conferma — 1.0.0

Aggiornato: 2026-11-07T23:12:00Z. Delta corrente #64, dettagliato in #78.
Stato: implementazione proposta su main `a10401a`, non rilasciata.

## Decisioni e compatibilità

| Fonte | Contraddizione | Decisione corrente e verifica |
| --- | --- | --- |
| #64 aggiornata / #78 | La vecchia #64 e il contratto 8.0.0 consentivano embedding title-only immediati | Per nuovi inserimenti vuoti prima proposta, poi approvazione esplicita; HTTP verifica zero temi/vettori/seed prima della conferma |
| Memoria semantica 2.0.0 | Descrizione storicamente facoltativa | Temi già presenti e revisioni restano leggibili e indicizzabili singolarmente; nessun backfill o riscrittura |
| Topic Discovery | Lo switch potrebbe essere confuso con una nuova funzione GPT | La descrizione è un'operazione `describe` indipendente; OFF non cambia e non avvia suggerimenti |
| #76 / #23 | Nuovo nome e direzioni creative | Esclusi dalla consegna per istruzione esplicita dell'owner; nessun asset o nome modificato |

## Flusso e API

`POST /api/admin/editorial/workspace/topics` accetta `title`, `description` e
un eventuale `operation_id` UUID. Con una descrizione manuale non vuota registra
come prima e tenta un solo embedding entro i limiti. Con titolo normalizzato già
esistente seleziona il tema, senza chiamare modelli.

Con descrizione vuota richiede `operation_id` e restituisce **202** con una bozza
privata: `id`, titolo, stato, descrizione inglese ≤500 caratteri, ambiguità e
`proposal_sha256`. Non registra temi, seed SLOP o semantica. Il modello vede
soltanto il titolo come dato, istruzioni contro dettagli inventati e uno schema
JSON rigoroso; il server verifica anche la risposta. Le ambiguità espresse dal
modello sono visibili. Il testo generato non dimostra fatti e non è una fonte.

Le nuove route autenticate sono sotto
`/api/admin/editorial/workspace/topic-descriptions/:id`:

- `GET`: riprende la proposta privata, disponibile anche nell'elenco workspace.
- `POST /approve`: `title`, `description`, `expected_sha256`. Richiede proposta
  ready e titolo/hash corrente. Salva atomicamente tema, descrizione canonica,
  template/versione/hash e memoria pending; solo dopo avvia l'embedding esistente.
  Conferme identiche sono idempotenti, conferme differenti o concorrenti in
  conflitto ricevono 409. Non accetta un generico `approved=true`.
- `POST /regenerate`: `title`, `expected_sha256`, nuovo `operation_id`. Sostituisce
  atomicamente la proposta pronta e prepara una nuova ricevuta. Un replay con
  lo stesso ID legge il risultato senza un secondo invio; la versione precedente
  non può più essere approvata.
- `POST /cancel`: `title`, `expected_sha256`. Chiude la proposta senza tema,
  embedding, ricerca fotografica o generazione. L'audit rimane privato.

Il titolo nel modulo resta modificabile, ma una bozza non può approvare un titolo
diverso: annullare e richiedere una nuova proposta. La descrizione può essere
corretta liberamente prima della conferma. Refresh non approva nulla: la UI offre
Riprendi la descrizione. Durante un invio i controlli impediscono doppio clic e
modifiche dell'input che verrebbero sovrascritte dal risultato.

## Persistenza, costi ed errori

La migrazione **0024** aggiunge `editorial_topic_description_drafts` e
`editorial_topic_description_jobs`. Nessuna tabella precedente viene ricostruita,
nessun voto/vettore/file storico viene modificato. Un indice unico sui titoli
normalizzati attivi protegge anche richieste con ID diversi. Le ricevute nuove
sono visibili nello storico operazioni insieme a quelle precedenti.

`worker/workspace-ai.v1.0.0.ts` usa Responses API con modello configurato, i gate
`WORKSPACE_AI_ENABLED` / `ENABLE_REAL_DISCOVERY_PAID`, secret server, timeout e
prenotazione `brief` sul ledger REAL esistente prima dell'invio. La UI conferma
il costo massimo configurato alla richiesta e a ogni rigenerazione. Budget/gate
assenti falliscono prima del provider; l'owner può scrivere la descrizione a mano.
Il testo digitato rimane nel modulo anche in caso di errore.

Un esito potenzialmente fatturato, risposta invalida o timeout diventa uncertain:
non si ritenta con lo stesso ID né se ne genera un altro automaticamente. Il
titolo rimane protetto dagli invii concorrenti/incerti; il percorso manuale è
disponibile. Una ricevuta completata può recuperare una bozza interrotta dopo
la risposta, leggendo il JSON archiviato senza ripetere la chiamata. Stati
preparing senza ricevuta certa restano bloccati: nessun recupero speculativo.

Gli embedding restano `text-embedding-3-small`, 1536 dimensioni e template
`Topic: ...\nDescription: ...`, con i tetti `TOPIC_EMBEDDING_*`. Il replay di
un'approvazione non innesca nuove indicizzazioni, neppure se il servizio prima
non era configurato. L'indicizzazione successiva resta un'azione esplicita.

## Rilascio e limiti

Prima di rilasciare: verifiche locali/CI, anteprime desktop/mobile e approvazione
dell'owner. Applicare 0024 con backup prima del codice nuovo, che legge le nuove
tabelle anche con gate spenti. Non modificare limiti, secret o flag durante la
migrazione. Il rollback del codice conserva le nuove tabelle per audit; non
eliminare bozze/ricevute. Il codice precedente ripristinerebbe anche il vecchio
ramo title-only, quindi una regressione funzionale richiede attenzione esplicita.

Questa consegna non include provider pagati reali, migrazione remota, merge,
deploy, pubblicazione né modifiche ai file R2. Le prove simulate verificano il
contratto e la gestione dei costi, non l'accuratezza fattuale o linguistica di
ogni futura descrizione GPT: resta necessaria la revisione dell'owner.
