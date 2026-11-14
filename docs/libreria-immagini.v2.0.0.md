# Libreria delle immagini, tag e analisi — specifica 2.0.0

Stato: vigente. Aggiornata: 2026-11-14T12:00:00Z. Versione consolidata (riordino della documentazione dell'owner del 2026-11-14): riunisce
senza strati `libreria-immagini.v1.8.0`, `categorie-tag.v1.1.0` e le parti su libreria, tag e analisi di `database-immagini.v1.0.1`,
`didascalie-wizard.v1.0.0` e `anteprima-descrizione.v1.2.0`, che restano nella cronologia git. Regole di contenuto delle SLOP e
trasparenza: specifica `contenuti-e-trasparenza`. Copie di gioco: specifica `copie-di-gioco`.

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

## 2. Immagini

Una sola raccolta di immagini REAL e SLOP.

- **Ingresso.** Le REAL entrano dal wizard REAL (Wikimedia Commons, specifica `dashboard-admin-wizard-real`), le SLOP dallo studio
  e dai batch automatici (specifica `generazione-slop`). La sezione Database non carica file né cerca su Commons. Esiste ancora
  la rotta `POST /upload`, usata dai test.
- **Campi.** Origine, titolo (≤200 caratteri), descrizione (≤1000), spiegazione (≤2000, oggi non mostrata nel gioco), fonte, autore e
  licenza (REAL), prompt e modello (SLOP), tag con le categorie, stato, originale e copia di gioco, revisione per le modifiche
  concorrenti. Per una SLOP generata anche gruppo, slot (tema e tag di partenza) e qualità della generazione.
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
  | `format` | Formato | mezzo e aspetto dell'immagine; al massimo uno per immagine | `black-and-white`, `poster`, `illustration` |
  | `place` | Luogo | nomi propri di luoghi, anche più d'uno | `paris`, `france` |
  | `setting` | Ambiente | tipi di luogo, ora, meteo, stagione | `street`, `night`, `rain` |
  | `event` | Evento | ciò che accade | `riot`, `parade` |
  | `people` | Persone | ruoli e gruppi, mai nomi | `firefighter`, `crowd` |
  | `object` | Oggetti e strutture | oggetti, veicoli, edifici, animali | `bridge`, `tram` |
  | `other` | Altro | il resto | |

  Un tag nel formato dei decenni appartiene sempre a Tempo. Formato e mezzo sono tag legittimi: `illustration` o `cgi` indicano una
  tecnica, non l'IA. La categoria appartiene al tag: cambiarla vale per tutte le immagini che lo usano, con conferma.
- **Parole ambigue:** si sceglie la parola con un solo significato (`house-fire` per l'evento, `flames` per l'oggetto,
  `construction-crane`); il suffisso di categoria (`fire-event`) lo crea solo l'owner, come ultima risorsa. Il nome di un tag è unico.
- **Vocabolario:** contiene solo tag in uso; un tag esce con l'ultima immagine che lo usa, insieme ai suoi alias.
- **Alias:** etichetta alternativa che rimanda a un tag e non si attacca mai a un'immagine; ogni tag, scritto o generato, passa per gli
  alias prima del salvataggio. «Unisci A in B» sposta immagini e alias di A su B, che conserva la sua categoria, e fa di A un alias.
- **Avviso:** una REAL senza tag di Tempo riceve un avviso non bloccante.

## 5. Analisi a pagamento

- Su richiesta dell'owner (wizard, dettaglio o gruppo nel Database, studio SLOP), solo per immagini nuove con copia di gioco. Il modello
  di testo scelto nelle Impostazioni, che deve leggere immagini, riceve la copia di gioco, titolo e descrizione (REAL) o il prompt (SLOP)
  e i 300 tag più usati divisi per categoria; mai l'origine. Istruzioni identiche per REAL e SLOP: base comune e parte «Tag» del
  contesto dei modelli (sezione 7).
- Risposta JSON con schema rigido: da 5 a 15 tag divisi per categoria, al massimo uno di Tempo e uno di Formato. I tag vengono resi
  conformi, risolti per alias e **sostituiscono** quelli presenti. Un tag proposto in una categoria diversa da quella del vocabolario
  mantiene la categoria del vocabolario e il conflitto viene segnalato all'owner.
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
- Senza il segreto `OPENAI_API_KEY` le chiamate a pagamento sono spente. Nei test solo il modello finto `tests/fake_openai.v1.4.0.py`.

## 7. Contesto dei modelli

- Tre testi modificabili dalle Impostazioni, fino a 4000 caratteri ciascuno: **base comune** (ogni chiamata: lingua, fatti, regole dei
  tag; non parla mai di immagini generate), **Tag** (con la base a ogni analisi), **Prompt per le SLOP** (con la base alla scrittura dei
  prompt, con le regole della specifica `contenuti-e-trasparenza`).
- Ogni salvataggio di un testo diverso crea una versione datata; ripristinarne una vecchia crea una nuova versione con lo stesso testo.
  Ogni analisi registra le versioni usate.
- Il codice propone un testo (`DEFAULTS` del modulo del contesto) che le Impostazioni mostrano accanto a quello in vigore finché è
  diverso; diventa una versione solo quando l'owner lo salva. Un database nuovo parte dalla proposta.
- Restano nel codice, qualunque cosa dicano i testi: formato JSON e schema delle risposte, conversione e filtri dei tag, limiti.

## 8. Dati

- D1: `images`, `tags`, `image_tags`, `tag_aliases`, `paid_calls`, `model_contexts`, `app_settings`, `slop_batches`,
  `slop_proposal_ignored`, `retired_copies`, tabelle del gioco (`game_sessions`, `game_rounds`, `answers`, `media_events`,
  `leaderboard`, `rate_limits`). Elenco delle migrazioni in `MASTER.md`.
- Colonne inutilizzate, lasciate per non ricostruire le tabelle: `caption`, `generated_caption` (`images`), `caption` e `copy_view`
  (`game_rounds`), `copy_view` (`images`).
- R2: quarantena privata (`library/<id>/`: originale e copia) e bucket del gioco (copie pubblicate).
- Le statistiche di un'immagine (visualizzazioni e classificazioni corrette) contano solo i round giocati con la copia attuale.
