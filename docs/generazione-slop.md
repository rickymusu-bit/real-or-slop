# Generazione SLOP — specifica 9.0.0

Stato: implementata nel ramo 1.40.0, da rilasciare. Aggiornata: 2026-11-18T18:13:41Z.

## 1. Modalità e bilanciamento

L’avviso in dashboard confronta i conteggi di REAL e SLOP approvate o pubblicate e mostra a parte le SLOP nuove. L’owner decide la
quantità da generare, da 1 a 10 per batch automatico. I tag descrivono le immagini e si usano come filtri del Database.

**Manuale.** L’owner scrive prompt inglese, tag di partenza e brief con ancoraggi, preferenze, elementi liberi ed esclusioni. Preparare
o modificare il processo prima del primo tentativo è gratuito. Il processo non richiede una REAL né una chiamata che scriva o
riscriva il prompt. I tag di partenza restano nello snapshot privato. Dopo l’accettazione, i tag finali descrivono l’originale prodotto.

**Automatica.** Dalla decisione dell’owner del 2026-11-18 (#157), le gallerie definiscono quali falsi hanno senso, quali elementi reali
rendono credibile la scena e che cosa deve essere visibile. Si creano e modificano in «Database immagini → Gallerie». Hanno titolo,
descrizione e **Indicazioni SLOP** in testo libero. Si possono assegnare REAL anche con indicazioni vuote. L’owner può chiedere una
proposta di indicazioni al modello dopo aver confermato una chiamata. Il testo entra nel modulo, dove si può modificare, e diventa
operativo con il salvataggio. Indicazioni vuote o composte di soli spazi bloccano la preparazione automatica in dashboard e API.

La catalogazione REAL è una chiamata multimodale separata. Vede l’originale intero e il contesto Commons e restituisce insieme tag e
descrizione editoriale neutra con elementi visibili, contesto documentato e incertezze. Il suo contesto non parla delle SLOP.

## 2. Estrazione, proposte e conferma

1. **Estrai le REAL.** Campione casuale uniforme senza ripetizioni tra le REAL approvate o pubblicate della galleria con descrizione
   editoriale valida e originale disponibile in quarantena. La dashboard mostra miniature, titoli e tag. Tocco o pressione
   prolungata apre l’originale intero con descrizione, contesto documentato e incertezze. Con un campione insufficiente il server
   indica quante REAL sono disponibili e l’owner può diminuire la quantità. Estrazione, riestrazione e annullamento sono gratuiti.
   `POST auto/preview {gallery_id,size}` firma per 15 minuti ID, revisioni, ordine delle REAL, revisione della galleria e configurazione.
2. **Prepara le proposte.** `POST auto/prepare {preview,count,confirm:true}` consuma una volta l’estrazione dopo conferma del massimo
   di una chiamata per REAL. Il Worker ricontrolla galleria, foto e configurazione, congela modelli, qualità, tolleranza, tentativi
   massimi e versioni dei contesti. Il Workflow prepara le proposte in ordine. Per ciascuna REAL il modello riceve l’originale intero
   prima del ritaglio 4:5, titolo, profilo editoriale, contesto Commons documentato, titolo e descrizione della galleria, indicazioni
   SLOP e istruzioni generali. Restituisce una frase in italiano sul falso concreto e il prompt in inglese, oppure il motivo per cui
   non può proporre un falso compatibile. Le premesse precedenti aiutano a variare il batch. I tag non dirigono la nuova generazione.
3. **Conferma le immagini.** Le proposte restano disponibili per un’ora dalla preparazione, anche dopo il ricaricamento. La dashboard
   affianca la premessa e il prompt alla REAL e mostra il motivo per gli esiti senza proposta. `POST auto/start {batch,count,confirm:true}`
   conferma il numero esatto di proposte valide e il massimo rimanente di `(1 + 2N) × count` chiamate, con `N` tentativi massimi.
   Include generazione, valutazione e tag dopo accettazione. La preconferma mostra modelli, qualità, tentativi, tolleranza e
   pianificazione predefinita. La configurazione di `complexity` è trattata nella issue #153. Il server ricontrolla appartenenza, disponibilità, revisioni e scadenza.
   Un cambiamento di galleria o riferimenti invalida le proposte. `POST auto/cancel {batch}` ferma la preparazione prima del passo
   successivo. La conferma, l’annullamento o la scadenza rimuovono i riferimenti temporanei. Conferme concorrenti acquisiscono una sola
   volta la transizione. Il Workflow delle immagini parte solo con la conferma acquisita.

### Premesse e vincoli

La premessa dice che cosa la foto farebbe credere, che cosa è inventato e quali elementi reali riconoscibili restano in scena.
Per un evento aggiunge un fatto significativo e visibile. Per esempio, un ponte alpino può avere una campata con un danno inventato
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
come nuove e l’analisi dei tag vede l’originale intero. Il browser prepara poi la copia di gioco 4:5 con la ricetta WebP comune.
La SLOP eredita la galleria. Per il trattamento si copiano solo misure e parametri tecnici anonimi di colore, supporto e geometria.
Le REAL restano utilizzabili nelle estrazioni successive e nelle partite.

I processi esauriti, in revisione, falliti o incerti dopo l’avvio della generazione restano in evidenza con immagini, prompt e
valutazioni fino alla decisione dell’owner. «Accetta comunque il tentativo N» permette di accettare qualsiasi candidata intera
salvata e valutata di un processo concluso o sospeso anche in presenza di segnalazioni, elencate nella conferma. Una sola richiesta
acquisisce la decisione e la conferma comprende al massimo una chiamata per i tag. Se il file manca si ripristina lo stato precedente.
La scelta dell’owner si registra separatamente dalla valutazione. Chiusura e manutenzione permettono poi di eliminare le candidate
temporanee dopo sette giorni. Copia, approvazione e pubblicazione restano passaggi distinti.

## 4. Compatibilità e dati

La migrazione 0060 aggiunge gallerie, appartenenza facoltativa, premesse e riferimenti temporanei. Le immagini pregresse sono
consultabili e assegnabili dal Database. Nei nuovi batch (pipeline 3) i riferimenti sono eliminati anche quando una proposta scade
senza intervento, tramite manutenzione. Sulle SLOP e nel registro storico di disponibilità non vengono scritti ID delle REAL sorgenti.
Restano galleria, processo, tentativi, metadati della SLOP e registro tecnico delle chiamate.

I processi storici mantengono il contratto precedente. I batch automatici di pipeline 2 riprendono i passi compatibili con descrizione
e tag salvati, una chiamata testuale per brief e prompt e le prenotazioni di `slop_reference_uses`. Le prenotazioni storiche durano
finché esiste la figlia, anche nel cestino. La chiusura di un processo senza figlia libera la prenotazione. Le occupazioni del registro
storico non limitano le nuove estrazioni di galleria né le partite. I batch storici di pipeline 1 restano consultabili in revisione.

La valutazione di pipeline 2, manuale o storica, riceve l’intera candidata corrente e un JSON con `attempt_id`, `brief` con i
quattro gruppi di vincoli, `prompt` corrente, `composition_preference` e `tolerance`. Usa i contesti Base e Valutazione attivi,
le regole fisse, uno schema JSON e un limite di 8000 token. Ogni richiesta è indipendente. I prompt rivisti conservano ancoraggi
ed esclusioni del brief. Il massimo nel flusso manuale è `1 + 2N`; quello storico comprende anche la preparazione del brief.
La migrazione conserva lo storico dei contesti dei modelli, incluso il testo per scrivere i brief storici.

La SLOP è identificata dal suo ID. La sua analisi riceve prompt e descrizione aggiuntiva se presente e cataloga i tag osservati
sull’originale. Per le copie si conservano le misure anonime e i parametri tecnici della ricetta.

Nei test si usano solo il Worker e lo storage locali con OpenAI simulato. Il rilascio segue le regole documentate in `AGENTS.md`.
