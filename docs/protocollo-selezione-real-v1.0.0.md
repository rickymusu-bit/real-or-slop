# Real or Slop — Protocollo di selezione delle immagini REAL e bilanciamento del dataset

**Versione:** 1.0.0  
**Data:** 25 ottobre 2026  
**Stato:** specifica editoriale e tecnica approvata; implementazione da eseguire in PR separata.  
**Repository:** `rickymusu-bit/real-or-slop`.

## 1. Principio fondamentale

**Le immagini REAL non si prendono a caso dalle gallerie.** Si raccolgono in modo ampio, si verificano e si selezionano con criteri editoriali; **solo dopo**, in partita, si estrae casualmente da gruppi approvati e bilanciati.

Le due classi non vanno confuse con due gradi di plausibilità:
- **REAL** = immagine non generata con IA, con provenienza e natura verificate rispetto alla rappresentazione presentata (fotografia, riproduzione di opera realmente esistente, vero manifesto, ecc.).
- **AI** = immagine generata con IA per il gioco, anche se rappresenta un oggetto o un luogo *realmente esistente*.
- Il titolo commerciale **SLOP** è il nome del pulsante AI, **non** un giudizio universale sulla qualità dell'immagine.
- Un quadro autentico di una scena mitologica è REAL anche se racconta un evento fittizio; una ricostruzione generativa di un monumento realmente esistente è AI. **Non confondere autenticità del file/oggetto rappresentato e verità della scena narrativa.**

**Obiettivo cognitivo:** non tutto ciò che sembra vero lo è; non tutto ciò che appare impossibile è falso. Il gioco deve combattere entrambi i pregiudizi, non sostituirli con nuove scorciatoie.

## 2. Difficoltà editoriale delle immagini REAL

La difficoltà delle REAL **non è data dalla loro somiglianza alle SLOP**, ma dalla probabilità che una persona le giudichi erroneamente artificiali. Partire con difficoltà provvisoria, da calibrare sulle risposte.

| Livello | Tipologia REAL privilegiata | Ragionamento richiesto |
|---|---|---|
| **Facile** | Foto, monumenti, opere e oggetti autentici relativamente familiari e ben contestualizzati | Riconoscere dettagli coerenti e ordinari; l'immagine deve comunque richiedere osservazione, non essere un riempitivo |
| **Medio** | Soggetti meno familiari, punti di vista insoliti, tecnologie d'epoca, opere meno note | Distinguere novità dall'artificialità; considerare contesto, materiali, composizione |
| **Difficile** | Invenzioni autentiche sorprendenti, architetture improbabili ma realmente costruite, documenti e situazioni controintuitive | Superare il pregiudizio «troppo strano per essere vero» |
| **Esperto** | Reperti fotografici o culturali particolarmente insoliti, ma con **provenienza inequivocabile** | Accettare realtà documentate che sembrano inventate e conoscere i limiti del proprio giudizio |

**Esempio di tipologia REAL difficile:** fotografie storiche del *Schienenzeppelin*, veicolo ferroviario sperimentale realmente esistito con elica. Non usare l'esempio come asset prima di aver identificato **la singola fotografia**, la licenza, la provenienza e i diritti di riuso.

Non rendere però tutte le REAL strane: altrimenti il giocatore imparerebbe la scorciatoia «immagine bizzarra = REAL». Tutti i livelli devono comprendere anche scene autentiche ordinarie.

**Compatibilità:** attualmente D1 e API supportano solo `facile`, `medio`, `difficile`. `esperto` è, per ora, **un profilo editoriale futuro**: non inserirlo nel database o nei filtri finché migrazione, frontend e test non saranno approvati.

## 3. Le quattro combinazioni che devono comparire nel catalogo

| | Contenuto dall'aspetto ordinario/plausibile | Contenuto dall'aspetto insolito/sorprendente |
|---|---|---|
| **REAL** | Vera fotografia ordinaria o riproduzione autentica | Vera fotografia/reperto straordinario ma documentato |
| **AI** | Immagine generata, tecnicamente convincente, con evento o oggetto plausibile | Immagine generata dall'aspetto inconsueto ma credibile: incongruenze ragionabili, mai assurdità grossolane |

Non confondere `surprising` con `difficulty`: sorpresa e difficoltà sono variabili correlate **possibili**, non sinonimi.

In particolare, persino **facile** deve far pensare: la generazione AI facile può contenere un anacronismo verificabile e moderato, non necessariamente difetti tecnici evidenti o contesti assurdi. È coerente con il protocollo SLOP della PR #8.

## 4. Selezione REAL: pipeline editoriale

