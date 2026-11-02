> Aggiornamento 2026-11-02T18:51:11.607127Z: per le prove piccole si usa il metodo diretto;
> Batch resta per i caricamenti. [Policy e chiavi v1.0.0](prove-dirette-caricamenti-batch-v1.0.0.md).

> Aggiornamento 2026-11-02T16:30:46Z, versione operativa **3.0.0**: il workflow usa
> [OpenAI Batch v1.0.0](pipeline-batch-openai-v1.0.0.md), con stato D1/R2, quattro
> fasi e tetto cumulativo `EDITORIAL_TOTAL_USD` (5 USD per la prova). Le istruzioni
> sincrone sotto sono conservate per compatibilità: per nuovi lotti usare
> `pipeline.batch` / operazioni Actions `start`, `resume`, `status`, `cancel`.
> Il primo avvio non completa tutte le fasi: riprendere con lo stesso run ID.
> Prezzi nuovi `EDITORIAL_BATCH_EVALUATION_USD` e `EDITORIAL_BATCH_GENERATION_USD`
> obbligatori positivi nei due ambienti; nessun valore remoto impostato qui.

> Aggiornamento 2026-11-02T15:58:55+01:00: la revisione quotidiana usa [immagine, Approva/Rifiuta e preferenze apprese v1.0.0](revisione-visiva-preferenze-v1.0.0.md). Le schede vengono preparate prima della presentazione; i moduli precedenti restano soltanto nella gestione avanzata.

---
version: 3.0.0
updated_at: 2026-11-02T16:30:46Z
---

# Esecuzione privata della pipeline editoriale

Il vecchio job che importava fino a dieci fotografie tecnicamente valide come
REAL è superato. Si applica la [pipeline editoriale 1.0.0](pipeline-editoriale-real-slop-v1.0.0.md):
unica classifica, prima metà REAL, seconda metà sorgenti SLOP, revisione umana,
pubblicazione esplicita in gruppi bilanciati. Nessun cron pagato è attivo.

## Prima verifica: soltanto locale

```sh
python3 -m venv .pipeline/venv
. .pipeline/venv/bin/activate
pip install -r pipeline/requirements.txt
npm ci
npm run lint
npm test
npm run build
npm run db:migrate
npm run db:seed
npm run test:integration
ROS_TEST_PROFILE= npm run test:integration
```

I comandi database sopra usano esclusivamente `--local --env local`.
`db:seed` pubblica soltanto le fixture locali, per consentire la demo nuova;
non è una procedura di pubblicazione del catalogo remoto. Su database già
popolati 0008 conserva tutte le approvate, se già bilanciate.

Per un lotto locale JPEG/PNG/WebP completo e un manifest compatibile con
l'importatore esistente:

```sh
python3 -m pipeline.editorial .pipeline/lotto/manifest.json
python3 -m pipeline.editorial .pipeline/lotto/manifest.json --simulate --out .pipeline/simulazione
```

Il primo comando valida e mostra i massimi teorici. Il secondo usa un generatore
di fixture dichiarate e valutazioni simulate, salvando solo file locali. Entrambi
non effettuano chiamate OpenAI o scritture remote, anche in presenza di chiavi.
Le fixture uniformi non misurano la qualità editoriale di un corpus reale.

Raccolta di fotografie, con sole API documentate delle fonti e senza OpenAI:

```sh
python3 -m pipeline.automatic
python3 -m pipeline.automatic --collect --out .pipeline/automatic
```

Il primo è un piano senza rete; il secondo scarica originali e derivati locali.
Per una prima raccolta di due fotografie usare `--collect --limit 2`.
Conservare la cartella, inclusa `collection.sqlite`, fra giornate diverse.
Ripetere il download può consumare quote delle fonti anche senza costi OpenAI.
La raccolta non approva né importa nel Worker.

## Migrazioni e rilascio futuro, da autorizzare separatamente

Prima di applicare 0007/0008 su staging o produzione:

```sql
SELECT demo,type,count(*) FROM images WHERE status='approved' GROUP BY demo,type;
PRAGMA foreign_key_check;
```

Preparare backup D1 e R2 e provare il ripristino su copia isolata. Se i conteggi
non sono uguali, completare manualmente il lato mancante nel vecchio sistema;
0007 interrompe prima della rimozione della colonna e 0008 ricontrolla la
precondizione, senza ritirare immagini. Non modificare la guardia
per forzare un catalogo sbilanciato. Congelare scritture amministrative durante
il rilascio coordinato di schema e backend; non tornare al backend precedente
con colonna rimossa. Sessioni, risposte e audit sono preservati.

