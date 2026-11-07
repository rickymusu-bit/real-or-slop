# Ciclo editoriale completo — 1.0.0

Aggiornato: 2026-11-06T21:54:11Z. Specifica del delta richiesto dal proprietario nella sessione corrente.

## Decisioni prima dell'implementazione

| Fonte e stato | Decisione | Impatto e verifica |
| --- | --- | --- |
| Richiesta corrente: casella → brief → ricerca → voto REAL → SLOP → voto → pubblicazione | Per i nuovi cicli il brief condiviso e la banca dei prompt SLOP sono obbligatori e congelati prima del retrieval | Nuovo orchestratore; lettori e run REAL storici invariati; test di freeze e contaminazione |
| #56 / ricerca-real 1.0.0: brief opzionale e flussi separati | Rimane valida per la discovery isolata; il ciclo completo compone i moduli già presenti | Nessuna conversione retroattiva dei cinque dossier del pilota |
| Coda unica: voto personale distinto da diritti e pubblicazione | Il sito è l'unica autorità dei voti. L'ammissione richiede conferme documentali esplicite, senza secondo voto visivo | Test di SHA, revisioni, concorrenza, diritti mancanti e idempotenza |
| Bilancio richiesto dal proprietario | Bilanciare il catalogo pubblicato, non l'archivio. Dopo 10 REAL e 7 SLOP approvate, pubblicare 7+7 e conservare 3 REAL in attesa | Test di deficit, pending, rigenerazione limitata e pubblicazione atomica |
| Rifiuti SLOP | Usare varianti congelate non ancora tentate; contare anche le SLOP pending per non sovraprodurre; errori incerti bloccano il reinvio | Test di timeout, crash, deduplica e limiti monetari/tentativi |
| Feedback sito assente nel collector | Importare eventi immutabili legati ai pixel; distinguere REAL, SLOP e guasti tecnici | Prior REAL e SLOP distinti (85%/15%); i rifiuti esplicitamente tecnici, del generatore o dei diritti restano diagnostici |
| Vecchi esecutori e dati | Conservare gli esecutori storici e i loro audit; nessuna cancellazione o migrazione distruttiva | Suite di regressione esistente |

Il nuovo codice non autorizza inferenze aggiuntive a pagamento né voti al posto del proprietario.

## Comportamento e confini

Il punto d'ingresso completo è `python3 -m pipeline.cycle` (`npm run editorial:cycle -- …`).
`pipeline.real.workflow` resta disponibile come discovery isolata e per riprendere
run storici. Il nuovo percorso riusa i suoi moduli, senza migrare checkpoint.

1. `start` seleziona o riceve la casella e congela configurazione, modelli e limiti.
2. Con `--execute`, GPT produce brief, strategie generali e banca di 1–32 prompt.
   Il freeze e la ricevuta precedono adattamento ai provider e ogni retrieval.
3. `--live` abilita HTTP e download limitati. Le copie tecniche acquisite entrano
   pending nella coda unica con `--sync-inbox`, anche con dossier incompleti.
   Non vengono inventati revisore, conferme dei diritti, autenticità o profili.
   I file non fotografici o troppo grandi restano registrati come errori tecnici.
4. Ogni ripresa legge voti e revisioni effettivi dal sito, verifica i byte esposti,
   conserva gli eventi immutabili e conta solo giudizi sui pixel correnti.
   Le immagini già assegnate a un altro ciclo sono escluse dal nuovo target anche
   prima dell’ammissione documentale; i loro voti restano conservati senza
   riutilizzarne la capacità o alterare la resa della nuova casella.
5. Approvazioni REAL stabiliscono il target. SLOP approvate e pending occupano
   capacità; una SLOP rifiutata apre un deficit. Ogni richiesta usa il successivo
   prompt congelato inutilizzato e produce un solo file. Nessun dato REAL entra
   nella richiesta al generatore. Le approvazioni vengono rilette tra le richieste.
6. Le nuove SLOP e i loro originali sono archiviati e consegnati pending alla
   stessa coda, senza dipendere da un punteggio automatico. SHA duplicati non
   diventano più immagini: consumano comunque un tentativo.
