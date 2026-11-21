# Generazione SLOP — specifica 13.0.0

Stato: implementata nel ramo 1.55.0, da rilasciare. Aggiornata: 2026-11-21T23:00:00Z.

## 1. Modalità e bilanciamento

L’avviso in Statistiche confronta i conteggi di REAL e SLOP approvate o pubblicate e mostra a parte le SLOP nuove. L’owner decide la
quantità da generare, da 1 a 10 per batch automatico. Le foto non hanno tag (decisione del 2026-11-20): la galleria le raggruppa.

«Genera SLOP» apre la pagina dedicata della galleria e la usa per entrambe le modalità. Le generazioni recenti e le eccezioni mostrate nello studio sono della
galleria. La revisione del batch mostra le SLOP che si trovano ancora nella galleria di origine. Una SLOP spostata può essere
revisionata dalla galleria di destinazione. Se esiste già un batch automatico, Gallerie e la modalità automatica delle altre gallerie offrono un accesso al batch aperto.

**Manuale.** L’owner scrive prompt inglese e brief con ancoraggi, preferenze, elementi liberi ed esclusioni. Preparare
o modificare il processo prima del primo tentativo è gratuito. Il processo non richiede una REAL né una chiamata che scriva o
riscriva il prompt. I tag di partenza non esistono più: la richiesta che li contiene è rifiutata. I batch manuali creati prima li
conservano nello snapshot privato, senza effetti.

