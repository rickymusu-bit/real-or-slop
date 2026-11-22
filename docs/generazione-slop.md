# Generazione SLOP — specifica 15.0.0

Stato: implementata nel ramo 1.57.0, da rilasciare. Aggiornata: 2026-11-22T18:00:00Z.

## 1. Un solo wizard

Decisione dell'owner del 2026-11-22: **niente generazione manuale**. Ogni SLOP nasce dal wizard «Genera SLOP» della galleria, che
segue una sola pipeline:

1. **Galleria**: il wizard si apre dalla galleria, nella stessa scheda;
2. **REAL**: estrazione corretta su affollamento e dettaglio, che l'owner modifica togliendo o aggiungendo REAL;
3. **Proposte**: per ogni REAL l'owner scrive una proposta o la chiede al modello;
4. **Scelta** delle proposte da generare;
5. **Prompt**: il modello scrive premessa e prompt (prima conferma), l'owner li corregge;
6. **Generazione** sul server (seconda conferma);
7. **Revisione**: inquadratura, trattamento, approvazione e pubblicazione delle SLOP accettate, e i processi senza SLOP.

Spariscono la scrittura diretta di prompt e brief, le SLOP senza REAL di partenza e le rotte dei batch manuali (`POST batches`,
`PUT batches/:id`, `POST batches/:id/{images,run,stop}`). I processi manuali già registrati restano consultabili; quelli senza SLOP
compaiono fra le eccezioni e si accettano o si chiudono come gli altri.

L’avviso in Statistiche confronta i conteggi di REAL e SLOP approvate o pubblicate e mostra a parte le SLOP nuove. Un batch genera da
1 a 10 SLOP. Le foto non hanno tag (decisione del 2026-11-20): la galleria le raggruppa. Un batch alla volta: se ne esiste già uno,
Gallerie e il wizard delle altre gallerie offrono un accesso al batch aperto. La revisione del batch mostra le SLOP che si trovano
ancora nella galleria di origine; una SLOP spostata si revisiona dalla galleria di destinazione.

