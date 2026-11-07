# Rilascio approvato della issue #64 — 1.0.0

Aggiornato: 2026-11-07T19:35:00Z. L'owner ha risposto «Approvo» dopo la consegna
dell'implementazione, degli esiti locali e delle anteprime, autorizzando merge,
migrazioni necessarie e rilascio. Non autorizza inferenze a pagamento o la scelta
di nuovi budget. I flag e i secret esistenti restano invariati.

Base GitHub verificata: `bac6edf`. Le verifiche locali complete sono registrate
in `completamento-issue-64.v1.0.0.md`. Anteprime riproducibili, con dati simulati:
[desktop](anteprima-admin-desktop.v2.0.0.png),
[mobile](anteprima-admin-mobile.v2.0.0.png).

## Preflight

- Account `89bb1f60467dcfd2147871748f0f9645`, Worker `real-or-slop`.
- D1 `98a3e712-d9f9-4510-91ab-2b80329be753`, storia remota ferma a 0018:
  occorrono 0019–0023, tutte additive. La versione del codice non prova che una
  migrazione sia già stata applicata in produzione.
- Binding R2 esistenti `real-or-slop-quarantine` e `real-or-slop-approved` verificati.
- `DATA_MODE=demo`; il rilascio non cambia la modalità delle partite.
- Worker senza `OPENAI_API_KEY`, gate workspace e budget embedding: il nuovo admin
  potrà registrare temi/file e stati pending; l'attivazione dei modelli richiede
  configurazione economica esplicita successiva.

È emerso un difetto nel validatore dei nomi delle migrazioni: la regex precedente
rifiutava i suffissi `.vMAJOR.MINOR.PATCH.sql` già presenti da 0019. Correzione
ristretta a tale formato, con test sull'elenco reale e nomi malformati. Rimangono
le guardie su prefisso completo delle migrazioni, destinazioni e approvazione.

Prima delle mutazioni: esportazione D1, restore locale e prova delle migrazioni;
inventario e copia privata R2. Le copie e le ricevute rimangono sotto
`artifacts/release64/`, ignorate da Git. Nessun originale viene cancellato.

La PR deve superare la CI prima del merge. Il risultato effettivo del rilascio e
le verifiche successive saranno registrati in una nuova versione del report;
questo documento non attesta ancora una pubblicazione completata.