**Automatica.** Dalla decisione dell’owner del 2026-11-18 (#157), le gallerie definiscono quali falsi hanno senso, quali elementi reali
rendono credibile la scena e che cosa deve essere visibile. Si creano da «Nuova galleria» e si aggiornano con «Modifica galleria». Hanno titolo,
descrizione e **Indicazioni SLOP** in testo libero. Ogni REAL appartiene a una galleria, anche con indicazioni vuote. L’owner può chiedere una
proposta di indicazioni al modello dopo aver confermato una chiamata. Il testo entra nel modulo, dove si può modificare, e diventa
operativo con il salvataggio. Indicazioni vuote o composte di soli spazi bloccano la preparazione automatica in dashboard e API.

Le REAL non hanno descrizione editoriale (decisione del 2026-11-20): il modello delle proposte legge direttamente l’originale, il
titolo e la descrizione della fonte, insieme all'idea approvata della REAL.

### Idee di falsificazione delle REAL

Decisioni dell'owner del 2026-11-21. I modi possibili di creare una SLOP da una REAL sono una proprietà della REAL: un'estrazione
casuale non basta, perché per esempio un'edizione limitata si fotografa da sola, in risalto, e non ha senso in una scena affollata. Le
idee permettono di generare SLOP diverse da una REAL versatile e danno una buona confidenza che la falsificazione sia plausibile.

- **Proposta.** Dal dettaglio della REAL, «Proponi idee», o dalla selezione della galleria per le REAL che non ne hanno: una chiamata a
  pagamento per REAL, confermata, mai ripetuta in automatico (`POST /:id/ideas {confirm, request}`, tipo `prompts`). Il modello
  riceve l'originale intero, titolo e descrizione della fonte (ipotesi, non istruzioni), titolo, descrizione e Indicazioni SLOP della
  galleria, l'ultima misura di affollamento e dettaglio, le idee già approvate o usate e il testo modificabile «Idee SLOP delle REAL».
  Restituisce da zero a tre idee, ciascuna con la scena da generare, il genere di foto e che cosa cambia rispetto alla REAL; con zero
  idee, il motivo, che resta sulla REAL. Serve una galleria con Indicazioni SLOP salvate.
- **Al massimo tre idee per REAL**, contando approvate e usate. Una nuova proposta sostituisce le idee solo proposte e chiede quelle
  mancanti; con tre idee approvate o usate è rifiutata.
- **Revisione.** L'owner modifica, approva o scarta ogni idea (`PATCH` e `DELETE /ideas/:id`). Un'idea approvata è legata alla
  galleria e alla revisione delle sue indicazioni: se queste cambiano, o la REAL cambia galleria, l'idea è «da rivedere» ed esce
  dall'estrazione finché non viene approvata di nuovo. Un'idea usata o in un processo aperto non si modifica.
- **Riferimento tra REAL e SLOP.** La REAL ispira la SLOP, non viene copiata. La SLOP eredita galleria, famiglia ed epoca dell'oggetto,
  genere di foto (come si fotografa di solito quel tipo di oggetto), tecnica, luce e livelli di affollamento e dettaglio. Cambiano
  sempre ambiente e punto di vista; l'esemplare può restare lo stesso solo se la scena cambia molto. Composizione, segni
  dell'esemplare (graffi, adesivi, scritte a mano, numeri di serie), scritte e persone della REAL non si riprendono mai. Messe una
  accanto all'altra, REAL e SLOP non devono sembrare due scatti della stessa sessione.
- **Una SLOP per idea.** L'idea diventa «usata» quando la sua SLOP viene accettata, automaticamente o dall'owner. Un processo chiuso
  senza SLOP lascia l'idea disponibile.

## 2. Estrazione, proposte e conferma

1. **Estrai le REAL.** Campione senza ripetizioni tra le REAL approvate o pubblicate della galleria, con originale disponibile in
   quarantena e almeno un'idea approvata libera (non usata, non in un processo aperto, approvata per le indicazioni in vigore). Una
   REAL per estrazione, con una delle sue idee libere scelta a caso. L'estrazione è **corretta su affollamento e dettaglio**
   (`shared/idea-sampling.ts`): ogni asse è diviso in tre fasce (0–33, 34–66, 67–100); per ogni fascia si confronta la quota fra le
   REAL misurate della galleria con quella fra le SLOP già nate da sue idee (le REAL delle idee usate); il peso di una REAL è, per
   ogni asse, il rapporto fra le due quote, tra 0,25 e 4, e i due assi si moltiplicano. Gli assi si correggono separatamente perché
   nove celle congiunte resterebbero quasi vuote. Contano solo le misure della formula in vigore; una REAL senza misura pesa 1.
   Senza correzione le REAL più versatili, di solito le più semplici, uscirebbero più spesso e la semplicità diventerebbe un indizio
   dell'origine. La dashboard mostra miniature, titoli e idea. Tocco o pressione prolungata apre l’originale intero con la
   descrizione della fonte. Con un campione insufficiente il server indica quante REAL con un'idea approvata sono disponibili e
   l’owner può diminuire la quantità. Estrazione, riestrazione e annullamento sono gratuiti. `POST auto/preview {gallery_id,size}`
   firma per 15 minuti ID, revisioni e idee delle REAL, revisione della galleria e configurazione.
2. **Prepara le proposte.** `POST auto/prepare {preview,count,confirm:true}` consuma una volta l’estrazione dopo conferma del massimo
   di una chiamata per REAL. Il Worker ricontrolla galleria, foto e configurazione, congela modelli, qualità, tolleranza, tentativi
   massimi e versioni dei contesti. Il Workflow prepara le proposte in ordine. Per ciascuna REAL il modello riceve l’originale intero
   prima del ritaglio 4:5, titolo e descrizione della fonte della REAL (`reference: {title, description}`), l'idea approvata
   (`idea: {idea, genre, changes}`), i livelli di affollamento e dettaglio della REAL (`levels`, nullo senza misura della formula in
   vigore), titolo e descrizione della galleria, indicazioni SLOP e istruzioni generali. Sviluppa l'idea secondo il riferimento tra REAL
   e SLOP; cita alla lettera le scritte leggibili e indica i conteggi esatti delle parti contabili. Restituisce una frase in italiano
   sul falso e il prompt in inglese, oppure il motivo per cui non può proporre un falso compatibile. Le premesse precedenti aiutano a
   variare il batch. Il testo «Premessa e prompt di galleria» resta modificabile; le regole sull'idea e sul riferimento sono nel codice.
3. **Conferma le immagini.** Le proposte restano disponibili per un’ora dalla preparazione, anche dopo il ricaricamento. La dashboard
   affianca la premessa e il prompt alla REAL e mostra il motivo per gli esiti senza proposta. `POST auto/start {batch,count,confirm:true}`
   conferma il numero esatto di proposte valide e il massimo rimanente di `2N × count` chiamate, con `N` tentativi massimi: una
   generazione e una valutazione per tentativo. Dal 2026-11-20 nessuna analisi segue l’accettazione. La preconferma mostra modelli, qualità, tentativi, tolleranza e
   pianificazione predefinita. La configurazione di `complexity` è trattata nella issue #153. Il server ricontrolla appartenenza, disponibilità, revisioni e scadenza.
   Un cambiamento di galleria o riferimenti invalida le proposte. `POST auto/cancel {batch}` ferma la preparazione prima del passo
   successivo. L’annullamento o la scadenza rimuovono i riferimenti temporanei; la conferma rimuove quelli dei processi che non
   generano. Gli altri restano, con l'idea, fino alla fine del processo: all'accettazione della SLOP l'idea diventa usata e il
   riferimento sparisce; alla chiusura di un processo senza SLOP il riferimento sparisce e l'idea resta disponibile (trigger della
   migrazione 0069, decisione dell'owner del 2026-11-21). Conferme concorrenti acquisiscono una sola
   volta la transizione. Il Workflow delle immagini parte solo con la conferma acquisita.

### Premesse e vincoli

La premessa dice che cosa la foto farebbe credere, che cosa è inventato e quali elementi reali riconoscibili restano in scena.
Per un evento aggiunge un fatto significativo e visibile. Per un oggetto il falso può essere la fotografia stessa: un oggetto realmente
esistito in una scena mai fotografata (decisione dell'owner del 2026-11-21); il fatto inventato non è richiesto e il valutatore non
lo cerca. Per esempio, un ponte alpino può avere una campata con un danno inventato
conservando il luogo e i tratti riconoscibili, una console vintage può rappresentare un modello mai commercializzato plausibile per
epoca e mercato, un presidio immaginato a Parigi può conservare gli elementi della mobilitazione e la Cour Napoléon. La scena ipotetica
non autorizza deduzioni su ciò che è realmente avvenuto. Quando le indicazioni richiedono il riconoscimento di un luogo o di un
edificio, prompt e valutazione includono i tratti visibili necessari. Le preferenze di inquadratura e sguardo valgono solo quando naturali.
Si applicano le regole della specifica `contenuti-e-trasparenza`.

## 3. Generazione, valutazione e ripresa

Il Workflow prosegue anche se si chiude la dashboard. Ogni passo a pagamento acquisisce una richiesta persistente prima dell’invio
e registra l’esito in `paid_calls`. Con un’interruzione, i passi mai acquisiti possono essere ripresi dall’owner entro la conferma
già data. I passi con esito incerto non si ripetono automaticamente. Lo stop ferma la fase prima del passo successivo.

Il generatore riceve il prompt inglese approvato. A ogni valutazione la Responses API riceve l’intera candidata corrente prima di
cropping o trattamento, l’ID del tentativo, la premessa approvata, i vincoli della galleria, il prompt approvato e quello corrente,
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

Il **flusso manuale** genera nella galleria scelta e conserva il proprio brief. La valutazione riceve l’intera candidata, l’ID
del tentativo, il brief, il prompt corrente e la tolleranza, con Base e Valutazione attive. Il massimo è `2N` chiamate
per N tentativi. Al generatore il prompt arriva con il brief come contesto editoriale, senza tag. Le REAL si aggiungono con «Carica REAL» e si
estraggono solo in modo casuale dalla galleria selezionata.

La SLOP è identificata dal suo ID e non viene analizzata. Per la copia si conservano formato e misure anonime; i riferimenti alle
REAL si eliminano alla fine di ogni processo (sezione 2). Nessun registro permanente: di una REAL resta solo quali sue idee sono
state usate, non quale SLOP ne è nata.

La migrazione 0069 aggiunge `real_ideas` (idea, genere, cambiamenti, stato, galleria e revisione delle indicazioni, modello e
versioni del contesto, date), `images.ideas_reason`, `slop_gallery_sources.idea_id`, i trigger che conservano i riferimenti fino
alla fine del processo e la parte `real_ideas` del contesto dei modelli. Le idee si cancellano con la REAL.

Nei test si usano solo il Worker e lo storage locali con OpenAI simulato. Il rilascio segue le regole di `AGENTS.md`.
