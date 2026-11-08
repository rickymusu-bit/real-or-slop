# Snapshot delle preferenze e geometria — 1.0.0

Aggiornato: 2026-11-08T03:46:00Z. Base main `0a595bf`, completamenti #64 richiesti
dall'owner insieme al rilascio. App 0.19.0, contratti 11.0.0, schema additivo 0026.

## Decisioni e confini

| Ambito | Prima | Comportamento corrente |
| --- | --- | --- |
| Preferenze | Conteggi ricalcolati senza archivio degli stati | Snapshot per origine, versione, parametri, conteggi e fonti di feedback; hash stabile e archivio immutabile |
| Correzioni di voto / profilo | Potevano cambiare il risultato ricostruito | Nuovo stato con ID differente, quello precedente rimane leggibile |
| JPEG nell'audit | Sempre formato sconosciuto | Orientamento EXIF e dimensioni display quando risolvibili; diagnostica conservativa negli altri casi |
| File storici | Geometria mancante o senza orientamento risolto | Lettura esplicita dei byte privati correnti e audit separato; metadata, hash, originali e giudizi restano intatti |
| Qualità | Corpus ancora in popolamento | Cronologia descrittiva: nessuna soglia di maturità, efficacia o qualità inventata |

I limiti della decisione precedente rimangono vigenti: titolo e preferenze per
query REAL; soltanto titolo e feedback SLOP congelati per i prompt SLOP. Gli
snapshot dei ranker non vengono aggiunti al contesto del generatore SLOP.

## Snapshot

`learnedPreferences` seleziona come prima i profili legati ai pixel/revisioni
correnti e i relativi giudizi. Registra anche eventi esclusi dal gusto, con motivo
e indicazione `used`; guasti, diritti e provenienza non diventano gusti negativi.
La versione del ranker resta 1.0.0: pseudoconteggi 2/2, esplorazione ogni cinque
candidate e limite di 3000 feedback non cambiano.

L'ID SHA-256 comprende origine, stato canonico e fonti: ID/revisione/hash della
foto, evento, decisione/motivo, tag usati, hash/modello del profilo e timestamp
delle fonti. Non contiene il timestamp della lettura, così richieste ripetute o
concorrenti riusano lo stesso snapshot. Una correzione del voto produce un nuovo
ID anche quando ripristina gli stessi conteggi, perché conserva la nuova evidenza.
Le note libere non vengono duplicate negli snapshot.

La migrazione 0026 crea `editorial_preference_snapshots` e
`editorial_preference_snapshot_chunks`. Header e chunk sono inseriti atomicamente;
i JSON sono limitati a 500 kB per riga. Gli stati vecchi non vengono modificati o
cancellati. I metadati degli snapshot non dipendono dalla presenza successiva dei
file, e non impediscono la cancellazione autorizzata delle immagini.

Un caricamento dell'admin può archiviare uno stato nuovo, senza chiamate a modelli.
Statistiche e ranking della stessa risposta usano gli stessi snapshot. La ricevuta
della pianificazione REAL conserva anche `real_preference_snapshot_id`; il testo
del tema e i conteggi restano gli input del pianificatore già concordati.

Route private sotto `/api/admin/editorial/intelligence/preferences/snapshots`:

- `GET ?origin=all|REAL|AI&offset=0`: cronologia paginata, venti stati per pagina.
- `GET /:sha256`: stato e fonti completi, ricostruiti dai chunk immutabili.

Il pannello Storico delle preferenze funziona anche con tutte le funzioni AI
disabilitate. Conteggi di approvati/rifiutati e versioni sono metriche osservate;
non attestano un miglioramento della qualità del ranking o dei suggerimenti.

## Geometria e orientamento

`imageDimensions` rimane la guardia sulle dimensioni codificate. Il nuovo
`imageGeometry` legge bounded EXIF/TIFF: byte order II/MM, offset e conteggi
controllati, Orientation SHORT con un solo valore da 1 a 8. Gestisce APP1 JPEG,
eXIf PNG e EXIF WebP. Orientamenti 5–8 scambiano larghezza/altezza; i casi specchiati
mantengono la geometria prevista. Non ruota o ricodifica il file.

I risultati contengono `encoded_width/height`, `width/height` di visualizzazione,
orientamento, stato `explicit/absent/unknown`, versione del parser e diagnostica.
Metadati incompleti, multipli o incoerenti restano sconosciuti; il parser non è
un decoder completo né certifica autenticità o diritti.

I nuovi upload/acquisizioni conservano questa geometria nei propri metadata. Per
i file storici `POST /api/admin/editorial/intelligence/formats/analyze` richiede
soltanto `inbox_id` e SHA corrente. Il server verifica la coda effettiva, limite
12 MB, disponibilità privata e hash dei byte, poi inserisce un audit immutabile
in `editorial_image_geometry`. Una ripetizione riusa la cache. L'audit usa prima
questi dati legati ai pixel correnti e poi i metadata disponibili; i JPEG legacy
non riletti rimangono sconosciuti. I file storici non vengono riscritti.

La lettura è esplicita dall'admin, senza AI o consenso di spesa. L'audit dei
formati continua a separare REAL/SLOP e privato/pubblicato. Non corregge eventuali
sbilanciamenti ritagliando immagini, non importa le immagini eliminate e non
modifica voti, attestazioni o pubblicazione.

## Rilascio

Il procedere dell'owner nella sessione autorizza completamenti e rilascio. Main
con 0024–0025 è già stato distribuito dopo backup e prova di ripristino; originali,
audit e 419 oggetti R2 sono rimasti invariati. Prima del nuovo codice: verifiche,
anteprime, CI, backup fresco e migrazione 0026. Conservare le tabelle e gli audit
durante un eventuale rollback del codice.

La credenziale OpenAI è stata verificata con la sola lettura dei modelli. Budget
e attivazione a pagamento dipendono dalla scelta numerica chiesta all'owner; non
dedurre un nuovo importo dal precedente tetto quasi esaurito. Nessun benchmark
di qualità dei suggerimenti viene eseguito durante il popolamento del corpus.
