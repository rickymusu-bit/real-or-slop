# Registro delle versioni

Aggiornato: 2026-11-21T09:00:00Z. Una voce per versione dell'app, dalla più recente; le versioni dei documenti sono in `MASTER.md`.
I documenti citati nelle voci precedenti al riordino del 2026-11-14 sono nella cronologia git.

## 1.51.0 — 2026-11-21T09:00:00Z

- Niente descrizione editoriale delle REAL e niente analisi a pagamento: spariscono il passo di generazione del wizard, i campi del
  dettaglio, le istruzioni «Descrizione delle REAL» e le API `/analyze` e `/analysis`. Il passo 2 del wizard tiene la descrizione
  della fonte, che resta nel catalogo e accompagna la REAL nelle proposte SLOP automatiche.
- Le SLOP non hanno più una descrizione: il campo sparisce dal dettaglio e dall'API.
- Risultati di fine partita: per le REAL titolo, autore, licenza, link alla foto originale e modifiche della copia; per le SLOP prompt
  e modello di immagini. «Come funziona» e «Fonti e crediti» lo dicono.
- Le proposte SLOP automatiche ricevono originale, titolo e descrizione della fonte. Una REAL approvata o pubblicata con originale
  disponibile può essere estratta anche senza descrizione.
- Migrazione 0066: elimina i campi della descrizione editoriale e dell'analisi, svuota la descrizione delle SLOP e salva come versioni
  correnti «Base comune» e «Premessa e prompt di galleria» proposte dal codice (le precedenti restano ripristinabili).

## 1.50.0 — 2026-11-20T16:30:00Z

