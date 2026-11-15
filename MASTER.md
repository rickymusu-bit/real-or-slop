# Mappa del progetto

Versione 23.3.2, aggiornata il 2026-11-15T21:07:23Z. Percorsi relativi alla radice del repository; le versioni precedenti sono nella
cronologia git.

Questa mappa dice dove si trova ogni cosa e a che punto è il progetto: quali file sono in uso, quali specifiche sono vigenti, come si
rilascia. Le regole di lavoro sono in `AGENTS.md`, la storia delle versioni
in `CHANGELOG.md`.

## Stato

- **In produzione:** app 1.30.1 (PR rickymusu-bit/real-or-slop#144, deploy alle 21:01 UTC; migrazioni fino alla 0051). Alle
  21:05 UTC 16 delle 20 REAL approvate hanno tag e descrizione dall'originale intero; 4 sono ferme «in corso» dalle 19:10, quando
  il Worker ha superato il limite di memoria, e si ripetono dalla scheda o, con la 1.30.2, in gruppo. Nessuna immagine pubblicata: nessun livello è giocabile. Su indicazione dell'owner, alle 17:24 UTC sono stati salvati direttamente nel D1
  il contesto «Brief e prompt per le SLOP» proposto (pipeline 2) e la soglia dello studio a 20 REAL. Qualità immagini `medium`.
- **Nel ramo 1.30.2 (PR da unire):** le analisi in gruppo includono le immagini con esito incerto o interrotto, nominate nella
  conferma; messaggio corretto quando nessuna selezionata è senza descrizione.
- **Nella 1.30.1:** invio dell'immagine ai modelli senza copie in stringhe (memoria), ripetizione dalla scheda
  di un'analisi rimasta «in corso» oltre dieci minuti.
- **Nella 1.30.0:** nel Database il tasto «Seleziona tutte», per le immagini mostrate da vista e filtri.
- **Nella 1.29.0:** analisi di REAL e SLOP sull'originale intero invece della copia 4:5; processi senza SLOP in
  evidenza nello studio, con immagini, prompt e valutazioni di ogni tentativo, conservati fino alla chiusura dell'owner; con
  tolleranza 0 i difetti minori fanno rigenerare invece di fermare il ciclo; nel Database filtro «REAL senza descrizione» e analisi
  combinata in gruppo; ripetizione confermata degli esiti incerti anche dal wizard. Nessuna migrazione.
- **Da fare:** l'owner lancia dal Database l'analisi combinata delle 20 REAL (20 chiamate a pagamento).
- **Selezione REAL:** otto principi qualitativi nella issue #138; nessun filtro o scoring automatico.
- **Da decidere con l'owner:** se e come comunicare al giocatore il processo di generazione dopo la risposta.
- **Più avanti:** embedding dei tag per Topic Discovery; generatori di immagini alternativi.

## Specifiche vigenti

Ogni specifica descrive il comportamento attuale della sua area e dichiara la sua versione nell'intestazione; le specifiche si citano per
nome.

| Area | Specifica | Versione |
|---|---|---|
| Libreria, stati, tag e categorie, analisi, chiamate a pagamento, modelli, contesto dei modelli, dati | `docs/libreria-immagini.md` | 3.9.0 |
| Contenuti delle SLOP, marchio, metadati, trasparenza | `docs/contenuti-e-trasparenza.md` | 1.2.0 |
| Copie di gioco, formati, inquadratura, misure e trattamento delle SLOP | `docs/copie-di-gioco.md` | 9.2.0 |
| Dashboard, anteprima a pressione prolungata, wizard REAL | `docs/dashboard-admin-wizard-real.md` | 2.5.0 |
| SLOP gemelle, studio e batch automatici | `docs/generazione-slop.md` | 5.5.0 |
| Sezione Database | `docs/database-immagini.md` | 2.7.1 |
| Partita a livelli e classifica | `docs/gioco-a-livelli.md` | 2.2.0 |
| Statistiche e Impostazioni | `docs/statistiche-impostazioni.md` | 2.8.0 |
| Privacy e note legali | `docs/privacy-note-legali.md` | 1.3.0 |

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

## Sequenza delle PR della nuova pipeline

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
- Dashboard: `library.ts` (sezioni, Database, Impostazioni; CSS `library.css`, `database.css`, `admin-navigation.css`,
  `admin-loading.css`, `model-context.css`, `caption-count.css`), wizard REAL `real-wizard.ts` e `real-wizard.css`, studio SLOP
  `slop-studio.ts` e `slop-studio.css`, campi editoriali `editorial-ui.ts`, riquadro dei batch automatici `slop-auto.ts` e `slop-auto.css`, statistiche `stats.ts` e
  `stats.css`, grafico della distribuzione `database-chart.ts`, anteprima a pressione prolungata `image-preview.ts` e
  `image-preview.css`, pillole e categorie dei tag `tag-ui.ts` e `tag-categories.css`, editor di formato e ritaglio `crop-editor.ts` e
  `crop-editor.css`, copie di gioco nel browser con misure e trattamento delle SLOP `game-copy.ts`.

**Worker** Cloudflare (`worker/`, ingresso `index.ts`):
- `core.ts` (accesso admin, errori), `storage.ts` (file del gioco senza metadati), `maintenance.ts` (manutenzione giornaliera).
- Libreria `library.ts` (stati, vocabolario, alias, categorie, distribuzione, copie), partite in corso e copie trattenute `in-play.ts`,
  analisi `analysis.ts`, contesto dei modelli `model-context.ts`, modelli `models.ts`, Impostazioni `app-settings.ts`, statistiche
  `stats.ts`, registro condiviso delle chiamate `paid.ts`, Commons `commons-editorial.ts`.
- SLOP: studio `slop.ts`, gemelle `twins.ts`, generazione `slop-generation.ts`, batch automatici `slop-auto.ts`, gruppi e loro misure
  per Database e Statistiche `slop-groups.ts`.
- Gioco `game.ts` con `sampling.ts` e `random.ts`, classifica `leaderboard.ts`.

**Codice condiviso** (`shared/`): tag `tags.ts`, tag scritti a mano `tag-input.ts`, categorie `tag-categories.ts`, modelli OpenAI
`models.ts`, gemelle, proposta dei batch e coppie in partita `twins.ts`, gruppi `slop-groups.ts`, formati e ricetta della copia
`game-copy.ts`, misure e trattamento `copy-treatment.ts`, licenze ND
`licenses.ts`, pulizia dei metadati `media-clean.ts`, livelli e punteggio `levels.ts`, costanti legali `legal.ts`, controllo delle
immagini `editorial.ts` (descrizioni, brief e valutazioni), `image-dimensions.ts`, `image-format.ts`, `image-geometry.ts`, precaricamento `preloading.ts`, `html.ts`.

**Test** (`tests/`): unitari `*.test.ts` (`npm test`); d'integrazione `*.integration.py`, eseguiti da `scripts/integration.py` con il
modello finto `fake_openai.py` e gli aiuti `catalog.py`, `game_copy.py`, `long_press.py`.

**Dati.** D1 con le migrazioni in `migrations/`:

| Migrazione | Contenuto |
|---|---|
| 0033 | schema pulito: immagini, tag, gioco |
| 0034 | alias, rimozione dei tag orfani, stato dell'analisi, registro delle chiamate |
| 0035 | tag e didascalie generati, ripristinabili |
| 0036 | didascalia fino a 256 caratteri (colonna oggi inutilizzata) |
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
| 0047 | didascalie cancellate, colonne inutilizzate |
| 0048 | categorie Genere, Colore e Supporto al posto di Formato; completamento, misure, trattamento e gruppo delle immagini; gruppo dei batch; soglia del gruppo |
| 0049 | REAL di origine di una SLOP gemella |
| 0050 | descrizione editoriale REAL e provenienza, contesto Commons separato, processi/tentativi privati, chiamate evaluation e collegamenti, snapshot e impostazioni del loop; batch legacy invariati |
| 0051 | contesto «Valutazione delle SLOP» e pipeline di ogni versione del contesto (testi delle gemelle = 1) |

R2: quarantena privata (`library/<id>/`, originale e copia) e bucket del gioco (copie pubblicate).

## Rilascio e anteprime

- Il merge su `main` avvia Workers Builds: `npm run build`, poi `npx wrangler d1 migrations apply DB --remote && npm run deploy` sulle
  risorse di produzione (D1 `real-or-slop-local`, R2 `real-or-slop-quarantine` e `real-or-slop-approved`).
- Anteprime delle PR: migrazioni con `--env preview`, poi `npm run preview` (controllo `scripts/check-preview.mjs`) su D1
  `real-or-slop-preview` e R2 `real-or-slop-preview-quarantine` e `real-or-slop-preview-approved`, inizialmente vuoti.
- CI (`.github/workflows/checks.yml`): lint, test, build e controlli di Wrangler; non parte per le PR che toccano solo documenti.
- Tag: al merge su `main` il workflow `release-tag` (`.github/workflows/release-tag.yml`) crea `vX.Y.Z` con la versione di
  `package.json`, se non esiste già.
- Manutenzione giornaliera: Cron Trigger alle 03:17 UTC.

## Verifiche

`npm run lint`, `npm test`, `npm run build`, `npm run dry-run`, `npm run test:integration` (Worker locale con D1 e R2 locali e il modello
finto `tests/fake_openai.py`) e `ROS_TEST_BROWSER=1 npm run test:integration` per la dashboard, desktop e mobile. L'elenco dei
test d'integrazione eseguiti è in `scripts/integration.py`.

**Verifica locale della 1.29.0:** esiti nella PR. Solo API fittizia, D1 e R2 locali. Per la suite con browser in un container senza
il modulo Python `playwright`: `pip install playwright` e `ROS_CHROMIUM_PATH` sul Chromium installato.

**Consegna del lavoro:** pubblicare sempre il ramo e aprire o aggiornare una PR per avviare i controlli CI (`AGENTS.md` 22.3.0). Commit e patch locali non completano la consegna.
