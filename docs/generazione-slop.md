# Generazione SLOP — specifica 8.4.0

Stato: implementata nel ramo 1.41.0, da rilasciare. Aggiornata: 2026-11-18T05:56:24Z.

## Due modalità e avviso sul dataset

Decisione dell'owner del 2026-11-17: in «Generazione SLOP» ci sono «Generazione manuale» e «Generazione automatica».
La proposta di generazione, Ignora/Chiudi e l'impostazione per attivarla spariscono. Un avviso mostra soltanto lo sbilanciamento
tra REAL e SLOP approvate/pubblicate, contando separatamente le SLOP nuove ancora da decidere. Non avvia processi e non impone una quantità.
Il bilanciamento usa soltanto il numero di foto e la disponibilità delle REAL madri rispetto alle SLOP figlie. Non esistono gruppi
di genere/decennio, quote per tag o soglie di gruppo. Genere e Tempo restano normali tag descrittivi, senza influenzare il campione.

**Manuale:** l'owner scrive prompt inglese, tag di partenza e brief (ancoraggi obbligatori, preferenze, elementi liberi ed esclusioni).
Non occorre una REAL. Preparare e modificare il processo prima del primo tentativo è gratuito; nessuna chiamata scrive o riscrive
il prompt manuale. Poi partono lo stesso ciclo di generazione e valutazione, la revisione e la copia 4:5. I tag di partenza restano
nello snapshot privato del processo, senza essere copiati nei metadati della figlia; i tag finali descrivono l'originale prodotto, con la normale analisi dopo accettazione. Nessun trattamento da una REAL mancante.

**Automatica:** l'owner sceglie da una a dieci REAL di riferimento. Il numero di SLOP segue il numero di REAL; può essere diverso
dallo sbilanciamento, anche quando il catalogo è in pareggio. Una chiamata testuale per REAL scrive brief e prompt dai tag e dalla
descrizione salvati.

1. **Scegli le REAL di riferimento.** «Dal Database» filtra le REAL libere per titolo, descrizione o tag e conserva la selezione
   durante la ricerca. «Da Wikimedia Commons» riusa ricerca, link, importazione privata, tag e descrizione del wizard REAL.
   Le REAL possono essere preparate a mano o con l'analisi combinata, che dichiara e conferma separatamente una chiamata per foto.
   Una REAL importata può entrare nella selezione da nuova, con tag e descrizione editoriale, senza copia di gioco. Si possono
   combinare REAL di entrambe le provenienze. «Estrazione casuale» resta disponibile per le REAL approvate/pubblicate pronte,
   con campionamento uniforme senza ripetizioni.
2. **Rivedi le REAL e avvia.** L'anteprima gratuita mostra miniature, titoli e tag. Un tocco o una pressione prolungata apre
   l'originale intero con descrizione editoriale, contesto documentato e incertezze. «Conferma e avvia N SLOP» richiede la conferma
   del massimo di chiamate del batch. Un cambio della selezione o della quantità estratta invalida l'anteprima.

`GET auto/references` elenca i riferimenti disponibili nel Database, comprese le REAL nuove con tag e descrizione editoriale.
`POST auto/preview {sources}` conserva l'ordine degli ID scelti. `{size}` chiede invece l'estrazione casuale. L'anteprima non crea
batch, non prenota REAL e non invia chiamate al modello. Restituisce un token firmato con ID, revisioni, ordine e configurazione,
valido quindici minuti. `POST auto/start {preview,confirm:true}` usa esattamente quelle REAL. Un riferimento cambiato, occupato
o eliminato, un cambio della configurazione o una scadenza richiedono una nuova anteprima. La transazione che crea i processi
verifica nuovamente revisioni e disponibilità. Ogni token può avviare un solo batch. La selezione del batch non sopravvive al
ricaricamento. Le REAL già importate restano nella libreria privata. La scelta dei riferimenti non richiede una migrazione.

## Ispirazione e disponibilità

Una SLOP automatica è ispirata a una REAL, senza obbligo di somiglianza. Sono disponibili le REAL con tag e descrizione editoriale che non
hanno una figlia esistente né una prenotazione aperta. Le REAL nuove sono disponibili tramite scelta esplicita. Il registro privato `slop_reference_uses` prenota atomicamente la madre
alla creazione del processo e registra la figlia accettata. La madre resta esclusa se la figlia è nuova, approvata, pubblicata o nel
cestino; solo cancellare definitivamente la figlia la libera. Chiudere un processo senza figlia libera la sua prenotazione. Gli esiti
incerti e in revisione richiedono prima la decisione dell'owner. Eliminare un processo già accettato lascia occupata la madre.

