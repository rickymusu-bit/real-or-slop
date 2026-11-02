---
version: 1.0.0
created_at: 2026-11-02T16:30:46Z
updated_at: 2026-11-02T16:30:46Z
application: 0.14.0
status: implemented-not-activated
extends: pipeline-editoriale-real-slop-v1.0.0.md
---

# Pipeline editoriale con OpenAI Batch

La raccolta resta sulle API delle fonti documentate; le operazioni OpenAI del
workflow quotidiano passano alla Batch API. La fotografia fornisce un'idea,
non un modello da copiare: generazione esclusivamente da prompt testuale aperto,
valutazione sui pixel, revisione umana e pubblicazione separata 50/50.

Questa specifica sostituisce **l'esecuzione sincrona predefinita del workflow**
descritta in `coda-automatica.md` 2.0.0. Non cambia i protocolli editoriali, la
classifica unica, la conservazione degli originali, i diritti, la soglia comune,
le preferenze con esplorazione del 25%, né la revisione visiva a due pulsanti.
`pipeline.editorial --execute` e `pipeline.automatic --apply` restano strumenti
sincroni di compatibilità espliciti: non sono fallback automatici di Batch.

## Dimensione e sequenza

Il lotto quotidiano normale contiene **al massimo 20 fotografie ammissibili**,
dopo ricerca diversificata, controlli di licenza e deduplicazione. La ricerca
può esaminare più risultati. Non ci sono immagini di riempimento. Non occorre
aspettare 20 foto per usare Batch: lo sconto non dipende da una soglia di volume.

| Fase | Richieste con 20 fotografie | Richieste nella prova con 2 fotografie |
|---|---:|---:|
| Valutazione visiva delle fotografie | 20 | 2 |
| Descrizione e reinterpretazione delle sorgenti SLOP | 10 | 1 |
| Generazione da solo testo | 10 | 1 |
| Valutazione cieca dei risultati | 10 | 1 |

Si tratta di **quattro fasi dipendenti**, non di un unico file con 50 richieste
indipendenti. Ogni fase aspetta i risultati della precedente. Al termine della
prima, ordinamento globale unico 0–100, con identificativo stabile come spareggio:
prime 10 candidate REAL, ultime 10 sorgenti SLOP. Per un lotto più piccolo,
`ceil(n/2)` REAL e `floor(n/2)` SLOP fra le fotografie risultate valide.
Nessun secondo ordinamento delle sorgenti. REAL sotto soglia restano fuori dalla
coda pronta; nessuna quota obbliga ad abbassare il livello.

Le richieste di valutazione usano `/v1/responses` con immagini effettive e
`detail=high`; le generazioni usano **soltanto** `/v1/images/generations`, `n=1`.
Il brief comprende osservazioni, fatti documentati e inferenze distinti, motivo
di scarso interesse e reinterpretazione. Il prompt lascia libertà a composizione,
luce, materiali e dettagli; non contiene foto/allegati per image-to-image.
La valutazione finale usa la medesima rubrica REAL, senza punteggio/rango della
sorgente o prompt. I tentativi insufficienti sono scartati; una nuova iterazione
può riformulare il brief, entro i limiti. Gli errori API non provocano rigenerazioni
implicite. Originale e derivato, hash, prompt, parametri, modelli, timestamp,
identificativi di job/richiesta e motivi di scarto restano privati.

Un file JSONL contiene un solo endpoint e modello. L'implementazione limita ogni
shard a 20 richieste / 50 MB (limiti ufficiali documentati: 50.000 / 200 MB).
Se i dati visivi richiedono più shard, la classifica resta globale e aspetta tutti
i risultati. Gli output non hanno ordine garantito: associazione con `custom_id`,
controllo di duplicati, ID estranei, risposte mancanti ed errori per richiesta.

## Modelli, risparmio e tempi

La documentazione ufficiale consultata il 2026-11-02 indica Batch disponibile per
`gpt-6.1-terra` e `gpt-image-2`, con **sconto del 50% sui prezzi corrispondenti**.
Gli ID restano configurabili. Prima di un nuovo run si verifica `/v1/models`;
essere elencato non garantisce l'accesso a ogni endpoint o una quota sufficiente.
Nessun cambio automatico di modello o passaggio al prezzo sincrono se Batch fallisce.

