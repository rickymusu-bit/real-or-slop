# Istruzioni per gli agenti

Versione 19.1.0, aggiornata il 2026-11-14T16:00:00Z. Percorsi relativi alla radice del repository; le versioni precedenti sono nella
cronologia git.
Valgono per Codex e per Claude Code (`CLAUDE.md` importa questo file).

## Il progetto

REAL or SLOP è un gioco educativo, personale e non commerciale: per ogni foto il giocatore dice se è una fotografia autentica (REAL, da
Wikimedia Commons) o un'immagine generata con l'IA (SLOP). Una dashboard privata (`/admin`) gestisce la libreria delle immagini, la
generazione delle SLOP e le impostazioni. Frontend Vite e TypeScript, Worker Cloudflare con D1 e R2, modelli OpenAI per tag, prompt e
immagini.

**Dove leggere:** `MASTER.md` per la mappa (file in uso, specifiche vigenti, migrazioni, rilascio), le specifiche in `docs/` per il
comportamento di ogni area, `CHANGELOG.md` per la storia delle versioni.

## Principi che non cambiano senza l'owner

- **Origine nascosta fino alla risposta.** Nessun indizio dell'origine nei file serviti (copie WebP senza metadati, stessa ricetta finale
  e stesso formato massimo per REAL e SLOP), nell'interfaccia (marchio «RS» su tutte, nessun testo durante la partita) o nei dati inviati
  al browser prima della risposta. Il modello che scrive i tag non sa che esistono immagini generate.
- **Le SLOP somigliano alle REAL del loro gruppo** (decisione del 2026-11-14): si generano per gruppi di genere e decennio e passano per
  un trattamento che ne copia risoluzione, rumore, nitidezza e tono dalle REAL del gruppo, senza superarle (specifiche
  `generazione-slop` e `copie-di-gioco`).
- **Chiamate a pagamento:** solo con conferma esplicita dell'owner, registrate in `paid_calls` senza importi, esiti incerti mai ripetuti in
  automatico; niente prezzi né budget, il limite è quello del progetto OpenAI. Nei test solo modelli finti.
- **Libreria come un file system:** nessun lotto, archivio o registro delle eliminazioni; svuotare il cestino cancella ogni riga e ogni
  file dell'immagine.
- **Contenuti delle SLOP:** regole nella specifica `contenuti-e-trasparenza` (persone vive o morte da meno di 50 anni mai nominate né
  descritte, personaggi storici senza crimini attribuiti, regimi documentati ma mai celebrati, niente nudità fuori dalle opere d'arte).
- **Niente didascalie**, né nel gioco né nella dashboard (decisione del 2026-11-13).
- **Privacy:** solo il cookie tecnico, partite cancellate dopo 12 mesi, testi legali verificati da un legale: ogni modifica a Privacy o
  Termini va fatta verificare di nuovo (specifica `privacy-note-legali`).

## Regole di lavoro

1. Prima di modificare: `git status --short --branch`, `origin/main` aggiornato, stato delle PR. Leggere `MASTER.md` e la specifica
   dell'area. Registrare le contraddizioni tra richiesta, specifica e codice e chiedere solo le decisioni davvero mancanti.
2. Le istruzioni esplicite dell'owner prevalgono. Deploy, merge, migrazioni remote e chiamate a pagamento solo con la sua autorizzazione
   nella sessione. Non stampare credenziali.
3. **Versioni** (decisione dell'owner del 2026-11-14). I file hanno nomi stabili, senza versione: la loro storia è in git
   (`git log -p <file>`). L'app ha una sola versione, in `package.json` (MAJOR, MINOR, PATCH); al merge su `main` il workflow
   `release-tag` crea il tag `vX.Y.Z`, quindi ogni file di un rilascio si legge con `git show vX.Y.Z:<file>`. Le specifiche,
   `AGENTS.md` e `MASTER.md` dichiarano nell'intestazione una versione semantica (MAJOR per modifiche strutturali, MINOR per
   modifiche significative, PATCH per correzioni) e il timestamp ISO 8601 dell'ultima modifica, aggiornati a ogni modifica, così si
   possono citare («specifica `libreria-immagini` 2.0.0»). Le intestazioni del codice descrivono lo scopo del file, non la sua
   cronologia. Eccezione: le migrazioni (`migrations/`) non si rinominano mai, perché Wrangler le riconosce dal nome del file.
4. **Documenti.** Ogni area ha una sola specifica vigente, `docs/<area>.md`, che descrive il comportamento attuale per intero: quando una
   decisione lo cambia, si aggiorna la specifica dell'area, non si aggiunge un documento che «prevale dove dice altro». Le specifiche
   registrano le decisioni dell'owner con la data e si citano per nome (specifica `gioco-a-livelli`). I file di codice in uso sono
   elencati in `MASTER.md`, la storia delle versioni dell'app in `CHANGELOG.md`. A ogni modifica si aggiornano la specifica dell'area,
   `MASTER.md` (file e stato) e `CHANGELOG.md`; `AGENTS.md` quando cambiano regole o principi.
5. **Verifica prima della consegna:** `npm run lint`, `npm test`, `npm run build`, `npm run dry-run`, `npm run test:integration` e, per la
   dashboard e il gioco, `ROS_TEST_BROWSER=1 npm run test:integration` su desktop e mobile. Ogni fase in una PR con anteprima e CI verde.
6. **Resoconto finale:** cosa è cambiato, verifiche ed esiti, rischi, azioni non eseguite.
7. **Rilascio:** il merge su `main` avvia da solo build, migrazioni remote e deploy (Workers Builds, comando
   `npx wrangler d1 migrations apply DB --remote && npm run deploy`): il merge è l'autorizzazione dell'owner a entrambi. Le anteprime delle
   PR usano solo il database `real-or-slop-preview` e i bucket `real-or-slop-preview-*` (blocco `previews`, ambiente `preview` per le
   migrazioni), mai quelli di produzione.