7. La verifica di origine e licenza si completa separatamente nella scheda
   approvata del sito. Conferme esplicite, categorie, autore, fonte, prove e
   spiegazione sono obbligatorie per l'ammissione. Non serve ripetere il voto
   visivo. SLOP richiede anche dichiarazione, prompt congelato e ricevuta.
8. La pubblicazione esplicita del ciclo sceglie `min(REAL, SLOP)` fra le immagini
   ammesse e ancora non pubblicate. Selezione e inserimento sono atomici e
   soggetti ai trigger preesistenti. Le eccedenze restano in attesa. Il publisher
   legacy conserva il proprio archivio e non consuma le nuove ammissioni.

Nessuna coppia individuale è obbligatoria. Il catalogo attivo rimane bilanciato,
l'archivio e le code possono essere sbilanciati. Non si cancellano rifiuti né si
revocano approvazioni per far tornare i conti. Il gioco mantiene monete REAL/AI
indipendenti 50/50. Dopo la pubblicazione i voti associati sono immutabili come
l'identità del catalogo; nessuna rimozione automatica può rompere il bilanciamento.

Il feedback conserva origine, revisioni e note. Per il campionamento della casella
usa prior separati: 85% resa editoriale REAL e 15% resa editoriale SLOP, con floor
di esplorazione positivo e prior regolarizzati. Lo storico precedente senza SLOP
mantiene il peso originale. I motivi espliciti `generation`, `technical`, `rights`
non contano come rifiuti editoriali; rimangono negli eventi e nei dossier.
I voti superati da pixel nuovi tornano pending. Anche i rifiuti poi eliminati
esplicitamente dal sito restano leggibili attraverso registro ed eventi storici.

## Esecuzione

Esempio senza effetti esterni e senza spesa (i nomi modello immagine sono da
configurare con il modello effettivamente autorizzato):

```sh
python3 -m pipeline.cycle start --out .pipeline/editorial-cycle/example \
  --run-id example --model gpt-6.1-terra --provider commons \
  --topic animals --emotion compassion --intensity medium
python3 -m pipeline.cycle status --out .pipeline/editorial-cycle/example
```

`resume --execute --live --sync-inbox --base URL_RADICE` avanza solo gli stadi
abilitati. `watch` usa gli stessi argomenti e rilegge la coda ogni 15 secondi per
massimo 120 poll; `--poll-seconds` è limitato a 1–60 e `--max-polls` a 1–10000.
Rilascia il lock tra i poll e si ferma sui limiti, errori e attese documentali.
È un processo CLI da avviare esplicitamente, non un cron o un job remoto installato.
Senza quel processo o una ripresa esplicita il voto sul sito non lancia inferenze.

Prima di `start` per un run pagato configurare `--image-model`, `--max-attempts`,
`--generation-usd`, `--generation-budget-usd` e qualità. Budget zero per default.
I limiti non sono modificabili dopo il freeze: servono nuovi run, non aumenti
silenziosi. Autore/licenza SLOP sono opzionali prima della revisione, mai dedotti
come CC0; devono essere verificati esplicitamente prima della pubblicazione.

I due gate client/server per il testo sono `ENABLE_REAL_DISCOVERY_PAID=true`.
Il generatore richiede inoltre `ENABLE_EDITORIAL_CYCLE_GENERATION=true` sui due
lati, `EDITORIAL_CYCLE_IMAGE_MODEL`, `EDITORIAL_CYCLE_GENERATION_USD` e
`EDITORIAL_CYCLE_MAX_GENERATIONS` (1–32) sul server. Il testo usa modello/stima
REAL configurati: la stima conservativa deve coprire anche il brief fino a
12000 token in uscita. Run, giorno e totale usano lo stesso ledger `editorial_usage`
e gli stessi limiti `REAL_DISCOVERY_*`, includendo testo e immagini. La prenotazione
è atomica e non rimborsa errori o rifiuti. Un ID di prenotazione già presente
blocca il reinvio. Non memorizzare chiavi nelle configurazioni del run.

Testi, generazioni e pubblicazione richiedono l'admin token dell'app per le API
autenticate. La sola consegna/lettura della coda usa il percorso Cloudflare già
configurato e non richiede quel token. Non ruotare token e non attivare gate remoti
solo perché il codice è disponibile.