La finestra Batch è `24h` **per job**. Quattro fasi possono richiedere circa quattro
giorni, oltre all'intervallo fra controlli, alle code e alle eventuali rigenerazioni.
Lotto raccolto quotidianamente non significa lotto completato nello stesso giorno.
Più coorti possono essere in elaborazione, rispettando coda e budget. Il runner
non aspetta 24 ore: controlla una volta, salva e termina; un'avanzata prepara al
massimo la fase successiva. Non è aggiunto alcun cron. Il cron preesistente
06:17 UTC resta subordinato a `ENABLE_EDITORIAL_SCHEDULE=true` esplicito.

Fonti ufficiali:
- [Batch API](https://developers.openai.com/api/docs/guides/batch)
- [GPT-6.1 Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra)
- [GPT Image 2](https://developers.openai.com/api/docs/models/gpt-image-2)
- [Prezzi API](https://developers.openai.com/api/docs/pricing)

## Stato persistente e concorrenza

La migrazione additiva `0011_editorial_batches.sql` introduce:

- `editorial_batch_runs`: una raccolta per giorno UTC, configurazione congelata,
  checkpoint, manifest dei file, revisione CAS, lease di 15 minuti;
- `editorial_batch_sources`: prenotazioni immutabili di identità, provenienza,
  SHA-256 e impronta percettiva, valide anche fra esecuzioni concorrenti;
- `editorial_batch_reservations`: prenotazioni di richieste che alimentano
  atomicamente il ledger esistente `editorial_usage`.

Nessuna tabella di gioco, risposta, cronologia o catalogo viene riscritta. Le
sorgenti prenotate non possono essere sottratte da un'altra esecuzione o entrare
come REAL prima dell'assegnazione. Il registro definitivo è scritto dopo la
classifica; una sorgente SLOP non diventa mai REAL giocabile. Le deduplicazioni
includono le prenotazioni dei run ancora in corso. La capacità riservata di questi
run conta nel limite privato, oltre alle immagini in attesa: il calcolo è
conservativo e può fermarsi prima di saturare fisicamente la coda.

Originali e derivati sono conservati privatamente nel binding R2 `QUARANTINE`,
con percorsi basati su SHA-256; checkpoint e manifest in D1. Prima si caricano i
file, poi si pubblica il manifest completo con confronto della revisione. Ripresa
su un nuovo runner scarica e verifica dimensioni/hash, senza dipendere dagli
artifact Actions. Solo API admin autenticate; nessun dossier, prompt o sorgente
è esposto ai giocatori. La chiave OpenAI resta nell'esecutore Python / secret
Actions; non è trasmessa al Worker, inserita nei JSONL o salvata nel checkpoint.

Prima del POST `/batches` viene salvato l'intento con input file ID, hash e
metadata univoci. Se si perde la risposta, non si reinvia: la ripresa cerca un job
corrispondente e lo adotta. È disponibile `--adopt-batch-id` con verifica di file,
endpoint e metadata. Un risultato ambiguo richiede riconciliazione, non un nuovo
run. Un lease impedisce due scrittori; CAS impedisce checkpoint obsoleti; la
prenotazione monetaria è idempotente e atomica anche fra run diversi.

## Budget e configurazione

Nessun importo di produzione viene impostato da questa implementazione. I valori
zero impediscono nuove richieste. Non confondere prezzi Batch con prezzi sincroni.

| Variabile | Dove | Significato |
|---|---|---|
| `EDITORIAL_BATCH_EVALUATION_USD` | Worker e esecutore / Actions vars | Massimo stimato conservativo per analisi, brief o valutazione visiva Batch |
| `EDITORIAL_BATCH_GENERATION_USD` | Worker e esecutore / Actions vars | Massimo stimato conservativo per immagine Batch con i parametri scelti |
| `EDITORIAL_TOTAL_USD` | Worker; Actions vars come promemoria operativo | Tetto cumulativo del ledger di tutte le giornate e run; obbligatorio positivo per Batch |
| `EDITORIAL_RUN_USD`, `EDITORIAL_DAILY_USD` | Worker e esecutore / Actions vars | Tetti per run e prenotazioni del giorno UTC |
| `EDITORIAL_MAX_EVALUATIONS`, `EDITORIAL_MAX_GENERATIONS`, `EDITORIAL_MAX_REGENERATIONS` | Worker e esecutore / Actions vars | Limiti numerici, usando il minimo dei limiti server correnti e congelati |
| `OPENAI_ANALYSIS_MODEL`, `OPENAI_EVALUATOR_MODEL`, `OPENAI_IMAGE_MODEL` | Esecutore / Actions vars | Ruoli distinti, modelli configurabili |
| `OPENAI_API_KEY`, `REAL_OR_SLOP_ADMIN_TOKEN` | Secret esecutore / Actions | Credenziali esistenti, nessun nuovo secret necessario |

Soglia, tentativi, dimensioni, qualità e licenza sono nel
[template senza segreti](../pipeline/editorial.env.example). I valori locali
fittizi dei test non sono prezzi suggeriti. Per la prova autorizzata: tetto
**cumulativo 5 USD**, tetti run/giorno non superiori a 5 USD, due foto e un solo
tentativo generativo. Il cumulativo comprende anche spese precedenti registrate:
non cancellare/reset del ledger per riavviare il budget. Il percorso sincrono
rispetta lo stesso cumulativo quando configurato; ne conserva la compatibilità
precedente se la variabile non è presente. Batch richiede invece il cumulativo.

Si prenota l'intero shard **prima** dell'invio; ogni fase controlla nuovamente la
spesa globale e giornaliera. Non si rimborsano automaticamente errori,
annullamenti o richieste non eseguite: è una scelta conservativa contro doppi
addebiti e retry. Il budget giornaliero riguarda il giorno della prenotazione,
non quello della fattura OpenAI. Il cumulativo evita il reset a mezzanotte.

Sono limiti di **spesa stimata**, non un blocco della fatturazione OpenAI. Le stime
vanno verificate sui prezzi correnti e su token visivi/output/qualità scelti;
un sottodimensionamento può causare un costo reale maggiore. I contatori di usage
restituiti sono conservati quando disponibili, ma non sono una fattura. Non è
modificato alcun limite o piano di fatturazione esterno. Per ogni run si controlla
anche che il primo passaggio teorico del lotto rientri nel budget congelato.

## Revisione e visione delle immagini

In `/admin` arrivano solo schede preparate: **immagine, Approva, Rifiuta**. Nessun
campo aggiunto. Prima dell'arrivo, una coda vuota indica se ci sono run in
elaborazione. La valutazione automatica non approva né pubblica. Le decisioni
alimentano il sistema locale di preferenze già esistente; esplorazione e rubrica
restano invariate. Nessun training a pagamento.

In `/admin?advanced=1` e `/admin/slop`, il pannello tecnico mostra stato dei run e
dossier con fonte, originale privato, descrizione, brief, prompt, modelli,
valutazione, tentativi e motivi di scarto. Anche una generazione scartata resta
archiviata, senza entrare nel catalogo. I risultati compaiono progressivamente:
le REAL possono arrivare dopo la prima fase; le SLOP dopo la quarta.

Licenza dichiarata per le immagini generate: **CC BY 4.0**, se impostata
esplicitamente (`GENERATED_LICENSE_NAME=CC BY 4.0`,
`GENERATED_LICENSE_URL=https://creativecommons.org/licenses/by/4.0/`). Non converte
la licenza delle sorgenti, non attesta copyright inesistente e non supera diritti
di terzi. Restano i controlli esistenti su fonti, originali, diritti compatibili e
copie troppo fedeli. Le immagini sintetiche non sono documenti dell'archivio fonte.

La pubblicazione usa la procedura esistente, manuale e atomica, a gruppi 50/50.
Nessuna correzione automatica dello stock pubblicato, nessun nuovo campionamento:
Allenamento/A tempo, precaricamento, Bernoulli indipendente, demo e sospensione
PvP sono preservati. Nessuna difficoltà preassegnata; eventuale futura misura
`error_rate = risposte_errate / risposte_valide` richiede campioni e incertezza
statistica, controllo delle risposte ripetute e una specifica successiva.

## Verifica locale senza OpenAI

```sh
python3 -m pipeline.batch .pipeline/lotto/manifest.json
python3 -m pipeline.batch .pipeline/lotto/manifest.json --simulate --out .pipeline/prova-batch
ROS_TEST_BATCH=1 npm run test:integration
```

Il piano non usa rete né scritture remote. `--simulate` usa esclusivamente fixture
esplicite; non dipende dalla chiave e non è mai una fallback dopo errori live.
L'integrazione usa Worker, D1 e R2 **locali isolati**, provider fittizio e import
reale nella coda locale. Non usare `ROS_TEST_BATCH` per un ambiente remoto.

## Primo avvio controllato dopo rilascio approvato

1. Backup D1/R2 e prova ripristino. Applicare 0011 prima del nuovo backend, con
   procedura di rilascio esistente approvata. Non eseguire seed su produzione.
   Test locale: `npm run db:migrate`; le 0011 sono additive e preservano i dati.
2. Verificare disponibilità Batch dei modelli, termini, licenze, quota e prezzi.
   Configurare i valori server e Actions separatamente; presenza di una chiave
   in Codex Cloud non implica presenza in GitHub. Mantenere cron disabilitato.
3. Configurare prezzi conservativi e tetto cumulativo 5 USD. Abilitare
   esplicitamente `ENABLE_EDITORIAL_PAID` in Worker e Actions e
   `ENABLE_AUTOMATIC_REVIEW_QUEUE` in Actions soltanto per l'esecuzione concordata.
4. In **Automatic private review queue**, `operation=start`, `reference_count=2`,
   `execute_paid=true`. Salvare il run ID `ros-<GITHUB_RUN_ID>`. Il workflow
   termina dopo l'invio; questo non significa che le immagini siano già pronte.
5. Usare `operation=status` per leggere lo stato salvato. Usare `operation=resume`
   con quel run ID per consultare OpenAI e raccogliere i risultati. Con
   `execute_paid=false` raccoglie/importa solo risultati già pagati e si ferma
   prima della fase successiva; con `true` può inviare la prossima fase entro i
   limiti. Ripetere senza riscaricare le fotografie. Un rerun Actions del medesimo
   run ID riprende il lotto, senza crearne un secondo.
6. Revisionare in `/admin`; verificare uso e ledger. Spegnere il gate per nuove
   richieste dopo la prova. Lettura, recupero e annullamento restano disponibili.
   Nessuna pubblicazione automatica; non aumentare il budget per completare quote.

Equivalenti CLI, solo su destinazione verificata dopo abilitazione esplicita:

```sh
python3 -m pipeline.batch .pipeline/lotto/manifest.json --start --execute --run-id prova-batch-01 --base https://WORKER-DI-TEST-VERIFICATO
python3 -m pipeline.batch --status prova-batch-01 --base https://WORKER-DI-TEST-VERIFICATO
python3 -m pipeline.batch --resume prova-batch-01 --base https://WORKER-DI-TEST-VERIFICATO
# La prossima chiamata può inviare una nuova fase a pagamento:
python3 -m pipeline.batch --resume prova-batch-01 --execute --base https://WORKER-DI-TEST-VERIFICATO
python3 -m pipeline.batch --cancel prova-batch-01 --base https://WORKER-DI-TEST-VERIFICATO
```

## Errori, annullamento e recupero

`--status` legge il checkpoint, senza polling provider. `--resume` controlla i job;
non è un nuovo avvio e non cambia configurazione, ranghi o prompt già congelati.
Mancanza di credenziali/configurazione, quota, API o storage interrompe il lavoro;
nessuna chiamata sostitutiva, punteggio inventato o pubblicazione.

`completed`, `expired` e `cancelled` vengono raccolti per `custom_id`; gli output
parziali validi sono conservati. Richieste mancanti/scartate non sono ricreate
per riempire il lotto. Una classifica con risultati parziali assegna soltanto
le fotografie effettivamente valutate e valide. Errori API o validazione
sospendono il run e richiedono una ripresa manuale; `--resume-all` salta i run
con errore salvato. I limiti giornalieri esistenti di registrazione/import possono
rinviare l'avanzamento delle coorti: conservare il checkpoint e riprendere senza
rigenerare un file accettato o alterare la data per aggirare il limite.

L'annullamento OpenAI è asincrono. Lo stato `cancel_pending` resta recuperabile:
riprendere per raccogliere gli eventuali risultati arrivati durante l'annullamento.
File e provenienza restano privati; non partono nuove valutazioni/generazioni e
le prenotazioni non sono rimborsate. Eventuali candidate già importate restano
in revisione, senza cancellazione retroattiva. La cancellazione non è pubblicazione.

Gli output OpenAI richiedono recupero tempestivo: scadenza richiesta 30 giorni;
non dipendere dal provider come archivio. Artifact Actions privati: sette giorni,
utili alla diagnosi, non necessari per riprendere un checkpoint completato in D1/R2.
Esiste una finestra prima del **primo** checkpoint remoto: se il processo termina
fra creazione run e primo salvataggio, recuperare il workspace originale; nessuna
chiamata pagata è stata ancora inviata. File R2 orfani da upload interrotto non
sono esposti o cancellati automaticamente; pulizia solo dopo verifica/backup.

Dopo 15 minuti senza rinnovo un lease scade; riprendere lo stesso ID. Non
modificare checkpoint, ledger o claim a mano per forzare un invio. Se un job
ambiguo non viene trovato nella ricerca limitata ai 1.000 job recenti, usare
`--adopt-batch-id` verificato; non creare un nuovo lotto equivalente.
