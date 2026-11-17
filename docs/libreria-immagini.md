# Libreria delle immagini, tag e analisi — specifica 4.1.0

Stato: vigente; la 3.8.1 è in produzione con l'app 1.30.1, la 3.9.0 è per l'app 1.30.2. Aggiornata: 2026-11-17T10:22:45Z. La 3.9.0 ammette nelle azioni
in gruppo la ripetizione confermata degli esiti incerti o interrotti (decisione dell'owner del 2026-11-15). La 3.8.1 corregge la
memoria usata per inviare l'originale e la ripetizione di un'analisi interrotta dalla dashboard.
La 3.8.0 fa analizzare REAL e SLOP intere (l'originale, non la copia 4:5: decisioni dell'owner del 2026-11-15) e aggiunge
l'analisi combinata in gruppo delle REAL senza descrizione. La 3.7.0 aggiunge il contesto «Valutazione delle SLOP», blocca brief e prompt finché il contesto in vigore è quello delle
gemelle (migrazione 0051) e riammette la ripetizione confermata di un'analisi con esito incerto.
La 3.1.0 registra la REAL di origine delle SLOP gemelle (migrazione 0049), il tetto di risposta dell'analisi e il contesto 1.8.0.
La 3.0.0 sostituisce la categoria Formato con Genere, Colore e Supporto, giudicate solo dall'immagine, e aggiunge il completamento a
pagamento di queste tre categorie per le immagini già analizzate (decisioni dell'owner del 2026-11-14, sezioni 4 e 5). La 2.0.0 è la
versione consolidata (riordino della documentazione dell'owner del 2026-11-14): riunisce
senza strati `libreria-immagini.v1.8.0`, `categorie-tag.v1.1.0` e le parti su libreria, tag e analisi di `database-immagini.v1.0.1`,
`didascalie-wizard.v1.0.0` e `anteprima-descrizione.v1.2.0`, che restano nella cronologia git. Regole di contenuto delle SLOP e
trasparenza: specifica `contenuti-e-trasparenza`. Copie di gioco: specifica `copie-di-gioco`.

**Stato del ramo 1.27.0:** implementata la pipeline della specifica `generazione-slop` 5.3.0; produzione ancora 1.26.0 fino al rilascio autorizzato.

## 1. Decisioni dell'owner

- La libreria si usa come il file system di un computer: inserire, modificare e cancellare devono essere rapidi (2026-11-09).
- Niente lotti, proposte o cicli: ogni immagine è indipendente (2026-11-09).
- Database in ordine, senza archivi storici: un'immagine eliminata dal cestino non lascia righe né file; nessun registro delle
  eliminazioni, nessuna istantanea, nessuna esportazione automatica (2026-11-09).
- Tag in inglese per i nomi comuni, nella lingua originale traslitterata per i nomi propri, senza accenti né spazi; un tag scritto a
  mano con forma errata si converte senza avviso (2026-11-09 e 2026-11-10).
- Una categoria per tag; parole specifiche per i termini ambigui, suffisso di categoria come ultima risorsa; è vietato solo il tag
  sull'origine dell'immagine (2026-11-10).
- L'analisi a pagamento genera i tag una sola volta per immagine e sostituisce quelli delle immagini scelte; i tag generati si
  ripristinano senza costi (2026-11-09).
- Niente prezzi né budget: ogni chiamata a pagamento si conferma e si registra senza importi; il limite di spesa è quello del progetto
  OpenAI (2026-11-10).
- Niente didascalie, né nel gioco né nella dashboard; quelle scritte sono state cancellate (2026-11-13).
- Una modifica lascia approvata un'immagine approvata; spostare nel cestino una pubblicata la ritira subito dal gioco (2026-11-11 e
  2026-11-13).
- I tag descrivono anche che tipo di fotografia è un'immagine (**Genere**), il suo colore (**Colore**) e che cosa è materialmente
  (**Supporto**: stampa, pagina di giornale, fotogramma di pellicola, foto digitale…). Sostituiscono la categoria Formato, che ammetteva
  un solo tag e lasciava posto a `color` o `black-and-white` e a nient'altro. Genere e decennio definiscono i gruppi con cui Database
  e Statistiche confrontano REAL e SLOP (2026-11-14).
- Genere, Colore e Supporto si giudicano **solo dall'immagine**, per tutte le immagini: l'analisi di una SLOP riceve il prompt, che
  dichiara ciò che si voleva e non ciò che il generatore ha prodotto (batch del 2026-11-14: «1960s» e `color` copiati dal prompt su
  immagini dall'aspetto digitale) (2026-11-14).
- Le immagini già analizzate ricevono Genere, Colore e Supporto con un **completamento a pagamento**, un'eccezione alla regola di una
  generazione per immagine, invece che a mano (2026-11-14).

## 2. Immagini

Una sola raccolta di immagini REAL e SLOP.

- **Ingresso.** Le REAL entrano dal wizard REAL (Wikimedia Commons, specifica `dashboard-admin-wizard-real`), le SLOP dallo studio
  e dai batch automatici (specifica `generazione-slop`). La sezione Database non carica file né cerca su Commons. Esiste ancora
  la rotta `POST /upload`, usata dai test.
- **Campi.** Origine, titolo (≤200 caratteri), descrizione (≤1000), spiegazione (≤2000, oggi non mostrata nel gioco), fonte, autore e
  licenza (REAL), prompt e modello (SLOP), tag con le categorie, stato, originale e copia di gioco, revisione per le modifiche
  concorrenti. Per una SLOP generata anche batch, REAL di origine, tag di partenza, REAL di riferimento e qualità della generazione.
- **Descrizione.** Per le REAL arriva da Commons (testo ripulito, al massimo 500 caratteri) e l'owner la corregge nel passo 2 del wizard
  o nella sezione Database. Il giocatore la legge nella lista di fine partita (specifica `gioco-a-livelli`). Entra anche nel
  contesto dell'analisi.
- **Limiti dei file.** JPEG, PNG o WebP fino a 12 MB e 32 megapixel; copia di gioco WebP fino a 4 MB.

## 3. Stati

`nuova` → `approvata` → `pubblicata`, più `cestino` (che ricorda lo stato di provenienza).

- **Approvare** (solo una nuova): copia di gioco in 4:5, almeno un tag e, per una REAL, la conferma di aver verificato
  diritti e licenza. Una REAL con licenza senza opere derivate (ND) è esclusa: il server rifiuta approvazione e pubblicazione.
- **Pubblicare** (solo un'approvata): la copia passa nel bucket del gioco ed entra nelle partite nuove.
- **Modificare.** Nuove e approvate si modificano direttamente, con salvataggio immediato; un'approvata resta approvata e deve
  conservare almeno un tag. Una pubblicata si modifica solo dopo «Modifica», che la ritira subito dal gioco (torna approvata); va poi
  ripubblicata. Le partite in corso continuano con la copia con cui sono iniziate.
- **Ritirare** una pubblicata: torna approvata. La copia lascia il bucket del gioco subito, oppure quando finisce l'ultima partita in
  corso che la usa (`retired_copies`).
- **Cestino.** Spostare nel cestino, da sola o in gruppo, non chiede conferma, tranne per le pubblicate, che escono subito dal gioco. Ripristinare riporta allo
  stato di provenienza; una SLOP non si ripristina se la REAL ha già una SLOP attiva o un processo in corso; una pubblicata torna approvata. «Svuota cestino» ed «Elimina definitivamente» cancellano ogni riga dell'immagine
  (tag, round, risposte) e ogni suo file; un'immagine ancora usata da una partita in corso si elimina quando la partita finisce.
- **Partita in corso:** in preparazione o attiva e iniziata da meno della durata massima delle Impostazioni (24 ore predefinite).
- Azioni in gruppo: fino a 500 immagini per volta.

## 4. Tag

- **Forma:** minuscoli, solo `a-z`, cifre e trattino singolo tra le parole, al massimo 40 caratteri; al massimo 40 tag per immagine.
  Nomi comuni in inglese (`riot`, `police-car`), nomi propri nella lingua originale traslitterata (`place-de-la-republique`, `munchen`).
  Vietati i tag che rivelano l'origine (`ai`, `generated`, `real`, `fake`, `midjourney`…) e il segnaposto `untagged`.
- **Conversione:** un tag scritto a mano con forma errata (maiuscole, accenti, spazi, punteggiatura) si converte e si salva senza avviso
  (`São Paulo` → `sao-paulo`). Il server resta rigido e accetta solo tag già conformi; la conversione avviene nel browser.
- **Categorie**, una per tag, lista fissa nel codice:

  | Id | Nome | Contenuto | Esempi |
  |---|---|---|---|
  | `time` | Tempo | solo decenni, formato `NNN0s`; al massimo uno per immagine | `1970s` |
  | `genre` | Genere | che tipo di fotografia è; al massimo uno per immagine | `mugshot`, `studio-portrait`, `crowd-scene` |
  | `color` | Colore | lista chiusa; al massimo uno per immagine | `color`, `black-and-white`, `sepia`, `hand-colored` |
  | `medium` | Supporto | che cosa è materialmente l'immagine; lista chiusa; al massimo uno per immagine | `newspaper-print`, `film-still` |
  | `place` | Luogo | nomi propri di luoghi, anche più d'uno | `paris`, `france` |
  | `setting` | Ambiente | tipi di luogo, ora, meteo, stagione | `street`, `night`, `rain` |
  | `event` | Evento | ciò che accade | `riot`, `parade` |
  | `people` | Persone | ruoli e gruppi, mai nomi | `firefighter`, `crowd` |
  | `object` | Oggetti e strutture | oggetti, veicoli, edifici, animali | `bridge`, `tram` |
  | `other` | Altro | il resto | |

  Un tag nel formato dei decenni appartiene sempre a Tempo. La categoria appartiene al tag: cambiarla vale per tutte le immagini che lo
  usano, con conferma.
- **Genere** (lista aperta): il tipo di fotografia, riconoscibile da inquadratura, posa e scopo, indipendente dal soggetto. Esempi:
  `mugshot`, `studio-portrait`, `group-portrait`, `snapshot`, `street-scene`, `crowd-scene`, `press-photo`, `aerial-view`, `landscape`,
  `architecture`, `interior`, `still-life`, `sports-action`, `stage-performance`, `ceremony`. Non dice che cosa accade (Evento) né
  dove (Luogo). Le varianti di un genere si uniscono con gli alias, perché frammentano i gruppi.
- **Colore** (lista chiusa nel codice): `color`, `black-and-white`, `sepia`, `hand-colored`.
- **Supporto** (lista chiusa nel codice): `photo-print`, `newspaper-print`, `magazine-print`, `postcard`, `slide`, `film-still`,
  `instant-photo`, `digital-photo`, `phone-photo`, `screen-capture`, `poster`, `painting`, `drawing`, `illustration`. Dice che cosa si vede
  materialmente: una pagina di giornale stampata a retino, un fotogramma di pellicola, una diapositiva, una foto digitale. Le marche e i
  tipi di pellicola restano fuori: dall'immagine non si riconoscono, e un tag che il modello non può verificare sarebbe inventato.
- Le proprietà continue dell'aspetto (risoluzione, rumore, nitidezza, contrasto, saturazione) non sono tag: le misura il codice
  (specifica `copie-di-gioco`, sezione 4).
- **Migrazione 0048:** la categoria `format` sparisce. `color`, `black-and-white`, `sepia` e `hand-colored` passano a Colore; gli altri
  tag di Formato passano a Supporto se sono nella lista, altrimenti ad Altro con un avviso nel vocabolario.
- **Parole ambigue:** si sceglie la parola con un solo significato (`house-fire` per l'evento, `flames` per l'oggetto,
  `construction-crane`); il suffisso di categoria (`fire-event`) lo crea solo l'owner, come ultima risorsa. Il nome di un tag è unico.
- **Vocabolario:** contiene solo tag in uso; un tag esce con l'ultima immagine che lo usa, insieme ai suoi alias.
- **Alias:** etichetta alternativa che rimanda a un tag e non si attacca mai a un'immagine; ogni tag, scritto o generato, passa per gli
  alias prima del salvataggio. «Unisci A in B» sposta immagini e alias di A su B, che conserva la sua categoria, e fa di A un alias.
- **Avvisi** non bloccanti: una REAL senza tag di Tempo; un'immagine senza Genere, Colore o Supporto (fuori dai gruppi).

## 5. Analisi a pagamento

Per una REAL l’unica analisi restituisce insieme `tags` e `real_description` (`visible`, `documented_context`, `uncertainties`), in una transazione con esito della chiamata. Il modello vede la REAL **intera**, cioè l’originale caricato (JPEG, PNG o WebP fino a 12 MB), mai il ritaglio 4:5 (decisione dell’owner del 2026-11-15). Modello, hash dell’originale, revisione e data sono conservati come provenienza. La descrizione è privata, modificabile senza alterare tag o testo Commons; quest’ultimo è conservato separatamente per le nuove acquisizioni. Per una SLOP l’analisi restituisce soltanto tag, anch’essa sull’originale intero.

Una REAL storica senza descrizione resta utilizzabile nel catalogo; la nuova generazione richiede compilazione manuale o una nuova analisi combinata confermata (`refresh_description:true`), anche se già approvata/pubblicata. Nessun backfill. L'analisi combinata si lancia dalla scheda o in gruppo dal Database (filtro «REAL senza descrizione», azione «Analisi combinata tag e descrizione»), con conferma del numero massimo di chiamate, una per foto; le immagini con esito incerto o interrotto sono incluse e la conferma le nomina. La modifica della sola descrizione privata non ritira una pubblicata.

- Su richiesta dell'owner (wizard, dettaglio o gruppo nel Database, studio SLOP), solo per immagini nuove. Il modello di testo scelto
  nelle Impostazioni, che deve leggere immagini, riceve l'originale intero (vede i pixel, non i metadati del file) con titolo e
  descrizione (REAL) o con il prompt (SLOP)
  e i 300 tag più usati divisi per categoria; mai l'origine. La base comune e la parte «Tag» si applicano ad entrambe
  senza menzionare immagini sintetiche; **per le REAL** si richiede in più la descrizione editoriale neutra, **per le SLOP**
  rimane l'output dei soli tag. Schemi diversi per tipo non devono introdurre istruzioni che rivelino la natura dell'altra categoria.
- Risposta JSON con schema rigido: da 5 a 15 tag divisi per categoria, al massimo uno di Tempo; esattamente un Genere, un Colore e un
  Supporto, questi ultimi due tra i valori della lista chiusa (enumerazione nello schema). I tag vengono resi conformi, risolti per alias
  e **sostituiscono** quelli presenti. Un tag proposto in una categoria diversa da quella del vocabolario mantiene la categoria del
  vocabolario e il conflitto viene segnalato all'owner.
- **Tetto di risposta:** 8000 token (app 1.26.0). Con 2000, che comprendono il ragionamento del modello, un'analisi su dieci del primo
  lotto automatico è tornata troncata («Risposta del modello non leggibile»): pagata e persa.
- **Solo dall'immagine.** Una riga fissa nel codice, aggiunta alle istruzioni di ogni analisi, chiede di giudicare Genere, Colore e
  Supporto soltanto da ciò che si vede nell'immagine, mai da titolo, descrizione o altro testo. Vale per REAL e SLOP allo stesso modo e
  non parla di immagini generate.
- **Completamento di Genere, Colore e Supporto** (eccezione alla regola seguente, decisione dell'owner del 2026-11-14): per le immagini
  fuori dal cestino che hanno già un'analisi riuscita e non hanno ancora tutte e tre le categorie. Dal Database, su una o più immagini
  (azione in gruppo), con conferma esplicita del numero di chiamate: una chiamata a pagamento per immagine, con la stessa immagine dell'analisi e le
  stesse istruzioni dell'analisi, che restituisce solo le tre categorie. Sostituisce i tag di quelle tre categorie e lascia gli altri.
  Non ritira le pubblicate, perché non cambia nulla di ciò che vede il giocatore. Una sola volta per immagine (`categories_completed_at`);
  registrata in `paid_calls` come analisi.
- **Una generazione per immagine:** dopo un esito riuscito il server rifiuta un'altra analisi. I tag generati restano nel database
  e «Ripristina i tag generati» li riporta senza costi. Fanno eccezione l’analisi combinata confermata di una REAL storica senza descrizione e una nuova SLOP accettata da un nuovo processo.
- Una sola analisi alla volta per immagine; un segno interrotto resta sospeso e viene marcato incerto dalla manutenzione.
- **Esito incerto o segno interrotto** (più di dieci minuti): mai ripetuto in automatico. Dalla scheda dell'immagine, o in gruppo dal
  Database e dal wizard, l'owner può ripeterlo con una conferma che lo nomina e avverte del possibile addebito già avvenuto; un'analisi
  ancora in corso da meno di dieci minuti resta esclusa. La richiesta porta
  `repeat_uncertain: true`, senza la quale il server rifiuta. La chiamata pendente dell'analisi interrotta passa a `uncertain`.
  La dashboard tratta allo stesso modo un'analisi ancora «in corso» dopo dieci minuti: la mostra come interrotta e offre la
  ripetizione con l'avviso.
- **Invio dell'immagine:** l'originale va al modello come data URL base64 scritta direttamente nei byte della richiesta, senza
  copie in stringhe JavaScript. Il 2026-11-15 cinque analisi di fila su originali da 2 a 6 MB hanno superato il limite di memoria
  del Worker (128 MB, «exceededResources») dopo aver registrato la chiamata: restavano «in corso». Con la nuova codifica la memoria
  aggiuntiva per un originale di 6,7 MB scende da circa 87 a circa 9 MB (misura locale con Node). Vale anche per la valutazione delle SLOP.

## 6. Chiamate a pagamento e modelli

- Quattro tipi: analisi, brief+prompt SLOP, immagini SLOP, valutazione SLOP intera. Ognuna richiede una **conferma esplicita** (`confirm: true`), senza importi.
- **Esiti:** risposta valida → `completed`; errore 4xx → `failed`, senza addebito; errore 5xx, timeout o rete → `uncertain`, mai
  ripetuta in automatico. Chiave rifiutata, limite di spesa o credito OpenAI esaurito fermano le serie con un messaggio che rimanda a
  platform.openai.com.
- **Registro** `paid_calls`: tipo, modello, esito, token, date; nessun importo e collegamenti a immagine, processo e tentativo, azzerati alla cancellazione; nessun archivio delle immagini eliminate.
- **Modelli:** modello di testo (analisi, brief+prompt e valutazione SLOP), modello di immagini e sua qualità si scelgono nelle Impostazioni, tra quelli
  elencati nel codice e presenti nel progetto OpenAI (`GET /v1/models`, in cache per un'ora; se l'elenco non si legge si offrono tutti).
  Ogni chiamata registra il modello usato.
- Senza il segreto `OPENAI_API_KEY` le chiamate a pagamento sono spente. Nei test solo il modello finto `tests/fake_openai.py`.

## 7. Contesto dei modelli

- Quattro testi modificabili dalle Impostazioni, fino a 4000 caratteri ciascuno: **base comune** (ogni chiamata: lingua, fatti, regole
  dei tag; non parla mai di immagini generate), **Tag** (con la base a ogni analisi), **Brief e prompt per le SLOP** (con la base alla
  chiamata che scrive brief e prompt, con le regole della specifica `contenuti-e-trasparenza`), **Valutazione delle SLOP** (con la base
  a ogni valutazione di una candidata intera; dall'app 1.28.0, prima era fisso nel codice).
- **Pipeline di un testo** (migrazione 0051): ogni versione registra la pipeline SLOP per cui è stata salvata. Le versioni salvate
  prima del rilascio della 1.27.0 (2026-11-15T15:10:12Z) valgono 1: il «Prompt per le SLOP» di allora descrive le gemelle e
  contraddice il brief editoriale. Finché il testo in vigore di «Brief e prompt per le SLOP» è di pipeline 1, il server non invia la
  chiamata di brief e prompt e le Impostazioni lo segnalano; salvare una versione (la proposta o un testo dell'owner) la sblocca.
  Ripristinare una versione ne conserva la pipeline.
- Ogni salvataggio di un testo diverso crea una versione datata; ripristinarne una vecchia crea una nuova versione con lo stesso testo.
  Ogni analisi registra le versioni usate.
- Il codice propone un testo (`DEFAULTS` del modulo del contesto) che le Impostazioni mostrano accanto a quello in vigore finché è
  diverso; diventa una versione solo quando l'owner lo salva. Un database nuovo parte dalla proposta.
- Restano nel codice, qualunque cosa dicano i testi: formato JSON e schema delle risposte, conversione e filtri dei tag, limiti, le
  liste chiuse di Colore e Supporto, la regola «solo dall'immagine», la lunghezza chiesta ai prompt SLOP e, per il valutatore,
  decisioni ammesse, significato della tolleranza, rifiuto dei difetti critici e conservazione letterale di ancoraggi ed esclusioni.
- Proposte del codice: con l'app 1.25.0 la base e la parte «Tag» con Genere, Colore e Supporto (contesto 1.7.0, salvato in produzione
  il 2026-11-14); con l'app 1.26.0 il «Prompt per le SLOP» delle gemelle (contesto 1.8.0); con l'app 1.27.0 «Brief e prompt per le
  SLOP» della pipeline editoriale e con la 1.28.0 «Valutazione delle SLOP» (contesto 1.9.0). In produzione il 2026-11-15 è ancora in
  vigore il testo delle gemelle del 2026-11-14: va salvata la proposta prima di generare.

## 8. Dati

- D1: `images`, `tags`, `image_tags`, `tag_aliases`, `paid_calls`, `model_contexts`, `app_settings`, `slop_batches`,
  `slop_reference_uses`, `slop_processes`, `slop_attempts`, `retired_copies`, tabelle del gioco (`game_sessions`, `game_rounds`, `answers`, `media_events`,
  `leaderboard`, `rate_limits`). Elenco delle migrazioni in `MASTER.md`.
- Migrazione 0048 (`images`): `categories_completed_at` (completamento delle tre categorie), `copy_metrics` (misure della copia di
  gioco) e `copy_treatment` (trattamento di una SLOP), specifica `copie-di-gioco`, sezione 4; `generation_group`, oggi inutilizzata.
- Migrazione 0053: rimuove `generation_source` e `source_id`, anonimizza slot e trattamento e preserva tentativi e chiamate. La migrazione storica 0049 aveva introdotto il legame, poi eliminato. La 0055 introduce il solo registro privato di disponibilità `slop_reference_uses` per le nuove generazioni: madre occupata finché la figlia esiste in qualsiasi stato; eliminare definitivamente la figlia libera la madre. Nessun legame viene inferito per le generazioni pregresse. La disponibilità non interviene nel campionamento del gioco.
- Colonne inutilizzate, lasciate per non ricostruire le tabelle: `caption`, `generated_caption` (`images`), `caption` e `copy_view`
  (`game_rounds`), `copy_view` (`images`).
- R2: quarantena privata (`library/<id>/`: originale e copia) e bucket del gioco (copie pubblicate).
- Le statistiche di un'immagine (visualizzazioni e classificazioni corrette) contano solo i round giocati con la copia attuale.

Migrazione 0050: descrizioni e provenienza, contesto Commons originale, `slop_processes` e `slop_attempts`, collegamenti del registro `paid_calls`, versione/snapshot del batch. Nessuna conversione o chiamata sulle REAL storiche.
Migrazione 0051 (`model_contexts`): parte `slop_evaluation` e colonna `pipeline` (sezione 7); testi, date e identificativi conservati.

