# Libreria delle immagini — specifica 10.1.0

Stato: implementata nel ramo 1.52.0, da rilasciare. Aggiornata: 2026-11-21T10:00:00Z.

## 1. Decisioni dell'owner

- La libreria si usa come il file system di un computer: inserire, modificare e cancellare devono essere rapidi (2026-11-09).
- Niente lotti, proposte o cicli: ogni immagine è indipendente (2026-11-09).
- Database in ordine, senza archivi storici: un'immagine eliminata dal cestino non lascia righe né file; nessun registro delle
  eliminazioni, nessuna istantanea, nessuna esportazione automatica (2026-11-09).
- **Niente tag** (decisione del 2026-11-20). Le foto di una galleria hanno in gran parte gli stessi tag, quindi i filtri per tag non
  servivano. Il trattamento delle SLOP ricava bianco e nero, seppia o colore dalle misure della REAL (specifica `copie-di-gioco`).
  Spariscono vocabolario, alias, categorie, filtri e distribuzione per tag, tag di partenza delle SLOP manuali, analisi delle SLOP e
  completamento di Genere, Colore e Supporto.
  Approvare una foto non richiede più tag. Le decisioni precedenti sui tag (2026-11-09, 2026-11-10, 2026-11-14 e 2026-11-17) sono
  superate e restano nella cronologia git.
- **Niente descrizione editoriale né analisi delle REAL; niente descrizione delle SLOP** (decisioni del 2026-11-20). Nei risultati
  le REAL mostrano solo i crediti (titolo, autore, licenza, link alla foto originale, modifiche della copia) e le SLOP prompt e modello.
  Il modello delle proposte SLOP riceve l'originale intero, il titolo e la descrizione della fonte. La migrazione 0066 elimina la
  descrizione editoriale, la sua provenienza, il testo Commons originale e i campi dell'analisi, e svuota la descrizione delle SLOP.
  Superano le decisioni del 2026-11-09 (analisi una volta per immagine), del 2026-11-19 (ripetizione dell'analisi, descrizione nei
  risultati) e quella di poche ore prima sulle incertezze.
- **Controllo notturno delle fonti Commons** (2026-11-20): 50 REAL a notte, numero modificabile dalle Impostazioni, ciascuna solo tre mesi dopo l'ultimo controllo; un
  file sparito da Commons viene **solo segnalato**, mai ritirato o cancellato in automatico (sezione 9).
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
- **Campi.** Origine, titolo e descrizione della fonte solo REAL (≤200 e ≤1000 caratteri), fonte, autore e
  licenza (REAL), prompt e modello (SLOP), stato, originale e copia di gioco, revisione per le modifiche
  concorrenti. Per una SLOP generata anche batch, processo, impostazioni del trattamento e qualità della generazione.
- **Descrizione della fonte.** Per le REAL arriva da Commons (testo ripulito, al massimo 500 caratteri) e l'owner la corregge nel
  passo 2 del wizard o nella galleria. Resta nel catalogo (ricerca, anteprima a pressione prolungata) e accompagna la REAL quando
  ispira una SLOP automatica; il giocatore non la vede. Le SLOP non hanno descrizione: il campo è vuoto e la modifica è rifiutata.
- **Limiti dei file.** JPEG, PNG o WebP fino a 12 MB e 32 megapixel; copia di gioco WebP fino a 4 MB.

### Campi utili per origine (decisione del 2026-11-17)

| Campi | REAL | SLOP | Funzione attuale |
|---|---|---|---|
| Titolo | sì | no | Titolo REAL nei crediti e nelle proposte SLOP; SLOP identificate dall’ID |
| Descrizione della fonte | sì | no | Catalogo, ricerca e proposte SLOP automatiche |
| Fonte, autore, nome e URL licenza | sì | no | Provenienza, diritti, controllo ND e attribuzione della REAL |
| Prompt e modello | no | sì | Ricostruzione della generazione, ricerca, prompt e modello nei crediti finali |
| Originale/copia, hash, dimensioni, MIME, crop e misure | sì | sì | Archivio, verifica file, copie identiche nel gioco e rifacimento nel browser |
| Batch, slot, qualità e trattamento | no | sì | Revisione, idempotenza e rifacimento delle copie SLOP |
| Stato, date e revisione | sì | sì | Transizioni e concorrenza |
| Galleria editoriale | sì | sì | Obbligatoria. Organizzazione delle REAL e appartenenza ereditata dalle SLOP dal batch |

