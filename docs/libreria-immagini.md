# Libreria delle immagini e analisi — specifica 9.0.0

Stato: implementata nel ramo 1.50.0, da rilasciare. Aggiornata: 2026-11-20T16:30:00Z.

## 1. Decisioni dell'owner

- La libreria si usa come il file system di un computer: inserire, modificare e cancellare devono essere rapidi (2026-11-09).
- Niente lotti, proposte o cicli: ogni immagine è indipendente (2026-11-09).
- Database in ordine, senza archivi storici: un'immagine eliminata dal cestino non lascia righe né file; nessun registro delle
  eliminazioni, nessuna istantanea, nessuna esportazione automatica (2026-11-09).
- **Niente tag** (decisione del 2026-11-20). Le foto di una galleria hanno in gran parte gli stessi tag, quindi i filtri per tag non
  servivano. Il trattamento delle SLOP ricava bianco e nero, seppia o colore dalle misure della REAL (specifica `copie-di-gioco`).
  Spariscono vocabolario, alias, categorie, filtri e distribuzione per tag, tag di partenza delle SLOP manuali, analisi delle SLOP e
  completamento di Genere, Colore e Supporto. L'analisi a pagamento di una REAL restituisce solo la descrizione editoriale.
  Approvare una foto non richiede più tag. Le decisioni precedenti sui tag (2026-11-09, 2026-11-10, 2026-11-14 e 2026-11-17) sono
  superate e restano nella cronologia git.
- L'analisi a pagamento genera la descrizione editoriale una sola volta per REAL e sostituisce quella delle foto scelte (2026-11-09,
  adattata il 2026-11-20).
- Dal dettaglio di una foto nuova o approvata si può rifare l’analisi a pagamento con conferma esplicita (2026-11-19).
- I risultati mostrano elementi visibili e contesto documentato della descrizione editoriale, con l’attribuzione della REAL (2026-11-19).
- Niente prezzi né budget: ogni chiamata a pagamento si conferma e si registra senza importi; il limite di spesa è quello del progetto
  OpenAI (2026-11-10).
- Niente didascalie, né nel gioco né nella dashboard; quelle scritte sono state cancellate (2026-11-13).
- Una modifica lascia approvata un'immagine approvata; spostare nel cestino una pubblicata la ritira subito dal gioco (2026-11-11 e
  2026-11-13).

## 2. Immagini

Una sola raccolta di immagini REAL e SLOP.

- **Ingresso.** Nella galleria aperta, «Carica REAL» cerca e acquisisce foto da Wikimedia Commons (specifica `dashboard-admin-wizard-real`).
  «Genera SLOP» apre la generazione manuale e automatica per la stessa galleria (specifica `generazione-slop`). Esiste ancora
  la rotta `POST /upload`, usata dai test.
- **Campi.** Origine, titolo solo REAL (≤200 caratteri), descrizione (≤1000), fonte, autore e
  licenza (REAL), prompt e modello (SLOP), stato, originale e copia di gioco, revisione per le modifiche
  concorrenti. Per una SLOP generata anche batch, processo, impostazioni del trattamento e qualità della generazione.
- **Descrizione.** Per le REAL arriva da Commons (testo ripulito, al massimo 500 caratteri) e l'owner la corregge nel passo 2 del wizard
  o nella galleria. Il giocatore la legge nella lista di fine partita (specifica `gioco-a-livelli`). Entra anche nel
  contesto dell'analisi.
- **Limiti dei file.** JPEG, PNG o WebP fino a 12 MB e 32 megapixel; copia di gioco WebP fino a 4 MB.

### Campi utili per origine (decisione del 2026-11-17)

