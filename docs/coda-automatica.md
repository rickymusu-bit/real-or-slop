# Coda privata alimentata automaticamente

Il revisore usa soltanto `/admin`: controlla le candidate, verifica la spiegazione
editoriale precompilata e fonte/licenza/autenticità, poi approva o rifiuta. La raccolta e
il caricamento dei file sono eseguiti da GitHub Actions, senza Google Drive e
senza operazioni manuali per ciascuna immagine.

## Comportamento

Il workflow `Automatic private review queue` parte ogni giorno alle **06:17 UTC**
(07:17 in Italia d'inverno, 08:17 d'estate). GitHub può ritardare i job pianificati.
Raccoglie da Wikimedia Commons fino a **10 candidate REAL al giorno** attraverso
l'API ufficiale e scarica soltanto da `upload.wikimedia.org`. Le prime ricerche
ruotano fra ponti storici, locomotive, architetture insolite, dipinti e automobili
storiche, con pagina di ricerca deterministica per giorno. Non certifica che una
candidata sia REAL: l'autenticità è verificata dal revisore.

Si esaminano al massimo 30 risultati per esecuzione; sono ammessi inizialmente
CC0, Public Domain Mark, CC BY 4.0 e CC BY-SA 4.0 dichiarati sulla singola scheda.
File incompleti, diritti ambigui, host non autorizzati, file illeggibili e duplicati
locali vengono esclusi. Le candidate mantengono provenienza e attribuzioni; la
spiegazione viene precompilata con la didascalia della fonte e va verificata prima
dell'approvazione. Le categorie e la
difficoltà iniziale `medio` sono provvisorie e modificabili in revisione.

Prima dell'importazione si controllano l'intero lotto, la salute del sito,
`demo: true`, la disponibilità del catalogo e la coda. Le immagini non-demo create
nel giorno UTC corrente, comprese quelle già approvate o rifiutate, consumano il
limite di dieci. Il job si ferma quando ci sono almeno **50 candidate in revisione**
e limita il nuovo lotto allo spazio residuo. I job sono serializzati; il limite
governa questo workflow, non importazioni manuali simultanee di altri operatori.

L'importatore usa esclusivamente l'origine fissata
`https://real-or-slop.rickymusu.workers.dev` e le API esistenti:

- D1 esistente: schede `in-review`, `demo=0`.
- `QUARANTINE` → `real-or-slop-quarantine`: originali privati byte per byte in
  `originals/{id}` e copia per il gioco sulla chiave opaca della candidata.
- Revisione umana → copia approvata in `IMAGES` → `real-or-slop-approved`.

Non vengono chiamate API di approvazione, Cloudflare, deploy o migrazione; non
vengono creati bucket o database. `DATA_MODE=demo` rimane invariato: l'approvazione
prepara il catalogo, ma il passaggio del gioco alle immagini reali è separato.
La generazione automatica delle immagini AI non è inclusa in questo job.

## Attivazione iniziale

Il workflow resta disattivato finché manca la variabile di attivazione. Funziona
soltanto sul branch `main` di questo repository **privato**, su schedule o avvio
manuale; non è eseguito su pull request o fork.

1. Dopo la revisione della PR, unire il codice a `main` soltanto nel rilascio
   autorizzato. Il repository ha un collegamento Workers Builds: il merge può
   attivare anche il suo deploy esistente, indipendentemente da questo workflow.
2. In GitHub, **Settings → Secrets and variables → Actions → Secrets**, aggiungere
   `REAL_OR_SLOP_ADMIN_TOKEN` con lo **stesso valore** di `ADMIN_TOKEN` sul Worker.
   Il segreto del Worker non viene letto o copiato automaticamente. Non usare
   `CLOUDFLARE_API_TOKEN`: questo workflow non ne ha bisogno. Non inserire il valore
   in chat, comandi salvati o file Git.
3. In **Actions → Variables**, impostare `ENABLE_AUTOMATIC_REVIEW_QUEUE=true`.
4. Eseguire una volta **Actions → Automatic private review queue → Run workflow**
   da `main` per verificare il primo lotto senza attendere il giorno successivo.
5. Aprire `/admin`: le nuove immagini devono comparire in **In revisione** con
   anteprima privata. Da quel momento il lavoro ordinario consiste nella revisione.

La rotazione di `ADMIN_TOKEN` richiede di aggiornare anche il segreto GitHub.
Il segreto dell'environment Codex è separato da quello del runner GitHub.
Per sospendere gli import impostare `ENABLE_AUTOMATIC_REVIEW_QUEUE=false`.

## Verifica e recupero

`python -m pipeline.automatic` mostra soltanto il piano e non usa la rete.
`python -m pipeline.automatic --collect` prepara e valida il lotto locale privato,
senza scrivere sul sito. `--apply` importa un lotto già raccolto e richiede il
segreto del runner: non è una modalità di anteprima.

Ogni esecuzione conserva lotto e ricevuta come artifact nel repository privato
per sette giorni, anche dopo un errore. Gli originali già importati restano in R2
e non dipendono dalla scadenza dell'artifact. Non pubblicare o committare i file.
Un errore non approva le candidate già caricate: controllare il run fallito e la
ricevuta. Il comando esistente `scripts/import-queue.py` permette di riprendere
un lotto interrotto senza duplicare le schede o sostituire originali e decisioni.
Una nuova esecuzione nello stesso giorno usa la stessa ricerca; risultati e file
della fonte possono cambiare e i controlli di checksum rifiutano le sostituzioni.
Non è garantito un numero minimo di nuove candidate: filtri, disponibilità e
deduplica possono ridurre il lotto. Il job segnala fallimento se non raccoglie
nessun file completo. Verifiche locali non equivalgono a un import remoto riuscito.
