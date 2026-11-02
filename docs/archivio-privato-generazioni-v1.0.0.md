---
version: 1.0.0
created_at: 2026-11-02T21:24:07.507675+01:00
application: 0.14.1
status: implemented-not-deployed
---

# Archivio privato delle generazioni

La prova diretta del 2026-11-02 ha completato due valutazioni fotografiche, un
brief, una generazione e la valutazione finale. La candidata REAL ha ottenuto
52.83/100, la SLOP 42.67/100: entrambe sotto la soglia comune 65. Nessuna nuova
immagine è entrata nella coda pronta o nel catalogo. La spesa è stata disabilitata
a fine esecuzione e il catalogo demo resta 12 REAL + 12 SLOP. Prenotazioni
conservative cumulative 4.50 USD, incluse 0.50 USD del precedente invio Batch
non eseguito; non rappresentano una fattura OpenAI.

La prova ha evidenziato un difetto del percorso diretto: per una generazione
scartata era salvato soltanto il dossier, mentre il file rimaneva nel runner
temporaneo. L'immagine di quella specifica esecuzione non è recuperabile dai
file conservati: il suo dossier e le fotografie sorgente sono disponibili nello
Studio, ma questa correzione non ricrea la preview storica e non genera una
nuova immagine al posto della precedente.

## Conservazione indipendente dalla selezione

Ogni tentativo che produce file archivia originale e derivato privati in R2,
anche con stato discarded o error. L'archiviazione non importa una candidata,
non cambia il punteggio e non approva o pubblica. La scheda della revisione
quotidiana resta immagine + Approva/Rifiuta; lo Studio mostra anche le preview
archiviate dei tentativi scartati. La selezione editoriale e il catalogo 50/50
restano invariati. Il percorso Batch usa lo stesso archivio consultabile, oltre
al proprio checkpoint privato.

La migrazione additiva **0012_editorial_attempt_media.sql** crea un manifest
immutabile con tentativo, variante original/preview, SHA-256, dimensione, chiave
R2 e timestamp ISO 8601. Nessuna modifica delle colonne o dei dati precedenti;
nessuna migrazione remota è eseguita da questa PR.

API solo amministrative:

- `PUT /api/admin/editorial/attempts/:id/original` e `/preview`: il dossier deve
  già esistere; i byte devono corrispondere al suo hash. Limite 12 MB, formati
  JPEG/PNG/WebP, oggetti immutabili e upload idempotente.
- `GET` sugli stessi percorsi: solo file confermati nel manifest, no-store e
  nosniff; nessun URL pubblico o token nella query string.
- `GET /api/admin/editorial/dossiers`: media_available deriva dal manifest,
  senza un HEAD R2 per ogni tentativo. I vecchi dossier senza file non mostrano
  una falsa anteprima.

Le fotografie sorgente condividono il controllo di integrità e i limiti dello
stesso helper. I file generati usano il prefisso separato
`editorial-attempts/<id>/original|preview` nel bucket privato esistente.

## Preflight e recupero

Il backend dichiara attempt_media_archive nelle capacità di importazione.
Entrambi gli esecutori verificano questa capacità prima delle nuove chiamate
pagate: codice aggiornato contro un backend vecchio si ferma, senza una fallback
che perda file. Originale/hash sono registrati localmente appena prodotti, anche
se l'ottimizzazione o la valutazione seguente falliscono. Nessuna chiave nel file.

I percorsi devono rimanere nel workspace del run e i byte devono corrispondere
al dossier congelato. Riprendere dal medesimo workspace ricarica anche gli
scarti non completamente archiviati, senza una nuova generazione. Un upload
interrotto fra R2 e manifest può lasciare un oggetto privato non indicizzato:
il retry completa il manifest. Non cancellare dossier o ledger per recuperare.

Prima di un rilascio separatamente autorizzato: backup D1/R2, applicazione locale
0012 e ripristino verificato; applicare 0012 prima del backend, senza seed su
produzione. La capacità deve essere presente prima di aggiornare l'esecutore.
Nessun nuovo secret, servizio, dipendenza, cron o incremento di budget. I test
usano fixture e Worker/D1/R2 locali, senza chiamate OpenAI a pagamento.