| Campi | REAL | SLOP | Funzione attuale |
|---|---|---|---|
| Titolo | sì | no | Titolo REAL nei crediti e nell’analisi; SLOP identificate dall’ID |
| Descrizione della fonte (REAL) o descrizione (SLOP) | sì | sì | Contesto dell’analisi e del catalogo |
| Fonte, autore, nome e URL licenza | sì | no | Provenienza, diritti, controllo ND e attribuzione della REAL |
| Prompt e modello | no | sì | Ricostruzione della generazione, ricerca e prompt nei crediti finali |
| Descrizione editoriale, provenienza dell'analisi e contesto Commons | sì | no | Brief automatico. Elementi visibili e contesto documentato della descrizione editoriale nei risultati |
| Contesti ed esito dell'analisi | sì | no | Controllo dell'analisi della descrizione |
| Originale/copia, hash, dimensioni, MIME, crop e misure | sì | sì | Archivio, verifica file, copie identiche nel gioco e rifacimento nel browser |
| Batch, slot, qualità e trattamento | no | sì | Revisione, idempotenza e rifacimento delle copie SLOP |
| Stato, date e revisione | sì | sì | Transizioni e concorrenza |
| Galleria editoriale | sì | sì | Obbligatoria. Organizzazione delle REAL e appartenenza ereditata dalle SLOP dal batch |

Il dettaglio e l’API non espongono titolo/fonte/autore/licenza sulle SLOP né prompt/modello sulle REAL. Le SLOP hanno `title=NULL` nella tabella condivisa e un’etichetta visiva basata sull’ID; ricerca anche per ID. Le modifiche di quei campi
sull'origine sbagliata sono rifiutate. Le colonne restano nella tabella condivisa perché servono all'altra origine; non si cancella
la provenienza delle REAL. La descrizione aggiuntiva delle SLOP resta una nota del catalogo, distinta dal prompt, e non appare nei crediti.

Didascalie e vista iniziale sono già state ritirate; «Spiegazione dopo la risposta» non è mai letta dal gioco. La 0057 ne elimina
le sei colonne residue, il controllo API e il campo del dettaglio. Il gioco carica soltanto identificativo, origine interna e riferimenti
alla copia per estrarre le foto; i crediti REAL e il prompt SLOP vengono letti nella query dedicata di fine partita.

## 3. Stati

`nuova` → `approvata` → `pubblicata`, più `cestino` (che ricorda lo stato di provenienza).

- **Approvare** (solo una nuova): copia di gioco in 4:5 e, per una REAL, la conferma di aver verificato
  diritti e licenza. Una REAL con licenza senza opere derivate (ND) è esclusa: il server rifiuta approvazione e pubblicazione.
- **Pubblicare** (solo un'approvata): la copia passa nel bucket del gioco ed entra nelle partite nuove.
- **Modificare.** Nuove e approvate si modificano direttamente, con salvataggio immediato; un'approvata resta approvata. Una pubblicata si modifica solo dopo «Modifica», che la ritira subito dal gioco (torna approvata); va poi
  ripubblicata. Le partite in corso continuano con la copia con cui sono iniziate.
- **Ritirare** una pubblicata: torna approvata. La copia lascia il bucket del gioco subito, oppure quando finisce l'ultima partita in
  corso che la usa (`retired_copies`).
- **Cestino.** Spostare nel cestino, da sola o in gruppo, non chiede conferma, tranne per le pubblicate, che escono subito dal gioco. Ripristinare riporta allo
  stato di provenienza; una SLOP non si ripristina se la REAL ha già una SLOP attiva o un processo in corso; una pubblicata torna approvata. «Svuota cestino» ed «Elimina definitivamente» cancellano ogni riga dell'immagine
  (round, risposte) e ogni suo file; un'immagine ancora usata da una partita in corso si elimina quando la partita finisce.
- **Partita in corso:** in preparazione o attiva e iniziata da meno della durata massima delle Impostazioni (24 ore predefinite).
- La selezione in galleria permette di approvare, pubblicare, togliere dalla pubblicazione, cestinare o cambiare galleria. Il Cestino offre ripristino ed eliminazione definitiva.
  Le azioni si applicano alle foto selezionate e riusano i controlli delle transizioni di stato. Il limite dell’API è 500 foto per richiesta.

## 4. Tag (ritirati)

Dal 2026-11-20 le foto non hanno tag. La migrazione 0063 elimina `tags`, `image_tags`, `tag_aliases` con i loro trigger e le colonne
`images.generated_tags` e `images.categories_completed_at`. Le API `/tags`, `/tags/alias`, `/tags/merge`, `/tags/category` e
`/:id/categories` non esistono più, la modifica di una foto rifiuta `tags` e `tag_categories`, l'elenco rifiuta i filtri `tag`, `tags`,
`match` e `incomplete`, le azioni di gruppo `tag-add` e `tag-remove` falliscono. Gli snapshot dei processi creati prima conservano i
vecchi `source_tags` e `copy_style`, letti solo per rifare le copie di quelle SLOP (specifica `copie-di-gioco`). Le proprietà
dell'aspetto (risoluzione, rumore, nitidezza, contrasto, saturazione, tinta e crominanza residua) le misura il codice (specifica
`copie-di-gioco`, sezione 4).

