---
version: 1.0.0
created_at: 2026-11-06T13:42:06Z
status: vigente
scope: audit-main-and-open-pr-heads
supersedes: null
source_issue: https://github.com/rickymusu-bit/real-or-slop/issues/57
---

# Audit preparatorio della pipeline editoriale

## Conclusione e confine della consegna

Main adotta il **metodo v3**, usa ancora contratti dati **v2** e conserva flussi
legacy eseguibili. La v4.3 esiste soltanto nella PR #55. La #56 modifica la
strategia di discovery, non autorizza a riscrivere quei tre livelli insieme.
La prima PR #57 aggiunge solo istruzioni, navigazione, audit e piano. Nessun
refactoring applicativo o implementazione della #56 è incluso. Le osservazioni
sottostanti sono verificate sul codice; le azioni sono proposte da revisionare.

## Evidenze e riproducibilità

Rilevazione remota del 2026-11-06 tramite API GitHub e `git ls-remote`, poi fetch
delle ref senza checkout/merge delle PR. La ref locale iniziale `origin/main`
puntava ancora ad `a5a04d0`: non era una fotografia attendibile di main.

| Oggetto | Stato osservato | Base → head verificati |
| --- | --- | --- |
| main / checkout iniziale `work` | Coincidenti, albero iniziale pulito, app 0.15.0 | `67ecf494ba8fe86d551525e1db330d1f31764975` |
| #51 | Open, draft, non merged, 17 file | main → `16e9efd92d055b1e252c5afb29d4a755deb219e5`, `feat/44-versioned-brief-embeddings` |
| #52 | Open, draft, non merged, 15 file | #51 → `822b315d93c04b3f69c8d4c657ad1e4b52178ab6`, `feat/45-brief-variety-metrics` |
| #55 | Open, draft, non merged, 77 file | #52 → `0577284497c985fbbf44463ad7dd48b475edb8a5`, `feat/editorial-v4-matrix` |
| #54 | Open, draft, non merged, 12 file | main → `a80a5560ea31903ef724fd06b9974e48b3fca384`, `feat/swipe-choices-v1.0.0` |
| #53 / #56 / #57 | Issue aperte | Specifiche/delta, non codice integrato |

