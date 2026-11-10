# Istruzioni Codex — versione canonica 17.6.0

Snapshot: `docs/AGENTS.v17.6.0.md`. Percorsi relativi alla radice del repository.
Aggiornato: 2026-11-10T07:25:00Z Precedente: `docs/AGENTS.v17.5.0.md` (storico, non più vigente).

## Sistema corrente

Specifiche vigenti: `docs/libreria-immagini.v1.5.0.md` e `docs/dashboard-admin-wizard-real.v1.3.0.md`. Restano valide `docs/copie-di-gioco.v2.0.0.md`
e `docs/spazio-file.v1.2.0.md`. Ogni altro documento in `docs/` è storico, compreso `docs/lotti-editoriali.v1.6.2.md`:
le sue regole su persone, marchi, marchio «RS» e metadati sono nella sezione 11 di `docs/libreria-immagini.v1.5.0.md`.

- Dashboard `/admin` in quattro sezioni. Caricamento REAL in wizard di tre passi: selezione Commons, tag e didascalie, riepilogo e pubblicazione. Le altre sezioni verranno completate progressivamente.
- Una sola **libreria** di immagini REAL e SLOP, gestita come un file system: caricamento multiplo,
  Commons diretto, modifica in linea, cestino; niente lotti, proposte, cicli o archivi storici.
- **Copia di gioco WebP** uniforme (qualità 0,85, lato lungo ≤2048 px, sRGB, senza metadati), creata nel
  browser dell'owner appena l'immagine entra; è il file che l'owner approva e che il gioco serve.
- **Tag** ASCII: minuscoli, cifre, trattini; inglese per i nomi comuni, lingua originale traslitterata per
  i nomi propri; vietati i tag che rivelano l'origine. Approvare richiede almeno un tag.
  Il vocabolario contiene solo tag in uso; gli **alias** rimandano a un tag e si risolvono prima di salvare.
  Un tag scritto a mano con forma errata (maiuscole, accenti, spazi) viene convertito e salvato senza avviso; il server resta rigido.
- **Analisi** (fase 2): tag e didascalia dal modello con visione sulla copia di gioco, senza l'origine. Una sola chiamata per immagine
  genera insieme tag e didascalia, che **sostituiscono** quelli presenti nelle sole immagini scelte; **una generazione per immagine**;
  i testi generati restano nel database e l'owner può sempre ripristinarli senza costi;
  conferma del costo massimo, **un solo budget** per tutte le chiamate a pagamento (5 $ iniziali, modificabile e
  rinnovabile), costo dai token, registro `spend`, esiti incerti mai ripetuti. Spenta senza `OPENAI_API_KEY`.
- **Didascalia** in italiano, limite morbido di 160 caratteri (avviso, mai taglio) e tetto di 256, mostrata con l'immagine durante il round, stesso
  procedimento per REAL e SLOP (fase 2). Si approva insieme alla copia.
- **Cestino:** svuotarlo cancella ogni riga e ogni file dell'immagine. Nessun registro delle
  eliminazioni, nessuna istantanea, nessuna esportazione automatica: decisione esplicita dell'owner.
- **Consulente SLOP** (fase 3): distribuzione dei tag REAL/SLOP e tag correlati con supporto minimo di 3
  immagini, calcolati sul database senza modelli. Il metodo di scelta dei tag per la generazione è da definire.
  Il generatore di immagini riceve solo testo.
- **Contenuti delle SLOP:** niente persone vive o morte da meno di 50 anni; personaggi storici ammessi senza crimini
  attribuiti né scene degradanti; marchi ammessi; regimi documentati ma mai celebrati; nessuna nudità umana tranne
  nelle opere d'arte.
- Restano: gioco singolo e PvP, file serviti senza metadati, marchio «RS», blocco del salvataggio.

## Regole di lavoro

1. Prima di modificare: `git status --short --branch`, `origin/main` aggiornato, stato delle PR.
   Leggere `MASTER.md` e la specifica vigente. Registrare le contraddizioni e chiedere solo le decisioni
   davvero mancanti.
2. Le istruzioni esplicite dell'owner prevalgono. Deploy, merge, migrazioni remote e chiamate a pagamento
   solo con la sua autorizzazione nella sessione. Non stampare credenziali.
3. Chiamate a pagamento: stima prima dell'invio, conferma, registro di spesa, nessun reinvio di esiti
   incerti, provider fittizi nei test.
4. Versioni: documenti `nome.vMAJOR.MINOR.PATCH.md` con timestamp ISO 8601; `AGENTS.md` e `MASTER.md`
   dichiarano la versione e hanno snapshot in `docs/`. App, schema e documenti hanno numeri indipendenti.
5. Verifica prima della consegna: `npm run lint`, `npm test`, `npm run build`, `npm run dry-run`,
   `npm run test:integration` e, per la dashboard, `ROS_TEST_BROWSER=1 npm run test:integration` su
   desktop e mobile. Ogni fase in una PR con anteprima e CI verde.
6. Resoconto finale: cosa è cambiato, verifiche ed esiti, rischi, azioni non eseguite.
