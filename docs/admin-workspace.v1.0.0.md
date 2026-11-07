# Studio editoriale in /admin — 1.0.0

Aggiornato: 2026-11-07T13:14:57.026Z. PR iniziale per issue #64. Specifica additiva, nessun deploy effettuato.

## Flusso implementato in questa PR

1. Aprendo `/admin` dopo autenticazione admin, la nuova sezione "Studio editoriale" compare prima della coda di revisione esistente. La dashboard usa `/api/admin/editorial/workspace`.
2. L'owner registra un argomento specifico in testo libero; il registro D1 è persistente, con chiave normalizzata e senza cancellare argomenti storici. Non equivale ancora a deduplicazione semantica.
3. L'owner propone una pagina/immagine HTTPS tramite link. Si memorizzano URL e nota in un registro privato **senza scaricare nulla** e **senza trattare il link come una REAL verificata**. Acquisizione automatica delle foto via URL è rinviata: implementarla solo con fetch controllato, difesa SSRF, redirect, limiti e fonte/licenza.
4. L'owner carica JPEG/PNG/WebP dal proprio dispositivo, un file o più file fino a 12 MB ciascuno. Il Worker riconosce una firma binaria e calcola SHA-256. Il file originale entra nella quarantena R2 e nella coda editoriale unica come REAL *pending*. Il browser non lo modifica e non lo ritaglia; non si riscrive l'immagine originale. Duplicati esistenti e immagini eliminate volontariamente vengono bloccati. L'upload non convalida dimensioni/decodifica o autentica la fonte: migliorare la verifica prima di eventuali ammissioni.
5. Le immagini manuali caricate sono revisionabili nella coda preesistente per singola immagine; il voto personale non attesta autenticità, licenza o pubblicazione. Note e metadati di provenienza vanno completati prima dell'ammissione. I link non ancora acquisiti restano nella sezione proposte e non appaiono come fotografie approvabili.
6. La UI non include falsi pulsanti per ricerca GPT, argomenti suggeriti o generazione SLOP: quelle funzioni sono esplicitamente indicate come successive.

## Tre learner separati: contratto e dipendenze future

**Topic Discovery:** analizza catalogo e cronologia (inclusi argomenti cercati senza immagini approvate), evita duplicati semantici, propone soggetti/eventi/luoghi/periodi specifici; apprende da accettazioni, rifiuti, rinvii. Nessuna ricerca GPT automatica.

**REAL Preference:** usa profili visivi pixel-only (soggetto/azione/composizione/leggibilità) e feedback editoriali registrati in `editorial_review_inbox_events`, incluse REAL proposte dall'owner. Deve distinguere gusti da rifiuti per licenze e guasti, e validare su preferenze future.

**SLOP Prompt Preference:** usa soltanto argomento, tassonomia e storico **SLOP** (prompt, modello, parametri, qualità, note e voti). `isolatedSlopPlanningInput` in `shared/editorial-workspace.v1.0.0.ts` è un primo contratto di ingresso con allowlist rigida. **Non è ancora collegato alla generazione**: i moduli futuri dovranno derivare il prompt esclusivamente da questo output e congelarlo prima che il ciclo osservi qualunque REAL. Il contenimento dei nomi campo da solo non impedisce contaminazione se qualcuno copia manualmente informazioni REAL in una stringa autorizzata: isolamento architetturale, storage e test E2E restano obbligatori.

Il modello REAL non determina licenza/autenticità. Il modello SLOP non riceve immagini, descrizioni, titoli o feedback REAL del ciclo corrente. Nessuna rete viene riaddestrata in questa PR.

## Formati e privacy

- Il nuovo upload dell'owner conserva tutti i pixel e il rapporto d'aspetto; le preview della coda e del gioco già usano `object-fit:contain`, ma **rimangono vincoli quadrati in pipeline legacy** (`pipeline/v2/presentation.py`, `smart_crop.py`, `direct.py`). La migrazione dei media REAL/SLOP del catalogo e il massimo lato di visualizzazione sono lavori separati.
- Nessun upload né registrazione da parte dei giocatori. Solo le credenziali amministrative già esistenti autorizzano gli endpoint; non vengono introdotti email, password o fotografie dei giocatori.
- Nessuna chiamata a GPT, ricerca di immagini remota, generazione a pagamento, cron, pubblicazione o migrazione remota viene avviata da questa PR.

## Compatibilità e controlli

- Migrazione additiva `migrations/0019_editorial_workspace.v1.0.0.sql`, da applicare solo **dopo** 0018 se necessaria e solo dopo backup/approvazione di deploy. Non riscrive immagini, voti o origini esistenti.
- Unit TS `tests/editorial-workspace.v1.0.0.test.ts`: validatori per argomenti, HTTPS, firme immagine, guardie di input SLOP.
- Unit SQLite `tests/editorial_workspace_v1_0_0_test.py`: migrazione, vincoli immutabili, duplicati, collegamento alla coda.
- Da aggiungere prima del rollout: test d'integrazione Worker + D1/R2, e2e browser desktop/mobile, pixel/dimensioni e lock dei file, anteprima visiva approvata dell'owner, test di regressione delle migrazioni e CI.

## Lavori futuri, esplicitamente non implementati

- Scaricamento sicuro dei link proposti e acquisizione guidata della licenza.
- Suggerimento autonomo di argomenti non ancora affrontati, apprendimento Topic Discovery, deduplica semantica.
- Ricerca GPT on-demand dal pulsante in dashboard; shortlist e ranking REAL appreso.
- Feedback delle preferenze REAL collegato ai voti della coda corrente, con profili multimodali.
- Learner del prompt SLOP, congelamento e generazione indipendente; budget e controlli admin.
- Normalizzazione proporzionale di tutto il catalogo e distribuzione aspect ratio SLOP.
- Dashboard di pubblicazione completa; preservare parità 50/50 e ammissione documentale separata.