Le API PR dichiaravano mergeable=true; non è un'approvazione o una garanzia
futura. Nessun `AGENTS.md`/`MASTER.md` trovato nell'albero iniziale o alla head
della #55. Il commento del proprietario nella #56 richiede la #57 prima della
feature. Checks della #55 sullo SHA rilevato: run
[42171536495](https://github.com/rickymusu-bit/real-or-slop/actions/runs/42171536495),
completed/success. È evidenza remota di quella PR, non un test locale della #57.
Le dichiarazioni su preview, spese del pilota e produzione nel corpo della #55
non sono state verificate contro Cloudflare né replicate.

Comandi per aggiornare l'osservazione (non mutano branch remoti):

```sh
git status --short --branch
git ls-remote origin refs/heads/main refs/pull/51/head refs/pull/52/head refs/pull/54/head refs/pull/55/head
git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main +refs/pull/51/head:refs/remotes/origin/audit-pr51 +refs/pull/52/head:refs/remotes/origin/audit-pr52 +refs/pull/54/head:refs/remotes/origin/audit-pr54 +refs/pull/55/head:refs/remotes/origin/audit-pr55
git diff --stat origin/audit-pr52 origin/audit-pr55
git show origin/audit-pr55:docs/protocollo-editoriale.v4.3.0.md
```

Ricontrollare anche draft/base/head e workflow tramite GitHub: le ref da sole
non dicono se una PR sia stata approvata. Non confondere la base incrementale
#52→#55 con il delta cumulativo main→#55.

## Mappa main: file → responsabilità → interfaccia → test

I proprietari indicati sono moduli/file, non persone. I test elencati esistono
in main; i contratti proposti per #56 sono nel piano separato.

| Responsabilità e file proprietari | Interfacce e dipendenze effettive | Protezioni esistenti |
| --- | --- | --- |
| Discovery: `pipeline/v2/discovery.py`, `pipeline/v2/search_sources.py`, `pipeline/providers.py` | `plan`, `collect`, `registry`, `SearchClient`, `search(client, query, limit)`; usa `pipeline/run.py:connect/ingest`, journal privato e SQLite | `tests/editorial_v2_discovery_test.py`: allocazioni uguali, OAuth, 403, parziali, budget, ripresa; `tests/pipeline_test.py` |
| Brief/freeze: `pipeline/v2/brief_catalog.py`, `briefs.py`, `brief_review.py`, `data/editorial/briefs.v1.json` | `select`, `freeze`, `validate`, `slop_plan`, `pairs`; hash del catalogo/testi/istruzioni; `briefs.py` importa `digest` da direct e `Preparation` da study | `tests/editorial_v2_brief_catalog_test.py`, `editorial_v2_briefs_test.py` |
| Generazione SLOP corrente: `pipeline/v2/direct.py`, `engine.py`, `protocol.py` | `DirectEngine.body`, `image_payload`, `generation_plan`, `initialize`; input AI autonomo, `Config`, checkpoint e ledger; Batch conservato in `engine.py:Engine` | `tests/editorial_v2_direct_test.py`, `editorial_v2_test.py`, `editorial_v2_transport_test.py`; `tests/editorial-v2.test.ts` |
| Compatibilità v1: `pipeline/editorial.py`, `automatic.py`, `batch*.py`; `worker/editorial.ts`, `editorial-batch.ts` | Ranking/brief derivati da sorgenti nel vecchio flusso; trasporto, serializzazione e API admin riusati. Non usarne l'orchestrazione per nuovi cicli v3/#56 | `tests/editorial_pipeline_test.py`, `automatic_pipeline_test.py`, `batch_pipeline_test.py`, `batch_api_test.py`, `batch.integration.py` |
| Origine/licenze: `pipeline/licenses.py`, `run.py:rights_check`, `importer.py`; `shared/licenses.json`, `licenses.ts`; `pipeline/v2/protocol.py`, `shared/editorial-v2.ts` | `recognized_license`/`recognizedLicense`, `provenance`/`validateV2Provenance`, `approval_blockers`/`v2ApprovalBlockers`; licenza null archiviabile, non approvabile | `tests/license-cases.json`, `licenses_test.py`, `licenses.test.ts`, `editorial-v2-contract.json`, `editorial_v2_test.py` |
| Pixel e presentazione: `pipeline/v2/direct.py`, `presentation.py`, `smart_crop.py`, `protocol.py`; `shared/editorial-v2.json` | `vision_payload` con contesto vuoto; `PROFILE_INSTRUCTIONS`, `profile_schema`, `visual_profile`; crop prima del profilo sui byte finali verificati SHA | `tests/editorial_v2_direct_test.py`, `editorial_v2_crop_test.py`, `editorial_v2_presentation_test.py`, `editorial-v2.test.ts` |
| Deduplica: `pipeline/run.py`, `importer.py`; `shared/similarity.ts`, `similarity-extraction.ts`, `worker/similarity.ts`, `scripts/scan-similarity.mjs` | Identità/URL/SHA in acquisizione; dHash legacy; nuovo contratto dHash e DINOv2 per origine, gruppi di scena usati da sampling | `tests/similarity.test.ts`, `similarity_schema_test.py`, `similarity.integration.py`, `pipeline_test.py` |
| Revisione: `worker/review-inbox.ts`, `review-preparation.ts`, `editorial-v2.ts`, `moderation.ts`; `src/review.ts`, `editorial-v2.ts` | `/api/admin/review-inbox`, `/api/admin/editorial/v2/candidates`; revisioni CAS, conferma esplicita, audit; approvazione inbox e review documentale v2 distinte | `tests/review_inbox.integration.py`, `review.integration.py`, `review_presentations.integration.py`, `editorial_v2.integration.py` |
| Storage e checkpoint: `worker/storage.ts`, `import.ts`, `editorial-media.ts`, `editorial-v2.ts`; `pipeline/batch_store.py`, `importer.py`; `wrangler.jsonc` | D1 `DB`, R2 `QUARANTINE`/`IMAGES`; originali privati, manifest hashati, lease/revisione e budget `editorial_usage`; migrazioni fino a 0017 | `tests/direct-import.integration.py`, `attempt_media_test.py`, `editorial_v2_schema_test.py`, `editorial_v2_transport_test.py` |
| Pubblicazione: `worker/editorial.ts:/publish`, `moderation.ts`; `worker/publication.ts` diagnostica | `publication_batches`/`published_images`, trigger di 0008 e decisioni umane; trasferimento da quarantena distinto. V2 restituisce `published:false` e non ha publish | `tests/editorial.integration.py`, `moderation.integration.py`, `editorial_schema_test.py`, `editorial-v2.test.ts` |
| Gioco: `worker/index.ts`, `game.ts`, `sampling.ts`, `room.ts`; `src/play.ts`, `preload.ts`, `clock.ts`, `media-privacy.ts` | `/api/sessions`, ready/start/answer, round opachi; D1 server deadline, monete indipendenti, capacità di entrambe le classi; `/api/rooms` 503 | `tests/game.test.ts`, `sampling.test.ts`, `sampling-statistics.test.ts`, `preload.test.ts`, `media-privacy.test.ts`; integrazioni game/sampling/preloading |

Flusso corrente: brief originale → freeze → rami REAL e SLOP; ogni ramo conserva
originali e varianti → profilo sui pixel finali e dossier documentale separati →
revisione per immagine. Nessun completamento automatico delle coppie.
Il catalogo giocabile segue separatamente i gate e la pubblicazione D1 esistenti.

## Mappa del delta non integrato

| PR | File/interfacce osservati | Impatto sul piano #56 |
| --- | --- | --- |
| #51 | `scripts/index-briefs.v1.0.0.mjs`, `tests/brief-embeddings.v1.0.0.test.ts`, `tests/brief_embeddings.v1.0.0_test.py`; catalogo inglese 1.1.0 e mapping | Conservare migrazione e ID/revisioni; indice MiniLM/TF-IDF opzionale, non requisito di retrieval |
| #52 | `scripts/brief-metrics.v1.0.0.mjs`, `analyze-briefs.v1.0.0.mjs`, `tests/brief-metrics.v1.0.0.test.ts`; rapporti versionati | Conservare metriche diagnostiche, senza convertirle in soglie editoriali |
| #55 | `pipeline/v2/matrix_v4_0_0.py:freeze/restore/select`, `shared/editorial-matrix.v4.0.0.ts:MatrixEvent/replay`, `shared/editorial-brief.v4.0.0.ts`, `worker/editorial-matrix.v4.0.0.ts`, `src/variety.v4.0.0.ts` | Separare intenzione, freeze, tentativo e giudizio; non aggiungere intensità agli ID storici |
| #55 | `shared/editorial-taxonomy.v4.0.0.json`, composizione/fotografia, policy caption e licenza; migrazione 0018 | Riutilizzi candidati, previa adozione esplicita. Test `matrix_v4_0_0_test.py`, `matrix-v4.0.0.test.ts`, `matrix-v4.0.0.integration.py` esistono solo nel branch |

## Matrice decisionale delle incongruenze

Le sostituzioni future sono proposte; questa PR sceglie soltanto quali fonti
descrivono main. Nessuna norma della #56 viene adottata come comportamento.

| Regola / norma attuale e fonte | Stato e conflitto | Decisione/sostituzione proposta | Impatto e protezione |
| --- | --- | --- | --- |
| V1: graduatoria, soglia 65, descrizione REAL→brief SLOP; `pipeline-editoriale-real-slop-v1.0.0.md`, `pipeline/editorial.py` | Metodo storico, codice legacy presente | Per nuovi cicli prevale v3: prompt originale prima del retrieval. Conservare compatibilità, non riusare ranking/derivazione | Test batch/editorial legacy restano; fixture SLOP con campi contaminanti rifiutati |
| V2: popolazioni non abbinate, Batch; `pipeline-editoriale-real-slop-v2.0.0.md` | Specifica storica, schema 2.0.0 ancora usato | V3 sostituisce metodo/trasporto con brief condivisi e API dirette; non rinumerare dossier | `editorial_v2_transport_test.py`, `editorial_v2_briefs_test.py`; Batch non riprende checkpoint sincroni |
| V3: seed italiano 100 brief/tag; `protocollo-editoriale.md`, `briefs.v1.json` | Vigente in main | #51 propone inglese con ID/revisioni e mapping; #55 aggiunge 144 celle. Conservare seed/freeze | Catalog test main; test inglesi solo #51 |
| Query identiche su tutti i provider; `discovery.py:plan` | Comportamento attuale ereditato v2, supporto a ricerca v3 assistita | #56 propone strategie A e varianti B per provider; versionare un piano nuovo, non cambiare vecchi checkpoint | Il test `test_default_plan_uses_all_source_channels_and_equal_query_allocations` deve restare per legacy; nuove fixture per query diverse |
| V3: coerenza con brief; #53/#55: selezione cella 12×12, scheduler con margini e resa umana | V3 vigente, v4 solo draft | #56: intenzioni 12×12×3, nessun match/coverage rigido. Mantenere classificazione osservata separata; non tradurre mancata hit in rifiuto umano | Nuovo schema e replay separato; preservare eventi 4.0.0 e test matrix del branch |
| V3: 1024×1024 e crop Terra; `direct.py`, `cropping-assistito-v2.md` | Vigente main; #55 propone `size:auto`, whole-frame max 1536, presentazione 1.2.0 | Decidere adozione #55 separatamente da discovery; leggere versione nel checkpoint | `editorial_v2_direct_test.py`/presentation; mantenere resume dei quadrati |
| V3: sfondo visibile e opere ambientate; `criteri-editoriali.md` | #55 consente contesto in caption e opere piatte documentate | Non applicare regola v4 a main. Risolvere policy e documentazione quando si integra #55 | Python/TS oggi bloccano REAL `artwork` e trasformazioni non coperte; test v2 da conservare per contratto storico |
| Licenze condivise ammesse, SLOP con licenza esplicita o null; `licenses.json`, protocol v2 | #55 propone nuove SLOP CC BY 4.0 attribuite | Adozione di licenza distinta dalla #56. Non assegnare retroattivamente diritti o cambiare ricevute | Fixture `license-cases.json`, v2 unresolved-rights e test pubblicazione #55 |
| Origine documentata, profilo solo pixel, conferma umana | Invariante v2/v3/#53/#56 | Preservare; retrieval non verifica autenticità e profilo non approva diritti | `editorial-v2-contract.json`, test blockers; per #56 aggiungere controlli sul payload cieco senza intended emotion |
| Approvazione individuale senza partner; v3/inbox | Il trasferimento v2→catalogo non è automatico; SQL legacy pubblica gruppi bilanciati | Distinguere registrazione, decisione e pubblicazione. #56 non cambia gioco né crea partner | Test inbox, publication trigger, 50/50 e round privacy |
| NC/ND ammesse con vincoli non commerciali/senza adattamenti; `licenze-immagini.md`; crop corrente | Compatibilità del singolo derivato da verificare, non certificata dal parser licenze | Tenere gate documentale e revisione dei crediti/trasformazioni; non dichiarare ogni crop legalmente riutilizzabile | Licenza riconosciuta ≠ tutti gli obblighi assolti; test ambiguità e blocco approvazione |
| Vecchi livelli/quote per partita; `protocollo-selezione-real-v1.0.0.md`, `protocollo-generazione-slop-v1.0.0.md`, sampling v1 | Storico superato da gioco/sampling v2 e migrazioni 0007/0008 | Non ripristinare difficoltà o quote per sessione dalla documentazione antica | `sampling-statistics.test.ts`, game integration e test schema |
| Nuova #56: tre intensità, neutralità, due passaggi GPT-6.1 | Proposta, non implementata | Neutralità/celle non significative, modello concreto e orchestrazione del freeze richiedono specifica; non inventare default ora | Casi neutrali e output invalidi nel piano; nessuna inferenza pagata in questa PR |

## Debito verificato e priorità

Analisi statica dei `.py` sotto pipeline tramite AST (corpi funzione identici
normalizzati, almeno sei righe), conteggio delle righe fisiche e lettura di import
e chiamanti; import locali TS letti separatamente. Non è un profilo runtime o
una prova di assenza di duplicazione semantica.

| Priorità | Osservazione verificata | Raccomandazione e beneficio per #56 |
| --- | --- | --- |
| P0 | Main, v4 draft e #56 descrivono regole incompatibili; nessun ingresso canonico iniziale | AGENTS/MASTER e indice in questa PR; impedire adozioni involontarie |
| P0 | `discovery.collect` (righe 70–187, 118 righe) gestisce journal/lock, budget, provider, ingest e output; `plan` replica query | Contratto nuovo attorno a piano validato e risultato provider; separare composizione HTTP da testo GPT prima di aggiungere A/B |
| P1 | `SearchClient.get` sovrascrive il retry di `providers.Client.get`: nel percorso v2 `request` è una singola chiamata; `collect` isola errori/parziali e disabilita la fonte per il resto del piano | Definire esplicitamente 429/backoff/retry/ripresa e persistenza nel contratto nuovo, senza introdurre retry pagati o cambiare legacy |
| P1 | `Openverse` in providers e `OpenverseSearch` in search_sources normalizzano gli stessi campi; il secondo aggiunge filtro fonte, token e upstream. Commons usa il connector condiviso; nessun profilo GPT provider oggi | Riutilizzare normalizzazione e transport esistenti dietro adapter verificabili; non fondere con autenticità o ranking |
| P1 | Python `protocol.py` e TS `shared/editorial-v2.ts` validano in parallelo; JSON comune descrive rubriche/limiti, non genera tutti i validatori | Estendere fixture condivise per nuovi contratti, senza framework/generatore di schema. Non dichiarato un bug di parità già dimostrato |
| P1 | V2 importa da `pipeline/editorial.py` utilità stabili ma anche vi dipende per `PipelineStop`, payload e scrittura privata; `briefs.py` importa hash da direct | Evitare che nuovi contratti dipendano dall'orchestrazione legacy; estrazione di sole utilità se necessaria e coperta, in PR successiva |
| P2 | dHash Pillow ripetuto in `run.download`, `importer.prepare`, `v2.engine.media`, `direct.apply_crop`; byte e fasi differenti. Nuova similarità usa altro algoritmo/contratto | Non uniformare hash: fixture sugli stessi byte prima di eventuale helper legacy. Nessuna necessità dimostrata per #56 |
| P2 | Ciclo Python `presentation.main` → import locale `smart_crop.run` → import top-level presentation. Cicli frontend `main↔play`, `main↔admin`, `admin↔review`, `main↔editorial-v2`, `main↔similarity` | Il primo è differito; i secondi condividono API/DOM/router. Annotare rischio di inizializzazione, non estrarre router o crop per una feature discovery |
| P2 | Funzioni Python più lunghe: `study.acquire_sources` 148 righe, `smart_crop.run` 94; `direct.phase` 60. Worker `editorialV2` concentra route, CAS, file e budget in un handler | Lunghezza non prova errore; rifinire soltanto punti attraversati dal nuovo contratto dopo fixture, non riscrivere i runner |

Nessun corpo funzione Python identico di almeno sei righe rilevato con quel
metodo. Le ripetizioni di normalizzazione/hash sopra sono osservazioni semantiche,
non un conteggio automatico di debito. I JSON storici sono conservazione richiesta:
nel delta incrementale #52→#55, **26.221 delle 30.173 righe aggiunte (86,9%)**
sono sotto `data/` (cataloghi/mapping/fixture). Non giustificano deduplicazione,
eliminazione di snapshot o riscrittura dell'intera PR.

## Workflow e baseline locale

CI corrente `.github/workflows/checks.yml`: Python 3.12, Node da `.nvmrc` (24),
Pillow fissato, npm ci, deploy:check, lint/test/build, migrazioni/seed locali,
packaging da dist assente, integrazione generale/Batch/v2/demo senza R2.
`pipeline.yml` è manuale con flag `ENABLE_IMAGE_PIPELINE`; `review-queue.yml`
contiene già un cron 06:17 UTC con gate repo privato/main e
`ENABLE_EDITORIAL_SCHEDULE`, più gate pagati distinti. Non è stata verificata
la configurazione remota dei flag; nessun workflow è stato attivato/modificato.

Ambiente isolato di questa verifica: Node 24.19.0, npm 11.9.0, Python 3.12.14,
venv `/tmp/ros-issue57-venv` con Pillow 12.0.0; cache npm e XDG in `/tmp`.
L'installazione iniziale npm non poteva scrivere la cache predefinita: risolta
con `npm_config_cache=/tmp/ros-npm-cache`, senza cambiare lockfile. Il Python
globale aveva Pillow 12.3.0: non usato per la baseline riproducibile.

```sh
python3 -m venv /tmp/ros-issue57-venv
/tmp/ros-issue57-venv/bin/python -m pip install -r pipeline/requirements.txt
export PATH=/tmp/ros-issue57-venv/bin:$PATH
export XDG_CONFIG_HOME=/tmp/ros-config
ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm_config_cache=/tmp/ros-npm-cache npm ci
npm run deploy:check
npm run lint
npm test
npm run build
npm run db:migrate
npm run db:seed
npm run dry-run
npm run test:integration
ROS_TEST_BATCH=1 npm run test:integration
ROS_TEST_V2=1 npm run test:integration
ROS_TEST_PROFILE= npm run test:integration
```

Eseguire le suite Wrangler in sequenza: cancellano solo lo stato dedicato
`.wrangler/integration` e condividono la porta 8788. Il runner usa fake OpenAI e
ledger locali; non implica pagamenti o scritture Cloudflare remote.

Esiti completati prima dei documenti: lint e build passati; `npm test` passato
(17 file Node, 167 test Python); integrazione generale passata con D1/R2 emulati,
migrazioni e seed isolati. Avviso build preesistente sui chunk oltre 500 kB.
Completamento: integrazioni Batch, v2 e demo senza R2 passate in sequenza;
`npm run db:migrate`, `npm run db:seed`, `npm run dry-run` e
`npm run deploy:check` passati. Migrazioni fino a 0017 e seed applicati soltanto
agli emulatori locali. Il packaging esegue il build hook e termina con
`--dry-run: exiting now`, senza pubblicare. Nessun fallimento applicativo
preesistente rilevato nelle verifiche eseguite. Le head #51/#52/#54/#55 sono state lette,
non testate localmente: i loro esiti descritti nelle PR restano attribuiti alle PR.

Verifica documentale della consegna: 84 link Markdown locali risolti, entrambi
gli snapshot identici byte per byte agli ingressi canonici, tutti i 37 file
preesistenti sotto `docs/` catalogati e `git diff --check` passato. Il delta
comprende solo documentazione e ingressi Markdown: nessun sorgente, test,
dipendenza, configurazione o workflow modificato. La baseline appena eseguita
resta quindi applicabile. Non sono stati aggiunti test che rispecchiano soltanto
il testo dei documenti.

## Azioni successive e limiti

Il [piano](piano-integrazione-editoriale.v1.0.0.md) decide quali lavori conservare,
rebasare, separare o sospendere prima della #56. La Fase C resta successiva alla
revisione di questa prima consegna: nessuna estrazione cosmetica è necessaria
per consegnare l'audit. I test provider/GPT ancora mancanti sono esplicitamente
elencati nel piano, non dichiarati già implementati.

Non eseguiti: modifiche applicative, nuove migrazioni, merge/chiusura/retarget
delle PR esistenti, deploy, operazioni D1/R2 remote, secret, cron, API pagate,
ricerca live, approvazioni o eliminazioni di immagini. Nessun catalogo, freeze,
asset, audit, giudizio o licenza precedente è stato riscritto.
