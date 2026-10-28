# Archivio Google Drive → catalogo Real or Slop (D1 + R2)

## Ruoli e confini

- **Drive (privato)** è la fonte degli **originali**, delle schede JSON, dei riferimenti a fonti/licenze e degli eventuali dossier di generazione. Non condividere i file pubblicamente e non usare link `uc?export=download` per il gioco.
- **D1** conserva schede, stato di revisione e una tabella privata `image_archives` che associa l'ID Drive dell'originale alla candidata. Gli ID Drive non vengono inviati dalle API pubbliche di gioco.
- **R2 QUARANTINE** riceve solo copie **WebP a fotogramma intero** di massimo 1600px. La revisione in `/admin` è obbligatoria.
- **R2 IMAGES** riceve un'immagine soltanto dopo l'approvazione esplicita: viene copiata dalla quarantena dall'API esistente. Il gioco serve l'oggetto R2, non scarica da Drive.

Il programma `scripts/sync-drive.py` gira **sul computer dell'amministratore**, non nel browser del giocatore né dentro il Worker: il token OAuth Google rimane sul computer, fuori da Git e da Cloudflare. La procedura è manuale, non esistono job/sincronizzazioni pianificate. Non cancella nulla da Drive/R2/D1 e non approva nulla da sola.

## Preparazione Cloudflare (una tantum; non automatica)

1. Prima di pubblicare un Worker che interroga `image_archives`, applicare la migrazione **`0007_drive_archive.sql`** al D1 corretto e verificato, con backup. Usare prima un D1 di prova; non usare l'ID del DB demo per esperimenti distruttivi.
2. Attivare R2 dopo aver verificato piano/condizioni di fatturazione. Creare e verificare **due bucket separati**: `QUARANTINE` privato e `IMAGES` per gli asset approvati (entrambi non accessibili direttamente al pubblico). Configurare i relativi binding Wrangler nella destinazione corretta, con nomi effettivamente creati.
3. Impostare il segreto `ADMIN_TOKEN` (minimo 32 caratteri) per il Worker remoto. Non inserirlo in codice, nel JSON della scheda, nel repository o nel log.
4. Eseguire test nell'ambiente di staging e controllare che `GET /api/admin/images` sia privato; `/api/health` e le partite demo devono continuare a funzionare.
5. La configurazione attuale **è ancora demo senza R2**. Il comando `npm run deploy:demo` rifiuta l'aggiunta dei bucket remoti: non usarlo per il catalogo. Il passaggio a `DATA_MODE=production`, la modifica dei binding, il merge e la pubblicazione vanno effettuati separatamente e solo dopo verifica/approvazione.

## Preparazione Google Drive (una tantum)

1. Crea una cartella **privata** nel tuo Drive per il lotto (per esempio `Real or Slop/Catalogo/Da importare`). Conserva sempre anche una copia di backup degli originali e delle schede, indipendente da una singola cartella.
2. In un progetto Google Cloud sotto il tuo controllo abilita **Google Drive API** e configura il consenso OAuth. Registra un **OAuth Client ID di tipo Desktop**; se l'app è in test aggiungi il tuo account come utente di test.
3. Scarica il JSON client OAuth in `.pipeline/client_secret.json` (non versionato). Il programma usa lo scope **`drive.readonly`**: legge i file accessibili al tuo account, non può modificarli. Su Drive personale `drive.file` senza Google Picker non concede automaticamente l'accesso a una cartella arbitraria già esistente.
4. Installa le dipendenze sul computer da cui esegui lo script: `python3 -m pip install -r requirements-drive.txt`. Al primo avvio si apre il browser per autorizzare l'accesso; il refresh token rimane in `.pipeline/google-drive-token.json` con permessi locali restrittivi. Revocalo in Google se il computer viene compromesso.

## Formato della cartella

Ogni coppia è costituita da **`nome.jpg` + `nome.json`** (stesso nome di base), oppure `.png/.jpeg/.webp`. Il JSON ha il campo `filename` che punta all'immagine nella stessa cartella e contiene i campi dell'API di importazione esistente. Usa [l'esempio](../examples/google-drive-item.example.json) come base.

- `ready: false` = bozza ignorata; imposta `true` **solo dopo** aver verificato fonte, diritti, didascalie e classificazione.
- Per `REAL`: prova documentale dell'autenticità e licenza effettiva della singola immagine.
- Per `AI`: anche `ai_model`, `ai_prompt`, `generation_date` (AAAA-MM-GG), `owner_declaration: true`; nella scheda indica un URL di fonte HTTPS legittimo, non una finta pagina archivistica.
- `categories` usa gli **ID presenti nel D1 di destinazione**; non nomi arbitrari.
- Evita due file con lo stesso nome nella stessa cartella. Non aggiungere token, password o dati personali superflui alle schede.

Il programma legge la scheda, recupera l'originale da Drive, registra SHA-256 dell'originale, crea un derivato WebP senza ritaglio, calcola dHash del derivato, crea la candidata D1 e ne carica il file su `QUARANTINE`. Il file originale non viene modificato. Il manifest Drive è il tuo originale editoriale; per aggiornare un'immagine già importata, utilizza la revisione amministrativa. Una modifica ai byte dell'originale con lo stesso Drive File ID viene **bloccata**: crea una nuova candidata dopo revisione invece di sovrascrivere silenziosamente.

## Comandi

Recupera l'ID della cartella dall'URL di Drive, poi (da repository, sul tuo computer):

```bash
python3 scripts/sync-drive.py --folder-id "ID_CARTELLA" --limit 10
```

Questa è **solo un'anteprima**: non scrive sul sito e non carica file su R2. Per importare davvero:

```bash
export REAL_OR_SLOP_ADMIN_TOKEN="TOKEN_WORKER_NON_CONDIVISO"
python3 scripts/sync-drive.py --folder-id "ID_CARTELLA" --site "https://IL-TUO-SITO.workers.dev" --limit 10 --apply
unset REAL_OR_SLOP_ADMIN_TOKEN
```

Non inserire il token direttamente nei comandi salvati in script o cron. Dopo l'upload apri `https://IL-TUO-SITO.workers.dev/admin`, verifica l'anteprima e i diritti, quindi approva manualmente. L'approvazione sposta la copia nel bucket `IMAGES`; **non implica che la modalità demo diventi produzione**.

## Idempotenza e recupero

- Ripetere l'import dello **stesso Drive File ID con lo stesso SHA-256** restituisce la candidata D1 già creata; un upload interrotto può essere riprovato senza duplicare la riga.
- Se la candidata è già `approved` o `rejected`, lo script non la modifica.
- Un originale Drive mutato a parità di ID genera HTTP 409, evitando di cambiare senza revisione una domanda già assegnata.
- Due esecuzioni concorrenti possono entrare in conflitto sull'indice univoco e una fallire: basta ripetere il comando per recuperare la candidata. Non eseguire importazioni in parallelo.
- Backup D1, inventario e copie R2 vanno mantenuti separatamente; **Drive non è automaticamente un backup del database D1**.
- Il token OAuth rimane locale, non è inviato al Worker. All'API Worker viene inviato soltanto `ADMIN_TOKEN`, mentre D1 conserva solo ID Drive e hash, senza link pubblici o credenziali.

## Verifiche prima di popolare tutto il catalogo

Testa inizialmente due immagini REAL e due AI, inclusi upload interrotto, ripetizione e rifiuto. Controlla che l'API pubblica non esponga ID Drive, prompt o risposte prima della scelta e che l'immagine approvata sia scaricata da R2 durante una partita **in produzione di test**. Solo dopo passa ai lotti successivi.
