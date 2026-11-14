# Mappa del progetto — versione canonica 18.0.0

Snapshot: `docs/MASTER.v18.0.0.md`. Percorsi relativi alla radice del repository.
Aggiornato: 2026-11-14T12:00:00Z. Precedente: 17.30.0, nella cronologia git (riordino della documentazione dell'owner del 2026-11-14).

Questa mappa dice dove si trova ogni cosa e a che punto è il progetto: quali file sono in uso (nel repository convivono molte versioni
dello stesso modulo), quali specifiche sono vigenti, come si rilascia. Le regole di lavoro sono in `AGENTS.md`, la storia delle versioni
in `CHANGELOG.md`.

## Stato

- **In produzione:** app 1.23.0 (PR 129, migrazioni fino alla 0047), con il contesto dei modelli salvato dall'owner il 2026-11-14.
- **Proposta aperta:** app 1.24.0, PR rickymusu-bit/real-or-slop#131, senza migrazioni: anteprima a pressione prolungata, selezione
  immediata su Commons, descrizione delle REAL nella lista finale, tag di partenza delle SLOP, proposta del testo dei prompt SLOP con
  volti visibili (vale quando l'owner lo salva dalle Impostazioni).
- **Riordino della documentazione** (questa versione): specifiche consolidate senza strati, documenti storici tolti dal repository.
- **Più avanti:** embedding dei tag per Topic Discovery; generatori di immagini alternativi.

## Specifiche vigenti

Ogni specifica descrive il comportamento attuale della sua area, senza rimandi a versioni precedenti; i nomi dei file di codice stanno
in questa mappa, non nelle specifiche.

| Area | Specifica |
|---|---|
| Libreria, stati, tag e categorie, analisi, chiamate a pagamento, modelli, contesto dei modelli, dati | `docs/libreria-immagini.v2.0.0.md` |
| Contenuti delle SLOP, marchio, metadati, trasparenza | `docs/contenuti-e-trasparenza.v1.0.0.md` |
| Copie di gioco, formati, inquadratura | `docs/copie-di-gioco.v6.0.0.md` |
| Dashboard, anteprima a pressione prolungata, wizard REAL | `docs/dashboard-admin-wizard-real.v2.0.0.md` |
| Studio SLOP e batch automatici | `docs/generazione-slop.v1.0.0.md` |
| Sezione Database | `docs/database-immagini.v2.0.0.md` |
| Partita a livelli e classifica | `docs/gioco-a-livelli.v2.0.0.md` |
| Statistiche e Impostazioni | `docs/statistiche-impostazioni.v2.0.0.md` |
| Privacy e note legali | `docs/privacy-note-legali.v1.1.0.md` |

**Documenti tolti.** Il 2026-11-14 l'owner ha chiesto di cancellare i documenti che non servono più: le specifiche precedenti, le note
delle vecchie pipeline e le snapshot di `AGENTS.md` e `MASTER.md` fino alla 17.30.0. Restano nella cronologia git: `git log -- docs/<nome>`
trova il commit che li ha cancellati e `git show <commit>^:docs/<nome>` li mostra. I commenti del codice citano ancora quei nomi come
storia. Corrispondenze delle ultime specifiche vigenti:

| Prima (fino alla 17.30.0) | Ora |
|---|---|
| `libreria-immagini.v1.8.0`, `categorie-tag.v1.1.0` | `libreria-immagini.v2.0.0`, `contenuti-e-trasparenza.v1.0.0` |
| `dashboard-admin-wizard-real.v1.3.0`, `didascalie-wizard.v1.0.0`, `anteprima-descrizione.v1.2.0` | `dashboard-admin-wizard-real.v2.0.0` (e le altre aree per le parti relative) |
| `wizard-slop.v1.4.1`, `proposta-generazione-slop.v2.0.1` | `generazione-slop.v1.0.0` |
| `database-immagini.v1.0.1` | `database-immagini.v2.0.0` |
| `copie-di-gioco.v5.0.0` | `copie-di-gioco.v6.0.0` |
| `gioco-a-livelli.v1.0.1` | `gioco-a-livelli.v2.0.0` |
| `statistiche-impostazioni.v1.0.1` | `statistiche-impostazioni.v2.0.0` |
| `privacy-note-legali.v1.0.4` | `privacy-note-legali.v1.1.0` |

## Discrepanze note

Testi pubblici del sito non aggiornati (in `src/main.ts`, da correggere con una PR di codice):
- «Come funziona» descrive ancora lo swipe sul telefono e «lo stesso formato 4:5»: dall'app 1.22.0 si risponde con i pulsanti e la foto
  è intera nel suo formato.
- «Fonti e crediti» dice «ritagliata nel formato 4:5»: la copia è ritagliata al formato comune più vicino.

## Architettura

**Browser** (Vite e TypeScript, `src/`, ingresso `main.ts`):
- Sito: home con classifica, «Come funziona», «Fonti e crediti» (`main.ts`); pagine legali (`legal.v1.1.0.ts`, `legal.v1.0.0.css`).
- Gioco: `play.v2.5.0.ts` (CSS `play.v2.3.0.css` e `play.v2.4.0.css`), foto esplorabile `photo-viewer.v2.0.0.ts`, precaricamento
  `preload.ts`, marchio «RS» `media-mark.v1.0.0.ts`, protezioni `media-privacy.ts`.
- Dashboard: `library.v1.23.0.ts` (sezioni, Database, Impostazioni; CSS `library.v1.0.0.css`, `database.v1.0.0.css`,
  `admin-navigation.v1.0.0.css`, `admin-loading.v1.0.0.css`, `model-context.v1.0.0.css`), wizard REAL `real-wizard.v1.17.0.ts` (CSS
  `real-wizard.v1.5.0.css`, `v1.6.0`, `v1.7.0`), studio SLOP `slop-studio.v1.6.0.ts` (CSS `slop-studio.v1.1.0.css`), riquadro dei batch
  automatici `slop-auto.v1.2.0.ts`, statistiche `stats.v1.2.0.ts`, grafico della distribuzione `database-chart.v1.0.0.ts`, anteprima a
  pressione prolungata `image-preview.v1.0.0.ts`, pillole e categorie dei tag `tag-ui.v1.1.0.ts`, editor di formato e ritaglio
  `crop-editor.v3.0.0.ts`, copie di gioco nel browser `game-copy.v3.1.0.ts` (lo studio usa `game-copy.v3.0.0.ts`).

**Worker** Cloudflare (`worker/`, ingresso `index.ts`):
- `core.ts` (accesso admin, errori), `storage.ts` (file del gioco senza metadati), `maintenance.v1.0.0.ts` (manutenzione giornaliera).
- Libreria `library.v1.22.0.ts` (stati, vocabolario, alias, categorie, distribuzione, copie), partite in corso e copie trattenute
  `in-play.v1.2.0.ts`, analisi `analysis.v1.22.0.ts`, contesto dei modelli `model-context.v1.6.0.ts`, modelli `models.v1.1.0.ts`,
  Impostazioni `app-settings.v1.1.0.ts`, statistiche `stats.v1.1.0.ts`, Commons `commons-editorial.v1.0.0.ts`.
- SLOP: studio `slop.v1.14.0.ts`, generazione `slop-generation.v1.13.0.ts`, batch automatici `slop-auto.v1.0.0.ts`.
- Gioco `game.v2.5.0.ts` con `sampling.ts`, classifica `leaderboard.v1.1.0.ts`.

**Codice condiviso** (`shared/`): tag `tags.v2.0.0.ts`, tag scritti a mano `tag-input.v1.0.0.ts`, categorie `tag-categories.v1.0.0.ts`,
modelli OpenAI `models.v1.0.0.ts`, slot `slot-extraction.v1.0.0.ts`, proposta dei batch `slop-auto.v1.0.0.ts`, formati e ricetta della
copia `game-copy.v3.0.0.ts`, licenze ND `licenses.v1.0.0.ts`, pulizia dei metadati `media-clean.v1.0.0.ts`, livelli e punteggio
`levels.v1.0.0.ts`, testi legali `legal.v1.1.0.ts` con `legal.v1.0.0.ts`, geometria e formati delle immagini.

Le versioni precedenti dei moduli restano nel repository come storico e non sono importate.

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

R2: quarantena privata (`library/<id>/`, originale e copia) e bucket del gioco (copie pubblicate).

## Rilascio e anteprime

- Il merge su `main` avvia Workers Builds: `npm run build`, poi `npx wrangler d1 migrations apply DB --remote && npm run deploy` sulle
  risorse di produzione (D1 `real-or-slop-local`, R2 `real-or-slop-quarantine` e `real-or-slop-approved`).
- Anteprime delle PR: migrazioni con `--env preview`, poi `npm run preview` (controllo `scripts/check-preview.mjs`) su D1
  `real-or-slop-preview` e R2 `real-or-slop-preview-quarantine` e `real-or-slop-preview-approved`, inizialmente vuoti.
- CI (`.github/workflows/checks.yml`): lint, test, build e controlli di Wrangler; non parte per le PR che toccano solo documenti.
- Manutenzione giornaliera: Cron Trigger alle 03:17 UTC.

## Verifiche

`npm run lint`, `npm test`, `npm run build`, `npm run dry-run`, `npm run test:integration` (Worker locale con D1 e R2 locali e il modello
finto `tests/fake_openai.v1.4.0.py`) e `ROS_TEST_BROWSER=1 npm run test:integration` per la dashboard, desktop e mobile. L'elenco dei
test d'integrazione eseguiti è in `scripts/integration.py`.