Dal 2026-11-18, quando la figlia entra in libreria come nuova, la REAL viene esclusa dalle nuove partite. Se era pubblicata torna
approvata. Una prenotazione senza figlia lascia la REAL giocabile se pubblicata. L'eliminazione definitiva dal cestino è possibile
dopo l'approvazione della figlia o dopo la chiusura del processo senza figlia. Eliminare la madre dopo l'approvazione
lascia intatta la SLOP, che usa descrizione, tag e misure già salvati nello snapshot. Eliminare definitivamente la figlia libera
la REAL superstite, che richiede una nuova pubblicazione per tornare nel gioco.

Il legame resta privato. L'esclusione si applica ai legami già registrati e a quelli futuri. La migrazione 0053 aveva cancellato
i legami precedenti, che restano sconosciuti.

## Varietà di composizione

La posizione e lo sguardo descritti nella REAL sono facoltativi. Dal 2026-11-18 la rotazione dei nuovi processi automatici include
vista frontale, inquadratura centrata e simmetrica, due prospettive laterali e una scelta aperta dettata dalla scena. Il prompt ammette
anche sguardo in camera, posa naturale, un solo soggetto e sfondo semplice, e aggiunge comparse, oggetti o dettagli solo quando
servono alla scena. La preferenza viene salvata nello snapshot e accompagna le richieste di brief e generazione e i tentativi
successivi. Il valutatore giudica la credibilità fotografica e tratta queste scelte come facoltative. I prompt manuali li scrive l'owner.

## Analisi REAL e brief

La chiamata multimodale di catalogazione vede l'originale REAL intero e il contesto Commons, e produce insieme tag e descrizione neutra: elementi visibili, contesto documentato e incertezze. Non conosce le SLOP. Nessun fatto viene inventato per completare Commons.

Una chiamata testuale per processo legge soltanto descrizione e tag salvati e produce brief e prompt inglese. Non vede l'immagine REAL. Il brief distingue ancoraggi obbligatori, preferenze, elementi flessibili ed esclusioni; prompt e scena possono cambiare, gli ancoraggi restano immutabili dopo il primo tentativo. Non si richiedono somiglianza visiva o un solo elemento modificato. Le persone sono inventate; valgono i limiti di `contenuti-e-trasparenza`. Gli edifici devono essere plausibili per stile, luogo ed epoca, senza fedeltà obbligatoria a un monumento reale.

Prima del primo tentativo è possibile salvare o riscrivere brief e prompt. Ogni riscrittura a pagamento aggiunge una chiamata al massimo mostrato. Un contesto prompt della pipeline precedente blocca le chiamate fino al suo aggiornamento esplicito.

## Ciclo e valutazione

Workflow Cloudflare: brief, generazione, valutazione e analisi dei tag dopo accettazione. Continua anche chiudendo la dashboard. Ogni chiamata è acquisita nel database prima dell'invio; gli esiti incerti non si ripetono automaticamente. La ripresa esegue solo passi ancora disponibili. Lo stop termina prima della successiva chiamata; quella già inviata può concludersi.

A ogni iterazione il valutatore riceve una nuova richiesta Responses API, senza conversazione o `previous_response_id`:
- l’immagine generata corrente intera, prima di crop e trattamento, come data URL;
- un testo JSON con esattamente `attempt_id`, `brief` (required, preferred, flexible, exclusions), `prompt` corrente,
  `composition_preference` e `tolerance` congelata nel processo;
- istruzioni composte da contesto Base e contesto Valutazione attivi al momento della richiesta, seguiti dalle regole fisse del codice;
- schema JSON obbligatorio della risposta e limite di 8000 token in uscita.

Non riceve l’immagine REAL, titolo o tag della madre, né immagini o valutazioni precedenti. Il brief può contenere ancoraggi ricavati
dai tag della REAL; non è la lista dei tag. Nei tentativi successivi il prompt può essere quello rivisto, mentre gli ancoraggi restano
immutabili. Il modello è quello di testo registrato nello snapshot all’avvio. Il valutatore vede la SLOP intera, non ritagliata né trattata. Restituisce accetta, riprova, riscrivi prompt, riprogetta scena o revisione umana, con difetti critici/minori, vincoli, incertezze e motivazione. Credibilità prima dell'aderenza letterale; nell’accettazione automatica i difetti critici non sono mai compensabili. Luogo, data e identità non verificabili dai pixel sono annotazioni, non ragioni automatiche di rifiuto. La revisione del prompt conserva gli ancoraggi e le esclusioni del brief. Il controllo testuale non dimostra che il modello li abbia realmente rispettati: resta necessario il controllo umano.

Tentativi massimi 1–5, tolleranza 0–2. A tolleranza zero, difetti minori provocano un nuovo tentativo entro il limite. Snapshot dei modelli, qualità e limiti all'avvio. Massimo iniziale per SLOP automatica: una chiamata brief, due per tentativo (immagine e valutazione), una analisi tag dopo accettazione. In manuale manca la chiamata brief: 1 + 2N invece di 2 + 2N. Nei test solo API fittizie. Nessun punteggio di difficoltà deriva dal numero di tentativi.

## Identità e tag della foto SLOP

