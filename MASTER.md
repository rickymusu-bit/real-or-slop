# Mappa canonica — versione canonica 17.11.0

Snapshot: `docs/MASTER.v17.11.0.md`. Percorsi relativi alla radice del repository.
Aggiornato: 2026-11-11T05:40:53Z. Precedente: `docs/MASTER.v17.10.0.md` (storico).

## Architettura

- **Frontend** Vite/TypeScript in `src/`: gioco (`play.ts`, `pvp.ts`, `preload.ts`), marchio «RS»
  (`media-mark.v1.0.0.ts`), protezioni (`media-privacy.ts`), libreria admin (`library.v1.9.0.ts`), wizard REAL (`real-wizard.v1.6.0.ts`), pillole e categorie dei tag (`tag-ui.v1.1.0.ts`),
  studio SLOP (`slop-studio.v1.1.0.ts`),
  codifica delle copie di gioco nel browser (`game-copy.v1.0.0.ts`).
- **Worker** Cloudflare in `worker/`: router (`index.ts`), accesso admin (`core.ts`), libreria
  (`library.v1.9.0.ts`, con vocabolario, alias e categorie), analisi a pagamento (`analysis.v1.9.0.ts`), contesto dei modelli (`model-context.v1.1.0.ts`),
  selettori dei modelli (`models.v1.0.0.ts`), studio SLOP (`slop.v1.1.0.ts`, generazione in `slop-generation.v1.0.0.ts`), Commons (`commons-editorial.v1.0.0.ts`), gioco (`game.ts`, `sampling.ts`),
  PvP (`room.ts`, Durable Object), file del gioco senza metadati (`storage.ts`).
- **Codice condiviso** in `shared/`: tag (`tags.v2.0.0.ts`), lunghezza della didascalia (`caption.v1.0.0.ts`), tag scritti a mano (`tag-input.v1.0.0.ts`), categorie dei tag (`tag-categories.v1.0.0.ts`), modelli OpenAI (`models.v1.0.0.ts`), estrazione degli slot (`slot-extraction.v1.0.0.ts`), ricetta della copia (`game-copy.v1.0.0.ts`),
  pulizia dei metadati (`media-clean.v1.0.0.ts`), formati e geometria delle immagini.
- **Dati:** D1, schema `0033_clean_slate.v1.0.0.sql` (immagini, tag, gioco) più `0034_tag_aliases_analysis.v1.1.0.sql`
  (alias, rimozione dei tag orfani, stato dell'analisi, registro di spesa, budget unico) `0035_generated_texts.v1.0.0.sql` (testi generati, ripristinabili) `0036_caption_soft_limit.v1.0.0.sql` (didascalia fino a 256 caratteri) `0037_model_contexts.v1.0.0.sql` (contesto dei modelli con versioni) `0038_tag_categories.v1.0.0.sql` (categoria dei tag) `0039_calls_and_models.v1.0.0.sql` (registro delle chiamate senza importi, niente budget, impostazioni dei modelli) e `0040_slop_batches.v1.0.0.sql` (gruppi di generazione SLOP). R2: quarantena privata
  (`library/<id>/` originale e copia) e bucket del gioco (copie pubblicate).

## Stato e fasi

Fase 1 rilasciata (app 1.0.1). Fase 2 unita in `main` (app 1.1.0): alias, tag e didascalie dal modello con
visione, budget unico e registro di spesa. Fase 3: consulente SLOP e generazione. Più avanti: Topic Discovery sulle
embedding dei tag. In produzione app 1.4.0 (PR 103 e 104, migrazioni fino alla 0035): dashboard a quattro sezioni, wizard REAL in tre schede, generazione congiunta di tag e didascalia che sostituisce i testi delle sole immagini scelte, una volta per immagine, con ripristino senza costi. Proposta app 1.5.0: didascalia con limite morbido di 160 caratteri e tetto di 256 (migrazione 0036), tag scritti a mano convertiti senza avviso; regole di contenuto e trasparenza riunite nella sezione 11 della specifica. In produzione app 1.7.0 (migrazioni fino alla 0038): contesto dei modelli e categorie dei tag. Proposta app 1.8.0 (migrazione 0039): niente prezzi né budget, modelli scelti nelle Impostazioni, studio SLOP parte gratuita (tema con spread, slot), `docs/wizard-slop.v1.4.1.md`; proposta app 1.9.0 (migrazione 0040): parte a pagamento (prompt, immagini, analisi, revisione). Specifiche `docs/libreria-immagini.v1.8.0.md` e `docs/dashboard-admin-wizard-real.v1.3.0.md`.
