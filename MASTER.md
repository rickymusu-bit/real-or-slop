# Mappa canonica — versione canonica 17.3.0

Snapshot: `docs/MASTER.v17.3.0.md`. Percorsi relativi alla radice del repository.
Aggiornato: 2026-11-09T20:47:00Z. Precedente: `docs/MASTER.v17.2.0.md` (storico).

## Architettura

- **Frontend** Vite/TypeScript in `src/`: gioco (`play.ts`, `pvp.ts`, `preload.ts`), marchio «RS»
  (`media-mark.v1.0.0.ts`), protezioni (`media-privacy.ts`), libreria admin (`library.v1.1.0.ts`), wizard REAL (`real-wizard.v1.0.0.ts`),
  codifica delle copie di gioco nel browser (`game-copy.v1.0.0.ts`).
- **Worker** Cloudflare in `worker/`: router (`index.ts`), accesso admin (`core.ts`), libreria
  (`library.v1.1.0.ts`, con vocabolario e alias), analisi a pagamento (`analysis.v1.1.0.ts`), Commons (`commons-editorial.v1.0.0.ts`), gioco (`game.ts`, `sampling.ts`),
  PvP (`room.ts`, Durable Object), file del gioco senza metadati (`storage.ts`).
- **Codice condiviso** in `shared/`: tag (`tags.v2.0.0.ts`), ricetta della copia (`game-copy.v1.0.0.ts`),
  pulizia dei metadati (`media-clean.v1.0.0.ts`), formati e geometria delle immagini.
- **Dati:** D1, schema `0033_clean_slate.v1.0.0.sql` (immagini, tag, gioco) più `0034_tag_aliases_analysis.v1.1.0.sql`
  (alias, rimozione dei tag orfani, stato dell'analisi, registro di spesa, budget unico). R2: quarantena privata
  (`library/<id>/` originale e copia) e bucket del gioco (copie pubblicate).

## Stato e fasi

Fase 1 rilasciata (app 1.0.1). Fase 2 in revisione (app 1.1.0): alias, tag e didascalie dal modello con
visione, budget unico e registro di spesa. Fase 3: consulente SLOP e generazione. Più avanti: Topic Discovery sulle
embedding dei tag. Proposta app 1.2.0: dashboard a quattro sezioni e wizard REAL in tre schede, con generazione selettiva e conferma della spesa. Specifiche `docs/libreria-immagini.v1.3.0.md` e `docs/dashboard-admin-wizard-real.v1.0.0.md`.