Decisione del 2026-11-17: nessun titolo delle SLOP. La foto usa il proprio ID; la dashboard mostra un’etichetta con ID abbreviato,
mai salvata come titolo né inviata ai modelli. Il titolo rimane obbligatorio solo per le REAL.

Il riquadro «Tag di partenza» scompare dal dettaglio e dall’anteprima della figlia; i tag copiati sono rimossi dallo slot della foto.
Restano i tag osservati dall’analisi della SLOP intera e le modifiche dell’owner. L’analisi riceve prompt e descrizione aggiuntiva se presente,
non il titolo della SLOP o i tag di partenza; conserva il vocabolario generale per mantenere coerenti i nomi. Genere, Colore e Supporto
si deducono solo dall’immagine. I tag della REAL restano input privati del processo per scrivere o riscrivere il brief; i tag inseriti
dall’owner restano disponibili nella generazione manuale. Colore e supporto necessari alla copia sono parametri tecnici `copy_style`,
separati dal catalogo dei tag e dalle misure numeriche. Non si cancella il legame madre–figlia.

## Revisione e copie

Solo una candidata accettata entra nella libreria privata come nuova SLOP. Analisi tag sull'intero originale. Copia 4:5 preparata dopo accettazione nel browser, con identica codifica WebP delle REAL, senza metadati. Il trattamento usa misure numeriche salvate, senza identificativo della REAL e senza rileggerla. I cursori permettono correzioni manuali; una REAL eliminata non impedisce di rifare la copia. Se mancano le misure, la copia è senza trattamento.

Accettazione automatica, approvazione dell'owner e pubblicazione sono distinte. Esauriti, in revisione, falliti e incerti restano in evidenza con tentativi e valutazioni finché l'owner li chiude. Decisione dell’owner del 2026-11-17: in un processo esaurito, in revisione, fallito o incerto si può scegliere «Accetta comunque il tentativo N» per qualsiasi candidata intera salvata e con valutazione valida, anche con difetti critici, minori, incertezze o vincoli non confermati. Si può scegliere anche un tentativo precedente a quello finale. La conferma elenca le segnalazioni e dichiara il massimo di una chiamata a pagamento, per i tag; annullare non invia chiamate.

L’accettazione manuale non cambia la valutazione originale: nello slot privato della foto viene registrata separatamente `acceptance:{by:"owner",attempt,at}`. La revisione mostra che la foto è stata accettata manualmente. Entra come SLOP nuova senza copia, mai approvata o pubblicata automaticamente. Per copie, approvazione e pubblicazione valgono i passaggi consueti. L’accettazione occupa la madre come qualunque altra figlia.

Processi in corso, già accettati o chiusi, tentativi non valutati o senza candidata non sono accettabili. Una sola richiesta acquisisce atomicamente il processo: un doppio clic non duplica immagini o chiamate. Se il file è mancante lo stato precedente viene ripristinato senza chiamate; se fallisce l’analisi dei tag la foto resta accettata e segnala l’errore, senza ripetizione automatica. I limiti del ciclo automatico restano gli stessi. Chiusura esplicita e manutenzione consentono poi la rimozione dei tentativi dopo sette giorni.

Aprire o chiudere il dettaglio di un tentativo conserva la scelta anche quando la sezione viene aggiornata.

## Batch automatici

Un solo batch automatico aperto. Il ciclo gira sul server e continua chiudendo la dashboard. Un batch concluso passa in revisione
e si chiude quando tutti gli esiti sono decisi, oppure con il comando esplicito dopo aver deciso le immagini nuove. La chiusura
libera le prenotazioni dei processi non avviati; gli esiti senza SLOP restano in evidenza fino alla loro chiusura esplicita.
I batch precedenti restano consultabili senza riprese a pagamento incompatibili.

## Rilascio

La 0055 aggiunge il registro privato, elimina le proposte ignorate e la loro opzione. Non esegue chiamate né backfill di identità. Prima del rilascio devono terminare i Workflow precedenti: non registrerebbero il nuovo utilizzo delle REAL. Migrazione e deploy richiedono l'autorizzazione di rilascio dell'owner. Nessuna chiamata né migrazione remota fa parte delle verifiche locali.

La 0056 elimina i campi e le impostazioni dei gruppi dal database. Le informazioni pregresse di genere e decennio negli slot
restano come normali tag di partenza; prompt, tentativi, chiamate, immagini e registro madre–figlia sono conservati.

L’accettazione manuale estesa non richiede nuove migrazioni: decisione e data sono nei metadati privati della foto, la valutazione originale resta nel tentativo.

La 0058 elimina i titoli SLOP e i tag di partenza copiati sulla foto. Conserva titoli REAL, tag osservati, dati dei processi, relazioni e impostazioni delle copie; non genera nuove analisi.

La 0059 ritira le REAL pubblicate con una SLOP già registrata e conserva le copie necessarie alle partite in corso.
