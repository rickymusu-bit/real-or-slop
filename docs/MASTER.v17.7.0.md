# Mappa canonica — versione canonica 17.7.0

Snapshot: `docs/MASTER.v17.7.0.md`. Percorsi relativi alla radice del repository.
Aggiornato: 2026-11-10T07:25:00Z Precedente: `docs/MASTER.v17.6.0.md` (storico).

## Architettura

- **Frontend** Vite/TypeScript in `src/`: gioco (`play.ts`, `pvp.ts`, `preload.ts`), marchio «RS»
  (`media-mark.v1.0.0.ts`), protezioni (`media-privacy.ts`), libreria admin (`library.v1.5.0.ts`), wizard REAL (`real-wizard.v1.3.0.ts`),
  codifica delle copie di gioco nel browser (`game-copy.v1.0.0.ts`).
- **Worker** Cloudflare in `worker/`: router (`index.ts`), accesso admin (`core.ts`), libreria
  (`library.v1.5.0.ts`, con vocabolario e alias), analisi a pagamento (`analysis.v1.5.0.ts`), contesto dei modelli (`model-context.v1.0.0.ts`), Commons (`commons-editorial.v1.0.0.ts`), gioco (`game.ts`, `sampling.ts`),
  PvP (`room.ts`, Durable Object), file del gioco senza metadati (`storage.ts`).
- **Codice condiviso** in `shared/`: tag (`tags.v2.0.0.ts`), lunghezza della didascalia (`caption.v1.0.0.ts`), tag scritti a mano (`tag-input.v1.0.0.ts`), ricetta della copia (`game-copy.v1.0.0.ts`),
  pulizia dei metadati (`media-clean.v1.0.0.ts`), formati e geometria delle immagini.
- **Dati:** D1, schema `0033_clean_slate.v1.0.0.sql` (immagini, tag, gioco) più `0034_tag_aliases_analysis.v1.1.0.sql`
  (alias, rimozione dei tag orfani, stato dell'analisi, registro di spesa, budget unico) `0035_generated_texts.v1.0.0.sql` (testi generati, ripristinabili) `0036_caption_soft_limit.v1.0.0.sql` (didascalia fino a 256 caratteri) e `0037_model_contexts.v1.0.0.sql` (contesto dei modelli con versioni). R2: quarantena privata
  (`library/<id>/` originale e copia) e bucket del gioco (copie pubblicate).

## Stato e fasi

Fase 1 rilasciata (app 1.0.1). Fase 2 unita in `main` (app 1.1.0): alias, tag e didascalie dal modello con
visione, budget unico e registro di spesa. Fase 3: consulente SLOP e generazione. Più avanti: Topic Discovery sulle
embedding dei tag. In produzione app 1.4.0 (PR 103 e 104, migrazioni fino alla 0035): dashboard a quattro sezioni, wizard REAL in tre schede, generazione congiunta di tag e didascalia che sostituisce i testi delle sole immagini scelte, una volta per immagine, con ripristino senza costi. Proposta app 1.5.0: didascalia con limite morbido di 160 caratteri e tetto di 256 (migrazione 0036), tag scritti a mano convertiti senza avviso; regole di contenuto e trasparenza riunite nella sezione 11 della specifica. Proposta app 1.6.0: contesto dei modelli modificabile dalle Impostazioni (migrazione 0037). Specifiche `docs/libreria-immagini.v1.6.0.md` e `docs/dashboard-admin-wizard-real.v1.3.0.md`.