Per il catalogo: `--admissions FILE` invia una lista di attestazioni esplicite
all'endpoint `/api/admin/editorial/cycle/admit`; `--publish` pubblica il solo
ciclo corrente. Gli stessi passaggi sono disponibili nelle schede approvate e
nella sezione «Pubblicazione del ciclo» di `/admin`. La richiesta di ammissione
contiene `inbox_id`, `revision`, `sha256`, `rights_confirmed`,
`authenticity_confirmed`, titolo, autore, fonte, licenza, prove, spiegazione,
categorie e, per AI, `owner_declaration`. Le conferme non hanno default true.

## Recupero e rilascio

Ricevute `prepared`, `reserving`, `submitting`, `received`, `completed`, `uncertain`
o `invalid` sono persistite prima degli effetti corrispondenti. Una risposta
`received` può essere riconvertita senza chiamare il modello. Uno stato incerto
ferma il ciclo e richiede verifica della ricevuta: non si cambia lo slot per
aggirarlo. Gli originali decodificabili e le risposte del provider restano privati
anche se la conversione fallisce. Un'interruzione prima dell'upload viene
recuperata alla ripresa dall'originale e dalla ricevuta completata.

La migrazione additiva `0018_editorial_cycle_admission.sql` aggiunge soltanto audit,
view e trigger per il collegamento tra coda e catalogo. Nessun backfill automatico,
nessun voto inventato, nessuna riscrittura degli archivi. Deve precedere il deploy
che ne legge le view. Verificare e applicare solo migrazioni pendenti dopo backup
D1; il comando di deploy deve conservare i vars remoti. Non cambiare `DATA_MODE`,
cron, gate o budget durante questo rilascio. In modalità demo il gioco continua
ad usare il proprio pool demo anche se esistono pubblicazioni REAL/SLOP non demo.

Il pilota preesistente mantiene i suoi cinque dossier e voti: non è convertibile
retroattivamente a un brief che avrebbe dovuto precedere la ricerca. I nuovi
cicli partono da una nuova cartella. Commons è il provider predefinito; il supporto
Openverse resta disponibile, ma il blocco di accesso documentato non è risolto
con questo delta. Nessuna vecchia pipeline è cancellata.


## Verifiche e sequenza di attivazione

Le prove automatiche aggiunte coprono discovery fittizia → copie non attestate →
coda locale → voti → generazione, il caso 10 REAL / 7 SLOP con tre sostituzioni,
limiti di spesa/tentativi, voti revocati, pixel cambiati, recupero dopo crash,
rifiuti eliminati, storico e polling limitato. Le integrazioni Worker/D1/R2
provano ammissioni concorrenti idempotenti, diritti mancanti, doppia pubblicazione
bilanciata, eccedenze e impossibilità di modificare voti già pubblicati. Il nuovo
profilo `ROS_TEST_CYCLE=1` verifica prenotazioni testo/immagini concorrenti e limiti
cumulativi con zero chiamate al provider. Le suite storiche restano nella CI.

La lettura remota durante questo lavoro ha confermato migrazioni 0001–0017 e
assenza di `editorial_cycle_admissions`; nessuna mutazione remota è stata eseguita.
Prima dell'attivazione, ricontrollare main e migrazioni pendenti. La sequenza
concreta da autorizzare, dopo Checks verdi sulla PR, è:

```sh
# Backup privato prima della sola migrazione additiva 0018.
umask 077
mkdir -p .pipeline/releases/editorial-cycle/v1.0.0
npx wrangler d1 export DB --remote   --output .pipeline/releases/editorial-cycle/v1.0.0/d1-before-0018.sql
npx wrangler d1 migrations list DB --remote
npx wrangler d1 migrations apply DB --remote
# Poi integrazione della PR: Workers Builds esegue il deploy da main.
# Verifica health, nuovi endpoint privati e conservazione di righe/voti/hash.
```

Se risultano migrazioni diverse da 0018 ancora pendenti, fermare questa sequenza
per esaminarle. Il rollout non cambia variabili remote, modalità demo, cron,
credenziali o budget e non esegue un nuovo pilota a pagamento. Un rollback del
codice può conservare questa aggiunta di schema; non cancellare audit o ripristinare
un intero DB per annullare una semplice release applicativa.