## 5. Analisi a pagamento

Si analizzano soltanto le REAL: ogni analisi restituisce `real_description` (`visible`, `documented_context`, `uncertainties`), salvata insieme all'esito della chiamata. Il modello vede la REAL **intera**, cioè l’originale caricato (JPEG, PNG o WebP fino a 12 MB), mai il ritaglio 4:5 (decisione dell’owner del 2026-11-15). Modello, hash dell’originale, revisione e data sono conservati come provenienza. Gli elementi visibili e il contesto documentato compaiono nei risultati con l’attribuzione della foto. Il testo Commons, le incertezze e la provenienza dell’analisi restano nel catalogo. Una SLOP non si analizza: il server risponde 409 senza registrare né inviare nulla.

Una REAL senza descrizione editoriale mostra i crediti disponibili nei risultati e non entra nelle estrazioni automatiche delle SLOP. Dal dettaglio la descrizione si può compilare a mano o generare con una nuova analisi confermata (`refresh_description:true`), anche per una foto già approvata o pubblicata. La conferma segnala gli esiti incerti o interrotti. La modifica della sola descrizione editoriale conserva lo stato della foto.

- Su richiesta dell'owner dal wizard per le REAL nuove, dal dettaglio in galleria anche per le approvate. Il modello di testo scelto
  nelle Impostazioni, che deve leggere immagini, riceve l'originale intero (vede i pixel, non i metadati del file) con titolo,
  descrizione e contesto Commons; mai l'origine. La base comune e la parte «Descrizione delle REAL» non menzionano immagini sintetiche.
- Risposta JSON con schema rigido: soltanto `real_description`. Una risposta senza descrizione valida non salva nulla e la chiamata,
  pagata, resta registrata come completata.
- **Tetto di risposta:** 8000 token (app 1.26.0). Con 2000, che comprendono il ragionamento del modello, un'analisi su dieci del primo
  lotto automatico è tornata troncata («Risposta del modello non leggibile»): pagata e persa.
- **Ripetizione dal dettaglio:** «Rifai l’analisi con IA» richiede conferma per una nuova chiamata (`confirm: true`, `reanalyze: true`)
  e avverte che la descrizione editoriale sarà sostituita. Il wizard genera la descrizione una volta sola dopo un esito riuscito.
  Rimane disponibile l’analisi confermata per una REAL storica senza descrizione.
- Una sola analisi alla volta per immagine; un segno interrotto resta sospeso e viene marcato incerto dalla manutenzione.
- **Esito incerto o segno interrotto** (più di dieci minuti): mai ripetuto in automatico. Dal dettaglio della foto e dal wizard, l'owner può ripeterlo con una conferma che lo nomina e avverte del possibile addebito già avvenuto; un'analisi
  ancora in corso da meno di dieci minuti resta esclusa. La richiesta porta
  `repeat_uncertain: true`, senza la quale il server rifiuta. La chiamata pendente dell'analisi interrotta passa a `uncertain`.
  La dashboard tratta allo stesso modo un'analisi ancora «in corso» dopo dieci minuti: la mostra come interrotta e offre la
  ripetizione con l'avviso.
