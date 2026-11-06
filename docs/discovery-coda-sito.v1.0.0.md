---
version: 1.0.0
created_at: 2026-11-06T19:45:00Z
status: five-candidates-synchronized-to-private-site-inbox
source_issue: 56
---

# Discovery REAL nella coda di revisione del sito

## Contraddizione e decisione

`docs/coda-revisione-unica.md` prescrive che `/admin` raccolga le immagini da
rivedere senza gallerie o cartelle separate. Il percorso #56 terminava invece
con HTML locale ed export delle già approvate. Questo non soddisfaceva la
destinazione prevista per la decisione personale del proprietario.

La galleria locale riferiva file relativi separati: il singolo HTML aperto fuori
dal filesystem del run non conteneva i pixel. Non viene usata come consegna della
review. Il sito deve servire le anteprime dal proprio bucket privato autenticato.

La specifica indica già `scripts/sync-review-inbox.py`: credenziali Cloudflare,
upload content-addressed in QUARANTINE e insert `pending` nell'inbox, senza
approvazioni o modifiche alle tabelle del gioco. Il token amministrativo dell'app
non è richiesto da questo percorso. La precedente dichiarazione di blocco per
`REAL_OR_SLOP_ADMIN_TOKEN` era errata.

## Delta limitato

- Riutilizzare manifest, uploader e tabella della coda esistenti; nessuna nuova
  inbox, migrazione, autenticazione o servizio.
- Conservare originali e profili, hash e ricevute. Permettere il contenitore MPO
  degli originali JPEG, mantenendo preview JPEG/PNG/WebP e limiti esistenti.
- Esportare le candidate REAL da revisionare prima dell'approvazione, anche con
  problemi documentali o profili non utilizzabili: la decisione visiva e i diritti
  restano separati. Rifiutare fixture prima di qualsiasi scrittura remota.
- Esporre l'azione di sincronizzazione nel ciclo, con ricevute e stato che
  distingua manifest pronto, coda sincronizzata e review personale pendente.
- Non azzerare decisioni, reinserire file eliminati, pubblicare immagini,
  abilitare cron/inferenze o sostituire credenziali.

Le cinque candidate esistenti sono la prima consegna concreta da sincronizzare
in `/admin`; la verifica deve leggere righe e pixel reali del bucket, non dedurre
il successo soltanto dalla preparazione del manifest.

## Uso

```sh
# Prepara e verifica il manifest senza rete o approvazioni:
npm run discovery:real -- inbox --out .pipeline/real/run-001
# Carica nella coda privata e verifica le righe/pixel remoti:
npm run discovery:real -- inbox --out .pipeline/real/run-001 --apply
# La stessa consegna dal ciclo riprendibile, senza nuove inferenze:
npm run discovery:cycle -- resume --out .pipeline/real/run-001 --sync-inbox
```

Servono le credenziali Cloudflare già usate dal sincronizzatore documentato e
la destinazione configurata in `wrangler.jsonc`. L'admin token dell'app resta
necessario per altri endpoint amministrativi, non per questo importatore.
`--sync-inbox` autorizza la copia esplicita dei file esistenti; non chiama GPT,
non esegue retrieval e non richiede `--execute` o `--live`.

Un ciclo reale con profili pronti, ma senza sincronizzazione confermata, dichiara
`awaiting_inbox_sync`; non termina con il solo HTML locale. Dopo la copia mostra
URL e stato della coda. Un voto locale non conclude il ciclo reale né produce
l'export automatico delle approvate. La coda del sito rimane autoritativa per
la scelta del proprietario. Inclusione, decisione visiva, verifica dei diritti
e pubblicazione nel gioco restano passaggi distinti.

L'export include tutte le candidate del dossier, anche se fuori dalla shortlist
o non utilizzabili secondo il modello. Le copie identiche hanno una sola scheda
con i riferimenti alle candidate d'origine; i dati del run restano conservati.
La sincronizzazione usa insert idempotenti e controlla la vista delle immagini
effettivamente mostrate, rispettando presentazioni successive e registro delle
eliminazioni. Verifica lo SHA-256 dei pixel remoti prima di dichiarare successo.

## Esecuzione concreta

- Cinque nuove righe REAL inserite come `pending`, revisione 0.
- Dieci file privati copiati e riletti: cinque anteprime e cinque originali,
  incluso l'intero JPEG/MPO con entrambi i frame. 18.447.827 byte complessivi.
- Controllati account, DB e binding QUARANTINE: accesso pubblico gestito
  disabilitato e nessun dominio personalizzato sul bucket.
- Stato iniziale: 58 schede nella coda. Le cinque nuove immagini erano assenti
  sia dalla coda sia dal registro delle eliminazioni. Il catalogo del gioco
  contava 30 immagini e 24 pubblicate; l'importatore non scrive queste tabelle.
- Le tre cartelle del pilota sono riprese con `--sync-inbox`, riusando le ricevute
  degli upload verificati. Nessun duplicato o reset dei voti e nessuna nuova
  inferenza. Il ledger GPT rimane a 18 prenotazioni per 0,73 USD.
- Manifest, ID, hash, ricevute, righe e verifica degli oggetti rimangono nei file
  privati del pilota. Nessun originale o URL delle candidate entra in Git.

`npm test`: 18 file Node e 218 test Python passati. Nuovi test su export di
candidate non approvate/non utilizzabili, deduplica, fixture, manomissioni,
preservazione dei voti, file eliminati, verifica dei pixel remoti, stato del
ciclo e originali MPO. Nessun test usa API pagate o dati di produzione.

Per la revisione usare [la coda sul sito](https://real-or-slop.rickymusu.workers.dev/admin),
con l'accesso amministrativo abituale e filtri REAL / Da valutare. Non occorre
aprire una galleria locale o approvare immagini tramite la chat.