### 4.1 Raccolta ampia (nessun'approvazione automatica)

Interrogare gli archivi autorizzati in base a categoria, sotto-categoria, luogo/paese, periodo, soggetto, stile/medium e termini di licenza. Partire dai provider **già realizzati** in `pipeline/providers.py` (Commons, Openverse, Met, Library of Congress, Smithsonian, NASA). Le fonti europee e globali aggiuntive sono catalogate in `docs/fonti-immagini-real-v1.0.0.md` della PR #7.

Le fonti devono essere ampie e geograficamente varie. Non assumere che foto/arte scaricabili siano libere da riuso: il controllo riguarda **ciascun oggetto**.

### 4.2 Filtri obbligatori prima dell'approvazione

- **Provenienza e autenticità:** permalink del fondo, identificativo archivistico, autore/istituzione, contesto, data (anche intervallo stimato) e descrizione verificata. Le fotografie manipolate, ricostruzioni e colorizzazioni devono essere etichettate correttamente o escluse se creano ambiguità con il concetto di REAL.
- **Licenza:** permesso compatibile con utilizzo pubblico del gioco, attribuzioni e share-alike eventuali; considerare diritti delle persone, dei marchi, poster cinematografici, opere protette. Se richiede attribuzione *prima* della scelta e ciò svela la risposta, scegliere un altro file o ottenere permesso idoneo, non nascondere attribuzione obbligatoria.
- **Qualità e leggibilità:** formato e risoluzione sufficienti, soggetto riconoscibile sul display di uno smartphone. Non rimuovere elementi visivi o watermark obbligatori per creare un gioco «più pulito».
- **Valore ludico e didattico:** l'immagine ha una ragione per stare nel catalogo? Il feedback può raccontare un fatto documentato, correggere una falsa intuizione o mostrare un dettaglio interessante? Preferire sì.
- **Diversità:** evitare serie molto simili, eccesso di una sola epoca/continente, troppe fotografie tutte in bianco e nero o tutti i quadri in una sola classe/difficoltà.

### 4.3 Valutazione e revisione umana

Attribuire valutazioni qualitative **separate**, non un solo numero magico:
- `subject_kind`: fotografia storica, opera artistica, architettura, infrastruttura, trasporti, scienza/natura, personaggi, cinema/locandine, altri;
- `country_or_region`, `period_bucket`, `image_medium` (foto a colori, B/N, dipinto, poster, riproduzione), `composition` (ritratto, scena ampia, dettaglio, still life), `visual_style` e `quality_bucket`;
- `familiarity`: alta/media/bassa, tenendo conto del pubblico previsto e delle differenze culturali;
- `perceived_plausibility`: ordinaria/sorprendente/molto insolita;
- `surprise_reason` e `reveal_learning_point` (privati prima della risposta);
- `authenticity_confidence`, `rights_status`, `editorial_difficulty`, `reviewer` e `review_date`.

Stato candidato → revisione → approvato/rifiutato, con **decisione umana e audit**, riusando `worker/moderation.ts`. Ogni REAL sorprendente deve poter essere dimostrata con un riferimento archivistico preciso.

## 5. Bilanciamento con le immagini SLOP

**Regola:** REAL e AI devono avere distribuzioni *comparabili* di **categoria, tipo di immagine, regione, periodo rappresentato, rapporto d'aspetto, risoluzione, qualità, composizione, colore/B/N e condizioni di visualizzazione**.

Il rapporto 50/50 tra le etichette è necessario ma **non sufficiente**. È sbagliato creare, ad esempio, un catalogo in cui:
- quasi tutte le REAL sono vecchie foto sgranate e tutte le AI sono immagini 4K nitidissime;
- le REAL rappresentano Europa e le AI Stati Uniti;
- i poster sono sempre REAL o sempre AI;
- i soggetti assurdi sono sempre AI e le invenzioni sorprendenti sempre REAL.

Usare *strati* (categorie e metadati) per costruire distribuzioni simili, **senza obbligo di coppie gemelle 1:1** e senza sovrarappresentare i pochi gruppi disponibili. Quando lo stock in uno strato manca, scegliere una combinazione meno specifica, ma **non** dichiarare bilanciamento perfetto e non ripetere un'immagine.