Il dettaglio e l’API non espongono titolo/fonte/autore/licenza sulle SLOP né prompt/modello sulle REAL. Le SLOP hanno `title=NULL` nella tabella condivisa e un’etichetta visiva basata sull’ID; ricerca anche per ID. Le modifiche di quei campi
sull'origine sbagliata sono rifiutate. Le colonne restano nella tabella condivisa perché servono all'altra origine; non si cancella
la provenienza delle REAL. 

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

## 5. Analisi (ritirata)

Dal 2026-11-20 nessuna foto viene analizzata. La rotta `POST /:id/analyze` e `GET /analysis` non esistono più; la manutenzione non
segue più analisi in corso. Le chiamate di tipo «analisi» già registrate restano in `paid_calls` e nelle statistiche come «Analisi
delle foto». L'invio dell'immagine al modello come data URL base64 scritta direttamente nei byte della richiesta resta per le
proposte e le valutazioni delle SLOP (il 2026-11-15 cinque analisi su originali da 2 a 6 MB avevano superato i 128 MB del Worker).

## 6. Chiamate a pagamento e modelli

- Tre tipi: proposte editoriali e prompt SLOP (anche le indicazioni proposte per una galleria), immagini SLOP, valutazione SLOP
  intera. Le SLOP accettate non richiedono altre chiamate. Ognuna richiede una **conferma esplicita** (`confirm: true`), senza importi.
- **Esiti:** risposta valida → `completed`; errore 4xx → `failed`, senza addebito; errore 5xx, timeout o rete → `uncertain`, mai
  ripetuta in automatico. Chiave rifiutata, limite di spesa o credito OpenAI esaurito fermano le serie con un messaggio che rimanda a
  platform.openai.com.
- **Registro** `paid_calls`: tipo, modello, esito, token, date; nessun importo e collegamenti a immagine, processo e tentativo, azzerati alla cancellazione; nessun archivio delle immagini eliminate.
- **Modelli:** modello di testo (proposte editoriali e valutazione SLOP), modello di immagini e sua qualità si scelgono nelle Impostazioni, tra quelli
  elencati nel codice e presenti nel progetto OpenAI (`GET /v1/models`, in cache per un'ora; se l'elenco non si legge si offrono tutti).
  Ogni chiamata registra il modello usato.
- Senza il segreto `OPENAI_API_KEY` le chiamate a pagamento sono spente. Nei test solo il modello finto `tests/fake_openai.py`.

## 7. Contesto dei modelli

- Tre testi modificabili dalle Impostazioni, fino a 4000 caratteri: **Base comune** (ogni chiamata), **Premessa e prompt di
  galleria** (proposte da originale, titolo e descrizione della fonte) e **Valutazione delle SLOP** (candidata intera). Le versioni
  della parte ritirata «Descrizione delle REAL» (`analysis`) restano nella tabella, non sono offerte e non si ripristinano.
- Ogni salvataggio di un testo diverso crea una versione datata; ripristinarne una vecchia crea una nuova versione con lo stesso testo.
  Ogni valutazione registra le versioni usate.
- Il codice propone un testo (`DEFAULTS` del modulo del contesto) che le Impostazioni mostrano accanto a quello in vigore finché è
  diverso; diventa una versione solo quando l'owner lo salva. Un database nuovo parte dalla proposta.
- Restano nel codice, qualunque cosa dicano i testi: formato JSON e schema delle risposte, limiti, la lunghezza chiesta ai prompt
  SLOP e, per il valutatore,
  decisioni ammesse, significato della tolleranza, rifiuto automatico dei difetti critici e conservazione letterale di ancoraggi ed esclusioni. L’owner può accettare manualmente una candidata valutata con segnalazioni, con conferma e decisione registrata separatamente (specifica `generazione-slop`).
