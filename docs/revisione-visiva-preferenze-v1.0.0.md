> Aggiornamento 2026-11-02T16:30:46Z: esecuzione del workflow tramite
> [Batch OpenAI v1.0.0](pipeline-batch-openai-v1.0.0.md), con recupero D1/R2 e
> monitoraggio tecnico separato. Rubrica, libertà generativa, preferenze e revisione
> umana a due pulsanti restano invariate.

# Revisione visiva e preferenze editoriali

- Versione: 1.0.0
- Aggiornato: 2026-11-02T15:58:55+01:00
- Applicazione: 0.13.0
- Stato: implementazione da revisionare; nessuna attivazione remota
- Dipendenza: regole di gioco 0.12.0 / migrazione 0009 (PR #25)

Questo documento aggiorna la procedura di revisione della pipeline editoriale
v1.0.0, della coda automatica e dello Studio SLOP v2.0.0. Le specifiche storiche
rimangono disponibili. Classifica unica, soglie comuni, ruoli delle fotografie,
revisione umana obbligatoria, pubblicazione bilanciata e campionamento del gioco
restano validi.

## Il lavoro del revisore

`/admin` presenta **una sola immagine alla volta**, con **Approva** e **Rifiuta**.
Non richiede categorie, motivazioni, note, spiegazioni, licenze da digitare o
checkbox aggiuntive. La decisione riguarda la scheda già elaborata dal sistema.
La preview deve essere caricata prima di abilitare i due pulsanti. Un errore
tecnico non genera un rifiuto editoriale né un esempio per il modello.

Un dettaglio facoltativo permette di leggere spiegazione, fonte, autore e
licenza. La gestione avanzata, l'archivio, i dossier, il vecchio import manuale
e la pubblicazione sono disponibili in `/admin?advanced=1`; lo Studio rimane
raggiungibile senza diventare un passaggio obbligato della revisione quotidiana.
I vecchi link con `?status=…` conservano la loro funzione di archivio avanzato.

Approva mantiene l'immagine **approvata ma non pubblicata**. Pubblicare resta
un'azione distinta e intenzionale in gruppi REAL/SLOP bilanciati. Nessun punteggio
o preferenza appresa sostituisce il clic umano.

## Preparazione prima della presentazione

La pipeline esistente prepara la spiegazione, la licenza, le categorie, la
valutazione e il dossier durante raccolta/generazione. L'analisi visiva restituisce
anche tag osservativi da un vocabolario condiviso: niente chiamate visive
aggiuntive, classificazioni manuali o addestramento a pagamento.

Quando viene collegata la valutazione REAL o il dossier SLOP, il Worker esegue
la preparazione e ne conserva uno snapshot:

- file effettivo in quarantena con SHA-256 corrispondente al catalogo;
- originale privato archiviato con impronta coerente con riferimento/dossier;
- fonte, autore, prova documentale e licenza riconosciuta;
- spiegazione compilata e categorie presenti;
- valutazione completa, natura fotografica, motivo concreto e soglia superata;
- per REAL, riferimento REAL coerente con identità, URL, diritti e impronta;
- per SLOP, dossier accettato, descrizione, brief, prompt, modello, originale,
  file finale e dichiarazione del proprietario coerenti.

Questi sono controlli automatici di coerenza e documentazione: non trasformano
una dichiarazione del provider o del generatore in una garanzia legale o storica.
Il clic Approva accetta la scheda documentata preparata; il sistema non spunta
checkbox invisibili per aggirare il precedente percorso manuale.

Le candidate incomplete restano private e **fuori dalla coda visiva**, con
motivazioni tecniche disponibili nella gestione/API. La vecchia approvazione
manuale avanzata conserva i propri controlli espliciti. Le vecchie importazioni
senza valutazione o dossier completi non diventano pronte per effetto della
migrazione: possono essere completate da un processo preparatorio autorizzato,
non vengono fatte passare artificialmente per immagini già elaborate.

Una modifica a file, metadati, categorie, licenza o scheda invalida lo snapshot.
Il pulsante invia automaticamente soltanto `decision` e un token della scheda;
il server ricontrolla dati e file e rifiuta schede obsolete. Il token non sostituisce
l'autenticazione amministrativa. La validità dello snapshot viene controllata
anche dentro la transazione SQL della decisione.

## Come impara il sistema

Il modello è un piccolo stimatore bayesiano locale, non un fine-tuning di Terra
o del generatore. Usa le decisioni sulle candidate **già preparate**: approvato è
un segnale positivo, rifiutato è negativo. Non occorre indicare il perché.
Categorie e tag visivi sono estratti prima della revisione e congelati nello
snapshot. Non viene usata l'etichetta REAL/SLOP come caratteristica di gusto.

Per ciascuna caratteristica, con `a` approvazioni e `r` rifiuti, la stima è:

`p = (a + 2) / (a + r + 4)`

La media delle stime delle caratteristiche presenti dà la preferenza di una
candidata o query. Le caratteristiche sconosciute partono da 0,5. Con pochi
esempi l'effetto rimane moderato; un solo rifiuto non crea un divieto. Le stime
sono indicazioni di gusto, non nuove soglie di qualità e non affermazioni sulle
cause del rifiuto. Il modello non può conoscere una motivazione non espressa.

Feedback, decisione e audit vengono salvati **nello stesso batch D1**. Due clic
simultanei producono una sola decisione e un solo esempio. Gli esempi conservano
versione, token, tag e data e non possono essere modificati o duplicati. I conteggi
sono ricostruiti dal registro persistente: nessun parametro può perdere
aggiornamenti per una gara tra due richieste.

Lo snapshot completo usato per i brief è salvato privatamente in
`editorial/preferences.json` e riusato nel recupero dello stesso run, anche se
nel frattempo arrivano nuove decisioni. La raccolta conserva separatamente
`preferences.json`, così entrambe le fasi sono verificabili.

Lo storico precedente resta intatto; non viene retroattivamente interpretato
come preferenza, perché un vecchio rifiuto potrebbe essere stato tecnico o
legato ai diritti. All'avvio il modello è neutro e apprende dalle nuove decisioni
visive. Nessun rifiuto automatico per errore API, budget, licenza o caricamento
alimenta questo registro.

## Dove si usano le preferenze

1. **Ricerca:** con storico disponibile, sceglie cinque query da un repertorio
   più ampio, senza superare due query per famiglia principale. Rimangono almeno
   tre famiglie, il massimo di quattro ammissioni per query e venti fotografie.
   Pagine alternate, controlli tecnici, fonti e deduplicazione restano invariati.
2. **Brief SLOP:** Terra riceve suggerimenti morbidi sulle caratteristiche gradite
   o proposte meno spesso. Non riceve i punteggi o le posizioni della sorgente.
   Il generatore conserva la propria libertà; il dossier registra modalità,
   versione e impronta dello snapshot di preferenze usato per ogni tentativo.
3. **Ordine della coda:** preferenza probabilistica tra le immagini già pronte;
   nessuna viene eliminata o resa inapprovabile per il gusto previsto.

La classifica visiva delle fotografie rimane **una sola**, ordinata esclusivamente
per il punteggio comune 0–100. Le preferenze non correggono i punteggi, non
rimescolano la metà REAL con le sorgenti SLOP e non abbassano la soglia per
completare quantità. Il valutatore finale riceve soltanto pixel e rubrica comune:
nessuno storico, preferenza, brief o punteggio della sorgente. Il 50/50 del catalogo
e le monete Bernoulli del gioco non dipendono dal modello dei gusti.

## Variabilità permanente

Il **25% di probabilità di esplorazione** è definito, insieme a prior e vocabolario,
in `shared/editorial-preferences.json`, letto da TypeScript e Python. A ogni
scelta di query/ordine si può usare una scelta uniforme; per il brief, un tentativo
di esplorazione ignora i suggerimenti preferiti/sfavorevoli. Il resto usa pesi
morbidi sempre positivi. Non significa esattamente un quarto di ogni lotto:
è una probabilità, non una quota rigida. Anche ciò che è stato spesso rifiutato
può tornare in una nuova proposta, mentre la stessa immagine già revisionata
non viene ripresentata come se fosse nuova.

Il piano di ricerca è riproducibile a parità di giorno e snapshot, ma cambia tra
giorni. Il brief usa l'identificativo del tentativo come seme riproducibile. La
coda varia senza riscrivere provenienza, stati o valutazioni.

## API, errori e operazioni

Tutte le API richiedono l'autenticazione admin esistente:

- `GET /api/admin/review-queue`: sole candidate pronte, preview e token;
- `POST /api/admin/visual-review/:id`: `decision`, `token`, nessun altro campo;
- `POST /api/admin/editorial/prepare`: ripete i controlli su `image_id`;
- `GET /api/admin/editorial/preferences`: conteggi privati e versione del modello.

`/reviews` e `/attempts` preparano automaticamente le candidate collegate;
i retry dopo interruzione recuperano lo stato senza nuove generazioni.
Una preview corrotta blocca i pulsanti; una scheda cambiata restituisce 409 e
viene ricaricata. Una decisione non viene ripetuta né trasformata in pubblicazione.

`python -m pipeline.automatic --collect --preferences` legge lo storico con
`REAL_OR_SLOP_ADMIN_TOKEN`, senza chiamate OpenAI, e congela il file privato
`preferences.json`. Senza il flag, raccolta/piano mantengono il comportamento
neutro e le simulazioni non leggono servizi remoti. Un secret assente, uno
snapshot incompatibile o una lettura fallita interrompono l'esecuzione prima
delle chiamate pagate. Il workflow usa il secret già esistente; non servono
nuove chiavi, variabili d'ambiente, dipendenze o servizi di training.

La migrazione additiva **0010_visual_editorial_review.sql** aggiunge preparazioni,
feedback e invalidazioni, senza modificare catalogo, risposte, sessioni o storico
delle revisioni. Richiede la cronologia precedente completa, inclusa la 0009.
Prima del rilascio: backup, applicazione autorizzata delle migrazioni pendenti,
rilettura della cronologia, Worker/frontend della stessa versione e verifica
con una candidata privata. I budget e i cron restano separatamente disattivati;
questa modifica non effettua migrazioni, deploy, merge o chiamate OpenAI.

Test: lint, suite Node/Python, build e integrazione locale con D1/R2;
Chromium con fixture UI per verificare pulsanti senza campi e protezione da
preview rotte. I test di preparazione, audit e apprendimento usano il Worker
locale effettivo, senza API a pagamento.
