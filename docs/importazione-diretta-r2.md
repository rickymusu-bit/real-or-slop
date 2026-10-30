# Importazione diretta delle immagini in D1 e R2

Il catalogo viene popolato senza Google Drive, OAuth Google o sincronizzazioni intermedie:

```text
Fonti ufficiali → lotto locale con fonti/licenze e file
               → API admin → D1: metadati in revisione
                           → R2 QUARANTINE: originale privato + file per il gioco
               → revisione umana → R2 IMAGES: file approvato
```

Il gioco serve le immagini da R2. Dopo il rilascio iniziale di questo codice, caricare o approvare un nuovo lotto non richiede una nuova build del sito. L'importazione non effettua approvazioni automatiche né cambia `DATA_MODE`: il catalogo reale in preparazione rimane separato dalle fixture della demo.

## Prerequisiti

- Worker aggiornato con queste API, D1 esistente e i binding `QUARANTINE`/`IMAGES` verso due bucket privati verificati. Per il caricamento basta `QUARANTINE`; l’approvazione richiede anche `IMAGES`.
- `ADMIN_TOKEN` configurato sul Worker. Sul computer dell’operatore usare lo stesso valore nel segreto `REAL_OR_SLOP_ADMIN_TOKEN`; è accettato anche `ROS_ADMIN_TOKEN` per compatibilità locale. Non inserire token in manifest, Git, URL o comandi salvati.
- Python 3.12 e le dipendenze già previste dalla pipeline: `python3 -m pip install -r pipeline/requirements.txt`.
- Manifest, originali e copie per il gioco all’interno della stessa cartella di lotto privata. I riferimenti a file esterni o symlink che escono dal lotto sono rifiutati.

Non sono necessari client OAuth, cartelle Google, librerie Google o la migrazione `0007_drive_archive.sql` della PR Drive superata. Non vengono creati bucket o applicate migrazioni automaticamente.

## Manifest e comandi

Lo script accetta il `manifest.json` prodotto da `pipeline.run`: ogni elemento contiene `metadata`, `file` (originale) e l’eventuale `sha256` dell’originale. `metadata.derived_file`, quando presente, identifica il WebP già preparato per il gioco. Può usare una scheda locale completa tramite `import_sidecar`, come nel lotto pilota già raccolto; nessun file viene letto da Drive.

Esempio minimo di un elemento del manifest:

```json
{
  "file": "originals/photo.jpg",
  "metadata": {
    "type": "REAL",
    "title": "Titolo verificato",
    "author": "Autore della fonte",
    "provider": "archivio",
    "source_id": "oggetto-001",
    "source_url": "https://example.org/scheda-originale",
    "evidence": "Prova archivistica da verificare",
    "rights": "https://creativecommons.org/licenses/by-nc-nd/4.0/",
    "categories": ["arte"],
    "difficulty": "medio",
    "explanation": "Spiegazione editoriale per la rivelazione",
    "derived_file": "webp/photo.webp"
  }
}
```

Il file complessivo è una lista JSON. I percorsi possono essere relativi alla cartella del manifest, oppure quelli prodotti dalla pipeline. I campi obsoleti `drive_archive`, `drive_original_url`, `drive_manifest_url`, `ready` e `filename` non vengono inviati al sito. Il precedente flag Drive `ready` non governa questo flusso: le candidate vengono caricate **in revisione**, senza approvazione.

Anteprima, senza credenziali o richieste di rete:

```sh
python3 scripts/import-queue.py .pipeline/manifest.json --base https://IL-SITO.workers.dev
```

Caricamento esplicito, dopo aver configurato il segreto nell’ambiente:

```sh
python3 scripts/import-queue.py .pipeline/manifest.json --base https://IL-SITO.workers.dev --limit 10 --apply
```

HTTP è consentito solo per localhost; per il remoto serve l’URL radice HTTPS. I redirect non vengono seguiti, così il token admin rimane sul sito indicato. Il lotto selezionato viene controllato prima delle scritture; vengono saltate le schede segnate dalla pipeline come incomplete, ambigue o fuori dal filtro di licenza. I filtri espliciti restano rispettati.

## Originali, revisione e ripresa

- L'originale viene archiviato byte per byte in `QUARANTINE`, prefisso `originals/{image_id}`, con SHA-256 nei metadati R2. Il prefisso resta privato anche dopo l’approvazione e non va eliminato durante una pulizia dei file in revisione. Non serve un terzo bucket.
- Il file per il gioco viene caricato sulla chiave opaca esistente della candidata. Lo script non ricomprime: utilizza il file già preparato e calcola SHA-256 e dHash sui byte effettivamente caricati. Originale e upload devono essere JPEG, PNG o WebP entro 12 MB; il file di gioco viene decodificato e controllato entro 30 megapixel.
- Una ripetizione con stesso provider/ID fonte, tipo, URL fonte e checksum restituisce la stessa candidata. Se l’upload si interrompe dopo il POST, rilanciare lo stesso comando: riprende senza ricreare metadati. L’eventuale mancanza di un oggetto R2 viene verificata anche se D1 ne contiene già il checksum.
- Un originale già archiviato non viene sostituito con byte diversi, anche durante una revisione; le scritture concorrenti usano una condizione R2 che impedisce la sovrascrittura. File o identità di fonte differenti sono bloccati con 409. Eseguire i lotti in sequenza; non usare import concorrenti per sostituire una candidata in revisione.
- Candidate già approvate o rifiutate non vengono modificate. Correzioni a metadati, spiegazioni, licenze o difficoltà passano dalla revisione esistente, con audit. Il pannello permette di modificare la spiegazione sia per REAL sia per AI.
- Ogni esecuzione con `--apply` salva una ricevuta privata `import-receipt.json` nella cartella del manifest, con sito, ID D1 e checksum. `--receipt` permette un percorso alternativo. Non contiene token.

L'API amministrativa mantiene l’accesso ai file originali su `/api/admin/originals/:id`. Nessun originale viene esposto dalle API di gioco prima della risposta. Fonti, licenze, prove e decisioni restano in D1; conservare backup D1 e copie/inventario R2 separatamente. Il prefisso degli originali e una ricevuta non sono un backup completo del database.

## Stato delle risorse remote

Il proprietario ha confermato l’aggiunta dei binding R2; i nomi concordati sono ora riportati anche in `wrangler.jsonc`. Questa sessione non dispone ancora delle credenziali Cloudflare dell’environment corretto: l’import remoto rimane da effettuare dopo il rilascio del Worker aggiornato e la verifica dei binding tramite l’API amministrativa. Il lotto pilota locale di dieci immagini è utilizzabile da questo script senza passare da Drive. Le copie già archiviate su Drive non vengono cancellate e non sono più una dipendenza.