- Proposte del codice: con l'app 1.25.0 la base e la parte «Tag» con Genere, Colore e Supporto (contesto 1.7.0, salvato in produzione
  il 2026-11-14); con l'app 1.26.0 il «Prompt per le SLOP» delle gemelle (contesto 1.8.0); con l'app 1.27.0 «Brief e prompt per le
  SLOP» della pipeline editoriale e con la 1.28.0 «Valutazione delle SLOP» (contesto 1.9.0). In produzione il 2026-11-15 è ancora in
  vigore il testo delle gemelle del 2026-11-14: va salvata la proposta prima di generare. Con l'app 1.50.0 la base senza le regole
  dei tag e la parte «Descrizione delle REAL» al posto di «Tag». Con l'app 1.51.0, su richiesta dell'owner del 2026-11-20, la
  migrazione 0066 salva come versioni correnti le proposte di «Base comune» (senza tag né descrizioni) e «Premessa e prompt di
  galleria» (che legge titolo e descrizione della fonte), se il testo in vigore è diverso; le versioni precedenti restano
  ripristinabili. È un'eccezione esplicita alla regola che le proposte non si salvano da sole.

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
Migrazione 0065: `images.source_checked_at` e `images.source_missing_at` per il controllo delle fonti (sezione 9), con indice parziale
sulle REAL; le REAL già acquisite da Commons ricevono come ultimo controllo la data di acquisizione. `app_settings` è ricostruita con
tutte le righe per ammettere la chiave `commons_checks_per_night`.
Migrazione 0066: elimina `real_description`, `real_description_provenance`, `commons_description`, `analysis_status`,
`analysis_error`, `analyzed_at`, `analysis_base_context` e `analysis_task_context`; svuota la descrizione delle SLOP; salva le proposte
di «Base comune» e «Premessa e prompt di galleria» (sezione 7). Foto, descrizioni della fonte, chiamate e partite restano.

## 9. Controllo delle fonti su Commons

Decisione dell'owner del 2026-11-20. Commons cancella i file soprattutto per problemi di diritti: un file sparito può voler dire che la
licenza su cui si basa la REAL non era valida. Una licenza Creative Commons invece non si revoca, quindi non si rilegge la licenza: si
controlla solo che la pagina del file esista ancora.

- **Quando.** Nella manutenzione notturna (Cron Trigger delle 03:17 UTC), dopo le altre operazioni e senza poterle bloccare.
- **Quali foto.** Le REAL fuori dal cestino la cui fonte è una pagina `https://commons.wikimedia.org/wiki/File:…`, se l'ultimo
  controllo (`source_checked_at`) risale ad almeno tre mesi di calendario prima. Prima quelle mai controllate, poi le più vecchie;
  al massimo il numero scelto in Impostazioni → Fonti Commons (`commons_checks_per_night`, **50** predefinito, da 0 a 500; 0 sospende il
  controllo). Le richieste all'API sono da 50 titoli, una dopo l'altra: il primo errore chiude la notte, salva ciò che è già stato
  risposto e lascia in coda il resto. L'acquisizione da Commons conta come primo controllo; la migrazione 0065
  usa la data di acquisizione per le REAL già presenti.
- **Richiesta.** `action=query`, `formatversion=2`, `redirects=1`, `maxlag=5`, i titoli dei file, con il `User-Agent` del progetto.
  Nessuna chiamata a pagamento e nessun dato personale.
- **Esiti.** Pagina presente: data del controllo aggiornata e segnalazione tolta. File spostato con un reindirizzamento: il link della
  fonte segue il nuovo titolo. Pagina mancante: data del controllo aggiornata e `source_missing_at` impostato alla prima volta in cui
  manca. Un indirizzo che non è più un file di Commons si mette da parte per tre mesi, senza segnalazione. Errore di rete, risposta
  HTTP non riuscita, `maxlag` o risposta illeggibile: nulla cambia e le stesse foto tornano la notte successiva.
- **Solo segnalazione.** La foto resta nel suo stato. La scheda della galleria mostra quante REAL non risultano più su Commons, la
  foto un'etichetta «Fonte rimossa», il dettaglio la data e cosa fare: verificare la pagina, ritirare o cestinare la foto se la
  licenza non regge, oppure correggere la pagina della fonte. Correggerla toglie la segnalazione e rimette la foto in testa alla coda
  della notte successiva. Il dettaglio di una REAL controllata mostra anche «Fonte presente su Commons al …».
- **Carico.** Con il valore predefinito una richiesta leggera a notte, qualunque sia la dimensione del catalogo: 5000 REAL si
  ricontrollano in circa cento giorni, quindi l'intervallo effettivo supera i tre mesi quando le REAL dovute sono più di quelle
  controllate ogni notte. Alzando il numero (500 = dieci richieste) l'intervallo torna a tre mesi.