- **Invio dell'immagine:** l'originale va al modello come data URL base64 scritta direttamente nei byte della richiesta, senza
  copie in stringhe JavaScript. Il 2026-11-15 cinque analisi di fila su originali da 2 a 6 MB hanno superato il limite di memoria
  del Worker (128 MB, «exceededResources») dopo aver registrato la chiamata: restavano «in corso». Con la nuova codifica la memoria
  aggiuntiva per un originale di 6,7 MB scende da circa 87 a circa 9 MB (misura locale con Node). Vale anche per la valutazione delle SLOP.

## 6. Chiamate a pagamento e modelli

- Quattro tipi: analisi delle REAL (descrizione), proposte editoriali e prompt SLOP, immagini SLOP, valutazione SLOP intera. Le
  SLOP accettate non richiedono altre chiamate. Ognuna richiede una **conferma esplicita** (`confirm: true`), senza importi.
- **Esiti:** risposta valida → `completed`; errore 4xx → `failed`, senza addebito; errore 5xx, timeout o rete → `uncertain`, mai
  ripetuta in automatico. Chiave rifiutata, limite di spesa o credito OpenAI esaurito fermano le serie con un messaggio che rimanda a
  platform.openai.com.
- **Registro** `paid_calls`: tipo, modello, esito, token, date; nessun importo e collegamenti a immagine, processo e tentativo, azzerati alla cancellazione; nessun archivio delle immagini eliminate.
- **Modelli:** modello di testo (descrizione delle REAL, proposte editoriali e valutazione SLOP), modello di immagini e sua qualità si scelgono nelle Impostazioni, tra quelli
  elencati nel codice e presenti nel progetto OpenAI (`GET /v1/models`, in cache per un'ora; se l'elenco non si legge si offrono tutti).
  Ogni chiamata registra il modello usato.
- Senza il segreto `OPENAI_API_KEY` le chiamate a pagamento sono spente. Nei test solo il modello finto `tests/fake_openai.py`.

## 7. Contesto dei modelli

- Quattro testi modificabili dalle Impostazioni, fino a 4000 caratteri: **Base comune** (ogni chiamata, con istruzioni neutre),
  **Descrizione delle REAL** (analisi, parte `analysis`), **Premessa e prompt di galleria** (proposte da originale e contesto) e **Valutazione delle SLOP** (candidata
  intera). La fase di catalogazione REAL ha istruzioni distinte.
- Ogni salvataggio di un testo diverso crea una versione datata; ripristinarne una vecchia crea una nuova versione con lo stesso testo.
  Ogni analisi registra le versioni usate.
- Il codice propone un testo (`DEFAULTS` del modulo del contesto) che le Impostazioni mostrano accanto a quello in vigore finché è
  diverso; diventa una versione solo quando l'owner lo salva. Un database nuovo parte dalla proposta.
- Restano nel codice, qualunque cosa dicano i testi: formato JSON e schema delle risposte, limiti, la lunghezza chiesta ai prompt
  SLOP e, per il valutatore,
  decisioni ammesse, significato della tolleranza, rifiuto automatico dei difetti critici e conservazione letterale di ancoraggi ed esclusioni. L’owner può accettare manualmente una candidata valutata con segnalazioni, con conferma e decisione registrata separatamente (specifica `generazione-slop`).
- Proposte del codice: con l'app 1.25.0 la base e la parte «Tag» con Genere, Colore e Supporto (contesto 1.7.0, salvato in produzione
  il 2026-11-14); con l'app 1.26.0 il «Prompt per le SLOP» delle gemelle (contesto 1.8.0); con l'app 1.27.0 «Brief e prompt per le
  SLOP» della pipeline editoriale e con la 1.28.0 «Valutazione delle SLOP» (contesto 1.9.0). In produzione il 2026-11-15 è ancora in
  vigore il testo delle gemelle del 2026-11-14: va salvata la proposta prima di generare. Con l'app 1.50.0 la base senza le regole
  dei tag e la parte «Descrizione delle REAL» al posto di «Tag». I testi in vigore nel D1 non cambiano da soli: finché l'owner non
  salva la proposta, le istruzioni possono ancora parlare di tag, ma lo schema della risposta accetta solo la descrizione.