Dalla decisione dell’owner del 2026-11-18 (#157) ogni REAL appartiene a una galleria. Le gallerie hanno titolo, descrizione e soglie di
affollamento e dettaglio; titolo e descrizione accompagnano le richieste al modello come contesto. **Niente Indicazioni SLOP di
galleria** (decisione dell'owner del 2026-11-22): quelle proposte dal modello partivano dal solo titolo, non dalle foto. Quali falsi
hanno senso lo dicono le proposte di ogni REAL. Il wizard è disponibile quando la galleria ha almeno una REAL approvata o pubblicata.
La migrazione 0070 elimina le indicazioni salvate e la loro proposta automatica.

Le REAL non hanno descrizione editoriale (decisione del 2026-11-20): il modello delle proposte legge direttamente l’originale, il
titolo e la descrizione della fonte, insieme alla proposta scelta.

### Proposte delle REAL

Decisioni dell'owner del 2026-11-21 e del 2026-11-22. I modi possibili di creare una SLOP da una REAL sono una proprietà della REAL:
un'edizione limitata si fotografa da sola, in risalto, e non ha senso in una scena affollata. Le proposte (`real_ideas`) restano
salvate sulla REAL per i batch successivi.

- **Scritte dall'owner.** Nel passo 3, gratuite e approvate subito (`POST /:id/ideas {idea, genre?, changes?}`); al massimo tre
  proposte per REAL in tutto.
- **Chieste al modello.** Nel passo 3, per una REAL o per tutte le REAL scelte che non hanno proposte libere: una chiamata a
  pagamento per REAL, confermata con il massimo, mai ripetuta in automatico (`POST /:id/ideas {confirm, request}`, tipo `prompts`).
  Il modello riceve l'originale intero, titolo e descrizione della fonte (ipotesi, non istruzioni), titolo e descrizione della
  galleria, l'ultima misura di affollamento e dettaglio, le proposte già approvate o usate e il testo modificabile «Idee SLOP delle
  REAL». Restituisce da zero a tre proposte (scena, genere di foto, cosa cambia rispetto alla REAL); con zero, il motivo, che resta
  sulla REAL. Una nuova richiesta sostituisce le proposte del modello non scelte e chiede quelle mancanti fino a tre, contando
  approvate e usate.
- **Revisione.** Nel passo 3 l'owner corregge il testo di una proposta libera (`PATCH /ideas/:id`) o la scarta (`DELETE /ideas/:id`).
  Scegliere una proposta nel passo 4 la approva per la galleria della REAL. Una proposta approvata quando la REAL era in un'altra
  galleria è «da rivedere»: torna valida se viene scelta di nuovo. Una proposta usata o in un processo aperto non si modifica. Il
  dettaglio della REAL nella galleria mostra le proposte in sola lettura.
- **Riferimento tra REAL e SLOP.** La REAL ispira la SLOP, non viene copiata. La SLOP eredita galleria, famiglia ed epoca dell'oggetto,
  genere di foto (come si fotografa di solito quel tipo di oggetto), tecnica, luce e livelli di affollamento e dettaglio. Cambiano
  sempre ambiente e punto di vista; l'esemplare può restare lo stesso solo se la scena cambia molto. Composizione, segni
  dell'esemplare (graffi, adesivi, scritte a mano, numeri di serie), scritte e persone della REAL non si riprendono mai. Messe una
  accanto all'altra, REAL e SLOP non devono sembrare due scatti della stessa sessione.
- **Una SLOP per proposta.** La proposta diventa «usata» quando la sua SLOP viene accettata, automaticamente o dall'owner. Un processo
  chiuso senza SLOP la lascia disponibile. Nello stesso batch si possono scegliere più proposte della stessa REAL (decisione
  dell'owner del 2026-11-22): due REAL dello stesso oggetto danno SLOP simili quanto due proposte della stessa REAL, quindi un limite
  per REAL non serviva. La varietà dipende dalla scelta dell'owner e dalle premesse già scritte nel batch, che il modello riceve.

## 2. I passi del wizard

1. **Galleria.** Il wizard è quello della galleria aperta; un batch aperto altrove si raggiunge con il suo collegamento.
2. **REAL.** `POST auto/preview {gallery_id, size}` estrae gratis fino a `size` REAL approvate o pubblicate della galleria con
   originale in quarantena, **corretta su affollamento e dettaglio** (`shared/idea-sampling.ts`): ogni asse è diviso in tre fasce
   (0–33, 34–66, 67–100); per ogni fascia si confronta la quota fra le REAL misurate della galleria con quella fra le SLOP già nate da
   proposte della galleria (le REAL delle proposte usate); il peso di una REAL è, per ogni asse, il rapporto fra le due quote, tra
   0,25 e 4, e i due assi si moltiplicano. Contano solo le misure della formula in vigore; una REAL senza misura pesa 1. Senza
   correzione si sceglierebbero più spesso le REAL più semplici e la semplicità diventerebbe un indizio dell'origine. L'estrazione è
   solo una proposta: le REAL estratte arrivano già selezionate e l'owner ne toglie o aggiunge fra tutte quelle disponibili
   (`GET auto/candidates?gallery=`, con misura e proposte). Selezione e scelte restano nella scheda del browser fino alla prima
   conferma. Tocco o pressione prolungata su una miniatura apre l’originale intero con la descrizione della fonte.
3. **Proposte** (sezione 1). Per ogni REAL scelta: le sue proposte, il campo per scriverne una, «Chiedi al modello».
4. **Scelta.** L'owner spunta le proposte da generare (una scritta da lui è scelta subito), da 1 a 10 per batch, anche più di una
   della stessa REAL; il riepilogo le mostra con la configurazione.
5. **Prompt.** `POST auto/prepare {gallery_id, ideas, count, request, confirm: true}` è la prima conferma, del massimo di una chiamata
   per proposta. `request` è un UUID del browser e diventa l'ID del batch: la stessa conferma inviata due volte crea un solo batch.
   Il Worker ricontrolla che ogni proposta sia libera e la sua REAL approvata o pubblicata nella galleria, con l'originale; approva
   le proposte scelte; congela modelli, qualità, tolleranza, tentativi massimi e versioni dei contesti; crea un processo per proposta,
   con il riferimento alla REAL e alla proposta. Il Workflow prepara i prompt in ordine. Per ciascuno il modello riceve l’originale
   intero prima del ritaglio 4:5, titolo e descrizione della fonte (`reference: {title, description}`), la proposta (`idea: {idea,
   genre, changes}`), i livelli di affollamento e dettaglio della REAL (`levels`, nullo senza misura della formula in vigore), titolo e
   descrizione della galleria e istruzioni generali. Sviluppa la proposta secondo il riferimento tra REAL e SLOP; cita alla lettera le
   scritte leggibili e indica i conteggi esatti delle parti contabili. Restituisce una frase in italiano sul falso e il prompt in
   inglese, oppure il motivo per cui non può proporre un falso compatibile. Le premesse precedenti aiutano a variare il batch. Il
   testo «Premessa e prompt di galleria» resta modificabile; le regole sulla proposta e sul riferimento sono nel codice.
   L'owner **corregge premessa e prompt** prima della seconda conferma (`POST auto/proposal {batch, slot, premise?, prompt?}`,
   gratuito, si salva da solo); la premessa resta l'ancoraggio che il valutatore controlla.
6. **Generazione.** I prompt restano disponibili per un’ora dalla preparazione, anche dopo il ricaricamento. `POST auto/start {batch,
   count, confirm: true}` conferma il numero esatto di proposte valide e il massimo rimanente di `2N × count` chiamate, con `N`
   tentativi massimi: una generazione e una valutazione per tentativo. Nessuna analisi segue l’accettazione. La preconferma mostra
   modelli, qualità, tentativi e tolleranza. Il server ricontrolla appartenenza, disponibilità, revisioni e scadenza: un cambiamento
   della galleria o delle REAL invalida i prompt. `POST auto/cancel {batch}` ferma la preparazione prima del passo successivo e lascia
   le proposte sulle REAL. L’annullamento o la scadenza rimuovono i riferimenti temporanei; la conferma rimuove quelli dei processi
   che non generano. Gli altri restano, con la proposta, fino alla fine del processo: all'accettazione della SLOP la proposta diventa
   usata e il riferimento sparisce; alla chiusura di un processo senza SLOP il riferimento sparisce e la proposta resta disponibile
   (trigger della migrazione 0069). Conferme concorrenti acquisiscono una sola volta la transizione. La generazione continua sul
   server anche se la pagina si chiude; «Interrompi» la ferma prima del passo successivo.
7. **Revisione.** Le SLOP accettate compaiono nel wizard con l'originale intero valutato e la copia 4:5, preparata nel browser;
   «Inquadratura», i comandi del trattamento, «Approva», «Pubblica» e «Cestino». Tutti i tentativi restano consultabili con la loro
   valutazione. I processi senza SLOP stanno in cima al wizard finché l'owner non li accetta o li chiude (sezione 3). «Apri nella
   galleria» apre la griglia filtrata sul batch. Il batch si chiude quando ogni SLOP è decisa e ogni eccezione chiusa.

### Premesse e vincoli

La premessa dice che cosa la foto farebbe credere, che cosa è inventato e quali elementi reali riconoscibili restano in scena.
Per un evento aggiunge un fatto significativo e visibile. Per un oggetto il falso può essere la fotografia stessa: un oggetto realmente
esistito in una scena mai fotografata (decisione dell'owner del 2026-11-21); il fatto inventato non è richiesto e il valutatore non
lo cerca. Per esempio, un ponte alpino può avere una campata con un danno inventato
conservando il luogo e i tratti riconoscibili, una console vintage può rappresentare un modello mai commercializzato plausibile per
epoca e mercato, un presidio immaginato a Parigi può conservare gli elementi della mobilitazione e la Cour Napoléon. La scena ipotetica
non autorizza deduzioni su ciò che è realmente avvenuto. Quando l'idea richiede il riconoscimento di un luogo o di un edificio, prompt e valutazione includono i tratti visibili necessari. Le preferenze di inquadratura e sguardo valgono solo quando naturali.
Si applicano le regole della specifica `contenuti-e-trasparenza`.

## 3. Generazione, valutazione e ripresa

Il Workflow prosegue anche se si chiude la dashboard. Ogni passo a pagamento acquisisce una richiesta persistente prima dell’invio
e registra l’esito in `paid_calls`. Con un’interruzione, i passi mai acquisiti possono essere ripresi dall’owner entro la conferma
già data. I passi con esito incerto non si ripetono automaticamente. Lo stop ferma la fase prima del passo successivo.

Il generatore riceve il prompt inglese approvato. A ogni valutazione la Responses API riceve l’intera candidata corrente prima di
cropping o trattamento, l’ID del tentativo, la premessa approvata, titolo e descrizione della galleria, l'idea che la SLOP sviluppa
(finché il processo è aperto), il prompt approvato e quello corrente,
più la tolleranza congelata. Il modello usa versioni congelate della base e del contesto di valutazione, senza conversazioni precedenti.
La credibilità fotografica ha priorità sui dettagli secondari. I difetti critici e gli ancoraggi obbligatori mancanti impediscono
l’accettazione automatica. Luogo, data e identità non dimostrabili dai pixel sono annotazioni. Una correzione valida aggiunge
un’indicazione fotografica al prompt approvato e conserva l’invenzione e gli elementi reali richiesti. Una riprogettazione richiede
revisione umana. Sono configurabili da 1 a 5 tentativi e tolleranza da 0 a 2. A tolleranza zero, i difetti minori richiedono un altro
tentativo entro il limite.

Un solo batch automatico aperto. Quando termina la generazione si passa alla revisione. Le candidate accettate entrano in libreria
come nuove, senza altre chiamate. Il browser prepara poi la copia di gioco 4:5 con la ricetta WebP comune.
La SLOP eredita la galleria. Per il trattamento si copiano solo formato e misure anonime della REAL: bianco e nero, seppia o colore
derivano da queste (specifica `copie-di-gioco`).
Le REAL restano utilizzabili nelle estrazioni successive e nelle partite.

I processi esauriti, in revisione, falliti o incerti dopo l’avvio della generazione restano in evidenza con immagini, prompt e
valutazioni fino alla decisione dell’owner. «Accetta comunque il tentativo N» permette di accettare qualsiasi candidata intera
salvata e valutata di un processo concluso o sospeso anche in presenza di segnalazioni, elencate nella conferma. Una sola richiesta
acquisisce la decisione, senza chiamate a pagamento. Se il file manca si ripristina lo stato precedente.
La scelta dell’owner si registra separatamente dalla valutazione. Chiusura e manutenzione permettono poi di eliminare le candidate
temporanee dopo sette giorni. Copia, approvazione e pubblicazione restano passaggi distinti.

## 4. Rilascio e dati

La migrazione 0060 aggiunge gallerie, premesse, riferimenti temporanei e contesto per la proposta. Su decisione dell’owner
del 2026-11-18, la migrazione 0061 azzera il D1 attuale al rilascio. Vengono rimossi catalogo, gallerie, tag, batch, tentativi,
partite, classifica, chiamate registrate, impostazioni e loro contesti. La migrazione elimina il registro madre–figlia e richiede
una galleria per ogni immagine e batch. Agisce esclusivamente sul D1.

Il **flusso manuale**, con brief e prompt scritti dall'owner, è stato tolto il 2026-11-22: i suoi processi già registrati conservano il
brief, che fa da vincolo se l'owner ne accetta una candidata fra le eccezioni. Nessuna migrazione: cambia solo il codice.

La SLOP è identificata dal suo ID e non viene analizzata. Per la copia si conservano formato e misure anonime; i riferimenti alle
REAL si eliminano alla fine di ogni processo (sezione 2). Nessun registro permanente: di una REAL resta solo quali sue proposte sono
state usate, non quale SLOP ne è nata.

La migrazione 0069 aggiunge `real_ideas` (idea, genere, cambiamenti, stato, galleria, modello e
versioni del contesto, date), `images.ideas_reason`, `slop_gallery_sources.idea_id`, i trigger che conservano i riferimenti fino
alla fine del processo e la parte `real_ideas` del contesto dei modelli. Le idee si cancellano con la REAL. La migrazione 0070
elimina `galleries.slop_instructions` e la revisione registrata sulle idee, e sostituisce «Premessa e prompt di galleria» con la
nuova proposta, che sviluppa l'idea, se il testo in vigore era ancora quello salvato dalla 0066.

Nei test si usano solo il Worker e lo storage locali con OpenAI simulato. Il rilascio segue le regole di `AGENTS.md`.
