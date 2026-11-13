# Istruzioni Codex — versione canonica 17.19.2

Snapshot: `docs/AGENTS.v17.19.2.md`. Percorsi relativi alla radice del repository.
Aggiornato: 2026-11-13T03:17:29Z. Precedente: `docs/AGENTS.v17.19.1.md` (storico, non più vigente).

## Sistema corrente

Specifiche vigenti: `docs/libreria-immagini.v1.8.0.md`, `docs/categorie-tag.v1.1.0.md`, `docs/dashboard-admin-wizard-real.v1.3.0.md`,
`docs/wizard-slop.v1.4.1.md` e `docs/database-immagini.v1.0.1.md` (approvata il 2026-11-11). Copie di gioco: `docs/copie-di-gioco.v3.0.1.md` (4:5, approvata il 2026-11-12, in produzione con l'app 1.12.0), che sostituisce la 2.0.0. Gioco:
`docs/gioco-a-livelli.v1.0.1.md` (approvata il 2026-11-12, in produzione con l'app 1.12.0). Statistiche e Impostazioni: `docs/statistiche-impostazioni.v1.0.1.md`
(approvata il 2026-11-12, in produzione con l'app 1.13.0). Generazione automatica delle SLOP su proposta:
`docs/proposta-generazione-slop.v2.0.1.md` (approvata il 2026-11-12, in produzione con l'app 1.15.0).
Ogni altro documento in `docs/` è storico, compreso `docs/lotti-editoriali.v1.6.2.md`:
le sue regole su persone, marchi, marchio «RS» e metadati sono nella sezione 11 di `docs/libreria-immagini.v1.8.0.md`.

- Dashboard `/admin` in cinque sezioni: Caricamento REAL (wizard di tre passi), Generazione SLOP, Database immagini, Statistiche
  (solo visualizzazione: partite adesso e aperte, partite e risposte, chiamate a pagamento, equilibrio del catalogo), Impostazioni (solo
  comandi: modelli e qualità delle immagini, contesto, vocabolario, classifica, soglie dello studio SLOP e delle proposte automatiche, durata di una partita aperta).
- Una sola **libreria** di immagini REAL e SLOP, gestita come un file system: caricamento multiplo,
  Commons diretto, modifica in linea, cestino; niente lotti, proposte, cicli o archivi storici.
- **Copia di gioco WebP 4:5** uniforme (qualità 0,85, altezza ≤2048 px, sRGB, senza metadati), ritagliata con un'inquadratura
  scelta dall'owner (centrata all'inizio) e creata nel browser appena l'immagine entra; è il file che l'owner approva e che il gioco
  serve. Le SLOP si generano in 4:5 dove il modello lo consente. Foto con licenza ND escluse dal gioco.
- **Tag** ASCII: minuscoli, cifre, trattini; inglese per i nomi comuni, lingua originale traslitterata per
  i nomi propri; vietati i tag che rivelano l'origine. Approvare richiede almeno un tag.
  Il vocabolario contiene solo tag in uso; gli **alias** rimandano a un tag e si risolvono prima di salvare.
  Un tag scritto a mano con forma errata (maiuscole, accenti, spazi) viene convertito e salvato senza avviso; il server resta rigido.
  **Categorie:** una per tag tra Tempo (solo decenni), Formato, Luogo, Ambiente, Evento, Persone, Oggetti e strutture, Altro;
  al massimo un tag di Tempo e uno di Formato per immagine; vietato solo il tag sull'origine; parole specifiche, suffisso
  di categoria come ultima risorsa.
- **Analisi** (fase 2): tag e didascalia dal modello con visione sulla copia di gioco, senza l'origine. Una sola chiamata per immagine
  genera insieme tag e didascalia, che **sostituiscono** quelli presenti nelle sole immagini scelte; **una generazione per immagine**;
  i testi generati restano nel database e l'owner può sempre ripristinarli senza costi;
  ogni chiamata a pagamento si **conferma** esplicitamente, senza importi; **niente prezzi né budget**; registro `paid_calls`
  (modello, token, esito); esiti incerti mai ripetuti; il limite di spesa è quello del progetto OpenAI. Spenta senza `OPENAI_API_KEY`.
- **Modelli:** modello di testo (tag, didascalie, prompt SLOP), modello di immagini e sua qualità scelti nelle Impostazioni, tra i modelli
  OpenAI elencati nel codice e disponibili nel progetto.
- **Contesto dei modelli:** testi fissi (base comune, tag e didascalie, prompt SLOP) modificabili dalle Impostazioni,
  con versioni e ripristino; ogni generazione registra le versioni usate. Formato JSON, limiti e filtri restano nel codice.
- **Didascalia** in italiano, limite morbido di 160 caratteri (avviso, mai taglio) e tetto di 256, mostrata con l'immagine durante il round, stesso
  procedimento per REAL e SLOP (fase 2). Si approva insieme alla copia.
- **Cestino:** svuotarlo cancella ogni riga e ogni file dell'immagine. Nessun registro delle
  eliminazioni, nessuna istantanea, nessuna esportazione automatica: decisione esplicita dell'owner.
- **Studio SLOP** (fase 3, `docs/wizard-slop.v1.4.1.md`): spread di ogni tag (REAL − SLOP tra approvate e pubblicate), tema
  obbligatorio in tutti i prompt, slot estratti dalle REAL con peso dello spread e modificabili; si apre con 50 REAL, un tema
  richiede 10 REAL (soglie modificabili nelle Impostazioni). Prompt in inglese scritti dal modello di testo; immagini dal modello di immagini, poi la stessa analisi
  delle REAL: i tag finali delle SLOP sono quelli dell'analisi. Il generatore riceve solo il testo del prompt.
  **Batch automatici** (`docs/proposta-generazione-slop.v2.0.1.md`): nessun timer né prefiltro; se 100 × (n_real − n_slop) / n_real ≥ 33% (SLOP
  approvate e pubblicate, almeno 10 REAL) una notifica nella dashboard chiede di approvare un batch automatico di min(N, 10) SLOP per
  quel tag, con N = n_real − n_slop − n_slop_nuove; un solo batch aperto alla volta, nessuna nuova proposta finché ogni sua foto non è decisa.
- **Contenuti delle SLOP:** niente persone vive o morte da meno di 50 anni; personaggi storici ammessi senza crimini
  attribuiti né scene degradanti; marchi ammessi; regimi documentati ma mai celebrati; nessuna nudità umana tranne
  nelle opere d'arte.
- **Sezione Database** (`docs/database-immagini.v1.0.1.md`): filtri per uno o più tag e per origine; ogni foto con tutti i tag,
  visualizzazioni e classificazioni corrette (solo sulla copia attuale). «Modifica» ritira subito una pubblicata; le partite in corso
  conservano didascalia e copia con cui sono iniziate (24 ore al massimo); una modifica lascia approvata un'immagine approvata.
  Una SLOP si rigenera dal prompt (a pagamento, con conferma; torna nuova, nuova analisi, statistiche azzerate). Scheda
  «Distribuzione»: REAL e SLOP, approvate e pubblicate impilate, per tag, con lo spread.
- **Gioco** (`docs/gioco-a-livelli.v1.0.1.md`): una sola modalità, una foto alla volta con il suo tempo; livelli nel codice (Facile 10×20 s,
  Medio 15×15 s, Difficile 20×10 s, Esperto 25×5 s); esito immediato dal server; tempo scaduto = foto non riconosciuta; punteggio
  foto × (2 × accuratezza bilanciata − 1) solo per partite concluse; swipe su telefono, R e S su computer; lista finale con fonti e
  prompt. Classifica nella home (7 giorni e sempre, migliore per giocatore) con soprannome controllato e codice partita (solo
  l'impronta nel database). PvP e allenamento eliminati.
- **Privacy e note legali** (`docs/privacy-note-legali.v1.0.1.md`, in produzione con l'app 1.14.0): progetto personale non commerciale; pagine
  `/privacy` e `/termini`; partite cancellate dopo 12 mesi (manutenzione giornaliera); classifica con dichiarazione «almeno 14 anni o
  permesso di un genitore» e cancellazione su richiesta; crediti delle REAL con le modifiche (ritaglio 4:5). Titolare in
  `shared/legal.v1.0.0.ts`; testi verificati da un legale (comunicazione dell'owner del 2026-11-13).
- Restano: file serviti senza metadati, marchio «RS», blocco del salvataggio.

## Regole di lavoro

1. Prima di modificare: `git status --short --branch`, `origin/main` aggiornato, stato delle PR.
   Leggere `MASTER.md` e la specifica vigente. Registrare le contraddizioni e chiedere solo le decisioni
   davvero mancanti.
2. Le istruzioni esplicite dell'owner prevalgono. Deploy, merge, migrazioni remote e chiamate a pagamento
   solo con la sua autorizzazione nella sessione. Non stampare credenziali.
3. Chiamate a pagamento: conferma esplicita prima dell'invio, registro delle chiamate, nessun reinvio di esiti
   incerti, provider fittizi nei test.
4. Versioni: documenti `nome.vMAJOR.MINOR.PATCH.md` con timestamp ISO 8601; `AGENTS.md` e `MASTER.md`
   dichiarano la versione e hanno snapshot in `docs/`. App, schema e documenti hanno numeri indipendenti.
5. Verifica prima della consegna: `npm run lint`, `npm test`, `npm run build`, `npm run dry-run`,
   `npm run test:integration` e, per la dashboard, `ROS_TEST_BROWSER=1 npm run test:integration` su
   desktop e mobile. Ogni fase in una PR con anteprima e CI verde.
6. Resoconto finale: cosa è cambiato, verifiche ed esiti, rischi, azioni non eseguite.
7. Rilascio: il merge su `main` avvia da solo build, migrazioni remote e deploy (Workers Builds, comando
   `npx wrangler d1 migrations apply DB --remote && npm run deploy`): il merge è l'autorizzazione dell'owner a entrambi.
   Le anteprime delle PR usano solo il database `real-or-slop-preview` e i bucket `real-or-slop-preview-*`
   (blocco `previews`, ambiente `preview` per le migrazioni), mai quelli di produzione.