**Trattamento tecnico omogeneo**: pipeline equivalenti di compressione, dimensioni, eventuali ritagli (solo se non alterano l'integrità), sharpening e profili colore; nessuna firma involontaria basata su uno specifico modello di generazione o una fonte. Evitare rimozione di crediti obbligatori. Le trasformazioni devono preservare informazioni rilevanti per il riconoscimento.

La somiglianza REAL/AI si costruisce quindi sul **dataset nel suo insieme**, non copiando una fotografia originale per generare sempre una versione gemella. La scelta casuale deve avvenire **dopo** la curatela.

## 6. Campionamento stratificato in partita — comportamento richiesto

### Versione minima realizzabile

1. Filtrare **esclusivamente** immagini `approved` e dell'ambiente corrente (demo/produzione), rispettando difficoltà e categorie selezionate.
2. Separare le candidate `REAL` e `AI`; selezionare numeri approssimativamente uguali (differenza massima **1**, quando la disponibilità lo consente). La difficoltà è quella scelta dal giocatore, non ricalcolata al volo.
3. Suddividere per **categoria/medium** come primo passaggio; usare regione/periodo/composizione come fattori secondari *se i metadati sono sufficienti*, senza restringere così tanto da rendere impossibile giocare.
4. Ricercare rappresentatività e ridurre correlazioni sistematiche: non far concentrare tutte le REAL in uno strato e tutte le AI in un altro; evitare ripetizione di soggetti o serie pressoché identici.
5. Randomizzare dentro gli strati e mescolare l'ordine finale; evitare ripetizioni nella stessa sessione.
6. Se manca un numero minimo per uno strato o una classe, ridurre onestamente il numero di round o segnalare il limite, secondo l'attuale politica del gioco. Non inventare asset, non cambiare silenziosamente classe e non usare immagini in revisione.
7. La selezione e l'etichetta restano **lato server**. Prima della risposta restituire solo round opaco e media autorizzato, non tipologia, licenza, descrizione storica, nome file o spiegazione.
8. Le stesse regole editoriali valgono per Allenamento, A tempo e PvP; conservare le attuali proprietà di session ownership, tempo e anti-replay. Non introdurre varianti non sincronizzate fra i due giocatori PvP.

### Algoritmo descrittivo (non codice da copiare senza revisione)

```text
pool = approved_catalog(user_filters, environment)
eligible = remove_conflicts_and_duplicates(pool)
real = eligible.filter(type == REAL)
ai = eligible.filter(type == AI)
target = choose_even_class_counts(real, ai, requested_count)
strata = group_by(category, medium; optionally period, region, composition)
selection = balanced_sample(real, ai, target, strata, diversity_constraints)
assert unique_images(selection)
assert abs(count_REAL(selection) - count_AI(selection)) <= 1 when possible
shuffle(selection)
persist_server_side(selection)
```

Per la modalità A tempo, l'attuale codice può arrivare a usare fino a **50 immagini**; la politica del preloading/server timer sarà trattata dal progetto dedicato (PR #7). Il selettore **non deve** far partire il timer durante un caricamento, né anticipare la risposta.

## 7. Calibrazione empirica della difficoltà

Usare dati aggregati di immagini e categorie già raccolti da `image_answer_statistics`; nel backend corrente la statistica per immagine viene mostrata solo con almeno **30 risposte**. Una soglia di 30 consente un primo segnale, **non** una stima precisa per sottogruppi culturali o confronti molto fini. Non aggiornare la difficoltà automaticamente.

**Obiettivi preliminari editoriali**, non garanzie:

| Profilo | Percentuale indicativa di risposte corrette |
|---|---|
| Facile | 80–95% |
| Medio | 65–80% |
| Difficile | 55–65% |
| Esperto (futuro) | Da calibrare separatamente, verificando che il risultato sia migliore del semplice caso |

Con due alternative il **50% è compatibile con il puro caso**. Un'immagine perfetta ma impossibile da distinguere in condizioni di gioco non è automaticamente una domanda «esperta» di qualità. La classifica può misurare anche incertezza e contesto, ma **non** promettere una deduzione sempre possibile dall'immagine sola.

Valutare inoltre tempo di risposta, prestazioni dei giocatori più esperti rispetto ai principianti e, se introdotto volontariamente, grado di sicurezza nella scelta. Niente profili sensibili e niente tracciamento non necessario. Registrare revisioni editoriali e motivazioni, senza cambiare automaticamente i dataset delle partite in corso.

## 8. Spiegazione dopo la risposta (obbligatoria per le REAL sorprendenti)

La rivelazione deve:
1. Dire **REAL** e identificare correttamente il soggetto.
2. Spiegare in una o due frasi perché la scena può sembrare artificiale, oppure quale aspetto è particolarmente interessante.
3. Mostrare una prova attendibile dell'autenticità (istituzione, scheda archivistica o URL di riferimento).
4. Mostrare autore, data (quando note), licenza/attribuzione nel rispetto degli obblighi.
5. Evitare affermazioni categoriche non documentate («è impossibile che sia AI») e descrizioni verbose che ripetano quanto già evidente dalla foto.

Per le immagini **AI**, spiegare dopo la risposta quale fatto/oggetto è stato inventato e, quando importante, l'anacronismo specifico con fonti di verifica. Non costruire narrazioni fasulle credibili fuori dal contesto del quiz.

## 9. Implementazione nel repository: istruzioni per Codex

**Stato rilevato (25 ottobre 2026):**
- `worker/game.ts`: `filteredCatalog()` filtra per categoria e difficoltà, `balanced()` separa già `REAL`/`AI` e fa shuffle, ma non stratifica per contenuto o stile.
- `worker/room.ts`: PvP importa le funzioni di selezione da `worker/game.ts`.
- `migrations/0001_initial.sql`: `images.difficulty` supporta `facile`/`medio`/`difficile`, `image_categories` è già presente.
- `migrations/0003_editorial_metadata.sql`: contiene la vista `image_answer_statistics`.
- `worker/moderation.ts` registra revisioni e difficoltà, ma non le nuove dimensioni editoriali.
- La demo usa immagini sintetiche geometriche **con etichette simulate**: non far passare questi risultati per una calibrazione su fotografie reali.

**Piano di implementazione incrementale (senza rompere la demo):**

1. **Metadati privati** — proporre una migrazione incrementale `image_curation` referenziata a `images.id` per categoria tipologica, stile/composizione, periodo, regione, familiarità, plausibilità percepita e note editoriali. Separare ciò che è verificato dai giudizi soggettivi. Evitare alterazioni distruttive della tabella `images`; documentare valori mancanti e retrocompatibilità.
2. **Moderazione** — aggiungere i campi al modulo/admin esistente con validazione e audit, senza esporre annotazioni o etichette agli endpoint di gioco prima del reveal.
3. **Campionamento** — estendere `balanced()` o creare `curatedSample()` riutilizzata da solo/PvP. La selezione resta server-side, riproducibile nei test tramite randomizzazione iniettata e con comportamento di fallback esplicito quando mancano tag. Non richiedere per forza nuovi servizi cloud.
4. **Statistiche** — presentare al revisore tasso di correttezza, numerosità e proposta di calibrazione, senza cambiare in automatico le difficoltà assegnate.
5. **Verifiche** — test su rapporti REAL/AI, nessuna correlazione artificiosa forte negli strati fattibili, assenza duplicati e spoiler, catalogo piccolo, campi mancanti, filtri, demo, Allenamento, A tempo e PvP.
6. **Dopo** aver verificato il comportamento, popolare progressivamente il catalogo con immagini REAL licenziate e AI revisionate: nessun import automatico di materiali dubbi.

**Interfacce:** niente riorganizzazione globale dell'app o cambiamenti arbitrari dei timer. Rispettare il lavoro separato sul tema Digital Gallery e sul preloading (PR #7); gli interventi che condividono file devono essere rebasati e testati con attenzione.

**Criteri di accettazione della prima PR di codice:**
- dato un pool bilanciabile, scarto REAL/AI <=1; zero duplicati nella sessione;
- se esistono più stili/categorie, campione più equilibrato dell'attuale shuffle senza bias sistematici evidenti; fallback quando il catalogo è piccolo;
- dati REAL con provenienza e diritti non ambigui prima dell'approvazione;
- file di demo e dati fixture invariati se non espressamente necessario per test;
- nessun campo di etichetta/curatela rivelato prima della risposta;
- `npm run lint`, `npm test`, `npm run build`, `npm run test:integration` superati negli ambienti disponibili.

Preparare **PR di codice in bozza**, con resoconto test e prima/dopo della distribuzione degli strati. **Non** fare merge, deploy remoto, creazione bucket R2, modifiche al database di produzione o acquisti senza approvazione.

## 10. Collegamenti e versionamento

- Fonti candidate REAL: `docs/fonti-immagini-real-v1.0.0.md` (PR #7, branch `codex/05-fonti-e-design-preload`).
- Tema Digital Gallery e preparazione immagini: `docs/istruzioni-codex-tema-precaricamento-v1.0.0.md` (PR #7).
- Generazione SLOP: `docs/protocollo-generazione-slop-v1.0.0.md` (PR #8, branch `codex/06-protocollo-generazione-slop`).

### Changelog

- **v1.0.0 — 25 ottobre 2026:** scelta REAL per curatela, quattro quadranti REAL/AI × ordinario/insolito, difficoltà editoriale REAL, campionamento stratificato e piano tecnico per implementazione progressiva.
