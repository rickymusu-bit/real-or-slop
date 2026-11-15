# Libreria delle immagini, tag e analisi — specifica 3.3.0

Stato: vigente; la 3.0.0 è in produzione con l'app 1.25.0, la 3.1.0 è in produzione con l'app 1.26.0. Aggiornata: 2026-11-15T11:08:00Z.
La 3.1.0 registra la REAL di origine delle SLOP gemelle (migrazione 0049), il tetto di risposta dell'analisi e il contesto 1.8.0.
La 3.0.0 sostituisce la categoria Formato con Genere, Colore e Supporto, giudicate solo dall'immagine, e aggiunge il completamento a
pagamento di queste tre categorie per le immagini già analizzate (decisioni dell'owner del 2026-11-14, sezioni 4 e 5). La 2.0.0 è la
versione consolidata (riordino della documentazione dell'owner del 2026-11-14): riunisce
senza strati `libreria-immagini.v1.8.0`, `categorie-tag.v1.1.0` e le parti su libreria, tag e analisi di `database-immagini.v1.0.1`,
`didascalie-wizard.v1.0.0` e `anteprima-descrizione.v1.2.0`, che restano nella cronologia git. Regole di contenuto delle SLOP e
trasparenza: specifica `contenuti-e-trasparenza`. Copie di gioco: specifica `copie-di-gioco`.

**Decisioni dell'owner del 2026-11-15, da implementare** (issue #136, aggiornata dalla specifica `generazione-slop` 5.0.0).
Fino al rilascio il resto di questa specifica descrive il comportamento dell'app 1.26.0: queste decisioni non sono ancora codice.
Chi implementa aggiorna tutte le sezioni interessate e toglie questo riquadro.

- **Descrizione visiva delle REAL:** un nuovo campo della REAL (`visual_description`, con modello e data), scritto da una chiamata a
  pagamento che guarda la copia di gioco, modificabile dall'owner; è l'ingresso del prompt della gemella (specifica
  `generazione-slop`, sezioni 3 e 4). Non è una didascalia: non compare mai nel gioco.
- **Chiamate a pagamento:** aggiungere `description` e `evaluation` alle chiamate di analisi, prompt e immagini. Ogni tentativo
  genera una candidata e la valuta; registrazione preventiva e nessun retry automatico di esiti incerti. La conferma comunica il
  **massimo possibile**, non un numero esatto, perché il loop può fermarsi prima.
- **Contesto dei modelli:** una quarta parte, «Descrizione delle REAL», con versioni e ripristino come le altre; proposte del codice
  1.9.0 per questa parte e per «Prompt per le SLOP».
- **Modelli predefiniti:** `gpt-6.1-sol` per il testo (deve leggere immagini), `gpt-image-2.5-flare` in qualità `high` per le immagini.
- **Campi di una SLOP generata:** REAL di riferimento, ancoraggi del brief editoriale, prompt finale, qualità, valutazione
  positiva e riepilogo dei tentativi; niente REAL campione né `change` obbligatorio. I tentativi rifiutati sono privati e
  temporanei, **non** immagini della libreria. Tag assegnati sulla candidata effettivamente accettata.
- **Stati:** approvare e pubblicare richiedono una copia di gioco 4:5 (specifica `copie-di-gioco`). Accettazione del loop
  crea un'immagine `new`: non equivale né all'approvazione né alla pubblicazione. 
- **Impostazioni:** limite massimo di tentativi (1–5, predefinito 3) e tolleranza qualitativa distinti; snapshot nel processo
  prima di inviare le chiamate. L'aumento dei tentativi non è una difficoltà misurata del gioco.

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
  concorrenti. Per una SLOP generata anche batch, REAL di origine, tag di partenza, REAL campione e qualità della generazione.
- **Descrizione.** Per le REAL arriva da Commons (testo ripulito, al massimo 500 caratteri) e l'owner la corregge nel passo 2 del wizard
  o nella sezione Database. Il giocatore la legge nella lista di fine partita (specifica `gioco-a-livelli`). Entra anche nel
  contesto dell'analisi.
- **Limiti dei file.** JPEG, PNG o WebP fino a 12 MB e 32 megapixel; copia di gioco WebP fino a 4 MB.

## 3. Stati

`nuova` → `approvata` → `pubblicata`, più `cestino` (che ricorda lo stato di provenienza).

- **Approvare** (solo una nuova): copia di gioco nel formato della foto, almeno un tag e, per una REAL, la conferma di aver verificato
  diritti e licenza. Una REAL con licenza senza opere derivate (ND) è esclusa: il server rifiuta approvazione e pubblicazione.
- **Pubblicare** (solo un'approvata): la copia passa nel bucket del gioco ed entra nelle partite nuove.
- **Modificare.** Nuove e approvate si modificano direttamente, con salvataggio immediato; un'approvata resta approvata e deve
  conservare almeno un tag. Una pubblicata si modifica solo dopo «Modifica», che la ritira subito dal gioco (torna approvata); va poi
  ripubblicata. Le partite in corso continuano con la copia con cui sono iniziate.
- **Ritirare** una pubblicata: torna approvata. La copia lascia il bucket del gioco subito, oppure quando finisce l'ultima partita in
  corso che la usa (`retired_copies`).
- **Cestino.** Spostare nel cestino, da sola o in gruppo, non chiede conferma, tranne per le pubblicate, che escono subito dal gioco. Ripristinare riporta allo
  stato di provenienza; una pubblicata torna approvata. «Svuota cestino» ed «Elimina definitivamente» cancellano ogni riga dell'immagine
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
  tipi di pellicola restano fuori: dalla copia di gioco non si riconoscono, e un tag che il modello non può verificare sarebbe inventato.
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

- Su richiesta dell'owner (wizard, dettaglio o gruppo nel Database, studio SLOP), solo per immagini nuove con copia di gioco. Il modello
  di testo scelto nelle Impostazioni, che deve leggere immagini, riceve la copia di gioco, titolo e descrizione (REAL) o il prompt (SLOP)
  e i 300 tag più usati divisi per categoria; mai l'origine. Istruzioni identiche per REAL e SLOP: base comune e parte «Tag» del
  contesto dei modelli (sezione 7).
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
  (azione in gruppo), con conferma esplicita del numero di chiamate: una chiamata a pagamento per immagine, con la copia di gioco e le
  stesse istruzioni dell'analisi, che restituisce solo le tre categorie. Sostituisce i tag di quelle tre categorie e lascia gli altri.
  Non ritira le pubblicate, perché non cambia nulla di ciò che vede il giocatore. Una sola volta per immagine (`categories_completed_at`);
  registrata in `paid_calls` come analisi.
- **Una generazione per immagine:** dopo un esito riuscito il server rifiuta un'altra analisi. I tag generati restano nel database
  e «Ripristina i tag generati» li riporta senza costi. Fa eccezione la rigenerazione di una SLOP, che è un'immagine nuova.
- Una sola analisi alla volta per immagine; un segno «in corso» più vecchio di 10 minuti non blocca più.

## 6. Chiamate a pagamento e modelli

- Tre tipi: analisi, prompt SLOP, immagini SLOP. Ognuna richiede una **conferma esplicita** (`confirm: true`), senza importi.
- **Esiti:** risposta valida → `completed`; errore 4xx → `failed`, senza addebito; errore 5xx, timeout o rete → `uncertain`, mai
  ripetuta in automatico. Chiave rifiutata, limite di spesa o credito OpenAI esaurito fermano le serie con un messaggio che rimanda a
  platform.openai.com.
- **Registro** `paid_calls`: tipo, modello, esito, token, date; nessun importo e nessun legame con le immagini.
- **Modelli:** modello di testo (analisi e prompt SLOP), modello di immagini e sua qualità si scelgono nelle Impostazioni, tra quelli
  elencati nel codice e presenti nel progetto OpenAI (`GET /v1/models`, in cache per un'ora; se l'elenco non si legge si offrono tutti).
  Ogni chiamata registra il modello usato.
- Senza il segreto `OPENAI_API_KEY` le chiamate a pagamento sono spente. Nei test solo il modello finto `tests/fake_openai.py`.

## 7. Contesto dei modelli

- Tre testi modificabili dalle Impostazioni, fino a 4000 caratteri ciascuno: **base comune** (ogni chiamata: lingua, fatti, regole dei
  tag; non parla mai di immagini generate), **Tag** (con la base a ogni analisi), **Prompt per le SLOP** (con la base alla scrittura dei
  prompt, con le regole della specifica `contenuti-e-trasparenza`).
- Ogni salvataggio di un testo diverso crea una versione datata; ripristinarne una vecchia crea una nuova versione con lo stesso testo.
  Ogni analisi registra le versioni usate.
- Il codice propone un testo (`DEFAULTS` del modulo del contesto) che le Impostazioni mostrano accanto a quello in vigore finché è
  diverso; diventa una versione solo quando l'owner lo salva. Un database nuovo parte dalla proposta.
- Restano nel codice, qualunque cosa dicano i testi: formato JSON e schema delle risposte, conversione e filtri dei tag, limiti, le
  liste chiuse di Colore e Supporto, la regola «solo dall'immagine» e la lunghezza chiesta ai prompt SLOP.
- Proposte del codice: con l'app 1.25.0 la base e la parte «Tag» con Genere, Colore e Supporto (contesto 1.7.0, salvato in produzione
  il 2026-11-14); con l'app 1.26.0 il «Prompt per le SLOP» delle gemelle (contesto 1.8.0, specifica `generazione-slop`, sezione 4),
  da salvare dalle Impostazioni.

## 8. Dati

- D1: `images`, `tags`, `image_tags`, `tag_aliases`, `paid_calls`, `model_contexts`, `app_settings`, `slop_batches`,
  `slop_proposal_ignored`, `retired_copies`, tabelle del gioco (`game_sessions`, `game_rounds`, `answers`, `media_events`,
  `leaderboard`, `rate_limits`). Elenco delle migrazioni in `MASTER.md`.
- Migrazione 0048 (`images`): `categories_completed_at` (completamento delle tre categorie), `copy_metrics` (misure della copia di
  gioco) e `copy_treatment` (trattamento di una SLOP), specifica `copie-di-gioco`, sezione 4; `generation_group`, oggi inutilizzata.
- Migrazione 0049 (`images`): `generation_source`, la REAL di cui una SLOP è la gemella (specifica `generazione-slop`).
- Colonne inutilizzate, lasciate per non ricostruire le tabelle: `caption`, `generated_caption` (`images`), `caption` e `copy_view`
  (`game_rounds`), `copy_view` (`images`).
- R2: quarantena privata (`library/<id>/`: originale e copia) e bucket del gioco (copie pubblicate).
- Le statistiche di un'immagine (visualizzazioni e classificazioni corrette) contano solo i round giocati con la copia attuale.
