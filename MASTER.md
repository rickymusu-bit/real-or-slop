# Mappa del progetto

Versione 39.0.0, aggiornata il 2026-11-25T20:45:04Z. Percorsi relativi alla radice del repository; le versioni precedenti sono nella
cronologia git.

Questa mappa dice dove si trova ogni cosa e a che punto è il progetto: quali file sono in uso, quali specifiche sono vigenti, come si
rilascia. Le regole di lavoro sono in `AGENTS.md`, la storia delle versioni
in `CHANGELOG.md`.

## Stato

- **Ramo 1.60.0:** pipeline completa della galleria, `docs/generazione-slop.md` 17.0.0. Preparazione collettiva delle REAL,
  parametri e particolarità, indici, regole/probabilità rivedibili, cambio ambiente/genere, scene inglesi, formato per candidata,
  generazione dal solo testo, valutazione e correzioni confermate. Workflow senza ripetizioni, maschera visibile e modificabile,
  accettazione umana, trattamento per genere e preparazione comune WebP. Migrazione 0073. Nessuna elaborazione reale avviata.
  Schema `docs/assets/pipeline-slop.svg`, disponibile anche dal wizard; test API e browser con OpenAI simulato.
- **Ramo 1.59.0:** indice esatto dei soggetti e ricerca semantica degli ambienti delle REAL. Il comando «Indicizza le descrizioni»
  completa le REAL già descritte, con chiamate confermate. Migrazione 0072.
- **Ramo 1.58.0:** descrizioni visive private in inglese delle REAL per otto assi, durante il caricamento o in gruppo dalla galleria. La griglia
  segnala le REAL senza descrizione. Migrazione 0071. Il wizard SLOP usa ancora il flusso 1.57.0.
- **In produzione la 1.57.0 (PR #173):** un solo wizard SLOP (galleria, REAL da un'estrazione corretta e modificabile, proposte dell'owner o del modello,
  scelta, prompt modificabili, generazione, revisione); tolta la generazione manuale; le proposte delle REAL si gestiscono solo nel
  wizard. Nessuna migrazione.