## 8. Dati

- D1: `images`, `galleries`, `paid_calls`, `model_contexts`, `app_settings`, `slop_batches`,
  `slop_reference_uses`, `slop_processes`, `slop_attempts`, `retired_copies`, tabelle del gioco (`game_sessions`, `game_rounds`, `answers`, `media_events`,
  `leaderboard`, `rate_limits`). Elenco delle migrazioni in `MASTER.md`.
- Migrazione 0048 (`images`): `categories_completed_at` (completamento delle tre categorie, eliminata dalla 0063), `copy_metrics` (misure della copia di
  gioco) e `copy_treatment` (trattamento di una SLOP), specifica `copie-di-gioco`, sezione 4.
- Migrazione 0053: rimuove `generation_source` e `source_id`, anonimizza slot e trattamento e preserva tentativi e chiamate. La migrazione storica 0049 aveva introdotto il legame, poi eliminato. La 0055 introduce il solo registro privato di disponibilità `slop_reference_uses` per i batch di pipeline 2: madre occupata finché la figlia esiste in qualsiasi stato; eliminare definitivamente la figlia libera la madre. Nessun legame viene inferito per le generazioni pregresse. La disponibilità non interviene nel campionamento del gioco.
- Migrazione 0056: elimina `images.generation_group`, `slop_batches.group_key`, `slop_batches.auto_tag` e le impostazioni obsolete dei gruppi. Ripulisce gli snapshot e converte il contesto storico di genere/decennio in tag di partenza ordinari, conservando immagini, tag, copie, processi, tentativi, chiamate e registro madre–figlia. Nessuna chiamata a pagamento.
- Migrazioni 0060 e 0061: introducono le gallerie e azzerano il D1 esistente su decisione dell’owner del 2026-11-18. Ogni
  immagine appartiene a una galleria. Le REAL si possono spostare conservandone lo stato. I riferimenti dei batch sono temporanei.
- Migrazione 0058: titolo obbligatorio per le REAL e nullo per le SLOP (vincoli tramite trigger, senza ricostruire la tabella madre). I tag di partenza vengono rimossi dagli slot delle SLOP dopo aver conservato solo colore/supporto nei parametri tecnici della copia. Nessuna modifica a tag osservati, processi, copie o legami.
- Le accettazioni manuali delle SLOP conservano nello slot `acceptance` (owner, ID tentativo e data) separata dalla valutazione originale, anche con difetti critici/minori o incertezze. Nessuna migrazione aggiuntiva; nuova foto senza approvazione/pubblicazione automatica.
- Migrazione 0057: elimina `caption`, `generated_caption`, `copy_view` ed `explanation` da `images`; `caption` e `copy_view` da `game_rounds`. Ogni altra colonna e ogni collegamento sono conservati. Le vecchie spiegazioni, mai lette dal gioco, vengono eliminate; descrizioni, tag e contesto editoriale restano.
- R2: quarantena privata (`library/<id>/`: originale e copia) e bucket del gioco (copie pubblicate).
- Le statistiche di un'immagine (visualizzazioni e classificazioni corrette) contano solo i round giocati con la copia attuale.

Migrazione 0050: descrizioni e provenienza, contesto Commons originale, `slop_processes` e `slop_attempts`, collegamenti del registro `paid_calls`, versione/snapshot del batch. Nessuna conversione o chiamata sulle REAL storiche.
Migrazione 0051 (`model_contexts`): parte `slop_evaluation` e colonna `pipeline` (sezione 7); testi, date e identificativi conservati.
Migrazione 0063: elimina tag, alias, categorie, `generated_tags` e `categories_completed_at` (sezione 4). Foto, descrizioni, stato
dell'analisi, copie, processi, chiamate e partite restano. Nessuna chiamata a pagamento.
