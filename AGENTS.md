# Istruzioni per gli agenti

Versione 22.3.0, aggiornata il 2026-11-15T14:21:17Z. Percorsi relativi alla radice del repository; le versioni precedenti sono nella
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
  e stesso formato per REAL e SLOP), nell'interfaccia (marchio «RS» su tutte, nessun testo durante la partita) o nei dati inviati
  al browser prima della risposta. Durante il caricamento della REAL, **la stessa chiamata multimodale genera tag e
  descrizione editoriale neutra**: vede la copia 4:5, il titolo e il contesto Commons, ma **non conosce l'esistenza delle SLOP**.
  Il modello successivo che produce **brief e prompt SLOP** riceve solo tag e descrizione salvata, **non l'immagine**;
  conosce invece lo scopo sintetico della generazione. Tenere separati i contesti di istruzione.
- **Ogni SLOP nasce da una REAL di riferimento** (decisione del 2026-11-15, specifica `generazione-slop` 5.2.0): il riferimento
  assicura ancoraggi editoriali tematici e fotografici, **non** somiglianza visiva né il cambiamento di un solo elemento.
  Il wizard salva **tag e descrizione della REAL nella medesima chiamata di analisi**; successivamente **una sola chiamata
  testuale** trasforma tag e descrizione in brief e prompt iniziale. La descrizione separa osservazioni visive, contesto
  documentato da Commons e incertezze, senza inventare fatti né sovrascrivere il testo originale di Commons.
  Il brief editoriale del processo resta immutabile; il prompt e la scena possono cambiare.
  Le persone sono inventate.
  Una SLOP e la propria REAL non compaiono nella stessa partita (specifiche `copie-di-gioco`, `gioco-a-livelli`).
- **Credibilità prima dell'aderenza letterale al prompt.** Il valutatore esamina **l'immagine generata intera**, senza crop
  né trattamento 4:5; decide accettazione, nuovo tentativo, revisione del prompt o revisione umana. Il ritaglio 4:5 è preparato
  **soltanto dopo l'accettazione** e non dà feedback al generatore. I difetti critici non sono compensabili con altri punti forti; tentativi
  e tolleranza sono configurabili. Nessuna candidata rifiutata entra nella libreria giocabile o viene pubblicata automaticamente.
- **Copie di gioco 4:5 verticali per tutte** (decisione del 2026-11-15), REAL e SLOP. Il ritaglio della REAL non deve
  eliminare elementi **fondamentali** per i tag o il significato della fotografia; in caso contrario l'owner corregge
  l'inquadratura. Le SLOP si valutano **intere** prima di creare la copia 4:5.
- **Chiamate a pagamento:** solo con conferma esplicita dell'owner del **numero massimo** previsto per un loop, registrate in
  `paid_calls` senza importi, esiti incerti mai ripetuti in automatico; niente prezzi né budget, il limite è quello del progetto
  OpenAI. Il massimo di tentativi di generazione è configurabile, ogni tentativo include la sua valutazione. Nei test solo modelli finti.
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
   **Consegna sempre tramite PR** (preferenza esplicita dell'owner, 2026-11-15): quando le modifiche sono pronte, pubblicare il ramo e
   aprire o aggiornare una PR su GitHub, così possono partire i test CI. Non fermarsi a commit o patch locali; nel resoconto fornire il
   link della PR e lo stato effettivo dei controlli. L'apertura della PR non autorizza merge o rilascio in produzione.
6. **Resoconto finale:** cosa è cambiato, verifiche ed esiti, rischi, azioni non eseguite.
7. **Rilascio:** il merge su `main` avvia da solo build, migrazioni remote e deploy (Workers Builds, comando
   `npx wrangler d1 migrations apply DB --remote && npm run deploy`): il merge è l'autorizzazione dell'owner a entrambi. Le anteprime delle
   PR usano solo il database `real-or-slop-preview` e i bucket `real-or-slop-preview-*` (blocco `previews`, ambiente `preview` per le
   migrazioni), mai quelli di produzione.