- **Integrata in main la 1.56.0 (PR #172):** niente Indicazioni SLOP di galleria né loro proposta automatica; contano le idee approvate delle REAL, con
  titolo e descrizione della galleria come contesto. Migrazione 0070.
- **Integrata in main la 1.55.0 (PR #171):** idee di falsificazione delle REAL (fino a tre, proposte con una chiamata confermata, approvate dall'owner),
  estrazione automatica delle sole REAL con un'idea libera, corretta su affollamento e dettaglio, riferimenti REAL-processo fino alla
  fine del processo con l'idea usata all'accettazione. Migrazione 0069. Da fare: valutazione per asse delle SLOP.
- **In produzione la 1.54.0 (PR #170):** dettaglio con sette categorie graduate 0, 1 o 2 (formula 2), dopo le prime misure reali; le
  misure precedenti restano come formula 1. Migrazione 0068.
- **In produzione la 1.53.0 (PR #169):** affollamento e dettaglio delle REAL misurati su richiesta da un modello (una chiamata confermata per foto),
  punteggi calcolati dal Worker, soglie per galleria con valori predefiniti nelle Impostazioni, sola segnalazione delle REAL oltre
  soglia. Le idee di falsificazione delle SLOP sono sospese finché non si vede come il modello misura. Migrazione 0067.
- **Integrata in main la 1.52.0 (PR #168):** controllo notturno delle fonti Commons delle REAL, 50 a notte (modificabile da Impostazioni → Fonti Commons, da 0
  a 500) dopo tre mesi dall'ultimo controllo, solo segnalazione nella galleria e nel dettaglio. Migrazione 0065.
- **Integrata in main la 1.51.0 (PR #167):** niente descrizione editoriale né analisi a pagamento delle REAL, niente descrizione delle SLOP; nei
  risultati i crediti delle REAL e prompt e modello delle SLOP. Le proposte SLOP leggono originale, titolo e descrizione della fonte.
  Migrazione 0066, che salva anche le proposte di «Base comune» e «Premessa e prompt di galleria» (su richiesta dell'owner). La 0064
  del primo giro della PR, mai applicata in produzione, è stata tolta.
- **Integrata in main la 1.50.0 (PR #166):** niente tag (decisione dell'owner del 2026-11-20). L'analisi a pagamento riguarda solo le REAL e restituisce la
  descrizione editoriale; le SLOP non si analizzano e il tetto del ciclo passa da `1 + 2N` a `2N` chiamate. Bianco e nero, seppia o
  colore del trattamento SLOP si ricavano dalla crominanza residua misurata sulla REAL (misure 4, trattamento 6). Migrazione 0063.
  Le copie si rimisurano da sole all'apertura delle gallerie.
- **Integrata in main la 1.49.0 (PR #165):** il riquadro si centra sull’asse in cui supera la foto, per mantenere simmetriche le bande nere.
- **Integrata in main la 1.48.0 (PR #164):** ritaglio 4:5 direttamente sulla foto adattata, compresa la parte con bande nere.
- **Integrata in main la 1.47.0 (PR #163):** foto intera di default nel 4:5, maniglie, gesto a due dita corretto e «Salva» visibile su mobile.
- **Integrata in main la 1.46.0 (PR #162):** barra compatta sotto la griglia per cambiare stato o galleria e deselezionare. Il dettaglio riunisce i comandi
  per tag, inquadratura, trattamento e ripetizione confermata dell’analisi IA.
  Acquisizione REAL con conteggio sul totale selezionato, barra di progresso e pagina bloccata fino alla fine delle copie di gioco.
  I risultati del gioco e il riepilogo del wizard leggono la descrizione editoriale delle REAL. I risultati conservano l’attribuzione.
  Inquadratura 4:5 con ritaglio a due dita o adattamento in larghezza. Le elaborazioni delle foto bloccano la finestra con uno stato al centro.
- **Integrata in main la 1.45.0 (PR #161):** pagine dedicate per i wizard REAL e SLOP, ritorno alla galleria e indirizzo della revisione filtrata per batch.
- **Integrata in main la 1.44.0 (PR #160):** eliminazione definitiva da «Modifica galleria» con conferma, rimozione atomica dal catalogo e coda R2.
- **Integrata in main la 1.43.0 (PR #159):** dashboard aperta su Gallerie con anteprime e creazione. Ogni galleria apre la griglia e i wizard di caricamento
  REAL da ricerca Commons e di generazione SLOP. Distribuzione in Statistiche.
- **Integrata in main la 1.42.0 (PR #158, issue #157):** gallerie obbligatorie, estrazione casuale per galleria e conferme separate per
  proposte e immagini. Migrazioni 0060 e 0061. La 0061 azzera il D1 attuale al rilascio su decisione dell’owner e rimuove
  la genealogia tra REAL e SLOP. Il browser usa nuove chiavi per le bozze del wizard e dello studio.
- **In produzione la 1.41.0 (PR #156):** scelta esplicita dal Database o da Commons, estrazione casuale disponibile, ritiro
  della REAL legata alla SLOP. Build Cloudflare del 2026-11-18 alle 19:18 UTC. La 1.42.0 sostituisce queste regole.
- **Integrata in main la 1.39.0 (PR #155):** tolti dal Database i tre checkbox di manutenzione e il loro stato/parametri del browser; test delle analisi adattati a origine, ricerca e selezione esplicita. Anteprima gratuita delle REAL estratte prima del batch automatico: miniature, titoli, tag, originale intero e descrizione; riestrazione/annullamento senza chiamate. Avvio vincolato alle stesse REAL con token firmato, revisioni controllate nella transazione e ID batch monouso. Rimossi i gruppi di genere/decennio da Database, statistiche, API e schema: migrazione 0056 con conservazione del contesto storico come tag ordinari. Bilanciamento solo per conteggi e disponibilità madre–figlia. Migrazione 0057: via didascalie, vista iniziale e spiegazione inutilizzata; dettaglio/API con metadati distinti per REAL e SLOP, query del gioco limitata ai dati necessari. Accettazione manuale estesa a candidate valutate con difetti critici/minori, incertezze o vincoli non confermati nei processi conclusi/sospesi; decisione registrata separatamente, conferma con le segnalazioni e massimo una chiamata per i tag. Migrazione 0058: titoli solo REAL, SLOP identificate tramite ID; rimossi riquadro e tag di partenza dalla figlia, conservando parametri tecnici della copia. Contratto esatto degli ingressi del valutatore documentato e verificato. Nessun merge, deploy, migrazione remota o chiamata reale eseguiti per questa versione.
- **Integrata in main la 1.38.0 (PR #154):** modalità manuale e automatica, registro privato delle REAL occupate (0055), composizioni variate e CI alleggerita. Merge confermato in questa sessione; funzionamento segnalato dall'owner.
- **Integrata in main la 1.37.0 (PR #152):** dashboard nelle cinque sezioni, ricerca catalogo e conteggi grezzi. Migrazione 0054. Stato del deploy non verificato in questa sessione.

- **Integrata in main la 1.36.0 (PR #151):** SLOP indipendenti e migrazione 0053, inclusa la validazione del trattamento anonimo per campioni malformati. Revisione tecnica in `docs/revisione-codice.md`. Stato del deploy non verificato in questa sessione.

- **Resoconto del rilascio:** app 1.35.0 (PR rickymusu-bit/real-or-slop#149; migrazioni fino alla 0052), Workers Paid dal 2026-11-16,
  Workers Logs attivi. 20 REAL approvate con tag e descrizione; copie fatte nel browser (con la 1.34.0 restano valide). Nessuna immagine pubblicata. Il primo batch automatico, ripreso sul server il 2026-11-16 alle 08:24 UTC, è finito alle
  08:32: 4 SLOP accettate (3 con copia; quella in bianco e nero accettata alle 05:38 senza copia, vedi 1.33.1), 4 revisioni chieste,
  2 incerti. Su indicazione dell'owner, il 2026-11-15 sono stati salvati direttamente nel D1 il contesto «Brief e prompt per le SLOP»
  proposto e la soglia dello studio a 20 REAL. Qualità immagini `medium`. Il secondo batch automatico (2026-11-16, 10 REAL): 8
  accettate con le note d'incertezza, 2 in revisione con i vincoli non confermati e senza difetti critici.
- **Nel ramo 1.35.1 (PR da unire):** «Accetta il tentativo N» anche per i tentativi con i vincoli editoriali non confermati ma
  senza difetti critici; la conferma avverte di rileggere le incertezze. Edifici e luoghi reali nominati o inventati dal brief
  caso per caso, mai riprodotti fedelmente; il valutatore non giudica la fedeltà all'aspetto reale.
- **Nella 1.35.0:** «Accetta il tentativo N» per i processi in revisione, con l'analisi dei tag; le note
  d'incertezza su luogo, data e identità non fermano più l'accettazione. Dei 6 processi senza SLOP del primo batch, i 4 in revisione
  si possono accettare; i 2 incerti (un brief, un'immagine pagata ma mai salvata) si chiudono e si rigenerano in un nuovo batch.
  Seppia distinto dal bianco e nero: tinta sui mezzitoni (algoritmo 5), misurata sulle REAL (misure 3: al primo accesso il
  browser rimisura le copie, gratis), tinta seppia di partenza nel riquadro dei cursori.
- **Nella 1.34.0 (include la 1.33.1):** il Worker gestisce ciò che riguarda OpenAI, il browser tutto il resto
  (decisione dell'owner del 2026-11-16): copie di gioco, misure e «Rifai la copia di gioco» tornano nel browser, senza binding
  Images né Workflow delle copie; trattamento delle SLOP regolabile con i cursori e anteprima nella pagina. Dopo il rilascio vanno
  rifatte nel browser le copie delle SLOP preparate dal Worker (le 3 a colori del primo batch) e preparata quella in bianco e nero.
- **Nella 1.33.1 (non rilasciata da sola):** errori con il loro motivo; eccezioni impreviste scritte nei log.
- **Nella 1.33.0:** un passo fermato dalla piattaforma chiude solo la sua REAL; «Riprendi sul server» anche per un batch in
  revisione; copia della SLOP in un passo a sé; limite di CPU di cinque minuti; Workers Logs (1.32.1).
- **Nella 1.32.0:** il browser è solo un'interfaccia: copie di gioco preparate dal Worker con il binding Images, «Rifai la copia di
  gioco» come Workflow.
- **Nella 1.31.0:** il ciclo SLOP gira su Cloudflare in un Workflow; la dashboard lo avvia e lo segue.
- **Nella 1.30.3:** brief e prompt con una richiesta per REAL; un batch rimasto «in scrittura» oltre dieci minuti riprende dai brief
  mancanti, senza ripetere quello interrotto.
- **Nella 1.30.2:** analisi in gruppo anche per gli esiti incerti o interrotti; nelle Impostazioni un modulo non sovrascrive gli altri.
- **Nella 1.30.1:** invio dell'immagine ai modelli senza copie in stringhe (memoria), ripetizione dalla scheda
  di un'analisi rimasta «in corso» oltre dieci minuti.
- **Nella 1.30.0:** nel Database il tasto «Seleziona tutte», per le immagini mostrate da vista e filtri.
- **Nella 1.29.0:** analisi di REAL e SLOP sull'originale intero invece della copia 4:5; processi senza SLOP in
  evidenza nello studio, con immagini, prompt e valutazioni di ogni tentativo, conservati fino alla chiusura dell'owner; con
  tolleranza 0 i difetti minori fanno rigenerare invece di fermare il ciclo; nel Database filtro «REAL senza descrizione» e analisi
  combinata in gruppo; ripetizione confermata degli esiti incerti anche dal wizard. Nessuna migrazione.
- **Selezione REAL:** otto principi qualitativi nella issue #138; nessun filtro o scoring automatico.
- **Da decidere con l'owner:** se e come comunicare al giocatore il processo di generazione dopo la risposta.
- **Più avanti:** generatori di immagini alternativi. L'idea degli embedding dei tag per Topic Discovery decade con i tag.

## Specifiche vigenti

Ogni specifica descrive il comportamento attuale della sua area e dichiara la sua versione nell'intestazione; le specifiche si citano per
nome.

| Area | Specifica | Versione |
|---|---|---|
| Libreria, stati, chiamate a pagamento, modelli, contesto dei modelli, controllo delle fonti, affollamento e dettaglio, dati | `docs/libreria-immagini.md` | 10.5.0 |
| Contenuti delle SLOP, marchio, metadati, trasparenza | `docs/contenuti-e-trasparenza.md` | 1.4.2 |
| Copie di gioco, formati, inquadratura, misure e trattamento delle SLOP | `docs/copie-di-gioco.md` | 13.1.0 |
| Dashboard, anteprima a pressione prolungata, wizard REAL | `docs/dashboard-admin-wizard-real.md` | 6.3.0 |
| Protocollo SLOP adottato, parametri, valutazione e correzioni; stato del wizard | `docs/generazione-slop.md` | 17.0.0 |
| Vincoli fotografici specifici della galleria Nintendo | `docs/regole-galleria-console-nintendo.md` | 2.0.0 |
| Foto e gallerie | `docs/database-immagini.md` | 10.5.0 |
| Partita a livelli e classifica | `docs/gioco-a-livelli.md` | 4.0.0 |
| Statistiche e Impostazioni | `docs/statistiche-impostazioni.md` | 4.9.0 |
| Privacy e note legali | `docs/privacy-note-legali.md` | 1.4.0 |

**Documenti tolti.** Il 2026-11-14 l'owner ha chiesto di cancellare i documenti che non servono più: le specifiche precedenti, le note
delle vecchie pipeline e le snapshot di `AGENTS.md` e `MASTER.md`. Restano nella cronologia git: `git log -- docs/<nome>` trova il
commit che li ha cancellati e `git show <commit>^:docs/<nome>` li mostra. Corrispondenze delle ultime specifiche con la versione nel nome:

| Prima | Ora |
|---|---|
| `libreria-immagini.v1.8.0`, `categorie-tag.v1.1.0` | `libreria-immagini`, `contenuti-e-trasparenza` |
| `dashboard-admin-wizard-real.v1.3.0`, `didascalie-wizard.v1.0.0`, `anteprima-descrizione.v1.2.0` | `dashboard-admin-wizard-real` (e le altre aree per le parti relative) |
| `wizard-slop.v1.4.1`, `proposta-generazione-slop.v2.0.1` | `generazione-slop` |
| `database-immagini.v1.0.1` | `database-immagini` |
| `copie-di-gioco.v5.0.0` | `copie-di-gioco` |
| `gioco-a-livelli.v1.0.1` | `gioco-a-livelli` |
| `statistiche-impostazioni.v1.0.1` | `statistiche-impostazioni` |
| `privacy-note-legali.v1.0.4` | `privacy-note-legali` |

## Sequenza storica delle PR della pipeline 2

- **Documentazione:** specifiche, istruzioni e mappa, senza codice né rilascio.
- **Backend (implementato 1.27.0):** estendere la chiamata di catalogazione REAL a **tag+descrizione neutra** in un unico output; poi chiamata
  **testuale** descrizione+tag → brief+prompt, stati persistenti, brief immutabile, valutazione strutturata,
  controllo spesa e fake API. Nessuna seconda lettura visiva della REAL nella generazione.
- **Frontend (implementato 1.27.0):** descrizione della REAL modificabile nel wizard e nel Database; ciclo nel browser, immagine SLOP **intera**
  sottoposta al valutatore, copia 4:5 **solo dopo** accettazione, configurazioni, anteprime e revisione.
- **Rilascio:** 1.27.0 rilasciata il 2026-11-15; correzioni nella 1.28.0. Il merge su main esegue deploy e migrazioni remote.
  Consultare `generazione-slop` 5.5.0, sezione 10. I batch della 1.26.0 in pausa **non** vanno ripresi con schema incompatibile.

## Architettura

Nomi stabili, senza versione (`AGENTS.md`, regola 3); nel repository ci sono solo i file in uso.

**Browser** (Vite e TypeScript, `src/`, ingresso `main.ts`):
- Sito: home con classifica, «Come funziona», «Fonti e crediti» (`main.ts`, `style.css`); pagine legali (`legal.ts`, `legal.css`).
- Gioco: `play.ts` e `play.css`, foto esplorabile `photo-viewer.ts`, precaricamento `preload.ts`, marchio «RS» `media-mark.ts`,
  protezioni `media-privacy.ts`.
- Dashboard: `library.ts` (finestra della galleria, Statistiche e Impostazioni; CSS `library.css`, `database.css`, `admin-navigation.css`,
  `admin-loading.css`, `model-context.css`, `caption-count.css`), gallerie `galleries.ts` e `galleries.css`, pagine dei wizard `gallery-wizard.ts` e `gallery-paths.ts`, wizard REAL `real-wizard.ts` e `real-wizard.css`, wizard SLOP
  `pipeline.ts` e `pipeline.css` (nuovo flusso completo), `slop-auto.ts` e `slop-auto.css` (avviso di sbilanciamento nelle Statistiche),
  `slop-studio.ts` e `slop-studio.css` (recupero delle lavorazioni precedenti), statistiche `stats.ts` e
  `stats.css`, grafico della distribuzione `database-chart.ts`, anteprima a pressione prolungata `image-preview.ts` e
  `image-preview.css`, editor di formato e ritaglio `crop-editor.ts` e
  `crop-editor.css`, avviso di elaborazione `photo-processing.ts` e `admin-loading.css`, cursori del trattamento delle SLOP con anteprima
  `treatment-editor.ts` e `treatment-editor.css`, copie di gioco preparate nel browser `game-copy.ts`, lettura e generazione delle
  descrizioni visive `real-description.ts`.

**Worker** Cloudflare (`worker/`, ingresso `index.ts`):
- `core.ts` (accesso admin, errori), `storage.ts` (file del gioco senza metadati), `maintenance.ts` (manutenzione giornaliera),
  `commons-check.ts` (controllo notturno delle fonti Commons delle REAL), `real-measure.ts` (misura a pagamento di affollamento e
  dettaglio delle REAL, storico, soglie), `real-ideas.ts` (idee di falsificazione delle REAL: proposta a pagamento, revisione,
  disponibilità per l'estrazione), `real-description.ts` (descrizione visiva privata delle REAL dall'originale intero),
  `real-index.ts` (identità normalizzata dei soggetti, vettori e ricerca degli ambienti).
- Libreria `library.ts` (stati, modifiche, distribuzione, copie), partite in corso e copie trattenute `in-play.ts`,
  gallerie `galleries.ts`, cancellazione di gallerie e file `gallery-removal.ts`, contesto dei modelli `model-context.ts`, modelli `models.ts`, Impostazioni `app-settings.ts`, statistiche
  `stats.ts`, registro condiviso delle chiamate `paid.ts`, Commons `commons-editorial.ts`.
- SLOP: nuovo protocollo `pipeline.ts` e tipi/estrazioni `shared/pipeline.ts`; schema illustrato `docs/assets/pipeline-slop.svg`.
  Compatibilità delle lavorazioni precedenti: rotte `slop.ts`, conteggi del catalogo `slop-references.ts`, generazione e valutazione `slop-generation.ts`, ciclo su Cloudflare
  (Workflow `SlopBatchWorkflow`) `slop-runner.ts`, batch del wizard `slop-auto.ts`, estrazione, REAL disponibili, preparazione,
  correzione e conferma dei prompt `slop-gallery.ts`.
- Corpo delle richieste con un'immagine (analisi e valutazione, base64 scritto nei byte) `image-body.ts`.
- Copie di gioco: controllo e conservazione della copia caricata dal browser in `library.ts` (`POST /:id/copy`).
- Gioco `game.ts` con `sampling.ts` e `random.ts`, classifica `leaderboard.ts`.

**Codice condiviso** (`shared/`): modelli OpenAI
`models.ts`, tipi dei batch `slop-proposals.ts`, preferenze di composizione `slop-composition.ts`, formati e ricetta della copia
`game-copy.ts`, misure e trattamento `copy-treatment.ts`, affollamento e dettaglio delle REAL `real-measure.ts`, descrizione visiva `real-description.ts`, estrazione corretta sui due assi `idea-sampling.ts`, licenze ND
`licenses.ts`, pulizia dei metadati `media-clean.ts`, livelli e punteggio `levels.ts`, costanti legali `legal.ts`, controllo delle
immagini `editorial.ts` (brief e valutazioni), `image-label.ts` (titolo REAL o ID SLOP), `image-dimensions.ts`, `image-format.ts`, `image-geometry.ts`, precaricamento `preloading.ts`, `html.ts`.

**Test** (`tests/`): unitari `*.test.ts` (`npm test`); d'integrazione `*.integration.py`, eseguiti da `scripts/integration.py` con il
modello finto `fake_openai.py` (che simula anche l'API di Commons per il controllo delle fonti) e gli aiuti `catalog.py`, `game_copy.py`, `long_press.py`, `local_db.py` (sole fixture nello SQLite di D1 isolato); `cloudflare-workers.mjs` sostituisce in Node
il modulo `cloudflare:workers` per i test unitari.

**Dati.** D1 con le migrazioni in `migrations/`:

| Migrazione | Contenuto |
|---|---|
| 0033 | schema pulito: immagini, tag, gioco |
| 0034 | alias, rimozione dei tag orfani, stato dell'analisi, registro delle chiamate |
| 0035 | tag e didascalie generati, ripristinabili |
| 0036 | didascalia fino a 256 caratteri (eliminata dalla 0057) |
| 0037 | contesto dei modelli con versioni |
| 0038 | categoria dei tag |
| 0039 | registro delle chiamate senza importi, impostazioni dei modelli |
| 0040 | gruppi di generazione SLOP |
| 0041 | copia di ogni round, copie ritirate in attesa |
| 0042 | inquadratura della copia |
| 0043 | partite a livelli e classifica, via le tabelle del PvP |
| 0044 | impostazioni dell'app (qualità, soglie, durata delle partite aperte) |
| 0045 | batch automatici delle SLOP, proposte ignorate |
| 0046 | formato nel ritaglio (la vista iniziale resta, inutilizzata) |
| 0047 | didascalie cancellate; colonne residue poi eliminate dalla 0057 |
| 0048 | categorie Genere, Colore e Supporto al posto di Formato; completamento, misure, trattamento e gruppo delle immagini; gruppo dei batch; soglia del gruppo |
| 0049 | REAL di origine di una SLOP gemella |
| 0050 | descrizione editoriale REAL e provenienza, contesto Commons separato, processi/tentativi privati, chiamate evaluation e collegamenti, snapshot e impostazioni del loop; batch legacy invariati |
| 0051 | contesto «Valutazione delle SLOP» e pipeline di ogni versione del contesto (testi delle gemelle = 1) |
| 0052 | runner del ciclo SLOP su Cloudflare per batch: istanza, stato, ultimo passo |
| 0053 | snapshot editoriali anonimi, rimozione dei legami REAL/SLOP; conservazione di processi, tentativi e chiamate |
| 0054 | proposte ignorate con fabbisogno assoluto e rimozione delle soglie obsolete; altre impostazioni conservate |
| 0055 | registro privato REAL/processo/figlia, cancellazione definitiva che libera la madre, eliminazione delle proposte e dell’opzione |
| 0056 | elimina i gruppi da colonne, impostazioni e snapshot; contesto storico convertito in tag ordinari, immagini/processi/chiamate/legami conservati |
| 0057 | elimina le sei colonne obsolete di didascalie, vista iniziale e spiegazione; ogni altro dato e collegamento conservati |
| 0058 | titoli solo REAL, nessun tag ereditato sulla figlia; parametri tecnici della copia e relazioni preservati senza ricostruire images |
| 0059 | ritira dal gioco le REAL legate a SLOP e conserva le copie delle partite in corso, regola sostituita dalla 0061 |
| 0060 | gallerie, premesse, riferimenti temporanei e contesto delle proposte |
| 0061 | azzera i dati applicativi del D1, elimina il registro madre–figlia e rende obbligatoria la galleria |
| 0062 | rimuove i contenuti insieme alla galleria e registra i file R2 da eliminare |
| 0063 | elimina tag, alias e categorie con i trigger, `generated_tags` e `categories_completed_at`; ogni altro dato conservato |
| 0065 | data dell'ultimo controllo della fonte Commons e della mancanza del file; la data di acquisizione vale come primo controllo; chiave delle Impostazioni per il numero di controlli a notte |
| 0066 | elimina descrizione editoriale, provenienza, testo Commons originale e campi dell'analisi; svuota la descrizione delle SLOP; versioni correnti di «Base comune» e «Premessa e prompt di galleria» uguali alle proposte |
| 0067 | misure di affollamento e dettaglio delle REAL (`real_measures`), soglie delle gallerie, parte `real_measure` del contesto e chiavi delle soglie predefinite nelle Impostazioni |
| 0068 | formula delle misure (1 per le esistenti) e nuova proposta di «Misura delle REAL» se quella in vigore è la prima |
| 0069 | idee di falsificazione delle REAL (`real_ideas`), motivo senza idee, idea nel riferimento REAL-processo, trigger che tengono i riferimenti fino alla fine del processo e segnano l'idea usata, parte `real_ideas` del contesto |
| 0073 | profili e scene privati, regole/probabilità delle gallerie e lavorazioni temporanee con pulizia durevole |
| 0070 | elimina le Indicazioni SLOP delle gallerie e la revisione registrata sulle idee; nuova proposta di «Premessa e prompt di galleria» se quella in vigore è la 0066 |
| 0071 | descrizioni visive delle REAL e controllo delle richieste concorrenti |
| 0072 | indici D1 per marca, famiglia e modello delle REAL, con vettori degli ambienti che scadono alla modifica del testo |

R2: quarantena privata (`library/<id>/`, originale e copia) e bucket del gioco (copie pubblicate).

## Rilascio e anteprime

- Il merge su `main` avvia Workers Builds: `npm run build`, poi `npx wrangler d1 migrations apply DB --remote && npm run deploy` sulle
  risorse di produzione (D1 `real-or-slop-local`, R2 `real-or-slop-quarantine` e `real-or-slop-approved`).
- Anteprime delle PR: migrazioni con `--env preview`, poi `npm run preview` (controllo `scripts/check-preview.mjs`) su D1
  `real-or-slop-preview` e R2 `real-or-slop-preview-quarantine` e `real-or-slop-preview-approved`, inizialmente vuoti.
- CI (`.github/workflows/checks.yml`): lint, unitari, build e dry-run sempre; `scripts/select-integration.mjs` seleziona le suite per le aree modificate. File sconosciuti, dipendenze condivise e infrastruttura eseguono tutto. `workflow_dispatch` esegue tutto. Desktop e mobile per ogni suite browser selezionata; cache pip e Chromium. Non parte per le PR solo documentali. Tempi per suite in `artifacts/integration-timings.json`.
- Tag: al merge su `main` il workflow `release-tag` (`.github/workflows/release-tag.yml`) crea `vX.Y.Z` con la versione di
  `package.json`, se non esiste già.
- Manutenzione giornaliera: Cron Trigger alle 03:17 UTC.
- Log: Workers Logs attivi (`observability` in `wrangler.jsonc`, dal 2026-11-16, su richiesta dell'owner): errori e messaggi di
  richieste, passi dei Workflow e manutenzione, conservati da Cloudflare per pochi giorni, URL senza query string. Vanno scritti nel
  file perché ogni rilascio applica la configurazione del file e spegnerebbe quella impostata dalla dashboard.

## Verifiche

`npm run lint`, `npm test`, `npm run build`, `npm run dry-run`, `npm run test:integration` (Worker locale con D1 e R2 locali e il modello
finto `tests/fake_openai.py`) e `ROS_TEST_BROWSER=1 npm run test:integration` per la dashboard, desktop e mobile. L'elenco dei
test d'integrazione eseguiti è in `scripts/integration.py`.

**Verifica locale della 1.39.0:** lint, unitari (30 file), build e dry-run passati; tutte le 13 suite di integrazione, comprese le sei suite browser desktop/mobile, passate. Controllati estrazione gratuita, immagini intere, riestrazione/annullamento, avvio sulle stesse REAL, riferimenti modificati/occupati, firma/scadenza e riutilizzo della selezione. La migrazione 0057 ha un test di conservazione di ogni altra colonna e dei legami; la CI della PR #155 viene ricontrollata sul commit finale, inclusa l’accettazione manuale con segnalazioni, senza duplicati e con valutazione originale conservata. Solo modelli finti e risorse locali.

**Verifica locale della 1.38.0:** lint, unitari (26 file), build, dry-run e tutte le 13 suite di integrazione, comprese le sei suite browser su desktop/mobile, passati. Confronto nello stesso ambiente: 501,18 s su main contro 206,77 s sul ramo (−58,7%); misura della sola integrazione con browser, non dei minuti fatturati. Nessun modello reale o risorsa remota.

**Verifica locale della 1.29.0:** esiti nella PR. Solo API fittizia, D1 e R2 locali. Per la suite con browser in un container senza
il modulo Python `playwright`: `pip install playwright` e `ROS_CHROMIUM_PATH` sul Chromium installato.

**Consegna del lavoro:** pubblicare sempre il ramo e aprire o aggiornare una PR per avviare i controlli CI (`AGENTS.md` 22.3.0). Commit e patch locali non completano la consegna.


**Selezione locale:** `ROS_TEST_SUITES=slop,slop_auto ROS_TEST_BROWSER=1 npm run test:integration` seleziona nomi esatti e rifiuta nomi sconosciuti. Senza selezione resta la suite completa; `ROS_TEST_MATCH` resta disponibile per filtri locali. Le fixture `tests/local_db.py` accettano solo `.wrangler/integration`, non un database remoto o un altro stato locale.
