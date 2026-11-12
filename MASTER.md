# Mappa canonica — versione canonica 17.14.0

Snapshot: `docs/MASTER.v17.14.0.md`. Percorsi relativi alla radice del repository.
Aggiornato: 2026-11-12T09:00:00Z. Precedente: `docs/MASTER.v17.13.0.md` (storico).

## Architettura

- **Frontend** Vite/TypeScript in `src/`: gioco a livelli (`play.v2.0.0.ts`, precaricamento in `preload.ts`; `play.ts` storico), home con classifica (`main.ts`), marchio «RS»
  (`media-mark.v1.0.0.ts`), protezioni (`media-privacy.ts`), libreria admin e sezione Database (`library.v1.12.0.ts`, grafico della distribuzione in `database-chart.v1.0.0.ts`), wizard REAL (`real-wizard.v1.7.0.ts`), pillole e categorie dei tag (`tag-ui.v1.1.0.ts`),
  studio SLOP (`slop-studio.v1.2.0.ts`),
  codifica delle copie di gioco 4:5 nel browser (`game-copy.v2.0.0.ts`) e inquadratura (`crop-editor.v1.0.0.ts`).
- **Worker** Cloudflare in `worker/`: router (`index.ts`), accesso admin (`core.ts`), libreria
  (`library.v1.12.0.ts`, con vocabolario, alias, categorie, statistiche e distribuzione), partite in corso e copie trattenute (`in-play.v1.1.0.ts`), analisi a pagamento (`analysis.v1.12.0.ts`), contesto dei modelli (`model-context.v1.1.0.ts`),
  selettori dei modelli (`models.v1.0.0.ts`), studio SLOP (`slop.v1.4.0.ts`, generazione in `slop-generation.v1.3.0.ts`), Commons (`commons-editorial.v1.0.0.ts`), gioco a livelli (`game.v2.0.0.ts`, `sampling.ts`; `game.ts` storico), classifica (`leaderboard.v1.0.0.ts`), file del gioco senza metadati (`storage.ts`).
- **Codice condiviso** in `shared/`: tag (`tags.v2.0.0.ts`), lunghezza della didascalia (`caption.v1.0.0.ts`), tag scritti a mano (`tag-input.v1.0.0.ts`), categorie dei tag (`tag-categories.v1.0.0.ts`), modelli OpenAI (`models.v1.0.0.ts`), estrazione degli slot (`slot-extraction.v1.0.0.ts`), ricetta della copia 4:5 (`game-copy.v2.0.0.ts`), licenze ND (`licenses.v1.0.0.ts`), dimensione chiesta al generatore (`image-size.v1.0.0.ts`),
  pulizia dei metadati (`media-clean.v1.0.0.ts`), livelli, punteggio, soprannome e codice partita (`levels.v1.0.0.ts`), formati e geometria delle immagini.
- **Dati:** D1, schema `0033_clean_slate.v1.0.0.sql` (immagini, tag, gioco) più `0034_tag_aliases_analysis.v1.1.0.sql`
  (alias, rimozione dei tag orfani, stato dell'analisi, registro di spesa, budget unico) `0035_generated_texts.v1.0.0.sql` (testi generati, ripristinabili) `0036_caption_soft_limit.v1.0.0.sql` (didascalia fino a 256 caratteri) `0037_model_contexts.v1.0.0.sql` (contesto dei modelli con versioni) `0038_tag_categories.v1.0.0.sql` (categoria dei tag) `0039_calls_and_models.v1.0.0.sql` (registro delle chiamate senza importi, niente budget, impostazioni dei modelli) `0040_slop_batches.v1.0.0.sql` (gruppi di generazione SLOP) `0041_database_section.v1.0.0.sql` (didascalia e copia di ogni round, immagini delle sfide, copie ritirate in attesa) `0042_game_copy_crop.v1.0.0.sql` (inquadratura della copia 4:5) e `0043_levels_leaderboard.v1.0.0.sql` (partite a livelli, classifica, via le tabelle del PvP). R2: quarantena privata
  (`library/<id>/` originale e copia) e bucket del gioco (copie pubblicate).

## Stato e fasi

Fase 1 rilasciata (app 1.0.1). Fase 2 unita in `main` (app 1.1.0): alias, tag e didascalie dal modello con
visione, budget unico e registro di spesa. Fase 3: consulente SLOP e generazione. Più avanti: Topic Discovery sulle
embedding dei tag. In produzione app 1.4.0 (PR 103 e 104, migrazioni fino alla 0035): dashboard a quattro sezioni, wizard REAL in tre schede, generazione congiunta di tag e didascalia che sostituisce i testi delle sole immagini scelte, una volta per immagine, con ripristino senza costi. Proposta app 1.5.0: didascalia con limite morbido di 160 caratteri e tetto di 256 (migrazione 0036), tag scritti a mano convertiti senza avviso; regole di contenuto e trasparenza riunite nella sezione 11 della specifica. In produzione app 1.7.0 (migrazioni fino alla 0038): contesto dei modelli e categorie dei tag. Proposta app 1.8.0 (migrazione 0039): niente prezzi né budget, modelli scelti nelle Impostazioni, studio SLOP parte gratuita (tema con spread, slot), `docs/wizard-slop.v1.4.1.md`; proposta app 1.9.0 (migrazione 0040): parte a pagamento (prompt, immagini, analisi, revisione). In produzione app 1.10.0 (PR 109, migrazioni fino alla 0041, pubblicata il 2026-11-11): sezione Database, `docs/database-immagini.v1.0.1.md`, approvata dall'owner. Proposta app 1.11.0 (migrazione 0042): copie di gioco 4:5 con inquadratura, esclusione delle ND, `docs/copie-di-gioco.v3.0.0.md`. Proposta app 1.12.0 (migrazione 0043): partita a livelli con classifica e codice partita, via PvP e allenamento, `docs/gioco-a-livelli.v1.0.0.md`. Seguono le schede Statistiche e Impostazioni. Specifiche `docs/libreria-immagini.v1.8.0.md` e `docs/dashboard-admin-wizard-real.v1.3.0.md`.