Questa PR non applica migrazioni remote, non modifica permessi/billing e non
effettua deploy. Il comando di rilascio esistente richiede l'ulteriore flag
d'ambiente `EDITORIAL_SCHEMA_RELEASE_APPROVED=true` dopo i controlli e l'approvazione
del rilascio, soltanto se il controllo in sola lettura trova nuove migrazioni.
A schema già aggiornato non occorre il flag: il deploy non modifica D1, non
esegue seed e conserva variabili e segreti del Worker. Se D1 non è leggibile o
il database risulta più avanti del checkout, il comando si ferma prima di
qualsiasi pubblicazione. Il flag non va lasciato permanentemente attivo.
Un database nuovo richiede il seed demo e la sua pubblicazione esplicita; nessun
nuovo catalogo viene pubblicato dallo script di deploy per completare una quota.

## Configurazione prima di un primo lotto controllato

Usare [pipeline/editorial.env.example](../pipeline/editorial.env.example) come
elenco di variabili, senza copiarvi segreti. Le cifre zero impediscono esecuzioni
pagate: sostituirle con stime conservative verificate per modello e parametri.

| Variabile / secret | Destinazione | Significato |
|---|---|---|
| `OPENAI_API_KEY` | Secret dell'esecutore Python / Actions | Accesso OpenAI, mai frontend/Worker/artifact |
| `REAL_OR_SLOP_ADMIN_TOKEN` | Secret dell'esecutore / Actions | Credenziale admin esistente del Worker |
| `ADMIN_TOKEN` | Secret Worker esistente | Autenticazione amministrativa invariata |
| `OPENAI_ANALYSIS_MODEL` | Python / Actions vars | Analisi visiva e brief; esempio verificato nell'elenco: `gpt-6.1-terra` |
| `OPENAI_EVALUATOR_MODEL` | Python / Actions vars | Valutatore finale, default modello di analisi |
| `OPENAI_IMAGE_MODEL` | Python / Actions vars | Generatore, esempio nell'elenco: `gpt-image-2` |
| `OPENAI_IMAGE_SIZE`, `OPENAI_IMAGE_QUALITY` | Python / Actions vars | Dimensioni e qualità; default 1024x1024 / medium |
| `EDITORIAL_THRESHOLD` | Python / Actions vars | Soglia comune di qualità 0–100, default 65 |
| `EDITORIAL_ATTEMPTS` | Python / Actions vars | Tentativi per sorgente 1–5, default 2 |
| `EDITORIAL_MAX_EVALUATIONS` | Python + Worker / Actions vars | Analisi, descrizioni e valutazioni per run, default 60 |
| `EDITORIAL_MAX_GENERATIONS` | Python + Worker / Actions vars | Generazioni incluse rigenerazioni, default 20 |
| `EDITORIAL_MAX_REGENERATIONS` | Python + Worker / Actions vars | Rigenerazioni per run, default 10 |
| `EDITORIAL_EVALUATION_USD` | Python + Worker / Actions vars | Stima massima di una chiamata visiva |
| `EDITORIAL_GENERATION_USD` | Python + Worker / Actions vars | Stima massima di una generazione |
| `EDITORIAL_RUN_USD`, `EDITORIAL_DAILY_USD` | Python + Worker / Actions vars | Budget stimati per run e giorno UTC |
| `EDITORIAL_QUEUE_LIMIT` | Python / Actions vars | Limite conservativo locale; default 100 |
| `GENERATED_LICENSE_NAME`, `GENERATED_LICENSE_URL` | Python / Actions vars | Dichiarazione dei diritti generati dopo verifica, senza default |
| `ENABLE_EDITORIAL_PAID` | Python + Worker / Actions vars | Abilitazione esplicita, default assente/false |
| `ENABLE_AUTOMATIC_REVIEW_QUEUE` | Actions vars | Abilitazione del workflow, default assente |
| `ENABLE_EDITORIAL_SCHEDULE` | Actions vars | Abilitazione esplicita del cron dormiente, default assente/false |
| `EDITORIAL_SCHEMA_RELEASE_APPROVED` | Solo esecutore di un rilascio con migrazioni nuove | Conferma temporanea del preflight/backup; non necessaria per normali deploy a schema aggiornato |

Il limite D1 della coda è indipendente dal client: leggere/modificare con API
admin `/api/admin/editorial/controls`, corpo `{"queue_limit":100}`. Vale anche per
l'importazione manuale. Non ridurlo ignorando le immagini già in attesa.

Dopo rilascio autorizzato su destinazione verificata e controlli di termini,
licenze, quote e prezzi, iniziare da un manifest di **due fotografie** e budget
sufficiente soltanto per quella prova. Prima leggere `/api/admin/editorial/state`.
Poi, solo nell'esecutore privato configurato e abilitato:

