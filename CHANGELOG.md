## 1.10.0 — 2026-11-11T09:30:00Z (pubblicata il 2026-11-11)

Scelte della specifica approvate dall'owner il 2026-11-11 (`docs/database-immagini.v1.0.1.md`).

Sezione Database della dashboard (`docs/database-immagini.v1.0.0.md`, richiesta dell'owner del 2026-11-11).

- **Immagini:** filtro per uno o più tag («con tutti» o «con almeno uno»), per REAL, SLOP o entrambe; ogni scheda mostra miniatura, tutti i tag colorati per categoria, visualizzazioni e classificazioni corrette (gioco singolo e PvP, solo sulla copia attuale) e le partite in corso che la includono.
- **Modifica:** «Modifica» su una pubblicata la ritira subito; le partite già avviate conservano didascalia e copia di gioco con cui sono iniziate (nuove colonne dei round, immagini delle sfide), e la copia resta nel bucket del gioco finché servono (al massimo 24 ore). Una modifica a un'immagine approvata la lascia approvata (prima tornava nuova). «Elimina» ritira e sposta nel cestino; l'eliminazione definitiva aspetta la fine delle partite in corso.
- **Rigenerazione delle SLOP** dal prompt modificato: chiamata a pagamento con conferma (immagine e analisi insieme), stesso orientamento, l'immagine torna nuova con una nuova analisi e statistiche azzerate.
- **Distribuzione:** REAL e SLOP nel complesso e per tag, barre impilate pubblicate (piene) e approvate (tratteggiate) ai due lati dello zero, spread, filtri per categoria, ordinamento, ricerca, suggerimento e vista a tabella.
- Migrazione additiva `0041_database_section.v1.0.0.sql`. Nuove versioni: `worker/in-play.v1.0.0.ts`, `worker/library.v1.10.0.ts`, `worker/analysis.v1.10.0.ts`, `worker/slop-generation.v1.1.0.ts`, `worker/slop.v1.2.0.ts`, `src/library.v1.10.0.ts`, `src/database-chart.v1.0.0.ts`, `src/database.v1.0.0.css`; modificati `worker/game.ts`, `worker/room.ts`. Test `library.v1.2.0`, `database.v1.0.0`, `library_browser.v1.9.0`, `database_browser.v1.0.0`; `scripts/integration.py` 2.3.0. `AGENTS.md`/`MASTER.md` 17.12.0.

## 1.9.0 — 2026-11-11T05:40:53Z (proposta, non pubblicata)

Studio SLOP, parte a pagamento (`docs/wizard-slop.v1.4.1.md`, sezioni 5–9 e 13).

- **Prompt:** «Genera prompt» scrive in una chiamata un prompt in inglese per slot, con il modello di testo e il contesto «Prompt per le SLOP»; ogni prompt si modifica a mano o si fa riscrivere (chiamata a pagamento, con conferma).
- **Immagini e analisi:** una conferma per il gruppo; per ogni slot il generatore riceve solo il testo del prompt, l'immagine entra come SLOP nuova con gruppo, slot e qualità, il browser ne prepara la copia di gioco e l'analisi scrive tag e didascalia come per le REAL. Formati quadrato, verticale e orizzontale a rotazione; qualità a scelta tra quelle del modello di immagini.
- **Revisione:** marchio «RS», didascalia, tag per categoria, «Previsti ma non rilevati» rispetto allo slot, Approva, Pubblica, Cestino, Rigenera.
- Rifiuti del generatore (regole d'uso) senza addebito; esiti incerti registrati e mai ripetuti; problemi dell'account OpenAI fermano la serie.
- Migrazione additiva `0040_slop_batches.v1.0.0.sql`. Nuove versioni: `worker/slop-generation.v1.0.0.ts`, `worker/slop.v1.1.0.ts`, `worker/library.v1.9.0.ts`, `worker/analysis.v1.9.0.ts`, `src/slop-studio.v1.1.0.ts`, `src/library.v1.9.0.ts`; test `slop.v1.1.0`, `slop_browser.v1.1.0`, `fake_openai.v1.3.0`. `AGENTS.md`/`MASTER.md` 17.11.0.

## 1.8.0 — 2026-11-10T22:11:48Z (proposta, non pubblicata)

Decisioni dell'owner del 2026-11-10 (`docs/wizard-slop.v1.4.0.md`, `docs/libreria-immagini.v1.8.0.md`).

- **Niente prezzi né budget.** Ogni chiamata a pagamento chiede una conferma esplicita, senza importo; il registro `paid_calls` conserva tipo, modello, token ed esito; gli esiti incerti non si ripetono; il limite di spesa è quello del progetto OpenAI. Tolti il tetto in dollari, il rinnovo, la riserva e il calcolo del costo.
- **Modelli nelle Impostazioni:** modello di testo (27 modelli OpenAI, predefinito `gpt-6.1-terra`) e modello di immagini (8 modelli, predefinito `gpt-image-2.5-flare`, perché OpenAI dismette `gpt-image-2` il 10 febbraio 2027; il menù mostra la data). Un modello non disponibile nel progetto OpenAI (`GET /v1/models`) si vede ma non si sceglie. L'analisi usa il modello di testo scelto. Le Impostazioni mostrano le chiamate a pagamento degli ultimi 30 giorni.
- **Studio SLOP, parte gratuita:** grafico dello spread (REAL − SLOP tra approvate e pubblicate) con filtri per categoria, vista compatta dei primi *n* tag, vista completa con ricerca, suggerimento con i conteggi, clic per aggiungere al tema; tema obbligatorio con conteggio dal vivo delle REAL; soglie di 50 REAL e 10 REAL per tema; slot estratti dalle REAL con restringimento per epoca, peso dello spread e varietà, modificabili e ripescabili, conservati nella scheda. «Genera prompt» arriva con la parte a pagamento.
- Colori delle categorie verificati con il validatore della palette (i precedenti non superavano i controlli di luminosità, saturazione e distinguibilità).
- Migrazione `0039_calls_and_models.v1.0.0.sql`: `paid_calls` al posto di `spend` (dati copiati), via `budget`, nuova tabella `settings`.
- Nuove versioni: `shared/models.v1.0.0.ts`, `shared/slot-extraction.v1.0.0.ts` (con test unitari), `worker/models.v1.0.0.ts`, `worker/slop.v1.0.0.ts`, `worker/analysis.v1.8.0.ts`, `worker/library.v1.8.0.ts`, `src/slop-studio.v1.0.0.ts`, `src/library.v1.8.0.ts`, `src/real-wizard.v1.6.0.ts`, `src/tag-ui.v1.1.0.ts`, CSS relativi; test `analysis.v1.6.0`, `slop.v1.0.0`, `library_browser.v1.8.0`, `real_wizard.v1.6.0`, `slop_browser.v1.0.0`, `fake_openai.v1.2.0`. Specifiche `libreria-immagini.v1.8.0.md` e `wizard-slop.v1.4.0.md` (approvata); `AGENTS.md`/`MASTER.md` 17.10.0.

## 1.7.0 — 2026-11-10T16:16:00Z (pubblicata il 2026-11-10)

Categorie dei tag (`docs/categorie-tag.v1.1.0.md`, decisioni dell'owner del 2026-11-10).

- Ogni tag ha una categoria: Tempo, Formato, Luogo, Ambiente, Evento, Persone, Oggetti e strutture, Altro. Tempo accetta solo decenni (`1970s`) e un decennio è sempre Tempo; al massimo un tag di Tempo e uno di Formato per immagine. Migrazione additiva `0038_tag_categories.v1.0.0.sql`: i tag esistenti diventano «Altro».
- Il modello riceve il vocabolario diviso per categoria e risponde con un elenco per categoria, nella stessa chiamata. Un tag già esistente conserva la sua categoria; una proposta diversa viene segnalata come conflitto nel wizard.
- Wizard e sezione Database: pillole colorate e ordinate per categoria, legenda, selettore della categoria per i tag nuovi (si imposta da solo per i tag esistenti e per i decenni), conferma per spostare un tag esistente in un'altra categoria, avviso non bloccante per le REAL senza tag di Tempo. Azioni in blocco con categoria. Vocabolario nelle Impostazioni diviso per categoria, con cambio di categoria; «Unisci» rifiuta i casi che lascerebbero due tag di Tempo o di Formato sulla stessa immagine.
- Impostazioni → «Contesto dei modelli»: «Carica nel campo» per i testi proposti con le categorie e con il divieto limitato all'origine; diventano una versione solo se l'owner li salva.
- Nuove versioni: `shared/tag-categories.v1.0.0.ts` (con test unitari), `worker/library.v1.6.0.ts`, `worker/analysis.v1.6.0.ts`, `worker/model-context.v1.1.0.ts`, `src/library.v1.6.0.ts`, `src/real-wizard.v1.4.0.ts`, `src/tag-ui.v1.0.0.ts`, `src/tag-categories.v1.0.0.css`; test `tests/analysis.v1.4.0.integration.py`, `tests/library_browser.v1.6.0.integration.py`, `tests/real_wizard.v1.4.0.integration.py`. Specifiche `libreria-immagini.v1.7.0.md` e `categorie-tag.v1.1.0.md`; `AGENTS.md`/`MASTER.md` 17.8.0.

## 1.6.0 — 2026-11-10T09:39:49Z (pubblicata il 2026-11-10)

Decisione dell'owner del 2026-11-10: contesto fisso del modello linguistico modificabile dalle Impostazioni (`docs/libreria-immagini.v1.6.0.md`, sezione 12).

- Impostazioni → «Contesto dei modelli»: tre testi (base comune, tag e didascalie, prompt per le SLOP) con contatore, salvataggio come nuova versione, storico con data e numero di immagini che l'hanno usata, ripristino. Prima versione: i testi approvati dall'owner.
- La generazione di tag e didascalie usa base e compito attuali più una riga fissa sul formato JSON, e registra le versioni usate. Formato, limiti della didascalia e filtri dei tag restano nel codice.
- I messaggi delle Impostazioni (tetto, rinnovo, unioni, alias, contesto) compaiono ora nelle Impostazioni: prima finivano nella sezione Database, nascosta.
- Migrazione additiva `0037_model_contexts.v1.0.0.sql`. Nuove versioni: `worker/model-context.v1.0.0.ts`, `worker/analysis.v1.5.0.ts`, `worker/library.v1.5.0.ts`, `src/library.v1.5.0.ts`, `src/model-context.v1.0.0.css`; test `tests/analysis.v1.3.0.integration.py` e `tests/library_browser.v1.5.0.integration.py`.

## 1.5.0 — 2026-11-10T07:10:00Z (pubblicata il 2026-11-10)

Decisioni dell'owner del 2026-11-10 sulla lunghezza della didascalia e sui tag scritti a mano (`docs/libreria-immagini.v1.5.0.md`, sezioni 3 e 4).

- Tolto il taglio netto a 160 caratteri, che troncava anche a metà parola senza avvisare. 160 è ora un limite morbido: il modello mira a 120–150 caratteri e mai oltre 160; una didascalia più lunga si conserva intera, con il contatore «N/160» evidenziato nell'editor del wizard e della sezione Database e un avviso nel riepilogo, senza bloccare la pubblicazione.
- Tetto tecnico di 256 caratteri nel server e nello schema. Solo una didascalia del modello oltre 256 viene accorciata, alla fine dell'ultima frase o parola intera, con un avviso.
- Migrazione `0036_caption_soft_limit.v1.0.0.sql`: ricostruisce la tabella `images` (un vincolo CHECK non si modifica in SQLite) conservando tag, alias, round, risposte e sfide collegati. Verificata in locale su un database popolato.
- Tag scritti a mano nel wizard, nel dettaglio e nelle azioni in blocco della sezione Database: se l'unico errore è la forma (maiuscole, accenti, spazi, punteggiatura) il tag viene convertito e salvato direttamente, senza avvisi; restano rifiutati i tag che rivelano l'origine. Il server continua ad accettare solo tag conformi.
- Regole di contenuto e trasparenza riunite nella sezione 11 di `docs/libreria-immagini.v1.5.0.md`; `docs/lotti-editoriali.v1.6.2.md` diventa interamente storico. Tolta la regola «non ricopiare la combinazione delle foto REAL» (il metodo di scelta dei tag per la generazione è da definire). Precisate due regole sulle SLOP: regimi e ideologie si documentano ma non si celebrano (nessun manifesto di propaganda generato ex novo); nessuna nudità umana tranne nelle opere d'arte. Aggiornato lo stato dei metadati: il gioco serve già solo copie senza metadati.
- Nuove versioni: `shared/caption.v1.0.0.ts` e `shared/tag-input.v1.0.0.ts` (con test unitari), `worker/analysis.v1.4.0.ts`, `worker/library.v1.4.0.ts`, `src/library.v1.4.0.ts`, `src/real-wizard.v1.3.0.ts`, `src/caption-count.v1.0.0.css`; test `tests/library.v1.1.0.integration.py`, `tests/analysis.v1.2.0.integration.py`, `tests/real_wizard.v1.3.0.integration.py`, `tests/library_browser.v1.4.0.integration.py`. Vecchie versioni conservate.

## 1.4.0 — 2026-11-09T22:50:37Z (pubblicata il 2026-11-10)

Decisione dell'owner del 2026-11-09 sulla generazione di tag e didascalie (`docs/libreria-immagini.v1.4.0.md`, sezione 10;
`docs/dashboard-admin-wizard-real.v1.2.0.md`).

- La generazione sostituisce tag e didascalia delle sole immagini scelte; prima aggiungeva tag e scriveva la didascalia solo se vuota.
- Una generazione per immagine: il server rifiuta la seconda prima di riservare o inviare; nel wizard l'immagine già generata non è selezionabile, nella sezione Database sparisce «Rianalizza». Un esito incerto o non riuscito si può riprovare solo su scelta esplicita.
- I testi generati sono conservati nel database (migrazione additiva `0035_generated_texts.v1.0.0.sql`). «Ripristina i testi generati» riporta a quei testi le immagini scelte, senza costi, anche dopo aver chiuso la scheda: dal dialogo di selezione e dalla singola scheda del wizard, e dal dettaglio nella sezione Database.
- Nel dialogo di generazione sono preselezionate solo le immagini mai generate; la conferma avverte degli esiti incerti. Il focus resta sul controllo attivo dopo ogni aggiornamento del wizard.
- Nuove versioni: `src/real-wizard.v1.2.0.ts`, `src/library.v1.3.0.ts`, `worker/library.v1.3.0.ts`, `worker/analysis.v1.3.0.ts`, test `tests/analysis.v1.1.0.integration.py` e `tests/real_wizard.v1.2.0.integration.py` (due immagini, una sola scelta). Vecchie versioni conservate.

## 1.3.0 — 2026-11-09T21:32:51.460Z (proposta, non pubblicata)

- Wizard REAL semplificato: un solo pulsante «Genera tag e didascalie con IA» e una chiamata per immagine. Rimangono selezione multipla, stima e conferma del costo, modifica dei campi e ripristino gratuito.
- Rimossi i target separati dal contratto API di analisi; la generazione usa il comportamento congiunto già validato, senza sovrascrivere didascalie compilate dall'owner.
- Vecchie versioni conservate, test browser desktop/mobile aggiornati; nessuna migrazione, merge o deploy automatico.
- Specifica: `docs/dashboard-admin-wizard-real.v1.1.0.md`.

## 1.2.0 — 2026-11-09T21:08:00Z (proposta, non pubblicata)

- Dashboard amministrativa organizzata in Caricamento REAL, Generazione SLOP (segnaposto), Database immagini e Impostazioni.
- Wizard REAL: link multipli e ricerca Wikimedia Commons con ordinamento per pertinenza o caricamento recente; editor per immagine con tag suggeriti dal vocabolario, didascalia, metadati espandibili, generazione selettiva a pagamento confermata e ripristino gratuito degli ultimi testi generati.
- Riepilogo con copia WebP di gioco, marchio RS in sovrapposizione e didascalia sotto l'immagine. Conferma esplicita dei diritti e pubblicazione. Draft privati recuperabili nella sessione.
- Conservate le versioni precedenti di libreria e analisi; nessuna migrazione, nessun deploy automatico.
- Specifica: `docs/dashboard-admin-wizard-real.v1.0.0.md`; verifica browser desktop/mobile in CI con anteprime scaricabili.

## 1.1.0 — 2026-11-09T21:30:00Z (proposta, non pubblicata)

Fase 2 della libreria (`docs/libreria-immagini.v1.3.0.md`, sezione 10).

- Analisi con il modello con visione: dalla copia di gioco, dal titolo, dalla descrizione o dal prompt, senza l'origine REAL/SLOP, una chiamata propone 5–15 tag e una didascalia. I tag sono resi ASCII, ripuliti dalle parole sull'origine, risolti per alias e aggiunti a quelli presenti; la didascalia riempie solo un campo vuoto.
- Un solo budget per tutte le chiamate a pagamento: 5 $ iniziali, modificabile e rinnovabile dalla dashboard (il rinnovo azzera il conteggio, il registro resta). Costo di ogni chiamata calcolato dai token e dal prezzo di listino del modello; prima dell'invio si riserva e si conferma il costo massimo (0,018 $ con `gpt-6.1-terra`). Esiti incerti contati e mai ripetuti; limite o credito OpenAI esauriti segnalati senza addebito, con arresto delle analisi in blocco. Analisi attiva solo con `OPENAI_API_KEY`.
- Vocabolario: alias dei tag, «Unisci» un tag in un altro, i tag spariscono con la loro ultima immagine.
- Migrazione additiva 0034. Test d'integrazione con un OpenAI finto locale, anche nel browser.

## 1.0.1 — 2026-11-09T18:30:00Z

- Ripristinato lo script `deploy:demo`, che il comando di deploy di Cloudflare Workers Builds richiama: ora esegue solo `wrangler deploy` (alias di `deploy`), senza migrazioni né seed. Senza lo script la build di produzione della 1.0.0 compilava ma non pubblicava.

## 1.0.0 — 2026-11-09T16:30:00Z (proposta, non pubblicata)

Libreria immagini e database in ordine (`docs/libreria-immagini.v1.1.0.md`), per decisione dell'owner.

- Una sola libreria REAL e SLOP gestita come un file system: caricamento multiplo e trascinamento, Commons (link e ricerca), modifica in linea di titolo, descrizione, didascalia, spiegazione, fonte e tag, selezione multipla, cestino senza conferme, eliminazione definitiva di ogni riga e file.
- Copia di gioco WebP creata nel browser dal file appena caricato; si approva la copia, che il gioco serve.
- Tag ASCII senza accenti (`place-de-la-republique`); approvare richiede almeno un tag e, per le REAL, la conferma dei diritti.
- Didascalia mostrata sotto l'immagine durante il round.
- Migrazione **distruttiva** `0033_clean_slate`: elimina tutte le tabelle precedenti (archivi storici, lotti, proposte, registri, partite, catalogo demo) e crea lo schema nuovo. Le migrazioni 0001–0032 escono dal repository.
- Eliminati: pipeline Python, studio SLOP, cicli editoriali, Topic Discovery, profili, similarità, modalità demo, script e workflow delle vecchie pipeline (compreso quello programmato ogni giorno), test relativi.

## 0.28.1 — 2026-11-09T07:00:00Z (proposta, non pubblicata)

- Acquisizione Commons: gli originali con più di 32 milioni di pixel (per esempio 9504×6336) venivano rifiutati anche se il Worker avrebbe scaricato la copia proporzionale; ora si passa alla copia anche per numero di pixel, e i limiti si controllano sul file effettivamente scaricato, misurato di nuovo dai byte.
- Messaggio più chiaro quando un titolo non esiste su Commons, con l'indicazione del caso tipico (trattini bassi persi copiando il link).
- `.npmrc`: le build Cloudflare (anteprime e produzione) non scaricano più da GitHub i binari CUDA facoltativi di `onnxruntime-node`, come già la CI; un timeout di quel download aveva fatto fallire una build.
- Nessuna migrazione.

## 0.28.0 — 2026-11-09T05:00:00Z (proposta, non pubblicata)

Tag per foto (`docs/lotti-editoriali.v1.5.0.md`, sezione 4). Tag solo manuali: nessuna proposta da modelli e nessuna chiamata a pagamento, per decisione dell'owner.

- Revisione: tag per foto REAL e SLOP, con aggiunta (anche con Invio) e rimozione. Il formato viene controllato mentre scrivi e la forma corretta proposta (`Burning car` → `burning-car`); i tag che rivelerebbero l'origine REAL/SLOP sono rifiutati.
- Segnaposto `untagged`, derivato: le foto senza tag non si approvano, non si ammettono e non entrano nella pubblicazione del ciclo; le già pubblicate restano nel gioco e compaiono nel nuovo filtro «Senza tag (N)».
- Vocabolario dei tag in Revisione: conteggi per tag e rimozione con anteprima dell'impatto (foto che resterebbero senza tag, pubblicate e non) e conferma esatta.
- Storico append-only di ogni aggiunta e rimozione, con l'hash dei pixel del momento. Migrazione additiva 0031.
- I test che approvano foto assegnano ora un tag prima dell'approvazione.

## 0.27.0 — 2026-11-09T04:10:00Z (proposta, non pubblicata)

- Esplora Commons: pulsante «Rivedi selezione (N)» e pannello con le foto selezionate prima di qualsiasi aggiunta o acquisizione: miniatura, titolo, autore, licenza, dimensioni, anteprima grande, «Rimuovi», «Svuota selezione», «Aggiungi al lotto corrente» e «Crea un lotto con queste».
- La selezione resta tra ricerche diverse e dopo il ricaricamento della pagina nella stessa scheda (sessionStorage), finché non viene aggiunta o svuotata.
- Nessuna modifica al Worker né migrazioni.

## 0.26.1 — 2026-11-08T23:10:00Z (proposta, non pubblicata)

- Esplora Commons: le miniature servite da `thumb.wikimedia.org` (forma attuale dell'API) erano scartate perché era ammesso solo `upload.wikimedia.org`; ora entrambi gli host, limitati a `/wikipedia/commons/`, con i parametri `utm_*` rimossi. Verificato sulla risposta reale per «Paris protest»: 30 foto su 30.
- Acquisizione: gli originali oltre 12 MB, scaricati come miniatura proporzionale da `thumb.wikimedia.org`, non vengono più rifiutati.
- Nessuna migrazione.

## 0.26.0 — 2026-11-08T22:40:00Z (proposta, non pubblicata)

- Esplora Commons mostra le fotografie: foto e categorie ora usano richieste API separate (insieme, l'API restituiva solo le categorie).
- Griglia di miniature con selezione sovrapposta; anteprima grande con autore, licenza, data, dimensioni, descrizione, selezione e navigazione tra le foto.
- Ricerca limitata alle immagini bitmap e ordinabile per pertinenza o per data; categorie collegate in un pannello richiudibile; barra della selezione fissa in basso.
- Specifica `docs/lotti-editoriali.v1.4.1.md`. Nessuna migrazione.

## 0.25.0 — 2026-11-08T21:00:00Z (proposta, non pubblicata)

- Esplora Commons e acquisizioni: tutte le richieste a Wikimedia inviano un `User-Agent` identificativo (il sito pubblico), richiesto dalla policy Wikimedia; i Worker non ne inviano uno di default. Gli errori riportano il codice HTTP di Commons.
- Rimozione dei lotti senza fotografie caricate o acquisite anche quando contengono link mai acquisiti, scartati o no: istantanea append-only in `editorial_lot_removals`, poi cancellazione di link, scarti, note e lotto; il titolo torna libero.
- Migrazione 0030: nuova tabella di audit e trigger di proposte/scarti sostituiti per ammettere solo quella cancellazione. Upload, foto acquisite, revisione e ricevute restano protetti.
- Specifica `docs/lotti-editoriali.v1.4.0.md`, AGENTS/MASTER 14.1.0.

## 0.24.0 — 2026-11-08T20:00:26Z (proposta, non pubblicata)

Fase 1 dei lotti editoriali (`docs/lotti-editoriali.v1.3.1.md`, AGENTS/MASTER 14.0.0).

- Lotti: titolo breve obbligatorio e note facoltative per la generazione (≤500 caratteri), senza proposta GPT né embedding. Storico append-only delle note con revisione ottimistica.
- Esplora Commons nella sezione Produzione: ricerca di foto e categorie, navigazione per sottocategorie, selezione multipla, aggiunta al lotto corrente o creazione di un lotto con titolo proposto dalle categorie; acquisizione immediata facoltativa.
- Link Commons verso miniature, originali, visualizzatore (`#/media/File:`) e `index.php` ricondotti alla pagina `File:`; deduplica sulla forma canonica.
- «Scarta link» per proposte mai acquisite: evento immutabile, la proposta resta nello storico.
- Acquisizioni Commons nuove: categorie e data salvate come contesto non verificato per il futuro pianificatore SLOP.
- Sezione «Argomenti» rinominata «Lotti»; rimozione dei lotti inutilizzati invariata.
- Migrazione additiva 0029. Nessuna chiamata a pagamento; API storiche (topics, descrizioni, semantica) invariate.

## 0.23.2 — 2026-11-08T16:20:00Z (proposta, non pubblicata)

- Il pulsante «Rimuovi argomento inutilizzato» è ora visibile nella sezione Argomenti: la navigazione a sezioni lo assegnava a Produzione immagini, nascondendolo.
- E2E browser desktop/mobile: verifica visibilità del pulsante nella vista Argomenti e rimozione di un argomento inutilizzato.

## 0.23.1 — 2026-11-08T15:35:00Z (proposta, non pubblicata)

- Pulsante «Rimuovi argomento inutilizzato» spostato fuori dal form della memoria semantica: il form conserva un solo pulsante (correzione della E2E browser fallita in CI).

## 0.23.0 — 2026-11-08T15:40:00Z (proposta, non pubblicata)

- Azione admin «Rimuovi argomento inutilizzato» (`POST /api/admin/editorial/workspace/topics/:id/remove`) con conferma esplicita del titolo.
- Rimozione consentita solo senza proposte, ricerche, prompt SLOP, job AI, pertinenze, generazioni, revisioni semantiche archiviate, embedding incerti o bozze attive; altrimenti 409 senza modifiche.
- Rimuove tema, memoria semantica corrente, seed SLOP e fase manuale; bozze e ricevute di descrizione restano con `topic_id` scollegato. Il titolo normalizzato torna disponibile.
- Motivo: l'argomento obsoleto «Proteste a Parigi, ottobre 2026» impediva di registrare quello reale. Nessuna migrazione, nessuna chiamata AI; il dato remoto non è stato toccato da questa modifica.

## 0.22.1 — 2026-11-08T12:52:41.502Z (proposta, non pubblicata)

- Caricamento dashboard senza mostrare temporaneamente i vecchi moduli.
- Proposte batch di fino a 20 link HTTPS, validazione preventiva, duplicati ignorati e risultati espliciti.
- Pulsante di acquisizione Commons su ciascun link e feedback locale; fonti non supportate indicate chiaramente.
- Rimosso il placeholder il precedente esempio dimostrativo; nessun argomento viene selezionato automaticamente o cancellato dal database.
- Route admin additiva e test browser desktop/mobile aggiornati. Nessuna migrazione o costo AI.

## 0.22.0 — 2026-11-08T11:05:14.575Z (proposta in PR, non pubblicata)

- Dashboard amministrativa divisa in sei sezioni: Panoramica, Argomenti, Produzione immagini, Revisione, Pubblicazione, Impostazioni.
- Navigazione laterale desktop e orizzontale compatta su mobile. Stato e filtri dei moduli rimangono intatti quando si cambia sezione.
- Panoramica con dati reali da API private (argomenti, coda, catalogo e modalità partite); errori non mascherati da conteggi inventati.
- Spostamento della pubblicazione in una sezione distinta senza duplicare i controlli, con conferme e verifiche preesistenti.
- Nuovi test della navigazione e verifica browser desktop/mobile; nessuna migrazione D1 o azione AI automatica.

## 0.21.0 — 2026-11-08T08:08:38.708Z (proposta in PR, non pubblicata)

- Selettore Demo/Produzione nella dashboard owner, persistito in D1 e indipendente dal deploy Cloudflare.
- Attivazione produzione soltanto con immagini REAL e SLOP pubblicate in R2; revisione ottimistica e audit immutabile.
- Nuove partite scelgono il catalogo corrente; le partite già assegnate conservano immagini, risposta, sorgente e corretta etichetta.
- Test e anteprima; migrazione additiva 0028. Nessuna attivazione automatica della produzione.

## 0.20.0 — 2026-11-08T07:01:53Z

- Budget AI condiviso visibile in dashboard con reset esplicito a importo server, storico immutabile e prenotazioni conservate.
- Periodi e assegnazioni atomiche: concorrenza, schede obsolete e doppi clic non moltiplicano il credito; limite comune per testo, immagini ed embedding.
- Migrazione additiva 0027, regressioni su esaurimento/ripristino, audit contabile e UI desktop/mobile.

## 0.19.0 — 2026-11-08T03:46:09Z (completamento #64)

- Snapshot immutabili separati REAL/SLOP, riferimenti ai voti/profili, parametri e conteggi; cronologia privata e ricostruzione dello stato usato dai ranker, con tracce suddivise entro i limiti D1.
- Audit EXIF delle otto orientazioni, dimensioni codificate/display separate e diagnostica per metadata non risolvibili. Lettura esplicita dei file storici senza modificare originali, hash o voti.
- Migrazione additiva 0026, frontend desktop/mobile, regressioni su immutabilità, concorrenza, correzione dei voti e byte EXIF.

## 0.18.0 — 2026-11-08T02:30:59Z (proposta, non rilasciata)

- #64: prima stime strutturate di coerenza/specificità/plausibilità, poi embedding e revisione dei duplicati; proposte escluse o incerte restano separate dai voti umani.
- Distanza semantica solo diagnostica, vicini storici separati da quelli del lotto corrente, contatori senza certificazioni automatiche della qualità o copertura.
- Migrazione additiva 0025, registro idempotente dell'intero lotto, UI desktop/mobile e regressioni su corpus vuoto/outlier/replay. Descrizioni escluse dalle query REAL e dai seed/prompt SLOP, con test sui payload e sul freeze.

## 0.17.0 — 2026-11-07T23:12:00Z (proposta, non rilasciata)

- #64/#78: un titolo senza descrizione prepara una proposta GPT inglese modificabile, con ambiguità e conferma obbligatoria prima del tema definitivo e dell'embedding. Descrizioni manuali conservano il percorso diretto.
- Bozze private riprendibili dopo refresh, rigenerazione con conferma dei costi, annullamento, ricevute dedicate e ledger esistente; deduplicazione e approvazione atomica vincolata al titolo/hash impediscono invii duplicati e conferme stale.
- Migrazione additiva 0024, provider simulati e browser desktop/mobile. Discovery resta indipendente; nessuna modifica a gate, budget, dati remoti o brand.

## 0.15.0 — 2026-11-03 (sperimentale, non attivata)

- Protocollo editoriale v2 indipendente: scoperta REAL multicanale e generazioni SLOP da idee originali o prompt aperti, senza fotografie di riferimento, classifica condivisa, soglie di sorpresa o preferenze storiche.
- Contratto multidimensionale Python/TypeScript, verifica documentale separata, esclusione degli ibridi, feedback con incertezza ed evidenze, regole accessibili prima del gioco.
- Studio privato `/admin/editorial-v2`, migrazione additiva 0013, checkpoint D1/R2, budget atomici, revisione umana con audit e nessun collegamento al catalogo pubblicabile. Gate assenti/disabilitati per default.
- Trasporto Batch condiviso con la compatibilità v1; simulazione riproducibile di 120 fixture e analisi della resa, copertura, duplicati e trasferimento. Le fixture non sostituiscono il benchmark fotografico o i test umani.
- Nessuna migrazione remota, chiamata pagata, schedule, pubblicazione, riclassificazione o rimozione di asset.

## 0.14.2 — 2026-11-03T15:18:33.817420+01:00

- Galleria privata in apertura dello Studio: lotto più recente caricato automaticamente, tutte le REAL e le SLOP archiviate, incluse quelle sotto soglia, con sorgente e generazione affiancate. Editor manuale e pubblicazione in sezioni avanzate.
- Fotografia sorgente visibile anche nella coda Approva/Rifiuta e nella gestione avanzata; il link al generatore è distinto dalla provenienza della fotografia. API arricchite soltanto nell’amministrazione autenticata.
- Nessuna nuova migrazione, dipendenza o chiamata OpenAI. Punteggi, soglie, revisione umana e catalogo pubblicato invariati.

## 0.14.1 — 2026-11-02T21:24:07.507675+01:00

- Archivio privato in R2 anche per generazioni scartate o fallite dopo la produzione del file, con manifest D1 immutabile e preview nello Studio. Nessuna importazione o pubblicazione aggiuntiva.
- Migrazione additiva 0012, controlli condivisi di integrità, recupero idempotente e verifica delle capacità prima delle chiamate pagate. Nessuna attivazione o modifica remota.

## 0.14.0 — 2026-11-02T16:30:46Z

- Workflow editoriale con quattro fasi OpenAI Batch, prompt esclusivamente testuali, valutazione finale cieca, risultati associati per custom_id e nessuna fallback sincrona. Prova da due fotografie / una generazione.
- Checkpoint privati D1/R2, lease e revisione CAS, invii incerti riconciliati senza duplicazioni, prenotazioni atomiche per batch/run/giorno e tetto cumulativo configurabile per i 5 USD della prova.
- Migrazione additiva 0011: prenotazione e deduplicazione delle sorgenti fra run, conservazione di dati e modalità esistenti. Stato tecnico separato dalla revisione Approva/Rifiuta.
- Test con provider fittizio, documentazione Batch e recupero; nessun nuovo secret, dipendenza, cron, pagamento, deploy, migrazione remota o pubblicazione del catalogo.

## 0.13.0 — 2026-11-02T15:58:55+01:00

- Revisione visiva con immagine e Approva/Rifiuta, senza campi o checkbox; preparazione automatica prima della coda, snapshot e conferma umana atomica.
- Preferenze bayesiane persistenti da decisioni umane, esplorazione del 25%, ricerca diversificata e brief morbidi senza cambiare classifica, soglie, libertà generativa o bilanciamento. Nessun training a pagamento.
- Migrazione additiva 0010 e dettagli/gestione avanzata separati. Nessuna attivazione o modifica remota.

## 0.12.0 — 2026-11-02T15:25:07+01:00

- A tempo: scadenze server per singola immagine, scelta 10/20/30 secondi e numero di round; manifest limitato al round corrente, timeout senza risposte fittizie e feedback senza consumo del round successivo.
- Allenamento: tempo misurato nel riepilogo, senza effetti su punti o spareggi.
- Oscuramento locale al cambio scheda/focus e chiusura dell’ingrandimento, senza pausa del timer; ostacoli al salvataggio diretto limitati alle immagini di gioco.
- PvP sospeso nella navigazione e nelle API pubbliche; attore, binding e dati storici conservati.
- Migrazione additiva 0009; vecchie sessioni e deadline preservate. Nessuna migrazione, pubblicazione o generazione remota eseguita.

## 0.11.2 — 2026-11-02T13:34:37+01:00

- Avvio manuale del workflow con scelta esplicita di 2 o 20 fotografie; default
  controllato da due riferimenti, massimo una generazione e quattro analisi visive.
- Raccolta CLI con `--limit` 1–20, mantenendo il lotto quotidiano normale a 20.
- Indicazioni operative per la prima attivazione e per vedere candidate/dossier
  nel sito e file scartati negli artifact privati. Nessuna attivazione a pagamento.

## 0.11.1 — 2026-11-02T09:43:07+01:00

- Workers Builds può pubblicare quando tutte le migrazioni D1 risultano già
  applicate, senza ripetere migrazioni/seed né richiedere una deroga permanente.
- Nuove migrazioni richiedono ancora preflight, backup e approvazione; cronologia
  D1 non disponibile/incoerente o migrazione incompleta interrompono il rilascio.
- I deploy conservano le variabili del Worker, inclusi interruttori e budget.

## 0.11.0 — 2026-11-01T22:00:00Z (non attivata)

- Classifica visiva unica REAL/SLOP, reinterpretazione testuale con generatore libero,
  API OpenAI configurabili e valutazione finale cieca con tentativi/budget limitati.
- Registro privato immutabile delle sorgenti, dossier e recupero senza rigenerazione.
- Rimozione della difficoltà operativa con archivio dei dati precedenti.
- Approvazione distinta da pubblicazione atomica 50/50, note di revisione facoltative,
  diagnostica privata e integrazione Studio/admin; campionamento indipendente invariato.
- Migrazioni 0007/0008 locali, test mock ed emulatori; nessuna attivazione pagata,
  migrazione remota, pubblicazione del catalogo o deploy.

# Changelog

## Unreleased

- Controllo reale Commons preregistrato: piani/rapporti manuali conservati,
  filtro bitmap uguale per i due bracci, replay senza rete e giudizi sconosciuti
  mantenuti null. Diagnosi Openverse distingue challenge Cloudflare e errori
  di autenticazione; segnalazione lasciata solo in bozza per scelta del proprietario.

- #56: discovery REAL separata con matrice 12×12×3, strategie GPT-6.1 e
  adattamento per Commons/Openverse, parametri HTTP deterministici, acquisizione
  privata, gate documentali e profili ciechi, shortlist e review esplicita.
  Ricevute/cache versionate, ledger atomico riusato e benchmark fixture; nessuna
  API pagata o modifica di produzione eseguita. AGENTS/MASTER 2.0.0 conservano
  gli snapshot precedenti; pipeline storiche e contratti del gioco invariati.

- #57, prima consegna documentale: AGENTS/MASTER canonici con snapshot 1.0.0,
  audit dei moduli e delle PR aperte, indice delle fonti e piano preparatorio #56.
  Nessuna modifica applicativa, di schema, workflow o versione dell'applicazione.
- Versionati i binding R2 QUARANTINE/IMAGES confermati dal proprietario e aggiornata la guardia di deploy:demo, mantenendo Worker, D1 e modalità demo esistenti. Nessun provisioning automatico.
- Flusso diretto file locali → D1/R2 senza Google Drive, con anteprima, originali privati immutabili su R2, import ripetibile e ripresa degli upload. Spiegazioni modificabili nella revisione sia per REAL sia per AI.
- Aggiunto supporto alle sei famiglie CC BY/BY-SA/BY-NC/BY-ND/BY-NC-SA/BY-NC-ND 2.0, 3.0 e 4.0, incluse le varianti pubblicate, per il sito non commerciale e senza adattamenti. Elenco condiviso pipeline/Worker, versione e giurisdizione conservate; conferme umane obbligatorie.
- Demo remota senza dipendenza da R2, D1 esistente con ID esplicito e profilo separato per gli emulatori locali.
- Rilascio demo con destinazione verificata, migrazioni/seed separati dalla build e provisioning automatico disabilitato.
- Corretto il flusso build/packaging Cloudflare: output Vite esplicito, build Wrangler da checkout pulito e verifica index/risorse pubblicate.
- Documentata la dipendenza dal codice applicativo ancora fuori da main e le impostazioni della dashboard esistente.

## 0.10.0 — 2026-10-26
- Gestore di immagini condiviso con fetch/decode, deduplica, due download concorrenti, priorità corrente, cache a finestra, budget e cancellazione; risposte abilitate solo dopo decodifica.
- Preparazione persistita per A tempo, manifest opachi e start atomico/idempotente dopo verifica di tutti i file; scadenza assegnata dal server, TTL di preparazione e countdown monotono.
- Allenamento con finestra corrente + due immagini, presentazione esplicita dopo decode e retry senza nuove estrazioni o punti.
- PvP con preparazione per-round, conferme autenticate di entrambi, deadline comune e limite di attesa di 45 secondi; riconnessione e pacchetti obsoleti gestiti senza riavviare il tempo.
- Annullamento distinto dal completamento in caso di guasto, audit e statistiche che escludono risultati invalidati; ultima risposta/completamento e annullamento protetti da transazioni concorrenti.
- Migrazione additiva, compatibilità delle assegnazioni legacy e override operativo per nuove partite; query aggregate per lotti fino a 50 round.
- Test unitari/HTTP/browser, fixture corrotte e lente, benchmark Chromium riproducibile con banda condivisa e documentazione del protocollo v1.0.0. Nessun deploy o modifica Cloudflare.

## 0.9.0 — 2026-10-25
- Tema Digital Gallery su home, modalità, gioco, risultati, PvP, pagine informative e amministrazione: palette approvata, marchio REAL or SLOP e superfici sobrie.
- Space Grotesk Bold e Inter serviti localmente con licenze OFL; nessun servizio font esterno o dipendenza aggiunta.
- Azioni REAL/SLOP simmetriche con valori API REAL/AI invariati; immagine integra senza filtri, progresso e layout compatto su telefono/tablet/desktop.
- Skip link, focus e zoom da tastiera, nomi accessibili, contrasti verificati e movimento ridotto per il feedback post-risposta.
- Verifica browser riproducibile con Chromium esistente, screenshot locali e documentazione v1.0.0. Backend, dati, campionamento e timer invariati; precaricamento riservato alla fase successiva.

## 0.8.0 — 2026-10-25
- Studio privato SLOP per concept, fatti con riferimenti, prompt integrale, modello, versione/data della generazione esterna e valutazioni delle iterazioni.
- Template locali Facile/Medio/Difficile e profilo Esperto soltanto editoriale; proposta di spiegazione modificabile basata esclusivamente sui fatti forniti.
- Salvataggi con revisione e audit immutabile; importazione manuale atomica/idempotente in quarantena e moderazione umana esistente, senza generatori esterni o creazione automatica di immagini.
- Provenienza congelata dopo l'importazione; nuove iterazioni separate, spiegazione finale modificabile durante la revisione con audit della differenza.
- Migrazione additiva, test schema/unitari/HTTP, controlli browser desktop/mobile e documentazione dello studio v1.0.0. API pubbliche, etichette indipendenti, sessioni e timer invariati. Nessuna nuova dipendenza o risorsa Cloudflare.

## 0.7.0 — 2026-10-25
- Corretto il vincolo di quota della 0.6.0: ogni nuova posizione usa una moneta REAL/AI indipendente al 50%, senza compensazioni o limiti alle serie consecutive.
- Capacità calcolata prima delle monete: round limitati allo stock distinto di ciascuna classe; rifiuto con 409 se non è garantibile una partita valida.
- Pesi editoriali comuni, posizioni compatibili con entrambe le classi, ampliamento preventivo degli strati e ottimizzazione delle riserve; nessuna correzione dei conteggi effettivi della partita.
- Simulazioni riproducibili su frequenza globale, storia, varianza binomiale e caratteristiche aggregate; vecchie quote conservate soltanto come controllo negativo dei test.
- Test delle assegnazioni già esistenti e del PvP condiviso; documentazione del campionamento v2.0.0. Nessun merge, deploy o modifica cloud richiesta.

## 0.6.0 — 2026-10-25 (politica delle quote superata dalla 0.7.0)
- Campionamento stratificato condiviso tra Allenamento, A tempo e PvP, con quote REAL/AI e confronti delle distribuzioni editoriali.
- Deduplica per ID, storage, SHA-256 e dHash; famiglie con etichette contrastanti escluse e fallback espliciti per cataloghi incompleti.
- Upload privato con dHash facoltativo calcolato dalla pipeline; un file sostituito senza nuova impronta azzera quella precedente.
- Benchmark riproducibile contro `balanced()`, test sintetici e integrazione su assegnazioni D1 locali, con filtri e protezioni dagli spoiler.
- Sessioni esistenti, timer, punteggi, difficoltà e fixture demo invariati. Nessuna nuova migrazione o dipendenza.

## 0.5.0 — 2026-10-25
- Schede editoriali private REAL/AI con vocabolari controllati, contesto rappresentato, fatti documentati e valutazioni soggettive separati.
- Migrazione D1 additiva, audit immutabile con snapshot e controllo delle revisioni contro sovrascritture concorrenti.
- Modulo amministrativo per classificazioni, prove, note e cronologia; salvataggio separato dalla decisione umana obbligatoria.
- Test di upgrade, autorizzazioni, validazione, concorrenza, compatibilità demo e assenza di spoiler. Nessuna quarta difficoltà, modifica al campionamento o servizio cloud aggiunto.

## 0.1.0 — 2026-10-25
- Architettura Worker/Vite, schema D1, seed sintetico idempotente e adapter storage.
- Navigazione responsive, protezione amministrazione, controlli API/schema e CI.

## 0.2.0 — 2026-10-25
- Connettori Python ufficiali, quarantena privata, controlli diritti/deduplica e workflow manuale inattivo.
- Import REAL/AI, upload privato, revisione editoriale autenticata e audit locale.

## 0.3.0 — 2026-10-25
- Allenamento e A tempo completi con filtri, bilanciamento, sessioni e scadenze D1 server-side.
- Crediti dopo risposta, ripresa, tasti rapidi, zoom, punteggio e statistiche editoriali private.

## 0.4.0 — 2026-10-25
- PvP due giocatori su Durable Objects SQLite e WebSocket hibernation, reveal comune, scadenze e audit D1.
- Riconnessione HTTP/WebSocket, rate limit, abbandono e test con due client reali.
- Backup/restore locali verificabili, configurazione preview fail-closed e piano di rilascio separato dalla produzione.
