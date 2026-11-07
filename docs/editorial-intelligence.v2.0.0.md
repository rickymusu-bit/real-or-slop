# Dashboard editoriale completa — 2.0.0

Aggiornato: 2026-11-07T19:21:24Z. Issue #64, base `bac6edf`.
Sostituisce le descrizioni di funzionalità future in `editorial-intelligence.v1.0.0.md`
e `topic-discovery-semantic-learning.v2.0.0.md` per gli ambiti implementati qui.
Non modifica i run storici né certifica l'attivazione in produzione.

## Percorso amministrativo

1. Registrare titolo e descrizione facoltativa (massimo 500 caratteri). Il testo
   viene conservato prima della chiamata embedding, anche con Discovery OFF.
2. Proporre file originali o link. I link Commons possono essere acquisiti;
   per altre fonti aprire la pagina e caricare il file dall'admin. La dashboard
   distingue link ancora da acquisire e file effettivamente acquisiti.
3. Confermare «Ho finito di proporre foto» oppure «Continua senza foto manuali».
   Il server richiede questa scelta prima di `/search`. Non avvia chiamate.
   È possibile terminare con le sole proposte manuali.
4. Ricerca, profilo pixel-only e confronto con il tema richiedono comandi separati.
   La pertinenza visiva non è una probabilità di gusto né prova di un evento.
   Il confronto riceve solo il profilo già prodotto e il testo del tema,
   mai titolo, autore o dichiarazioni di provenienza della fotografia.
5. I voti correnti aggiornano immediatamente il pannello delle preferenze e il
   deficit SLOP. Lo snapshot SLOP rimane quello congelato alla creazione del tema;
   il preparatore legge soltanto quel payload e lo storico SLOP già congelato.
6. Ogni generazione prenota atomicamente capacità oltre al budget già esistente.
   Le operazioni concorrenti o incerte consumano capacità; non si genera oltre
   il deficit. I formati ruotano da un punto iniziale derivato esclusivamente
   dall'ID del tema, senza osservare REAL. I prompt e formati già congelati restano
   validi e non vengono riscritti.
7. Dopo il voto si compilano attestazioni documentali separate nell'interfaccia
   esistente. Ammissione privata e pubblicazione bilanciata rimangono due azioni.
   Nessuna nuova categoria descrittiva o tassonomia è obbligatoria.

## Memoria semantica e revisioni

Il comando «Salva descrizione / indicizza argomento» funziona anche con Topic
Discovery OFF e rende indicizzabili singolarmente gli argomenti storici o pending.
È un'autorizzazione a un solo embedding entro i budget configurati. Non esistono
backfill automatici o retry degli esiti `submitting/uncertain`. Un confronto
`expected_sha256` impedisce sovrascritture di testo obsoleto.

La migrazione additiva 0023 archivia la revisione precedente quando cambiano testo
o modello, conservando vettore, token e stato. L'archivio è immutabile. Il ripristino
di un testo/modello già indicizzato riusa il vettore archiviato senza nuova spesa.
Il cambio del modello è esplicito con il medesimo comando; vettori di modelli o
template differenti non vengono confrontati.

La chiamata embedding acquisisce un lock prima di prenotare il ledger e inviare
la richiesta. Un concorrente non modifica lo stato del primo invio. Risposte
malformate, vettori nulli o invii non confermati non sono mai sostituiti con dati
inventati. La UI mostra configurazione, tetto, stato ed eventuale diagnostica.

## Suggeritore vettoriale

Topic Discovery resta OFF per default. Una richiesta esplicita autorizza al massimo
due chiamate testo e cinque embedding singoli, ciascuno prenotato nel rispettivo
budget. Il toggle non esegue nessuna chiamata. I tre learner restano indipendenti:
il suggeritore usa solo storico dei temi e decisioni su temi, inclusi ricerche a
zero risultati, rifiuti e rinvii; non usa gusti fotografici REAL/SLOP.

GPT propone titoli, descrizioni inglesi autocontenute e motivazioni, senza schema
obbligatorio per luogo/data/evento. Le proposte sono archiviate prima di indicizzarle.
Il confronto coseno esamina tutti i vettori compatibili di temi, revisioni e
suggerimenti storici; non tronca lo storico agli ultimi 200 record. Il confronto
lessicale rimane un'indicazione supplementare per testi non indicizzati.

Una seconda chiamata confronta le proposte con i vicini e distingue una parafrasi
dello stesso episodio da eventi, periodi e prospettive differenti. Il coseno da solo
non scarta un tema. La UI mostra vicini, distanza dal primo vicino, motivazione e
stato dell'indicizzazione. La distanza non è una probabilità e non misura da sola
qualità, fattibilità o veridicità. Proposte con verifica pendente/incerta o duplicate
non sono accettabili finché il controllo non è completato. Nessun esito del modello
diventa un rifiuto editoriale dell'owner.

Un embedding pending resta tale quando manca configurazione/budget. Con uno storico
parzialmente indicizzato il pannello non deve essere interpretato come deduplica
semantica completa: i testi restano disponibili e indicizzabili dall'admin.

## Diagnostica, proporzioni e compatibilità

Ogni ricerca conserva query riuscite, errori, file esclusi e indicatore di risultati
parziali. Zero risultati riusciti e provider indisponibile sono distinti.
L'ID dell'operazione rende la ripresa idempotente senza ripetere retrieval già avviati.

I nuovi file conservano geometria e byte originali. L'admin confronta i conteggi
dei formati REAL/SLOP privati e pubblicati. I file storici senza geometria e i JPEG
il cui orientamento EXIF non è risolto restano «sconosciuti»: non si inventano dati.
Non è un'attestazione di neutralità del catalogo reale; controllare gli originali
e le distribuzioni effettive prima del rilascio. Non si ritagliano immagini per
forzare la parità dei formati.

Applicare 0023 soltanto dopo 0022 e le precedenti, con le procedure di backup e
approvazione esistenti. Nessun secret, budget, gate, cron, database o bucket remoto
viene modificato da questa implementazione. Commons rimane l'unico adapter di
acquisizione automatica; gli altri link usano l'upload dell'amministratore.

## Verifiche riproducibili

`npm run test:editorial` esegue il vero Worker con D1/R2 locali e trasporto outbound
che risponde solo con fixture. Qualunque destinazione non prevista viene rifiutata.
Non vengono lette chiavi API reali. La suite copre embedding, concorrenti, revisioni,
temi storici, incertezza, duplicati ed eventi distinti, pertinenza, feedback,
isolamento SLOP, capacità e ricerca parziale/vuota/fallita.

Per il browser: installare `scripts/browser-requirements.txt`, installare Chromium
con Playwright se non presente ed eseguire `ROS_TEST_BROWSER=1 npm run test:editorial`.
La suite usa la pagina reale su desktop 1440×1000 e mobile 390×844: crea/modifica tema,
propone link e file verticali/panoramici, profila, confronta, vota, genera, cerca,
verifica persistenza, ammette e pubblica una coppia con attestazioni esplicitamente
fittizie nel solo D1 locale. Controlla overflow ed errori JS. Screenshot in
`artifacts/editorial-browser/`, ricevute fittizie in `artifacts/editorial-enabled-receipts.json`.
La CI esegue lo stesso percorso.

Le fixture confermano i contratti, non l'efficacia dei modelli reali o la provenienza
delle fotografie di produzione. Un benchmark pagato e il rilascio richiedono una
successiva autorizzazione esplicita; non sono stati eseguiti qui.