```sh
python3 -m pipeline.editorial .pipeline/primo-lotto/manifest.json \
  --execute --base https://WORKER-DI-TEST-VERIFICATO --out .pipeline/prima-esecuzione
```

Il segnaposto non è una destinazione configurata. Non usare l'URL di produzione
per una prova. Il comando può spendere entro i limiti stimati configurati e
scrivere soltanto registro/quarantena/coda privata, mai approvazioni o pubblicazioni.
Il modello viene controllato con `/v1/models`; un ID elencato non garantisce che
una generazione completi correttamente. Nessuna fallback a un altro modello.

Controllare `ranking.json`, `attempts/*.json`, `summary.json`, dossier Studio e
ledger. Il revisore decide manualmente; la pubblicazione richiede una seconda
azione esplicita in admin. Il costo reale e la resa dei modelli vanno verificati
prima di un lotto più grande. Non aumentare punteggi o budget per riempire la quota.

## Recupero

Conservare la cartella privata originale e il run ID. In caso di importazione
interrotta, riprendere con gli stessi argomenti e aggiungere `--resume`:

```sh
python3 -m pipeline.editorial .pipeline/primo-lotto/manifest.json \
  --execute --resume --base https://WORKER-DI-TEST-VERIFICATO --out .pipeline/prima-esecuzione
```

La ripresa conserva ruoli, ranking e tentativi. Un file già accettato viene
reimportato idempotentemente senza rigenerazione; il budget server non si azzera.
Un originale mancante richiede recupero da artifact/backup. Per file scaricati
su un percorso diverso, ripristinare i percorsi originali prima del recupero;
non cambiare i prompt dei tentativi già archiviati. Se il budget è esaurito,
interrompere e riesaminare il costo: non cambiare giorno o run ID per aggirarlo.
Un conflitto del registro richiede verifica editoriale, senza riclassificare una
sorgente come REAL o rimuovere una pubblicata.

## GitHub Actions

Il workflow `Automatic private review queue` supporta avvio manuale e un cron
quotidiano alle 06:17 UTC, disabilitato dal nuovo flag
`ENABLE_EDITORIAL_SCHEDULE` assente/false. Richiede branch main e repository privato. Negli avvii manuali senza `execute_paid=true` fa soltanto raccolta locale e piano. Lo step
pagato richiede inoltre `ENABLE_EDITORIAL_PAID=true`, secret OpenAI e admin
**in Actions**, policy compatibili nel Worker e modelli/prezzi/diritti valorizzati.
Le credenziali di Codex Cloud non sono trasferite automaticamente. Nessuna
variabile, secret, fatturazione o schedule remota è stata attivata da questa PR.
L'eventuale automazione quotidiana richiede `ENABLE_EDITORIAL_SCHEDULE=true`
oltre a tutte le altre abilitazioni; nessuna variabile viene impostata qui.

## Avvio dal pannello GitHub e visione delle immagini

Nel workflow **Automatic private review queue**, scegliere **Run workflow**,
branch `main`, `reference_count=2`. La modalità da due fotografie forza un solo
tentativo generativo, massimo una generazione e quattro chiamate visive
(due valutazioni REAL, una descrizione/brief, una valutazione del risultato).
Può produrre meno candidate o nessuna, secondo qualità e disponibilità.
La selezione `20` mantiene il normale limite giornaliero. Gli avvii schedulati
mantengono 20; questo controllo non attiva da solo il cron.

Per la sola ricerca basta `ENABLE_AUTOMATIC_REVIEW_QUEUE=true`, lasciando
`execute_paid` non selezionato e gli altri due interruttori false. Le fotografie
restano nell'artifact privato del run; la semplice raccolta non importa nella
coda del sito. L'artifact comprende originali, derivati e metadati e scade dopo
sette giorni.

Per valutazione/generazione/importazione occorrono le abilitazioni e i budget
positivi nei due ambienti, il secret admin valido e la licenza generata dichiarata
nella tabella precedente. Solo allora selezionare `execute_paid`. La prima prova
manuale non richiede `ENABLE_EDITORIAL_SCHEDULE=true`.

Le candidate importate sono su https://real-or-slop.rickymusu.workers.dev/admin,
filtro **In revisione**. In https://real-or-slop.rickymusu.workers.dev/admin/slop
premere **Carica dossier automatici e diagnostica** per fonte, sorgente privata,
brief, prompt, modelli, valutazioni e tentativi. I file generati scartati prima
dell'importazione restano nell'artifact privato del workflow; il dossier conserva
la motivazione anche quando non esiste una candidata collegata. L'approvazione
umana e la pubblicazione bilanciata restano due azioni esplicite separate.