- Le foto non hanno più tag (decisione dell'owner): spariscono filtri, pillole, vocabolario, alias, categorie, completamento di Genere,
  Colore e Supporto, ripristino e distribuzione per tag. Approvare una foto non richiede tag. Migrazione 0063.
- L'analisi a pagamento riguarda solo le REAL e restituisce la descrizione editoriale. Il passo 2 del wizard REAL diventa
  «Descrizione», con un avviso non bloccante per le foto senza descrizione.
- Le SLOP non si analizzano: nessuna chiamata dopo l'accettazione, automatica o manuale. Il tetto è `2N` chiamate per SLOP invece di
  `1 + 2N`. La generazione manuale non chiede più tag di partenza.
- Il trattamento delle SLOP sceglie bianco e nero, seppia o colore dalla crominanza residua della REAL (misure 4, trattamento 6),
  non più dal suo tag Colore. Le copie esistenti si rimisurano da sole all'apertura della galleria.
- Nuove proposte di testo per «Base comune» e «Descrizione delle REAL» nelle Impostazioni, da salvare.

## 1.49.0 — 2026-11-20T09:55:15Z

- Il riquadro 4:5 si muove liberamente entro la foto quando ci sta. Quando supera la foto in altezza o larghezza, si centra automaticamente su quell’asse per pareggiare le bande nere.

## 1.48.0 — 2026-11-20T07:35:33Z

- «Inquadratura» mostra subito il rettangolo sulla foto adattata al 4:5. Il rettangolo si può spostare e ridimensionare anche nelle bande nere. La copia viene ricavata dall’originale.

## 1.47.0 — 2026-11-20T06:09:53Z

- Le nuove copie 4:5 mostrano l’intera foto, con bande nere secondo le proporzioni. Nell’editor si può scegliere il ritaglio, spostare il riquadro e ridimensionarlo con le maniglie. Su mobile, allontanare le dita allarga il riquadro. «Salva» resta visibile durante lo scorrimento.

## 1.46.0 — 2026-11-19T23:44:53Z

- L’inquadratura 4:5 offre «Adatta alla larghezza» con bande nere e il gesto a due dita per il ritaglio. Durante l’elaborazione, un indicatore al centro blocca la finestra della foto.
- Nei risultati le REAL mostrano la descrizione editoriale, l’autore, il link alla foto originale e la licenza. Il wizard anticipa la stessa descrizione.
- La barra delle foto selezionate è sotto la griglia. Offre «Approva», «Pubblica», «Nel cestino», «Cambia galleria» e «Deseleziona». «Togli dalla pubblicazione» compare per le selezioni con foto pubblicate e ritira solo queste.
- Il dettaglio aperto toccando una foto riunisce i comandi per tag, inquadratura, trattamento SLOP e analisi IA. Si può rifare un’analisi con conferma esplicita.
- REAL e SLOP si possono spostare insieme. Le SLOP spostate si rivedono nella galleria di destinazione.
- L’acquisizione REAL mostra «Foto acquisite: X di Y» con il totale fisso e una barra di progresso. La pagina resta bloccata fino alla fine della preparazione delle copie di gioco.

## 1.45.0 — 2026-11-19T19:19:49Z

- «Carica REAL» e «Genera SLOP» aprono pagine dedicate nella stessa scheda, con spazio per i wizard e ritorno diretto alla galleria.
- Le selezioni di Commons e le bozze del wizard restano associate alla galleria tra le navigazioni. Il collegamento al batch automatico e quello alla revisione aprono la destinazione corretta.

## 1.44.0 — 2026-11-19T17:27:23Z

- «Elimina galleria» nel modulo di modifica, con conferma per foto, cestino e generazioni della galleria.
- Le partite e le generazioni in corso bloccano l’eliminazione fino alla conclusione. La migrazione 0062 registra i file R2 da rimuovere per consentire i tentativi di pulizia successivi.

## 1.43.0 — 2026-11-19T15:59:47Z

- La dashboard si apre su Gallerie, con anteprime e creazione. Ogni galleria ha una finestra con la griglia scorrevole, i filtri, il dettaglio e il cestino di quella galleria.
- «Carica REAL» mantiene il wizard di ricerca Commons, tag, inquadratura e pubblicazione. Rimosso il campo per incollare link. «Genera SLOP» apre entrambe le modalità nella galleria corrente, con estrazione casuale delle sue REAL nella modalità automatica.
- Statistiche include la distribuzione delle immagini. Impostazioni resta accessibile dalla navigazione principale.

## 1.42.0 — 2026-11-18T19:45:07Z

- Gallerie obbligatorie per REAL e SLOP, con titolo, descrizione e Indicazioni SLOP. Assegnazione nel caricamento e nel Database.
- Estrazione casuale gratuita dalla galleria e due conferme per proposte e immagini. Premessa e prompt dall’originale intero, valutazione con la premessa approvata. Le REAL restano utilizzabili nel gioco.
- Migrazioni 0060 e 0061. Su decisione dell’owner, azzeramento del D1 corrente al rilascio, compresi catalogo, batch, partite, classifica, chiamate registrate e impostazioni. Rimozione del registro madre–figlia. Le immagini nuove richiedono una galleria anche nella generazione manuale.

## 1.41.0 — 2026-11-18T05:56:24Z

- La generazione automatica permette di scegliere REAL pronte dal Database o di cercarne e importarne di nuove da Wikimedia Commons, anche combinando le due provenienze.
- Il wizard Commons prepara tag e descrizione editoriale con inserimento manuale o analisi combinata confermata. La foto privata è utilizzabile come riferimento da nuova.
- L’anteprima gratuita mostra esattamente le REAL scelte e conserva l’ordine del batch. L’estrazione casuale resta disponibile come opzione.
- Lo studio ignora le risposte tardive di un batch precedente quando si apre una nuova bozza.

## 1.40.0 — 2026-11-18T05:29:01Z

- Una REAL con SLOP derivata esce dalle nuove partite quando la figlia entra in libreria. La migrazione 0059 ritira le REAL già collegate, preservando le copie delle partite in corso.
- Dal Database l’eliminazione definitiva della madre è disponibile dopo l’approvazione della figlia. Una generazione chiusa senza SLOP libera la prenotazione.
- Il brief e il prompt automatici ammettono vista frontale, posa naturale, simmetria, soggetto singolo e sfondo semplice. La rotazione le include e il valutatore le giudica nel contesto della scena.

## 1.39.0 — 2026-11-17T19:34:55Z

- Database: rimossi i checkbox «Copia da rifare in 4:5», «REAL senza descrizione» e «Senza Genere, Colore o Supporto», con lo stato e i parametri obsoleti inviati dal browser. Le analisi in gruppo si eseguono sulla selezione esplicita.
- Generazione automatica in due passaggi: estrazione gratuita delle REAL, con miniature, titoli, tag e anteprima dell'originale intero con descrizione; poi conferma del massimo e avvio. Riestrazione e annullamento senza chiamate.
- L'avvio usa le stesse REAL mostrate, con configurazione firmata, scadenza di quindici minuti e controllo di revisioni/disponibilità nella transazione. Token già usati, selezioni scadute o modificate non avviano chiamate.

- Rimossi i gruppi di genere/decennio da interfaccia, API, statistiche e database. Migrazione 0056: elimina colonne e impostazioni obsolete, converte il contesto storico in normali tag e conserva immagini, copie, tentativi, chiamate e registro madre–figlia. Bilanciamento solo per numero di foto e REAL madri disponibili.

- Pulizia dei campi foto: migrazione 0057 elimina didascalie, vista iniziale e spiegazione mai letta dal gioco. Fonte/autore/licenza solo per le REAL; prompt/modello solo per le SLOP, anche nelle modifiche API. Conservati descrizioni, contesto editoriale, copie, analisi e legami madre–figlia. Query di estrazione del gioco ridotta ai campi realmente usati; crediti finali invariati.

- Un aggiornamento dello studio conserva anche l’apertura dei singoli tentativi nelle eccezioni SLOP, evitando che prompt e valutazione si richiudano durante la lettura.

- «Accetta comunque il tentativo N» anche con difetti critici/minori, incertezze o vincoli non confermati, nei processi conclusi/sospesi. Conferma con le segnalazioni e massimo una chiamata per i tag; scelta registrata separatamente dalla valutazione originale. Foto nuova, senza approvazione o pubblicazione automatiche; gestione dei doppi clic e dello stato in caso di file mancante. Nessuna nuova migrazione.

- SLOP senza titolo né riquadro «Tag di partenza»: ID abbreviato nella dashboard, ricerca per ID, titolo escluso dall’analisi. Migrazione 0058 elimina titoli SLOP e tag ereditati dai metadati della figlia; conserva titoli REAL, tag osservati, processi, legami e parametri tecnici della copia. Input esatto del valutatore documentato e verificato per ciascuna iterazione, senza cronologia implicita.

## 1.38.0 — 2026-11-17T10:19:38Z

- Generazione manuale con prompt, tag e ancoraggi dell'owner, senza REAL né chiamata per scrivere il prompt; automatica con quantità scelta. La proposta diventa una notifica di sbilanciamento, senza pulsanti di generazione globali.
- Registro privato delle REAL occupate: nessun riuso finché la figlia esiste, anche nuova o nel cestino; liberazione con eliminazione definitiva. Prenotazioni atomiche contro processi concorrenti. Migrazione 0055; nessuna attribuzione inventata per i legami pregressi rimossi.
- Composizione automatica variata con preferenze di posizione e sguardo, senza imporre pose o causare tentativi extra.
- CI: suite per area con fallback completo, cache dipendenze e Chromium, rimossa la terza build; fixture SQL nel solo D1 isolato senza avviare ogni volta Wrangler, tempi per suite negli artefatti. Suite completa disponibile manualmente.

## 1.37.0 — 2026-11-16T22:03:33Z

- Dashboard riprogettata in tutte le sezioni: ricerca catalogo, navigazione persistente, impostazioni raggruppate, revisioni progressive. Proposte automatiche dal fabbisogno globale, con campione casuale di REAL e nessuna soglia di spread o gruppo. Migrazione 0054.
- Allineamento a main dopo la #151, conservando i controlli del trattamento anonimo; verifica browser aggiornata alla nuova presentazione dei conteggi.
- Ricerca del catalogo effettiva anche su descrizione e prompt, combinata con gli altri filtri; test della migrazione 0054 e rifiuto delle impostazioni obsolete.

- Corretta la sovrapposizione della navigazione laterale ai pannelli desktop, ripristinati testata e spaziature della dashboard e resi visibili i titoli delle ispirazioni SLOP. Controlli browser sulla geometria oltre ai controlli funzionali; preparazione della pressione prolungata stabile anche quando il catalogo ricrea le schede in background.

## 1.36.0 — 2026-11-16T21:28:00Z

- SLOP indipendenti: nessun legame persistente con la REAL, coesistenza in partita, conteggi del catalogo e trattamento da misure anonime. Migrazione 0053 preserva tentativi e chiamate. Revisione tecnica e ripartizione Sol/Astra in `docs/revisione-codice.md`.
- Campioni malformati nel trattamento anonimo rifiutati senza errore interno; test di regressione per valori JSON primitivi e campioni incompleti.

## 1.35.1 — 2026-11-16T18:16:17Z

- **Accettare dopo la revisione anche con i vincoli non confermati** (decisione dell'owner del 2026-11-16): nel secondo batch 2 SLOP
  su 10 erano in revisione con `editorial_constraints_met` falso ma senza difetti critici, e «Accetta il tentativo N» non compariva.
  Un ancoraggio mancante è un difetto critico ed è elencato come tale: senza difetti critici il valore falso esprime un dubbio del
  valutatore, che decide l'owner. La conferma avverte di rileggere le incertezze. I tentativi con difetti critici restano esclusi.
- **Edifici e luoghi reali** (decisione dell'owner del 2026-11-16): la parte fissa delle istruzioni del brief lascia decidere caso
  per caso se nominare un luogo reale o inventarne uno simile, ma vieta di chiedere la riproduzione fedele di un edificio reale; il
  valutatore non giudica la fedeltà all'aspetto reale e non la chiede nei prompt rivisti. Nel secondo batch il brief aveva reso
  obbligatoria Brown Chapel e il valutatore ne aveva chiesto l'architettura esatta.
- Specifica `generazione-slop` 5.11.0; `MASTER.md` 26.4.0.

## 1.35.0 — 2026-11-16T16:40:52Z

- **Accettare una candidata dopo la revisione** (decisione dell'owner del 2026-11-16): nei processi «Da vedere» in cui il valutatore
  chiede la revisione, «Accetta il tentativo N» registra la candidata come SLOP nuova nel suo batch e analizza i tag con una
  chiamata a pagamento confermata (`POST processes/:id/accept`). Rifiutati i tentativi con difetti critici, ancoraggi mancanti o
  senza candidata salvata, il doppio invio e la REAL con una SLOP già attiva. Prima l'unica scelta era chiudere il processo.
- **Le note d'incertezza non fermano più l'accettazione:** il server trasformava in revisione ogni `accept` con almeno una nota,
  e il valutatore annota sempre che luogo, data e identità non si verificano dai pixel. La parte fissa delle istruzioni del
  valutatore chiede ora la revisione solo per un dubbio concreto su qualcosa di visibile.
- **Seppia distinto dal bianco e nero** (richiesta dell'owner del 2026-11-16): i due seguivano lo stesso calcolo, luminanza più la
  tinta dei cursori, e scegliendo «Seppia» la tinta restava quella che c'era (quasi zero), quindi il risultato era grigio. Ora la
  tinta è piena nei mezzitoni e nulla al nero e al bianco (algoritmo del trattamento 5); «Seppia» parte da una tinta seppia, «Bianco
  e nero» da nessuna. Le REAL hanno una nuova misura, la tinta su tutti i pixel (misure 3), perché la dominante, presa solo sui pixel
  quasi grigi, sottostima il viraggio di una seppia. Le copie si rimisurano nel browser all'apertura della dashboard; le
  impostazioni salvate con la versione 4 restano valide.
- Specifiche `generazione-slop` 5.10.0 e `copie-di-gioco` 11.1.0; `MASTER.md` 26.2.0.

## 1.34.0 — 2026-11-16T12:40:03Z

- **Il Worker gestisce ciò che riguarda OpenAI, il browser tutto il resto** (decisione dell'owner del 2026-11-16, che sostituisce
  quella del 2026-11-15 sul browser come sola interfaccia). Le copie di gioco tornano a prepararle il browser: ritaglio 4:5,
  ridimensionamento, trattamento delle SLOP, JPEG intermedio, WebP e misure, poi il caricamento, che il Worker controlla (WebP,
  dimensioni, misure, trattamento) e conserva. Spariscono il binding Images, il Workflow delle copie (`CopiesWorkflow`, `POST /copies`)
  e il decodificatore PNG scritto per il Worker; «Rifai la copia di gioco» gira nella pagina, una foto alla volta. Il Workflow del
  ciclo SLOP non prepara più la copia: la prepara il browser all'apertura della revisione. Le copie senza misure si misurano di
  nuovo nel browser aprendo il Database.
- **Un solo codificatore per REAL e SLOP**, quello del browser: le copie delle SLOP preparate dal Worker con la 1.32–1.33 vanno
  rifatte con «Rifai la copia di gioco», altrimenti la compressione di Images potrebbe distinguerle dalle REAL fatte nel browser.
- **Trattamento regolabile con i cursori** (richiesta dell'owner del 2026-11-16): «Regola il trattamento» nel dettaglio del Database
  e nella revisione dello studio apre i cursori di colore, contrasto, saturazione, dominante o tinta, sfocatura, grana, dimensione
  della grana, qualità JPEG e lato lungo, posizionati sulla proposta calcolata dalla REAL di riferimento. L'anteprima si ridisegna
  nella pagina a ogni modifica, accanto alla copia della REAL con le misure di entrambe; «Torna alla proposta» riporta i valori
  proposti. Le impostazioni salvate restano quando la copia si rifà. Il Worker accetta il registro solo con impostazioni entro i
  limiti, misure della REAL di riferimento e lato lungo coerente.
- Versione 4 dell'algoritmo del trattamento: stessi passi, valori proposti arrotondati prima di applicarli (la proposta riapplicata
  dà gli stessi pixel), tinta delle copie monocrome registrata, sfocatura senza un secondo buffer.
- Provate e scartate prima della decisione, mai rilasciate: la copia sul Worker con i codec di Squoosh in WebAssembly (jSquash), la
  cui memoria resta per tutta la vita dell'isolate (ricampionatore 142 MB per una copia, libpng 50 MB) contro i 128 MB di un Worker,
  e poi con fast-png e Images.
- `AGENTS.md` 24.0.0; specifiche `copie-di-gioco` 11.0.0, `database-immagini` 2.9.0, `dashboard-admin-wizard-real` 2.7.0,
  `generazione-slop` 5.9.0; `MASTER.md` 26.0.0.

## 1.33.1 — 2026-11-16T08:40:56Z

- **Copia delle SLOP in bianco e nero:** la copia della SLOP in bianco e nero accettata il 2026-11-16 non si creava («Errore del
  server», cinque tentativi dalla scheda, 3–4 s di CPU ciascuno nei Workers Logs). Il trattamento funziona (riprodotto in locale con
  l'immagine vera); il decodificatore PNG del Worker accettava solo PNG RGB o grigi a 8 bit, mentre Cloudflare Images restituisce il
  tipo di PNG adatto all'immagine (grigio o a palette per un bianco e nero). Ora legge palette, grigio, 1–16 bit, interlacciato e
  trasparenze (su fondo bianco); test unitario su PNG prodotti da sharp in tutte queste varianti. Causa dedotta, non osservata: la
  risposta di Images non è stata registrata.
- Un errore di Images o della lettura del PNG arriva all'owner con il suo motivo (502), non come errore generico; ogni eccezione
  imprevista del Worker finisce nei Workers Logs con la sua traccia.
- Specifica `copie-di-gioco` 10.0.1, `MASTER.md` 25.1.1.

## 1.33.0 — 2026-11-16T07:50:00Z (rilasciata il 2026-11-16)

- **Un passo fermato dalla piattaforma non ferma più il batch:** il 2026-11-16 un tentativo è stato interrotto da Cloudflare per
  CPU dopo la generazione e il Workflow ha messo in revisione l'intero batch, lasciando 6 REAL con brief mai tentate. Ora quella REAL
  resta incerta (tra i processi «Da vedere») e le altre proseguono; solo un problema dell'account OpenAI ferma l'esecuzione.
- **Ripresa di un batch in revisione:** «Riprendi sul server» compare anche quando restano SLOP da generare (REAL di riferimento con
  brief da scrivere, pronto o da ritentare); la ripresa resta entro il massimo confermato all'avvio e non ripete chiamate già inviate.
  Una revisione con SLOP ancora da generare non si chiude da sola.
- **Copia della SLOP accettata in un passo a sé** del Workflow, dopo i tag: il calcolo più pesante non condivide più il passo della
  generazione. Il percorso diretto dello studio la prepara come prima.
- **Limite di CPU di cinque minuti** per richiesta e per passo (`limits.cpu_ms`), possibile con Workers Paid, attivato dall'owner il
  2026-11-16; si paga solo la CPU usata.
- Specifica `generazione-slop` 5.8.0, `MASTER.md` 25.1.0.

## 1.32.1 — 2026-11-16T06:48:38Z

- **Workers Logs attivi** in `wrangler.jsonc` (richiesta dell'owner del 2026-11-16): l'attivazione dalla dashboard non risultava
  salvata sul Worker e il rilascio successivo l'avrebbe comunque spenta. Errori e messaggi di richieste, passi dei Workflow e
  manutenzione restano visibili per pochi giorni; le query string non vengono registrate. Serve a capire, per esempio, perché il
  2026-11-16 un passo del batch automatico ha superato il limite di CPU e perché una copia di SLOP non è stata creata.
  `MASTER.md` 25.0.1.

## 1.32.0 — 2026-11-15T23:09:52Z (decisione dell'owner del 2026-11-15: il browser è solo un'interfaccia) (rilasciata il 2026-11-16)

- **Copie di gioco preparate dal Worker:** ritaglio 4:5, ricampionamento, trattamento delle SLOP verso la REAL di riferimento con la
  compressione JPEG intermedia, WebP e misure non avvengono più nel browser. Il binding Images di Cloudflare decodifica e riduce
  l'originale (al massimo sei megapixel di lavoro) e codifica il WebP; ritaglio, ricampionamento per aree, trattamento e misure sono
  in JavaScript nel Worker (`worker/copy-maker.ts`, `worker/png.ts`). La copia nasce al caricamento o all'acquisizione di una REAL e
  all'accettazione di una SLOP; il browser sceglie solo l'inquadratura e chiede (`POST /:id/copy` in JSON; un file inviato è rifiutato).
- **«Rifai la copia di gioco»** per una selezione è un Workflow (`CopiesWorkflow`, `POST /copies`, `GET /copies/:job`), gratis; le
  pubblicate tornano approvate. Le misure di una copia esistente le fa il Worker (`POST /:id/metrics`); niente più misure in
  background nella dashboard.
- Principio in `AGENTS.md` 23.0.0; specifiche `copie-di-gioco` 10.0.0, `database-immagini` 2.8.0, `dashboard-admin-wizard-real`
  2.6.0, `generazione-slop` 5.7.0; `MASTER.md` 25.0.0. Nuovi test unitari del PNG e del ricampionamento.

## 1.31.0 — 2026-11-15T22:43:46Z (decisione dell'owner del 2026-11-15)

- **Il ciclo SLOP gira su Cloudflare:** un Workflow (`worker/slop-runner.ts`) scrive i brief, esegue i tentativi (generazione e
  valutazione dell'immagine intera) e analizza i tag della SLOP accettata; il browser lo avvia dopo la conferma del massimo e ne segue
  l'avanzamento. Chiudere la dashboard o cambiare app sul telefono non ferma più nulla. Un runner per batch, con stato e ora
  dell'ultimo passo (migrazione 0052); un runner fermo da quindici minuti si riprende («Riprendi sul server» per il batch
  automatico). I passi a pagamento non vengono mai ritentati da Cloudflare e trovano la propria rivendicazione se rieseguiti.
  «Interrompi» ferma il server prima della chiamata successiva. Workflow separati per anteprime e locale.
- Studio: «Genera brief e prompt» e «Genera e valuta» avviano il server e mostrano l'avanzamento; le copie 4:5 restano nel browser.
- `MASTER.md` 24.0.0 (aggiunti `worker/slop-runner.ts` e `worker/image-body.ts`, quest'ultimo mancante dalla 1.30.1),
  specifica `generazione-slop` 5.6.0.

## 1.30.3 — 2026-11-15T21:51:59Z

- **Brief e prompt una REAL per volta:** il primo batch automatico (10 SLOP) scriveva tutti i brief in un'unica richiesta di circa tre
  minuti; il browser del telefono ha chiuso la connessione dopo 48 secondi e Cloudflare ha interrotto il Worker («clientDisconnected»):
  2 brief scritti, uno incerto, 7 mai iniziati, batch bloccato su «in scrittura». Studio e batch automatico chiedono ora un brief per
  richiesta. Lo stato dei brief del batch segue i suoi processi, e un brief fallito o incerto non blocca più gli altri; una scrittura
  rimasta in corso oltre dieci minuti si sblocca alla lettura del batch, senza ripetere il brief interrotto. Specifica
  `generazione-slop` 5.5.1, `MASTER.md` 23.4.0.

## 1.30.2 — 2026-11-15T21:27:29Z (rilasciata il 2026-11-15)

- **Analisi in gruppo con esiti incerti o interrotti:** l'azione «Analisi combinata tag e descrizione» (e «Analizza con IA») scartava
  in silenzio le immagini con un'analisi interrotta o incerta e rispondeva «Nessuna REAL senza descrizione tra le selezionate», come se
  la descrizione di Commons contasse. Ora le include: la conferma dice quante sono e che potrebbero essere già state addebitate, e le
  loro richieste portano la ripetizione esplicita. Restano escluse solo le analisi in corso da meno di dieci minuti, con un messaggio
  che lo dice. Specifiche `libreria-immagini` 3.9.0 e `database-immagini` 2.7.1.
- **Impostazioni:** il salvataggio di un modulo numerico riscriveva tutti i campi numerici della pagina all'arrivo della risposta, anche
  quelli di un altro modulo appena modificati e non salvati. Ora riscrive solo i propri. In CI la risposta più lenta faceva fallire il
  test del browser (controllo `verify` della PR #145); un nuovo test lo riproduce in modo deterministico. Specifica
  `statistiche-impostazioni` 2.8.1, `MASTER.md` 23.3.3.

## 1.30.1 — 2026-11-15T19:21:51Z (rilasciata il 2026-11-15)

- **Memoria del Worker:** cinque analisi combinate di fila (originali da 2 a 6 MB) sono state interrotte da Cloudflare per memoria
  superata («exceededResources») dopo aver registrato la chiamata, e restavano «in corso». L'immagine va ora nel corpo della richiesta
  come base64 scritto direttamente nei byte, senza copie in stringhe: per un originale di 6,7 MB la memoria aggiuntiva scende da circa
  87 a circa 9 MB. Stessa codifica per la valutazione delle SLOP. Test unitario della codifica.
- **Analisi interrotta:** la dashboard mostra come interrotta un'analisi ancora «in corso» dopo dieci minuti e ne permette la
  ripetizione dalla scheda, con l'avviso del possibile addebito (prima bisognava aspettare la manutenzione notturna).
- Specifica `libreria-immagini` 3.8.1, `MASTER.md` 23.3.1.

## 1.30.0 — 2026-11-15T18:25:36Z (rilasciata il 2026-11-15)

- **Seleziona tutte:** nel Database un tasto seleziona tutte e sole le immagini mostrate da vista e filtri (per esempio le REAL senza
  descrizione, prima dell'analisi combinata in gruppo). Prima la selezione era solo una casella per foto. Specifica
  `database-immagini` 2.7.0, `MASTER.md` 23.3.0.

## 1.29.0 — 2026-11-15T17:58:54Z (rilasciata il 2026-11-15) (decisioni dell'owner del 2026-11-15)

- **Analisi dell'immagine intera:** tag e descrizione privata della REAL, e i tag della SLOP, nascono dall'originale, non dal
  ritaglio 4:5, così coprono tutta l'immagine. La copia di gioco non serve più all'analisi. La provenienza della descrizione registra
  l'hash dell'originale. Vale anche per il completamento di Genere, Colore e Supporto.
- **Tolleranza 0:** una candidata con soli difetti minori non ferma più il ciclo per la revisione ma consuma un nuovo tentativo; finiti
  i tentativi il processo è esaurito e resta «Da vedere».
- **Analisi combinata in gruppo:** nel Database il filtro «REAL senza descrizione» e l'azione «Analisi combinata tag e descrizione»,
  con conferma del numero massimo di chiamate.
- **Processi senza SLOP in evidenza:** tentativi esauriti, revisione chiesta dal valutatore, errori ed esiti incerti compaiono in cima
  allo studio («Da vedere», con il numero sulla scheda) con immagine intera, prompt e valutazione di ogni tentativo. Restano finché
  l'owner non sceglie «Chiudi: ho visto»; la manutenzione cancella le candidate solo sette giorni dopo un'accettazione o una chiusura
  (prima le cancellava dopo sette giorni in ogni caso, e cancellava anche i processi esauriti).
- **Wizard REAL:** la generazione dei tag su immagini con esito incerto invia la ripetizione confermata (nella 1.28.0 il server la
  rifiutava pur avendo chiesto conferma).
- `AGENTS.md` 22.4.0; specifiche `generazione-slop` 5.5.0, `libreria-immagini` 3.8.0, `dashboard-admin-wizard-real` 2.5.0,
  `database-immagini` 2.6.0; `MASTER.md` 23.2.0.

## 1.28.0 — 2026-11-15T17:00:44Z (correzioni della revisione della 1.27.0, rilasciata il 2026-11-15)

- **Contesto dei prompt delle gemelle bloccato:** il server usa il contesto salvato, e in produzione quello in vigore era ancora il
  testo delle gemelle, in contrasto con il brief editoriale (la 1.27.0 aggiungeva solo una frase che chiedeva di ignorarlo). Ogni
  versione del contesto registra ora la sua pipeline (migrazione 0051); finché «Brief e prompt per le SLOP» è un testo delle gemelle
  non parte alcuna chiamata e le Impostazioni lo segnalano. Salvare la proposta lo sblocca.
- **Valutatore modificabile:** nuovo contesto «Valutazione delle SLOP», inviato con la base; decisioni, tolleranza, rifiuto dei difetti
  critici e ancoraggi letterali restano nel codice. Ogni valutazione registra le versioni dei contesti usate.
- **Analisi incerta:** la 1.27.0 rifiutava sempre di ripeterla mentre la dashboard offriva il pulsante («Immagine cambiata o già in
  analisi»). Ora si ripete solo dalla scheda, con conferma del possibile addebito (`repeat_uncertain`); le azioni in gruppo la
  escludono. Un segno interrotto da più di dieci minuti vale come incerto, senza aspettare la manutenzione notturna.
- **Massimo delle chiamate:** «Riscrivi brief e prompt» dichiara la chiamata in più e il massimo del batch la include.
- Specifiche `libreria-immagini` 3.7.0, `generazione-slop` 5.4.0, `statistiche-impostazioni` 2.8.0; `MASTER.md` 23.1.0 con lo stato
  della produzione dopo la 1.27.0.

## 1.27.0 — 2026-11-15T14:47:34Z (implementazione #139, rilasciata il 2026-11-15)

- **Correzione CI #140:** comandi delle Impostazioni attivi prima del caricamento iniziale; la verifica del codice partita non provoca più un invio nativo e un ricaricamento della dashboard. Test browser desktop/mobile con caricamento dei contesti sospeso.
- **Consegna tramite PR:** registrata in `AGENTS.md` 22.3.0 la preferenza dell’owner di pubblicare sempre il ramo e aprire/aggiornare una PR per i test CI; nessuna consegna limitata ai file locali.
- Una sola analisi multimodale REAL produce tag e descrizione privata, salvati atomici con modello e revisione della copia.
  La descrizione è correggibile nel wizard e nel Database; testo Commons e tag restano indipendenti. Nessun backfill pagato.
- Una chiamata testuale per REAL produce brief e prompt; brief congelato con hash al primo tentativo. Processi e tentativi
  persistono, con rivendicazione atomica prima delle chiamate, snapshot di modelli/qualità/limite/tolleranza e idempotenza.
- Valutazione della candidata intera, mai del crop: accetta, rigenera, rivede il prompt, riprogetta o sospende per revisione.
  Stop alla prima accettazione, limite 1–5 (default 3), massimo 2+2N chiamate; nessuna candidata bocciata nella libreria.
- Copie 4:5, trattamento leggero v3 dalla sola REAL di riferimento; filtro e rifacimento in gruppo delle vecchie copie.
  Il gioco esclude copie precedenti; approvare e pubblicare restano azioni dell’owner. La rigenerazione diretta della libreria
  richiede un nuovo processo nello studio, così non può scavalcare la valutazione.
- Migrazione 0050 con campi e tabelle aggiuntivi, ritiro delle copie pubblicate non 4:5 e nessuna conversione dei batch precedenti: sola revisione. Anteprime temporanee private per sette giorni,
  pulizia alla cancellazione e in manutenzione; il registro delle chiamate conserva gli esiti senza archiviare immagini eliminate.
- Verifiche riuscite: lint, 95 test unitari, build, dry-run e suite completa API/browser (desktop e mobile), con API fittizia. Nessuna chiamata reale,
  migrazione remota, merge o rilascio eseguiti da questa implementazione.

## Dopo la 1.26.0 — 2026-11-15T13:42:00+01:00 (nuove decisioni editoriali, solo documentazione)

- **REAL come riferimento editoriale:** la nuova SLOP non deve assomigliare alla REAL di origine né cambiare un solo elemento.
  Il riferimento serve a bilanciare temi e linguaggio fotografico; i tag finali derivano dalla candidata accettata.
- **Descrizione REAL già durante i tag:** una sola chiamata multimodale del wizard, sulla copia 4:5 e sul contesto Commons,
  genera **tag e descrizione editoriale neutra** (osservazioni visive, contesto documentato, incertezze) senza conoscere le SLOP;
  il testo è modificabile e non sovrascrive Commons o la descrizione mostrata nel gioco.
- **Generazione di brief e prompt:** più avanti una sola chiamata **testuale** usa i tag e la descrizione salvati per restituire
  brief e prompt iniziale. Nessuna nuova lettura visiva della REAL nella pipeline SLOP; restano tre contesti dei modelli.
  Massimo **2 + 2N** chiamate per generare una SLOP quando la REAL ha già la descrizione; le REAL storiche senza descrizione
  richiedono un intervento manuale o un'analisi esplicitamente autorizzata.
- **Loop orientato alla credibilità:** una candidata viene generata e valutata **per intero**, prima di preparare il ritaglio 4:5; si accetta, si
  rigenera con lo stesso prompt, si riscrive il prompt o si riprogetta la scena, entro un massimo configurabile di 1–5
  generazioni (predefinito 3). Tolleranza editoriale separata, difetti critici mai compensati, stop anticipato alla prima
  accettazione, sospensione degli esiti incerti e nessun inserimento automatico nella libreria delle candidate bocciate.
- **Difficoltà del giocatore:** più tentativi possono aumentare la qualità media, ma non definiscono una difficoltà verificata.
- **Valutazione senza crop:** il valutatore vede la fotografia generata completa; ritaglio 4:5 e trattamento si applicano
  **dopo l'accettazione**, senza vincolare il modello a concentrare tutti i soggetti nel riquadro del gioco.
- **Protocollo REAL:** selezione editoriale qualitativa con otto principi (issue #138), nessun filtro automatico nel wizard.
- **Specifica:** `generazione-slop` 5.2.0, `copie-di-gioco` 9.1.3, `libreria-immagini` 3.5.1,
  `dashboard-admin-wizard-real` 2.3.1, `statistiche-impostazioni` 2.6.0, `AGENTS.md` 22.2.0 e `MASTER.md` 22.2.1.
  Il codice e la produzione 1.26.0 sono **invariati**. La specifica #136 va riallineata prima delle PR applicative.

## Dopo la 1.26.0 — 2026-11-15T09:00:00Z (decisioni e operazioni, nessun cambiamento di codice)

- **Produzione, 2026-11-14:** contesto 1.8.0 dei prompt SLOP salvato; soglia di proposta al 10%; modello di immagini
  `gpt-image-2.6-flare` in qualità `medium`; le 65 copie rimisurate con la versione 2 delle misure.
- **Primo lotto di gemelle, 2026-11-15** (9 immagini): scene coerenti, ma copie rovinate dal trattamento preso da un'altra REAL e
  prompt con dettagli inventati senza vedere la foto.
- **Decisioni dell'owner del 2026-11-15**, da implementare (issue rickymusu-bit/real-or-slop#136): pipeline foto REAL → descrizione
  → prompt con un solo elemento cambiato → foto SLOP → tag, una chiamata per foto; copie di gioco 4:5 per tutte; trattamento dalle
  misure della REAL di origine; modelli predefiniti `gpt-6.1-sol` e `gpt-image-2.5-flare` `high`; niente REAL che un generatore non
  sa disegnare bene (criteri da definire). Specifiche `generazione-slop` 4.0.0 e `copie-di-gioco` 9.0.0.

## 1.26.0 — 2026-11-14T21:30:00Z (in produzione, migrazione 0049)

Dopo il primo lotto per gruppi (2026-11-14: scene incoerenti, bordi da stampa, stessa composizione, luoghi scritti nelle insegne).
Specifiche `generazione-slop` 3.0.0, `copie-di-gioco` 8.0.0, `gioco-a-livelli` 2.1.0, `libreria-immagini` 3.1.0, `database-immagini`
2.3.0, `statistiche-impostazioni` 2.2.0; `AGENTS.md` e `MASTER.md` 20.0.0.

- **SLOP gemelle** al posto di gruppi e slot (proposta dell'owner): ogni SLOP nasce dai tag e dalla descrizione di una sola REAL e
  prende l'aspetto da un'altra REAL con lo stesso colore, supporto e decennio. Studio in quattro passi (REAL, Prompt, Immagini,
  Revisione); proposta automatica sulle REAL senza gemella; una gemella nel cestino libera la sua REAL.
- **Gioco:** una SLOP e la REAL da cui è nata non compaiono nella stessa partita; la sequenza delle origini estratta non cambia.
- **Contesto 1.8.0** proposto per i prompt SLOP: nessuno schema fisso, la resa dell'immagine e mai la stampa come oggetto, niente nomi
  di luogo nelle scritte. Da salvare dalle Impostazioni.
- **Revisione del codice della 1.25**, problemi corretti:
  - analisi: tetto di risposta da 2000 a 8000 token (un'analisi su dieci del lotto tornava troncata, pagata e persa);
  - trattamento: tolti gli effetti disegnati per Supporto (retino, vignettatura, alone), inventati e in parte annullati dal passo
    successivo; grana ammorbidita invece che a blocchi 2×2; JPEG intermedio a 0,85 per tutti; la tinta di una campione in bianco e
    nero non veniva applicata;
  - misure: il rumore non conta più le zone bruciate (versione 2; le copie si rimisurano da sole);
  - Distribuzione: il filtro per categoria aveva perso Tempo e Genere;
  - documenti: la specifica dava i comandi del trattamento anche nella revisione dello studio, dove non ci sono, e la grana «più
    grossa nelle immagini piccole», il contrario del codice.
- Tolti: estrazione degli slot, proposta per gruppi, soglia del gruppo nelle Impostazioni.

## 1.25.1 — 2026-11-14T20:00:00Z (in produzione, senza migrazioni)

- **Database:** dopo un'analisi, un completamento di Genere, Colore e Supporto o una rigenerazione, il messaggio elenca i conflitti di
  categoria (tag proposto in una categoria diversa da quella del vocabolario). Il server li restituiva già, la dashboard no: il
  2026-11-14 la foto segnaletica di King era rimasta senza Genere perché `mugshot` era in Altro. Specifica `database-immagini` 2.2.0.
- **Produzione, 2026-11-14 (app 1.25.0):** contesto 1.7.0 salvato; 55 REAL completate (55 chiamate, tutte riuscite); 55 copie misurate;
  `mugshot` spostato in Genere; decennio aggiunto a 9 REAL dalla data EXIF o dalla pagina Commons.

## 1.25.0 — 2026-11-14T18:00:00Z (in produzione, migrazione 0048)

Decisioni dell'owner del 2026-11-14 dopo il primo batch automatico (tema `color`: volti nascosti, cartelli rivolti alla camera, scene
incoerenti, foto dall'aspetto digitale). Specifiche `libreria-immagini` 3.0.0, `generazione-slop` 2.0.1, `copie-di-gioco` 7.0.1,
`contenuti-e-trasparenza` 1.2.0, `database-immagini` 2.1.1, `statistiche-impostazioni` 2.1.0, `privacy-note-legali` 1.2.0.

- **Categorie:** Formato lascia il posto a Genere (lista aperta), Colore e Supporto (liste chiuse), uno per immagine, giudicati solo
  dall'immagine. La migrazione 0048 sposta `color` e `black-and-white` in Colore, `painting` in Supporto.
- **Completamento a pagamento** di Genere, Colore e Supporto per le immagini già analizzate, una volta per immagine, dal dettaglio o in
  gruppo nel Database; le pubblicate restano nel gioco.
- **Gruppi** di genere e decennio al posto dei tag nel bilanciamento: soglia di 5 REAL (Impostazioni), al massimo tante SLOP quante REAL;
  proposte automatiche per gruppo; studio con la tabella dei gruppi e il tema facoltativo; slot estratti dentro il gruppo con una REAL
  campione per il trattamento.
- **Prompt:** esempi del gruppo (descrizioni e tag di fino a 8 REAL) nella chiamata, prompt da 600 a 1000 caratteri, tetto di risposta a
  16 000 token; contesto 1.7.0 proposto per base, analisi e prompt SLOP (supporto descritto, cartelli coerenti, persone varie, regole in
  positivo), da salvare dalle Impostazioni.
- **Misure e trattamento:** ogni copia di gioco ha le sue misure (lato lungo, rumore, nitidezza, contrasto, saturazione, dominante); le
  copie esistenti si misurano all'apertura della dashboard. Le SLOP passano per un trattamento verso la REAL campione (riduzione, effetti
  del supporto, tono, colore, sfocatura, grana, JPEG intermedio); nel Database «Altra REAL campione», «Senza trattamento», «Con
  trattamento». Le Statistiche mostrano i gruppi e confrontano le misure di REAL e SLOP pubblicate.
- **Testi del sito:** «Come funziona», «Fonti e crediti» e Termini citano il trattamento delle SLOP; la frase dei Termini è stata verificata
  da un legale (comunicazione dell'owner del 2026-11-14).

## 1.24.1 — 2026-11-14T15:30:00Z (proposta, senza migrazioni)

Uscirà con il riordino (PR rickymusu-bit/real-or-slop#132), che contiene anche le voci seguenti.

- **Database:** dopo «Analizza con IA» in gruppo e dopo «Svuota cestino» il messaggio di esito compariva prima che l'elenco fosse
  ricaricato: aprendo subito una scheda si vedevano i dati di prima, senza i tag nuovi. Ora il messaggio compare a elenco aggiornato.
  La corsa faceva fallire a volte il test `library_browser` sul telefono.

## Nomi senza versione — 2026-11-14T15:00:00Z (nessun cambiamento di comportamento; `AGENTS.md` e `MASTER.md` 19.0.0)

Decisione dell'owner del 2026-11-14: la versione esce dai nomi dei file; la storia è in git.

- Codice, test e specifiche hanno nomi stabili (`src/library.ts`, `worker/game.ts`, `docs/gioco-a-livelli.md`): 84 file rinominati.
  Le versioni parallele ancora importate sono state unite senza cambiare comportamento: il gioco e la classifica usati dalle
  statistiche (funzioni identiche), le impostazioni (la 1.1.0 contiene la 1.0.0), le costanti legali, la copia di gioco nel browser e i
  fogli di stile del wizard e del gioco, uniti nell'ordine in cui si applicavano.
- Le intestazioni del codice e dei test descrivono lo scopo, non la cronologia; i commenti citano le specifiche per nome.
- Tolte le snapshot di `AGENTS.md` e `MASTER.md`. Le specifiche, `AGENTS.md` e `MASTER.md` dichiarano la versione nell'intestazione.
- Nuovo workflow `release-tag`: al merge su `main` crea il tag `vX.Y.Z` con la versione di `package.json`, se manca.
- Le migrazioni conservano il nome: Wrangler le riconosce dal nome del file.

## Pulizia del codice — 2026-11-14T14:00:00Z (nessun cambiamento di comportamento; `MASTER.md` 18.2.0)

- Richiesta dell'owner del 2026-11-14: tolto il codice che nessun punto d'ingresso (`src/main.ts`, `worker/index.ts`) importava, cioè le
  versioni precedenti dei moduli di `src/`, `worker/` e `shared/`, il vecchio gioco (`src/play.ts`, `worker/game.ts`) e `src/clock.ts`:
  160 file. Tolti anche i test che verificavano solo quel codice (4 unitari, 80 d'integrazione e di supporto non più eseguiti, compresi i
  modelli finti precedenti) e i dati delle vecchie pipeline (`data/editorial/`). Dai test di `media-privacy` e `preload` tolte le
  verifiche del vecchio conto alla rovescia. Tutto resta nella cronologia git.

## Documentazione 18.1.0 — 2026-11-14T13:00:00Z

- Decisione dell'owner del 2026-11-14: le versioni precedenti dei file non si conservano più nel repository; una nuova versione cancella
  la precedente, che resta nella cronologia git (`AGENTS.md` 18.1.0, regola 3). Tolte le snapshot 18.0.0 e la privacy 1.1.0.
- `MASTER.md` 18.1.0: tolte le discrepanze note, corrette nell'app 1.24.0. Privacy 1.1.1: «Fonti e crediti» aggiornata.
- Le specifiche si citano tra loro per nome, senza versione: una nuova versione non costringe più a riscrivere quelle che la citano.

## Documentazione 18.0.0 — 2026-11-14T12:00:00Z (riordino, nessun cambiamento all'app)

Richiesta dell'owner del 2026-11-14: riordino e refactoring dei documenti importanti.

- **Specifiche consolidate**, una per area e senza strati: libreria `2.0.0`, contenuti e trasparenza `1.0.0` (nuova), copie di gioco
  `6.0.0`, dashboard e wizard REAL `2.0.0`, generazione SLOP `1.0.0` (riunisce studio e batch automatici), Database `2.0.0`, gioco
  `2.0.0`, Statistiche e Impostazioni `2.0.0`, privacy `1.1.0` (corretta la descrizione delle modifiche nei crediti, testi del sito invariati).
- **Documenti tolti** su richiesta dell'owner: le specifiche precedenti, le note delle vecchie pipeline e le snapshot di `AGENTS.md` e
  `MASTER.md` fino alla 17.30.0: 298 file. Restano nella cronologia git.
- `AGENTS.md` 18.0.0: principi e regole di lavoro, con la regola di una sola specifica vigente per area. `MASTER.md` 18.0.0: solo la mappa
  (stato, specifiche e corrispondenze, discrepanze note, file in uso, migrazioni, rilascio); la storia passa qui. `README.md` riscritto.
- Completate le voci da 1.15.1 a 1.23.0, che mancavano.

## 1.24.0 — 2026-11-14T09:00:00Z (proposta, senza migrazioni)

Anteprima a pressione prolungata, selezione immediata, descrizione delle REAL, tag di partenza delle SLOP (decisioni dell'owner del 2026-11-14; proposta scritta in `anteprima-descrizione.v1.2.0`, oggi nelle specifiche consolidate).

- **Ricerca su Commons:** il tasto «×» è una casella a sé dopo il campo, sempre presente e disattivato a campo vuoto; non copre più il testo.
- **Selezione:** un tocco su un risultato lo spunta e lo mette subito tra le «Immagini selezionate»; un secondo tocco o «×» lo toglie. Tolto «Aggiungi le selezionate». La selezione resta con una nuova ricerca (prima spariva).
- **Anteprima:** una pressione prolungata (500 ms) su una miniatura del wizard, del Database o della revisione dello studio SLOP apre l'immagine grande con titolo, descrizione e collegamento a Commons (REAL) o prompt e tag (SLOP); resta aperta fino a «×». Anche con il tasto destro o Maiusc+F10.
- **Descrizione:** modificabile nel passo 2 del wizard, mostrata nel riepilogo e, per ogni REAL, nella lista finale della partita.
- **Tag di partenza** (tema e slot del prompt) delle SLOP generate nel dettaglio del Database e nelle anteprime.
- **Pagine del sito:** «Come funziona» descrive pulsanti, foto intera ed esplorabile e formato comune più vicino, non più swipe e 4:5; «Fonti e crediti» non dice più «ritagliata nel formato 4:5» e avverte che la descrizione delle REAL può essere stata corretta o riscritta per il gioco.
- **Prompt SLOP, testo proposto** (`worker/model-context.v1.6.0.ts`): persone reali né nominate né descritte; gente comune con tratti concreti e volti visibili, mai «indistinti» o «anonimi» nel prompt; «mai nudità che riguardi minori» al posto di «mai minori». Prima il modello nascondeva tutti i volti e scriveva solo adulti. Vale quando l'owner lo salva dalle Impostazioni.
- Nuove versioni: `worker/model-context.v1.6.0.ts` con `worker/library.v1.22.0.ts`, `worker/analysis.v1.22.0.ts`, `worker/slop.v1.14.0.ts`, `worker/slop-generation.v1.13.0.ts` (solo l'import; la 1.5.0 e i moduli intermedi restano come storico), `src/image-preview.v1.0.0.ts`, `src/real-wizard.v1.17.0.ts`, `src/library.v1.23.0.ts`, `src/slop-studio.v1.6.0.ts`, `src/play.v2.5.0.ts`, `worker/game.v2.5.0.ts`. Test `game.v2.5.0`, `real_wizard.v1.15.0`, `database_browser.v1.7.0`, `slop_browser.v1.4.0`, `slop_auto_browser.v1.1.0`, `game_browser.v1.5.0`; `scripts/integration.py` 2.9.0. `AGENTS.md` 17.30.0, `MASTER.md` 17.31.0.

## 1.23.0 — 2026-11-13T22:00:00Z (pubblicata il 2026-11-13, PR 129; migrazione 0047 applicata alle 22:47 UTC)

- **Niente didascalie**, né nella partita né nella dashboard; quelle scritte cancellate dalla migrazione 0047 (non reversibile); l'analisi
  genera solo tag.
- Wizard REAL in quattro passi, con l'inquadratura dopo i tag; tasto che svuota la ricerca su Commons; la dashboard segnala il caricamento.
- Termini d'uso senza didascalie, approvati dal legale il 2026-11-14. Lo stesso giorno (PR 130) l'owner ha salvato nuove versioni del
  contesto dei modelli senza didascalie e con il paragrafo «Formato» nei prompt SLOP.

## 1.22.0 — 2026-11-13T19:00:00Z (pubblicata il 2026-11-13, PR 128)

- Foto intera nel suo formato su ogni schermo, senza vista iniziale 4:5; «Inquadratura» sceglie solo formato e ritaglio; zoom fino a
  due pixel CSS per pixel della copia e doppio tocco; foto intere anche nella lista finale.
- Il wizard REAL toglie le foto spostate nel cestino o eliminate nel Database; nel passo 2 «Togli dal caricamento».

## 1.21.1 — 2026-11-13 (pubblicata il 2026-11-13, PR 127)

- Schede del Database senza gli avvisi «senza copia» e «licenza ND», che restano nel dettaglio.

## 1.21.0 — 2026-11-13 (pubblicata il 2026-11-13, PR 126)

- Sezione Database senza caricamento di file, ricerca per titolo, filtro «Copia» e pannello Commons; ordinamento per data di aggiunta,
  visualizzazioni o accuratezza; schede con sola miniatura, origine e stato.
- Tolti il segno «copia da rifare» e «Rifai le copie»: nessuna copia 4:5 rimasta.

## 1.20.0 — 2026-11-13 (pubblicata il 2026-11-13, PR 125)

- Il cestino ritira subito una pubblicata, anche in gruppo.
- Nella ricerca su Commons il tocco sulla miniatura la seleziona; il collegamento alla pagina Commons passa alle immagini selezionate.

## 1.19.0 — 2026-11-13 (pubblicata il 2026-11-13, PR 124; migrazione 0046)

- Copie di gioco nel formato della foto (il più vicino di sette formati comuni) con vista iniziale 4:5, foto esplorabile nella partita,
  pulsanti al posto dello swipe; formato delle SLOP scelto dal modello di testo per il soggetto.

## 1.15.1–1.18.0 — 2026-11-13 (pubblicate il 2026-11-13, PR 120–123)

- Ricerca su Commons con sole miniature, categorie correlate richiudibili, pagine con frecce, colonne a scelta, link incollati in una
  sezione chiusa. Un'anteprima a pressione prolungata (1.16.0) è stata ritirata con la 1.17.0.

## 1.15.0 — 2026-11-12T22:00:00Z (pubblicata il 2026-11-12, PR 118)

Generazione automatica delle SLOP su proposta (`docs/proposta-generazione-slop.v2.0.1.md`, approvata dall'owner il 2026-11-12).

- **Proposta:** quando 100 × (REAL − SLOP) / REAL di un tag, tra approvate e pubblicate, raggiunge la soglia (33%, cioè 1,5 REAL per SLOP) e il tag ha almeno 10 REAL, un riquadro in cima alla dashboard propone un batch di min(N, 10) SLOP, con N = REAL − SLOP − SLOP nuove. Un solo tag alla volta (spread percentuale più alto); «Ignora» lo rimanda finché non sale di 10 punti; «Chiudi» lo nasconde fino alla prossima apertura. Numero delle proposte sul pulsante «Generazione SLOP».
- **Batch automatico:** «Genera» conferma tutte le chiamate a pagamento del batch (prompt, immagini, analisi); slot estratti e prompt scritti senza revisione; il batch gira nel browser e riprende dopo la chiusura della scheda senza mai ripetere una chiamata; «Interrompi». Finché una sua immagine resta da decidere, nessuna nuova proposta.
- **Revisione:** «Rivedi nel Database» apre le sole immagini del batch (filtro «Batch automatico in corso»).
- **Impostazioni**, «Studio SLOP»: proposte automatiche attive o spente, soglia di proposta in percentuale.
- **Database:** il cambio di vista (Tutte, Nuove, Cestino…) non viene più ignorato mentre un'azione ricarica l'elenco, e una risposta più vecchia dell'elenco non sovrascrive più una più recente (il clic perso faceva fallire la CI).
- Migrazione `0045_slop_auto_batches.v1.0.0.sql` (colonne in `slop_batches`, un solo batch automatico aperto, `slop_proposal_ignored`, due chiavi in `app_settings`). Nuove versioni: `shared/slop-auto.v1.0.0.ts`, `worker/slop-auto.v1.0.0.ts`, `worker/slop.v1.6.0.ts`, `worker/slop-generation.v1.5.0.ts`, `worker/analysis.v1.14.0.ts`, `worker/library.v1.14.0.ts`, `worker/app-settings.v1.1.0.ts`, `src/slop-auto.v1.0.0.ts`, `src/library.v1.15.0.ts`. Test `slop-auto.v1.0.0`, `slop_auto.v1.0.0`, `slop_auto_browser.v1.0.0`, `stats.v1.1.0`; `scripts/integration.py` 2.8.0. `AGENTS.md`/`MASTER.md` 17.19.0.

## 1.14.0 — 2026-11-12T19:00:00Z (pubblicata il 2026-11-12, PR 117; in produzione anche con la 1.15.0)

Privacy e note legali (`docs/privacy-note-legali.v1.0.0.md`, decisioni dell'owner del 2026-11-12). Bozza da far verificare a un legale.

- Pagine **Privacy e cookie** (`/privacy`) e **Termini d'uso** (`/termini`), con i dati realmente trattati; collegamenti nel piè di pagina. Titolare Riccardo Musumarra, contatto rickymusu@proton.me (`shared/legal.v1.0.0.ts`).
- **Conservazione:** manutenzione giornaliera (Cron Trigger alle 03:17 UTC) che cancella le partite più vecchie di 12 mesi, i limiti di richieste scaduti e le copie ritirate non più usate.
- **Classifica:** dichiarazione obbligatoria «almeno 14 anni o permesso di un genitore» (anche lato server) e avviso a non usare nome e cognome; nelle Impostazioni «Cancella» elimina per sempre una voce, anche dal risultato della verifica di un codice.
- **Licenze:** i crediti delle REAL indicano le modifiche (ritaglio 4:5, riduzione, ricompressione) e la stessa licenza dell'originale; la pagina «Fonti e crediti» lo spiega.
- Nuove versioni: `shared/legal.v1.0.0.ts`, `worker/maintenance.v1.0.0.ts`, `worker/game.v2.1.0.ts`, `worker/leaderboard.v1.1.0.ts`, `src/legal.v1.0.0.ts`, `src/play.v2.1.0.ts`, `src/library.v1.14.0.ts`. Test `game.v2.1.0`, `game_browser.v1.1.0`; `scripts/integration.py` 2.7.0. `AGENTS.md`/`MASTER.md` 17.17.0.

## 1.13.1 — 2026-11-12T13:30:00Z (proposta, non pubblicata)

Anteprime separate dalla produzione (richiesta dell'owner del 2026-11-12).

- Le anteprime delle PR usano un proprio database D1 (`real-or-slop-preview`) e propri bucket R2 (`real-or-slop-preview-quarantine`, `real-or-slop-preview-approved`), creati dall'owner; prima usavano quelli di produzione.
- Ambiente `preview` di Wrangler solo per applicare le migrazioni al database delle anteprime; il deploy di `main` resta sulle risorse di produzione.
- Cloudflare, scheda «Previews Base», «Preview command»: `npx wrangler d1 migrations apply DB --remote --env preview && npm run preview` (impostato dall'owner il 2026-11-12).
- Test `tests/wrangler-config.v1.0.0.test.ts`: la produzione non punta mai alle risorse delle anteprime e viceversa. `AGENTS.md`/`MASTER.md` 17.16.0 (rilascio e anteprime).

## 1.13.0 — 2026-11-12T11:00:00Z (pubblicata il 2026-11-12)

Schede Statistiche e Impostazioni (`docs/statistiche-impostazioni.v1.0.0.md`, decisioni dell'owner del 2026-11-11 e del 2026-11-12).

- **Statistiche**, quinta sezione della dashboard, solo visualizzazione: partite in corso adesso (attività negli ultimi 5 minuti) e partite aperte; partite del periodo per livello (iniziate, concluse, non concluse, scadute, punteggio medio); risposte delle partite concluse (REAL e SLOP riconosciute, accuratezza bilanciata, scadute) e voci in classifica; chiamate a pagamento per tipo con token, esiti incerti evidenziati e tabella filtrabile; equilibrio del catalogo con la fascia 40–60% e i livelli giocabili. Periodo 7, 30 giorni o sempre.
- **Impostazioni** solo comandi: qualità delle immagini accanto ai modelli (usata dallo studio SLOP e dalla rigenerazione, lì in sola lettura); soglie dello studio SLOP; durata massima di una partita aperta. Il conteggio delle chiamate passa alle Statistiche.
- Migrazione additiva `0044_app_settings.v1.0.0.sql`. Nuove versioni: `worker/app-settings.v1.0.0.ts`, `worker/stats.v1.0.0.ts`, `worker/models.v1.1.0.ts`, `worker/in-play.v1.2.0.ts`, `worker/slop.v1.5.0.ts`, `worker/slop-generation.v1.4.0.ts`, `worker/analysis.v1.13.0.ts`, `worker/library.v1.13.0.ts`, `src/stats.v1.0.0.ts`, `src/library.v1.13.0.ts`, `src/slop-studio.v1.3.0.ts`. Test `stats.v1.0.0`, `library_browser.v1.11.0`, `slop_browser.v1.2.0`, `database_browser.v1.2.0`. `AGENTS.md`/`MASTER.md` 17.15.0.

## 1.12.0 — 2026-11-12T09:00:00Z (pubblicata il 2026-11-12, insieme alla 1.11.0)

Partita a livelli e classifica (`docs/gioco-a-livelli.v1.0.0.md`, decisioni dell'owner del 2026-11-11 e del 2026-11-12).

- **Una sola modalità:** quattro livelli fissi nel codice (Facile 10 foto × 20 s, Medio 15 × 15 s, Difficile 20 × 10 s, Esperto 25 × 5 s), una foto alla volta in un riquadro 4:5 con la didascalia; il tempo parte quando la foto compare e si ferma alla risposta; esito immediato dal server per circa un secondo; tempo scaduto = foto non riconosciuta e passaggio automatico; solo le partite concluse hanno punteggio.
- **Punteggio** = foto × (2 × accuratezza bilanciata − 1). **Comandi:** swipe a destra REAL e a sinistra SLOP sul telefono, pulsanti e tasti R e S sul computer. Lasciando la pagina foto e didascalia si oscurano.
- **Risultati:** punteggio, REAL e SLOP riconosciute, lista delle foto con fonti delle REAL e prompt delle SLOP.
- **Classifica** nella home (ultimi 7 giorni e di sempre, migliore per giocatore) con soprannome controllato e **codice partita** mostrato una volta (solo l'impronta nel database); verifica del codice e voci nascoste nelle Impostazioni → «Classifica».
- **Eliminati** allenamento, modalità a tempo e PvP (Durable Object `GameRoom`, tabelle delle sfide e `players`); `/allenamento`, `/tempo` e `/pvp` portano a `/gioca`.
- Corretto: la home usava per errore la funzione globale `escape` del browser (codifica URL) al posto di quella HTML del progetto.
- Migrazione `0043_levels_leaderboard.v1.0.0.sql`, migrazione `v2` di Wrangler. Nuove versioni: `shared/levels.v1.0.0.ts`, `worker/game.v2.0.0.ts`, `worker/leaderboard.v1.0.0.ts`, `worker/in-play.v1.1.0.ts`, `worker/library.v1.12.0.ts`, `worker/analysis.v1.12.0.ts`, `worker/slop.v1.4.0.ts`, `worker/slop-generation.v1.3.0.ts`, `src/play.v2.0.0.ts`, `src/library.v1.12.0.ts`. Test `levels.v1.0.0`, `game.v2.0.0`, `game_browser.v1.0.0`, `library.v1.4.0`, `database.v1.2.0`, `library_browser.v1.10.0`, catalogo di prova `catalog_v1_0_0.py`. `AGENTS.md`/`MASTER.md` 17.14.0.

## 1.11.0 — 2026-11-12T08:00:00Z (pubblicata il 2026-11-12 con la 1.12.0)

Copie di gioco 4:5 (`docs/copie-di-gioco.v3.0.0.md`, decisioni dell'owner del 2026-11-11).

- Ogni copia di gioco è 4:5 verticale, al massimo 1638 × 2048, ritagliata dall'originale orientato lungo un'inquadratura: centrata all'inizio, modificabile con «Inquadratura» nel wizard REAL e nella sezione Database (trascinamento, frecce, dimensione). Cambiare inquadratura rifà la copia e ne azzera le statistiche; lo stato dell'immagine resta.
- Approvare e pubblicare richiedono una copia 4:5; le copie precedenti sono segnalate «da rifare in 4:5».
- Foto con licenza senza opere derivate (ND) rifiutate da Commons e non approvabili.
- SLOP generate in 1024 × 1280 con i modelli GPT Image 2.5 e 2.6, in 1024 × 1536 da ritagliare con gli altri; niente più rotazione di formati.
- Migrazione additiva `0042_game_copy_crop.v1.0.0.sql`. Nuove versioni: `shared/game-copy.v2.0.0.ts`, `shared/licenses.v1.0.0.ts`, `shared/image-size.v1.0.0.ts`, `src/game-copy.v2.0.0.ts`, `src/crop-editor.v1.0.0.ts`, `src/real-wizard.v1.7.0.ts`, `src/slop-studio.v1.2.0.ts`, `src/library.v1.11.0.ts`, `worker/library.v1.11.0.ts`, `worker/analysis.v1.11.0.ts`, `worker/slop.v1.3.0.ts`, `worker/slop-generation.v1.2.0.ts`. Test `game-copy.v2.0.0`, `library.v1.3.0`, `analysis.v1.7.0`, `slop.v1.2.0`, `database.v1.1.0`, `database_browser.v1.1.0`, encoder di prova `game_copy_v2_0_0.py`. `AGENTS.md`/`MASTER.md` 17.13.0.

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

