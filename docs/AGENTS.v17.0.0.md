# Istruzioni Codex — versione canonica 17.0.0

Snapshot: `docs/AGENTS.v17.0.0.md`. Percorsi relativi alla radice del repository.
Aggiornato: 2026-11-09T16:30:00Z. Precedente: `docs/AGENTS.v16.1.0.md` (storico, non più vigente).

## Sistema corrente

Specifica vigente: `docs/libreria-immagini.v1.1.0.md`. Restano valide `docs/copie-di-gioco.v2.0.0.md`
e, per persone, personaggi storici, marchi, marchio «RS» e metadati, le sezioni 6.2–6.4 di
`docs/lotti-editoriali.v1.6.2.md`. Ogni altro documento in `docs/` è storico.

- Una sola **libreria** di immagini REAL e SLOP, gestita come un file system: caricamento multiplo,
  Commons diretto, modifica in linea, cestino; niente lotti, proposte, cicli o archivi storici.
- **Copia di gioco WebP** uniforme (qualità 0,85, lato lungo ≤2048 px, sRGB, senza metadati), creata nel
  browser dell'owner appena l'immagine entra; è il file che l'owner approva e che il gioco serve.
- **Tag** ASCII: minuscoli, cifre, trattini; inglese per i nomi comuni, lingua originale traslitterata per
  i nomi propri; vietati i tag che rivelano l'origine. Approvare richiede almeno un tag.
- **Didascalia** in italiano, ≤160 caratteri, mostrata con l'immagine durante il round, stesso
  procedimento per REAL e SLOP (fase 2). Si approva insieme alla copia.
- **Cestino:** svuotarlo cancella ogni riga e ogni file dell'immagine. Nessun registro delle
  eliminazioni, nessuna istantanea, nessuna esportazione automatica: decisione esplicita dell'owner.
- **Consulente SLOP** (fase 3): distribuzione dei tag REAL/SLOP e tag correlati con supporto minimo di 3
  immagini, calcolati sul database senza modelli. Il generatore di immagini riceve solo testo.
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
