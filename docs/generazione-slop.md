# Generazione SLOP — specifica 19.2.0

Aggiornata: 2026-11-27T16:50:59Z. Stato: implementata nel ramo 1.70.0, da rilasciare.

![Schema completo della pipeline](assets/pipeline-slop.svg)

Schema vettoriale in `docs/assets/pipeline-slop.svg`, sorgente Graphviz in `docs/assets/pipeline-slop.dot`; copia pubblica
identica in `public/docs/pipeline-slop.svg`, collegata dal wizard. Decisione dell'owner del 2026-11-26: a ogni modifica della
pipeline lo schema si aggiorna nella stessa PR; `npm run diagram:pipeline` rigenera entrambe le copie e la build verifica la
firma della sorgente e l'identità delle copie. Il flusso segue i quattro passi della pagina, con linguaggio semplice, costi in
numero di chiamate e separazione fra scelta, conferma e lavoro del modello. La valutazione resta facoltativa e confermata.
Il comando di rigenerazione richiede Graphviz; il controllo di build usa solo Node e non richiede Graphviz.

Decisione dell’owner del 2026-11-25: tutta l’interfaccia amministrativa è in inglese, incluse gallerie, wizard REAL, pipeline SLOP, assi, parametri, conferme, errori, statistiche, impostazioni e schema della pipeline. I nuovi testi dei modelli sono in inglese; le scritte visibili nelle foto si trascrivono nella lingua originale. Titoli, descrizioni delle fonti, regole personalizzate e dati storici conservano la lingua salvata. Il sito pubblico resta in italiano.

## 1. Obiettivo e stato dell'implementazione

Decisioni dell'owner del 2026-11-24 e 2026-11-25: generare fotografie che sembrino appartenere alla galleria delle REAL,
partendo dalle loro descrizioni testuali in inglese. La varietà comprende elementi nuovi ma plausibili e combinazioni ordinarie.
Evitare copie riconoscibili delle REAL e tratti ricorrenti che distinguano il dataset SLOP, per esempio usura sempre accentuata,
edizioni speciali troppo frequenti o composizioni commerciali sistematiche.

La 1.60.0 sostituisce i controlli del wizard della galleria con il protocollo qui descritto. L'elenco delle sorgenti comprende
tutte le REAL della galleria fuori dal cestino; nessuna è preselezionata per la creazione delle scene. Le vecchie API e i processi editoriali restano compatibili per i dati precedenti;
un riquadro di recupero mostra i processi precedenti ancora da decidere. Il nuovo wizard non usa il vecchio ciclo automatico.

Le migrazioni 0073 e 0074 aggiungono profili e scene privati su `images`, impostazioni su `galleries` e `pipeline_jobs` temporanei.
Ogni lavorazione ha un Workflow e uno stato persistente. Le fasi manuali richiedono conferma; l’approvazione include l’osservazione automatica mancante. Il Workflow non ritenta
passi a pagamento. La coda acquisisce al massimo tre operazioni contemporanee; le preparazioni delle REAL di una stessa galleria (descrizione e parametri, anche in riscrittura) una alla volta, decisione dell'owner del 2026-11-26, perché ognuna legga il dizionario scritto dalla precedente. Le operazioni in attesa di una galleria non bloccano le altre gallerie né le altre fasi. Le richieste ancora in attesa si possono annullare gratuitamente;
quelle già inviate terminano senza avviare altre fasi. Dopo quindici minuti una richiesta acquisita senza esito passa all'attenzione dell'owner, senza reinvio automatico.

### Progresso e blocco della pagina

Decisione dell’owner del 2026-11-26: ogni operazione a pagamento blocca la pagina dall’invio confermato fino al termine dei lavori sul server, compresa la generazione dei parametri REAL. La finestra di progresso mostra fase, completati sul totale e richieste pendenti. Il dialogo modale blocca puntatore, tastiera e navigazione sottostanti; Esc non lo chiude.

Il browser accoda una sola volta e osserva lo stato con letture gratuite: la risposta «queued» non chiude la finestra. La preparazione REAL, le scene, la generazione, la valutazione e gli interventi locali usano lo stesso comportamento, singolarmente o in gruppo. La maschera di correzione e la conferma del massimo precedono sempre l’avvio della spesa. Nessuna fase successiva viene avviata da sola.

La finestra offre «Stop queued requests»: dopo che l’accodamento è completo, la conferma annulla gratuitamente ciò che non è stato inviato; i lavori acquisiti terminano. Le operazioni ferme o fallite si segnalano e rilasciano il blocco. Un errore di lettura del progresso indica che il server può continuare: tornare alla pagina riprende l’osservazione, senza ritentare richieste a pagamento. Anche reload, scheda nascosta e chiusura del browser lasciano proseguire il server. I lavori già attivi vengono osservati in una nuova finestra modale al ritorno, senza nuove conferme di spesa.

### Comandi e conferme

- **Prepara la galleria:** una chiamata per REAL ancora priva di profilo, su originale intero. Salva descrizione inglese,
  identità, genere, parametri osservati e particolarità. Riusa i profili già presenti. I dati sono rivedibili senza chiamate.
- **Riscrivi i parametri di tutte le REAL** (decisione dell'owner del 2026-11-26): una chiamata con immagine per REAL senza
  altri lavori attivi, confermata con il numero esatto, eseguita in serie. Conserva la descrizione, che resta un riferimento da
  verificare sull'immagine, e sostituisce parametri, particolarità e politiche modificate dall'owner. Le REAL con un altro lavoro
  attivo sono saltate e segnalate, senza addebito. Durante la preparazione di una galleria la pianificazione delle scene è rifiutata.
- **Unisci categorie:** sotto la composizione della galleria, gratuito. L'owner sceglie una caratteristica, spunta le
  categorie equivalenti e indica il nome unificato; il server lo applica ai profili REAL e SLOP della galleria con un
  controllo sul testo salvato, senza toccare valori liberi, descrizioni o lavori già congelati. Rifiutato mentre è in corso
  una preparazione delle REAL.
- **Regole e probabilità:** modificabili per galleria. Ogni probabilità vuota usa la stima automatica; zero disabilita un controllo.
  L'ambiente può restare invariato, variare entro lo stesso genere o cambiare insieme al genere.
- **Scegli le REAL:** nel passo 2 una griglia sempre visibile mostra miniatura e titolo di ogni REAL. Si possono selezionare
  solo quelle con descrizione e profilo e senza altre lavorazioni; le altre indicano perché sono disabilitate. «Select all ready
  REAL» seleziona soltanto quelle utilizzabili, «Clear selection» azzera le scelte. Conteggio, stato parziale della selezione
  collettiva e pulsante scene si aggiornano subito senza ricaricare o cancellare campi ancora in modifica. La selezione resta
  durante gli aggiornamenti della pagina, viene ripulita per le sorgenti diventate indisponibili e riparte vuota al reload.
  Le miniature mostrano il numero di generazioni iniziali riuscite e registrate dalla 1.66.0 più gli usi storici verificati (sezione 4.2), incluse candidate poi scartate;
  correzioni e chiamate fallite/incerte non incrementano il contatore. Le REAL restano riutilizzabili; gli usi senza prove
  sufficienti restano esclusi. Si conservano solo totale e baseline numerica sulla REAL, senza legame permanente alle SLOP.
  Il comando invia esclusivamente gli ID selezionati con il massimo corrispondente; zero selezionate disabilita il pulsante.
- **Prepara scene:** una chiamata per REAL selezionata e preparata. Le estrazioni e i riferimenti vengono congelati. Sono
  mostrate le modifiche e le dipendenze. L'owner modifica i campi della scena, il formato e i parametri previsti senza pagare.
- **Genera:** una chiamata per scena salvata, anche collettivamente dopo conferma del massimo. Una candidata non è accettata
  dal modello: resta da vedere. **Valuta** è una fase confermata separata, una chiamata per candidata, disponibile anche in gruppo.
- **Correggi:** ogni proposta apre un'anteprima della maschera sull'immagine intera, con benefici e rischi e zona rettangolare
  modificabile. Solo la conferma finale autorizza una chiamata a `images/edits`. La valutazione precedente resta visibile;
  nessuna valutazione aggiuntiva viene avviata. Il prima/dopo viene conservato fino alla decisione.
- **Accetta:** trasferisce l'immagine intera nella libreria come nuova. Elimina il riferimento alla REAL e i file temporanei
  mediante coda durevole. Decisione dell’owner del 2026-11-27: subito dopo l’accettazione nel passo 3, il browser prepara
  automaticamente la copia di gioco WebP 4:5 con trattamento, senza nuove chiamate ai modelli. L’originale intero centrato
  con bande nere è l’inquadratura iniziale. Un avviso blocca i comandi durante la preparazione. L’API di accettazione restituisce
  i metadati aggiornati, comprese le misure del riferimento del trattamento appena salvate. Non approva né pubblica.
  Se il browser si chiude o l’upload fallisce, la foto accettata resta nel passo 3 con stato/errore; al ritorno o con il normale
  aggiornamento si completa soltanto la copia mancante. Nessuna nuova accettazione, generazione o valutazione. Un errore non
  causa tentativi continui nella stessa pagina. Le copie già salvate e le scelte dell’owner sono conservate.
- **Revisione finale e pubblicazione:** il passo 4 mostra solo le copie pronte; permette di confrontarle con l’originale,
  modificare gratuitamente trattamento o inquadratura e approvare. Non contiene un comando per preparare la copia. L’approvazione SLOP include l’osservazione automatica
  dell’originale mancante, al massimo una chiamata; un profilo valido viene riusato. La misura tecnica delle copie REAL mancanti
  è calcolata dal browser. Il riferimento del trattamento è campionato fra REAL misurate dello stesso genere di destinazione;
  senza riferimento disponibile la copia parte senza trattamento. Approvare fa uscire la SLOP dal passo 4, senza eliminarla;
  si ritrova nella galleria e da lì si pubblica. Dal 2026-11-27 il passo 4 permette di selezionare le SLOP con copia pronta:
  spunte individuali, «Select all ready SLOP», «Clear SLOP selection» e «Approve N selected SLOP». Nessuna preselezione;
  selezione parziale e conteggi si aggiornano subito senza cancellare campi ancora in modifica. Le foto senza copia restano nel passo 3, fuori dalla selezione finale.
  La scelta resta durante gli aggiornamenti, si ripulisce per foto approvate/rimosse/non più pronte e riparte vuota al reload.
  Una sola conferma verifica che l’owner abbia controllato originali e copie dell’intero gruppo; nessuna conferma separata per
  l’osservazione automatica, al massimo una chiamata per foto non osservata. `POST /api/admin/library/bulk` usa solo gli ID scelti
  con `action=set-approved`, in richieste di massimo 500 foto. Il server ricontrolla stato e copia. Le approvate escono dal passo;
  gli esiti parziali indicano ID e motivo senza bloccare le altre. Il progresso segue solo le foto approvate o dall’esito d’invio
  incerto, senza osservazioni aggiuntive sulle foto esplicitamente rifiutate. Il passo 4 mostra tutte le SLOP di pipeline nuove con copia pronta, senza il vecchio limite di 100. Inquadratura e cursori riusano gli editor esistenti.

API private: `GET /api/admin/pipeline/:gallery` e `/status` (solo stato dei lavori, usato durante l’attesa); `POST /:gallery/settings`, `/profile`, `/categories`, `/prepare`, `/plan`, `/observe`, `/stop`;
`POST /:gallery/:job/{scene,generate,evaluate,edit,accept,close}`; `GET /:gallery/:job/file` e `?previous=1`.
Le fasi manuali a pagamento richiedono `confirm`, UUID `request` e `max_calls` esatto. L’osservazione automatica inclusa nell’approvazione usa la claim del server (sezione 4.1). Dal 2026-11-26 la preparazione accetta fino a 5000 REAL in una richiesta: tutta la selezione viene accodata atomicamente prima dell’avvio, senza dipendere da una successione di richieste del browser. Lo stesso comando prepara descrizioni e profili da Import REAL, galleria e dettaglio. `GET /api/admin/pipeline/:gallery/descriptions` espone l’avanzamento senza i profili completi. Il planner conserva il limite di 500 scene per richiesta, con suddivisione delle selezioni maggiori entro il massimo confermato.
Modelli e qualità sono quelli selezionati nelle Impostazioni; il selettore include GPT-6.2 Sol e Sunburst.

## 2. Descrizioni, assi e regole della galleria

Il modello descrive l'originale REAL **intero**, prima di ritaglio e trattamento, su otto assi:
`subject_type`, `subject_appearance`, `people`, `environment`, `viewpoint`, `light`, `technique`, `rendering`.
La descrizione è privata, in inglese, distinta da quella Commons. Si prepara al caricamento o successivamente in gruppo;
una REAL senza descrizione è segnalata sulla miniatura (specifica `libreria-immagini`).

Descrivere una singola scena fotografica: soggetti, superfici visibili, posa e sostegni, fotocamera, ambiente, luci, ombre,
fuoco, medium e resa. Le parti nascoste del prodotto non diventano oggetti da mostrare. Distinguere osservazioni, inferenze
e dettagli non determinabili. Trascrivere le scritte leggibili nella lingua originale: conservarle nell'analisi non significa
che debbano essere riprodotte nella SLOP.

Le regole della galleria accompagnano il generatore di testo: modelli compatibili, vincoli fisici e generi fotografici presenti.
Per Nintendo: `docs/regole-galleria-console-nintendo.md`. Sono costruite sulle REAL, rivedibili dall'owner, non dedotte dal solo
titolo. Non impongono marcatori visivi comuni a ogni SLOP. Decisione dell’owner del 2026-11-26: gli indici delle descrizioni sono rimossi, insieme ai comandi e alle API di indicizzazione (migrazione 0076). Il planner usa direttamente i profili validi e le descrizioni delle altre REAL della stessa galleria, dando precedenza alla stessa categoria di modello. Mantiene lo stesso genere quando non è richiesto un cambio di genere e passa fino a tre descrizioni di supporto. Non esegue ricerca semantica di ambienti né chiamate di embedding. Le scelte e i riferimenti sono congelati nella lavorazione. Il bilanciamento e le probabilità continuano a usare i parametri osservati nei profili, indipendentemente dai riferimenti di supporto. Le statistiche usano le annotazioni disponibili. Crowding e detail sono ritirati dal 2026-11-26: non influiscono sulla pipeline, non vengono misurati né inviati ai modelli. Le misure tecniche per il trattamento restano distinte e attive.

### Informazioni nel passo 3 e controllo della diversità

Il passo 3 mostra lo stato della lavorazione e, in «English scene and parameters», i controlli selezionati per la variazione,
le modifiche previste, le dipendenze, il genere, il formato e la scena sugli otto assi. «Intended parameters after variation»
contiene il profilo richiesto, distinto da quello osservato sulla SLOP dopo l’approvazione. Sono visibili la candidata intera,
il rapporto richiesto e le dimensioni ricevute, più il prima dopo una correzione. Se richiesta, la valutazione mostra giudizio,
difetti, incertezze e interventi suggeriti con beneficio, rischio e istruzione locale. Nessuna valutazione è inventata in sua assenza.

Per aumentare lo scostamento dalla REAL, nel passo 2 si aumentano le probabilità dei parametri che si desidera variare.
«Environment and genre» permette anche il cambio di ambiente nello stesso genere o insieme al genere. «Chance of plausible
new values (%)» controlla la probabilità di consentire valori nuovi nei soli parametri selezionati: non è un cursore generale
di distanza né il numero di parametri cambiati. Un parametro estratto può comunque ricevere un valore ordinario o uguale
alla sorgente, e i vincoli di compatibilità restano validi. Si salvano le impostazioni prima di preparare nuove scene;
quelle già preparate conservano lo snapshot precedente, pur restando modificabili manualmente.

## 3. Parametri controllabili

Gli assi restano la struttura della descrizione finale. I parametri definiscono cosa variare separatamente, rispettando le
dipendenze fisiche e storiche. La tabella specializza il protocollo per Nintendo; altre gallerie richiedono parametri pertinenti.

| Parametro | Significato | Asse principale |
|---|---|---|
| `model` | Famiglia e modello della console | `subject_type` |
| `colour` | Colore della scocca e dei componenti | `subject_appearance` |
| `material_finish` | Materiale, opacità, trasparenza e finitura | `subject_appearance` |
| `edition_decoration` | Edizione, personalizzazione, grafiche e adesivi | `subject_appearance` |
| `wear` | Abrasione, graffi da uso, superfici lucidate dal contatto | `subject_appearance` |
| `damage` | Fratture, scheggiature, deformazioni e parti mancanti | `subject_appearance` |
| `ageing` | Ingiallimento, scolorimento, ossidazione e deterioramento nel tempo | `subject_appearance` |
| `cleanliness` | Polvere, impronte, sporco e residui rimovibili | `subject_appearance` |
| `operating_state` | Accesa/spenta; configurazione aperta/chiusa quando applicabile | `subject_appearance` |
| `screen_content` | Gioco/applicazione, schermata, testi, valori e disposizione visibili | `subject_appearance` |
| `pose` | Posizione e orientamento del soggetto rispetto al piano e al sostegno | `viewpoint`, con vincoli di `environment` |
| `viewpoint` | Posizione e angolo della fotocamera rispetto al soggetto | `viewpoint` |
| `composition` | Distanza, dimensione nel fotogramma, decentramento e taglio | `viewpoint` |
| `aspect_ratio` | Rapporto larghezza/altezza del fotogramma intero, con orientamento verticale/orizzontale/quadrato | `viewpoint`, coordinato con `technique` |

Il contenuto dello schermo è distinto da acceso/spento. Un menu può cambiare mantenendo la console accesa. Gioco, schermata e
dati di salvataggio devono essere plausibili per modello ed epoca. A schermo spento o nascosto, `screen_content` è non applicabile:
estrarlo non accende la console e non cambia implicitamente l'inquadratura. Se non estratto, il contenuto può restare quello
descritto; dati identificativi copiati sono comunque un rischio di eccessiva somiglianza da segnalare alla revisione.
Non imporre che ogni schermo cambi sempre, creando un'altra regolarità sistematica.

Il rapporto d'aspetto è un parametro distinto dalla composizione. Annotarlo dalle dimensioni dell'originale intero dopo
l'orientamento EXIF, prima del ritaglio 4:5. Se non estratto, conservarlo; se estratto, scegliere un valore compatibile con
soggetto, posa e genere fotografico. Bilanciare le frequenze tenendo conto di queste relazioni: console e generi diversi
possono avere formati diversi. Evitare un formato SLOP uniforme imposto per comodità tecnica.

Il rapporto scelto deve essere coerente sia nel prompt sia nelle dimensioni richieste all'API. Se l'API non lo supporta,
segnalare l'approssimazione e registrare rapporto richiesto ed effettivo; non sostituire silenziosamente un verticale con
un orizzontale né tagliare parti fondamentali per adattarlo. La copia di gioco resta 4:5 per REAL e SLOP: `aspect_ratio`
controlla la fotografia intera e non cambia il formato comune servito durante la partita.

Quando si conserva il punto di vista, mantenere anche distanza e resa prospettica compatibili. Una prospettiva meno accentuata
può suggerire una fotocamera più lontana, con focale maggiore per un'inquadratura simile, ma non dimostra una focale precisa.
La prospettiva dipende dalla posizione della fotocamera; cambiare solo focale dalla stessa posizione cambia l'inquadratura.
Descrivere l'effetto visibile e le dipendenze senza inventare dati ottici o EXIF della REAL.

Le annotazioni devono essere atomiche: il colore non include accessori, la composizione non sostituisce lo sfondo, la posa non
importa il piano d'appoggio del donatore. Usura, danno, invecchiamento e pulizia hanno valori separati, compresa assenza e non
determinabile. Un valore ignoto non prova l'assenza di un fenomeno. Persone, accessori e numero dei soggetti non diventano nuove
variazioni attive in questo test. I profili sono JSON privati validati, salvati in `images.pipeline_profile`; i controlli sono definiti in `shared/pipeline.ts`.

Categorie canoniche (2026-11-26, segnalazione dell'owner: «object documentation» e «object_documentation» contate come
categorie diverse). Genere e `category` di ogni parametro sono chiavi di bilanciamento, non testo libero: si salvano e si
confrontano in forma canonica (minuscole, accenti rimossi, ogni sequenza di caratteri non alfanumerici sostituita da `_`;
una categoria vuota diventa `unspecified`). La normalizzazione si applica in lettura anche ai profili salvati prima, per
statistiche, estrazioni, riferimenti, campione del trattamento e accettazione, e in scrittura per profili preparati, modificati
dall'owner, proposti dal planner e accettati. Il valore libero (`value`) e le particolarità restano invariati. Le chiamate
di preparazione e di pianificazione ricevono `known_categories`, le categorie già usate nella galleria per genere e parametro
(dizionario completo per chiave, ordinato per frequenza, escluse le osservazioni ignote; limite tecnico di 200 voci), con
l'istruzione di riusare il nome esistente quando indica la stessa cosa. Una categoria nuova segue un formato fisso: inglese,
snake_case minuscolo, sostantivo singolare che nomina la classe e non l'esemplare, senza articoli, date o conteggi, senza parole
che appartengono a un altro parametro (il modello non contiene colore, edizione o condizione; il genere non nomina il soggetto),
nello stesso stile delle voci esistenti; i dettagli precisi stanno in `value`. Il formato tipografico è comunque imposto dal
codice con la normalizzazione. Per la preparazione l'elenco si legge all'avvio di ogni lavoro, in serie, così ogni REAL vede le
categorie di quelle già completate; le REAL ancora in coda di preparazione sono escluse, quindi una riscrittura ricostruisce il
dizionario solo dai profili già riscritti. Sinonimi non ortografici («catalog product photograph» e «catalog product photography»)
non vengono fusi automaticamente: li unisce l'owner con il comando gratuito.

## 4. Estrazione e bilanciamento

Estrarre **zero o più parametri**, ciascuno con probabilità configurabile per galleria. Distinguere la probabilità di modificarlo
dalla distribuzione del nuovo valore: include valori ordinari, assenza del tratto e valori uguali al punto di partenza.
Modificare non significa intensificare: una console danneggiata può diventare integra, una personalizzata può diventare standard.
Non forzare almeno una modifica vistosa.

Probabilità e valori devono riflettere la composizione delle REAL della galleria, considerando visibilità, dati ignoti e
compatibilità con il soggetto. Il generatore di testo può proporre valori plausibili non presenti nelle REAL (un altro colore,
tema o danno), senza sovrarappresentare le novità. Il protocollo non si limita a permutare elementi esistenti.

Controllare distribuzioni individuali, combinazioni rilevanti e ricorrenze nelle SLOP: campionare i valori indipendentemente non
conserva tutte le correlazioni delle REAL. Evitare duplicati riconoscibili lasciando che gli elementi comuni nelle REAL siano
comuni anche nelle SLOP; non imporre unicità a ogni immagine. Scartare o adattare un valore incompatibile dichiarandone il motivo,
senza introdurre modifiche nascoste degli altri parametri. La stima automatica di selezione per parametro è `clamp(1 − quota_della_categoria_più_frequente, 0.05, 0.4)`.
Decisione dell'owner del 2026-11-26: estrazione coerente dei parametri dipendenti e bilanciamento delle scene dello stesso gruppo.
La selezione resta indipendente per parametro e usa le probabilità configurate; non forza ulteriori modifiche.
I valori selezionati si estraggono congiuntamente da una stessa REAL per ciascun gruppo:
- modello, colore, materiale/finitura, edizione/decorazione, stato di funzionamento e contenuto dello schermo;
- posa, punto di vista, composizione e rapporto d'aspetto;
- usura, danno, invecchiamento e pulizia restano quattro estrazioni separate.

I campi non selezionati con evidenza nota vincolano il donatore alle categorie iniziali. I campi selezionati richiedono evidenza
nota su tutto il gruppo: `certainty=unknown`, categorie `unknown` e `unspecified` non sono donatori. Lo schermo appartiene al
modello estratto dallo stesso donatore, oppure al modello iniziale noto. Estrarre solo il contenuto non rivela uno schermo
nascosto o inattivo. La fotografia usa lo stesso genere salvo `change_genre`. Se manca una combinazione compatibile si
conservano i valori iniziali del gruppo: nessun ripiego su modelli o generi diversi e nessun parametro aggiunto alla selezione.
La compatibilità è per categorie osservate, non una prova di plausibilità fisica; il planner e la revisione restano necessari.
Il filtro conservativo può ridurre le variazioni effettive quando la galleria è piccola o le annotazioni incomplete.

I pesi correggono sotto/sovrarappresentazione della combinazione dei campi selezionati, entro lo stesso insieme di compatibilità
per REAL e SLOP, con prior equivalente a cinque osservazioni proporzionali alle REAL e pesi limitati a 0.25–4. Prima delle SLOP,
le combinazioni conservano le frequenze empiriche dei donatori. La scelta resta casuale, senza quote rigide o unicità imposta.
Durante una richiesta di pianificazione ogni nuova estrazione aggiunge al conteggio locale una previsione anonima: profilo
iniziale più valori estratti. Le scene successive considerano quindi SLOP accettate già osservate e previsioni precedenti della stessa
richiesta. `drawContext` registra versione dell'algoritmo, numero di accettate e numero di previsioni precedenti nella snapshot.
Richieste già registrate e REAL occupate non producono estrazioni provvisorie nuove. Le snapshot già registrate restano immutate
nei reinvii. Nessun conteggio provvisorio diventa una foto, una statistica pubblica o un registro permanente; chiudere un gruppo
non lascia riserve da sottrarre. Richieste separate, comprese quelle simultanee o divise dal browser oltre 500 scene, bilanciano
separatamente: il meccanismo non è una quota globale transazionale.

I profili recenti passati al planner sono le osservazioni degli ultimi tre accettati misurati, in ordine di creazione.
I conteggi provvisori della singola richiesta rappresentano soltanto l'estrazione prima degli adattamenti del planner e non
entrono nelle statistiche del catalogo. Il catalogo si confronta e si bilancia solo sulle osservazioni disponibili delle SLOP;
non si usa il profilo richiesto come ripiego. Nessuna tassonomia chiusa o correzione automatica delle immagini.

### 4.1 Osservazione delle SLOP e copertura del confronto

Decisione dell'owner del 2026-11-26: l'analisi della galleria usa le categorie **osservate nelle SLOP**, non quelle richieste.
Decisione dell’owner del 2026-11-27: ogni SLOP viene osservata **automaticamente quando è approvata**, dal wizard, dal dettaglio,
dalle azioni in gruppo e dalle API. L’approvazione autorizza al massimo una chiamata per originale mancante, senza conferma
separata. L’interfaccia indica questa conseguenza dell’approvazione; non presenta pulsanti «Observe SLOP». Accettare una candidata
o prepararne la copia non avvia ancora l’osservazione. Un profilo già valido viene riusato.

Lo stato approvato, la claim `images.slop_observation_request` e il lavoro sono scritti nella stessa transazione. Un’approvazione
concorrente/stale non accoda altri lavori. La coda condivisa avvia il Workflow sul server anche se la pagina viene chiusa; una
claim durevole conserva il primo tentativo anche dopo errore, annullamento o chiusura del lavoro. Non vengono creati retry automatici.
La migrazione 0080 conserva anche le richieste precedenti trovate nei lavori o nel registro delle chiamate. Se mancano modello,
Workflow o archivio privato, un’approvazione che richiede una nuova osservazione fallisce prima di cambiare lo stato della foto.
L’osservazione è distinta dalla valutazione qualitativa e non modifica la pubblicazione.

L'annotatore usa schema e convenzioni degli attributi REAL e il vocabolario dei profili REAL della galleria; riceve solo
immagine originale, dimensioni e vocabolario. Non riceve titolo, REAL ispiratrice, prompt, scena, parametri richiesti,
valutazione o regole di variazione. Non scrive una descrizione SLOP. Orientamento e rapporto del profilo sono calcolati dalle
dimensioni effettive del file. Profili e metadati di osservazione (modello e data) sono privati in `images.pipeline_slop_observation`;
`images.pipeline_profile` resta il profilo richiesto, utile a ricostruire la scena ma escluso dal confronto e dai pesi.

La tabella confronta osservazioni REAL e osservazioni SLOP con conteggio della copertura: osservate sul totale ed elenco delle
mancanti. Le nuove si osservano all’approvazione; gli adeguamenti del pregresso si gestiscono operativamente tramite API. Le foto fuori dal cestino contano anche mentre si prepara la copia o dopo approvazione e
pubblicazione. Le foto non misurate non forniscono evidenza e sono escluse dai pesi delle SLOP accettate e dai recenti.
Le categorie con certezza ignota non diventano evidenza di assenza. Le osservazioni sono giudizi del modello, non una garanzia.

Gli invii automatici sono persistenti, con UUID e una sola operazione per foto. L’API operativa `POST /:gallery/observe` resta
disponibile per adeguamenti autorizzati, con UUID e massimo esatto fino a 500 SLOP per richiesta; non è collegata a pulsanti admin. Cache e claim concorrente impediscono un secondo addebito per una foto già osservata.
Incertezza e fallimento restano visibili senza reinvio automatico. Il salvataggio controlla galleria, originale, cestino e testo
osservato precedente, così non applica il risultato a una foto spostata o cambiata durante la chiamata. Modificare copia o stato
di approvazione non invalida la lettura dell'originale. Il registro pagato usa `analysis`; nessun importo.

Migrazione 0078: aggiunge osservazioni e contatore alle foto e una claim del conteggio sui lavori. La registrazione della
prima candidata e l'incremento sulla REAL avvengono nella stessa transazione, al massimo una volta per lavoro; gli edit non
incrementano. Nessuna cancellazione di dati esistenti. I contatori della 0078 partono da zero e le osservazioni da null, senza chiamate.

Il browser legge soltanto `GET /api/admin/pipeline/:gallery/observations`: ID, presenza di un profilo valido e stato/errore del lavoro,
senza profili o snapshot. Durante l'osservazione mostra progresso bloccante e stop gratuito delle richieste in coda; tornando
alla galleria segue solo i lavori attivi, senza conferme né invii nuovi. Errori ed esiti incerti richiedono revisione nella pipeline.

### 4.2 Recupero dei conteggi precedenti (2026-11-27)

La migrazione 0079 recupera gratuitamente un minimo verificabile dai `paid_calls` già esistenti. Una lavorazione conta solo
se la sua chiave nel formato `pipeline-<UUID richiesta scena>-<UUID REAL>-<UUID operazione>` identifica una REAL ancora presente,
una chiamata immagini è conclusa e una successiva valutazione è conclusa prima dell'applicazione della 0078 (`d1_migrations.applied_at`).
La valutazione prova che la candidata era già stata salvata prima del nuovo contatore. Generazione ed edit della stessa lavorazione
contano una volta; esiti incerti, soli prompt, chiavi non valide e chiamate senza questa prova sono esclusi. Il dato non equivale
al numero di SLOP pubblicate. Non si ricostruisce alcun abbinamento REAL–SLOP accettata.

`slop_legacy_generated_count` conserva solo la baseline numerica già aggiunta a `slop_generated_count`, così il recupero non
somma due volte gli stessi usi e preserva i conteggi nuovi. Originali, copie, osservazioni, stati, revisioni e registro pagato restano
intatti. Gli adeguamenti necessari alle foto preesistenti dopo una modifica o un bug fix della pipeline sono a cura dell’agente tramite
API (autorizzazione permanente dell’owner del 2026-11-27). Prima si controllano cache, lavori e chiamate precedenti; si eseguono
solo le operazioni mancanti, senza reinvii incerti o pulsanti temporanei di recupero. Le osservazioni si ricavano dagli originali,
mai dai prompt o dai registri. Le tre SLOP pubblicate risultano già osservate alla verifica del 2026-11-27: nessuna nuova chiamata.

## 5. Scena finale e generazione

1. Scegliere le REAL descritte e recuperare annotazioni, statistiche e regole pertinenti della galleria.
2. Registrare per il batch probabilità, estrazioni, valori e revisioni delle descrizioni e delle regole usate.
3. Il generatore di testo riceve descrizione di partenza, parametri selezionati, valori e vincoli. Produce una scena completa
   in inglese su tutti gli assi e, separatamente, i cambiamenti effettivi e gli adattamenti di compatibilità.
4. In modalità `keep`, conservare **ambiente e configurazione fisica della luce**, medium e resa fotografica. Ombre, riflessi e superfici visibili
   si adattano a nuova geometria, materiali e fotocamera. Un cambio di composizione non autorizza uno sfondo nuovo. I parametri
   non estratti conservano il valore iniziale salvo le dipendenze necessarie dichiarate. `same_genre` può cambiare ambiente e
   luce conservando il genere; `change_genre` coordina anche tecnica, resa, composizione, posa, formato e persone necessarie.
   Le dipendenze devono essere esplicite e rispettare il soggetto e le regole sui contenuti.
5. L'owner può rivedere scena e prompt prima della conferma a pagamento. Generare con `POST /v1/images/generations` passando
   **solo la descrizione testuale finale**, senza la REAL, maschere o collage. Descrivere positivamente la scena di arrivo,
   senza rimandi alla foto originale.
   Impostare le dimensioni API in base a `aspect_ratio` per ogni candidata; controllare il rapporto restituito prima della revisione.
6. Conservare la candidata intera per valutazione e decisione dell'owner. Preparare la copia di gioco dopo l'accettazione.

Modelli usati negli esperimenti: GPT-6.2 Sol (`gpt-6.2-sol`) e GPT Image 2.6 Sunburst (`gpt-image-2.6-sunburst`). I modelli restano
configurabili. Questa decisione non sceglie un modello valutatore specifico; deve poter esaminare immagini intere e vincoli.

## 6. Valutazione e correzioni con conferma

Il modello valutatore riceve la **SLOP intera**, scena/prompt di arrivo, parametri e regole pertinenti. Esamina credibilità
fotografica, geometria e dettagli, coerenza della scena e aderenza ai parametri. Può segnalare ricorrenze nel contesto fornito,
ma non dedurre la distribuzione dell'intero dataset da una sola immagine. Verificare il rapporto del fotogramma e gli
scostamenti di distanza/resa prospettica quando questi parametri devono restare vincolati.

Per gli oggetti riconoscibili dare priorità ai dettagli hardware visibili: geometria, posizione e dimensione di slot/cartucce,
porte, cerniere e comandi rispetto al modello previsto. Distinguere un errore strutturale dalle piccole variazioni di una
grafica decorativa: nel test SP Tribal l'owner considera queste ultime meno gravi. Un giudizio positivo del valutatore
non dimostra l'assenza di errori hardware; l'owner può segnalare difetti mancati senza alterare la valutazione originale.

Restituisce difetti e incertezze, con eventuali proposte di correzione: problema visibile, zona, istruzione locale, beneficio
atteso e rischio di alterare dettagli corretti. Spiega perché l'intervento potrebbe valere una chiamata. La proposta non avvia
correzione, rigenerazione o nuova valutazione.

**Ogni intervento richiede conferma dell'owner prima della chiamata a pagamento**, anche se restano chiamate nel massimo del batch.
L'owner può scegliere, modificare o ignorare le proposte, accettare la candidata o scartarla. La conferma mostra immagine, difetto,
intervento e massimo di chiamate. La conferma della generazione non autorizza le correzioni. Le valutazioni a pagamento devono
essere comprese nel massimo esplicitamente autorizzato per la fase.

La correzione approvata usa `POST /v1/images/edits` con **l'intera SLOP**, prompt locale e maschera della zona. Non passare solo
il ritaglio: il contesto completo serve per proporzioni, prospettiva e luce. La maschera è una guida e non garantisce pixel
esterni identici. Conservare e confrontare prima/dopo, mostrando anche le modifiche fuori zona. Un eventuale compositing locale
è una scelta separata e dichiarata, non una proprietà dell'API.

**Nessun ciclo automatico di valutazione/correzione e nessuna rigenerazione automatica.** Dopo l'intervento l'owner confronta
il risultato; altre correzioni o valutazioni richiedono una nuova decisione e, se a pagamento, conferma esplicita.
Una proposta del valutatore può essere inutile o peggiorare la candidata: la sua raccomandazione non autorizza la spesa.

## 7. Chiamate, dati e revisione finale

Prima di ogni fase a pagamento, confermare il massimo di chiamate includendo le valutazioni previste. Registrare modello,
richiesta, stato ed esito in `paid_calls`, senza importi. Acquisire la richiesta una volta sola; esiti incerti mai ripetuti
in automatico. La proposta del valutatore e la decisione dell'owner restano distinte.

Le descrizioni e i parametri sono privati; la scena intermedia SLOP serve al prompt e non diventa didascalia pubblica. Nei risultati
restano prompt e modello SLOP, crediti e fonte REAL. Restano validi regole sui contenuti, appartenenza alla galleria, ricetta comune
WebP 4:5 e passaggi separati di approvazione/pubblicazione. Le REAL restano giocabili. I riferimenti per la lavorazione non
introducono un registro permanente REAL–SLOP; si eliminano al termine del processo secondo le regole della libreria.

## 8. Evidenze e limiti dei test

Il 2026-11-25: quattro originali della galleria Nintendo (GBA bianco, GBC verde, SP Tribal, Game Boy bruciato). Una chiamata Sol
ha descritto le quattro REAL e annotato le 23 foto della galleria; una seconda ha preparato le scene; quattro generazioni
Sunburst hanno usato solo il testo; una correzione ha usato immagine intera e maschera. Totale 7 chiamate su 8 autorizzate.
Nessuna chiamata a un valutatore: la revisione è stata visiva. Le proposte di un modello valutatore sono una decisione successiva
dell'owner, non una funzione dimostrata da quel test.

- Contesto fotografico riconoscibile; riuscite la rimozione della decorazione Tribal e la trasformazione del Game Boy bruciato
  in GBC integro. Sol ha scartato alcune incompatibilità di posa e sfondo.
- Graffi accentuati anche con descrizioni di usura lieve: controllare questa possibile ricorrenza del generatore.
- Menu GBC riprodotto perché Sol ne aveva trascritto testo e valori: da qui `screen_content`, aggiunto dopo il test e non ancora
  sperimentato come parametro estratto.
- La correzione ha eliminato il riflesso sfaccettato della croce ma l'ha arrotondata troppo, perdendo il dettaglio centrale.
  Esito parziale, non accettato come riparazione fedele. L'immagine intera non garantisce una correzione corretta.
- Probabilità provvisoria di selezione del 30% per parametro, valori campionati dalle REAL compatibili con condizioni ordinarie
  e assenze. Non è la calibrazione finale né una dimostrazione del bilanciamento del dataset.

Artefatti locali: `artifacts/test-galleria-parametri-2026-11-25/`, ignorati da Git: catalogo/crediti, descrizioni, estrazioni,
prompt, immagini, confronti, registro locale `paid_calls` e riepilogo. Il registro non è quello di produzione. Le evidenze
essenziali sono salvate qui perché gli artefatti non sono inclusi nella PR.

### Test di cambio ambiente e revisione dell'owner

Secondo test del 2026-11-25: GBA bianco su scrivania, GBC verde sul divano, SP Tribal in una scatola di cartone. Gli ambienti
erano scelti dall'operatore; Sol ha sviluppato le scene dai testi esistenti. Una pianificazione, tre generazioni e una
valutazione Sol sulle immagini intere: 5 chiamate su 5 autorizzate, nessuna correzione. Il valutatore riceveva immagini SLOP
e descrizioni di partenza, non le foto REAL. Test del cambio ambiente entro un genere simile, non del passaggio tra generi.

Il contesto e l'appoggio sono plausibili, ma l'owner segnala un errore importante nell'alloggiamento/cartuccia del gioco
sul bordo anteriore inferiore dello SP, non rilevato dal valutatore. Il primo riepilogo dell'assistente sottostimava questo
problema. Il valutatore aveva proposto solo di attenuare un riflesso del display: non è una dimostrazione di verifica hardware
affidabile. I motivi tribali leggermente diversi sono invece giudicati meno gravi dall'owner.

L'owner osserva una resa prospettica meno accentuata della console. È compatibile con una ripresa più distante e una focale
maggiore a parità di dimensione apparente; non permette di misurare la focale dai pixel. I due originali verticali erano stati
resi orizzontali perché il client imponeva 1536×1264 a tutte le generazioni. Questo limite del test motiva il nuovo parametro
`aspect_ratio`, da applicare anche alla richiesta API. Non è una scelta autonoma del generatore di cambiare formato.

Artefatti locali in `artifacts/cambio-ambiente-stesso-genere-2026-11-25/`, ignorati da Git. La segnalazione dell'owner è
registrata separatamente da `evaluation.json`; nessuna rivalutazione o correzione a pagamento è stata avviata.

## 9. Particolarità e trattamento finale approvati

Le particolarità sono dettagli collegati ai parametri, non un nono asse o un'unica variazione generica. Ciascuna ha descrizione,
zona, parametro, ruolo (`identity`, `specimen`, `temporary`), policy (`preserve`, `vary`, `draw`) e certezza. Un nome di edizione
preciso, come GBA SP Tribal Edition, viene preferito a descrizioni generiche sostitutive delle serigrafie. La conservazione
esatta dei disegni dal solo testo non è garantita. I dati identificativi temporanei, come nome e combinazione dei progressi
in un salvataggio, vengono variati coerentemente; non si impone di eliminare sempre lo spagnolo né di spegnere tutti gli schermi.

All’accettazione nel passo 3 si prepara subito la copia comune WebP 4:5 con trattamento; nel passo 4 trattamento e inquadratura restano regolabili durante il controllo visivo finale prima di approvare
e pubblicare. Nessun rumore o sfocatura uniforme viene imposto a tutte le SLOP. Il genere di destinazione guida il campione
tecnico e non la sola REAL di partenza. Senza misure pertinenti non si inventa un trattamento.

La calibrazione è una stima iniziale esplicita, rivedibile dall'owner, da validare sulla galleria completa. Non viene promessa
l'indistinguibilità dei dataset né la rilevazione di ogni errore hardware. Le combinazioni e le ricorrenze visive richiedono
revisione. I test software usano modelli simulati; l'esecuzione sull'intera galleria reale richiede le conferme nella dashboard.

## Lingua del wizard (1.61.0)

Wizard, schema, assi e parametri sono in inglese. Anche valutazione, difetti, incertezze, benefici, rischi e istruzioni di correzione vengono richiesti in inglese, con precedenza su eventuali indicazioni linguistiche del contesto salvato. Il generatore non traduce le scritte originali citate come osservazioni. Le vecchie proposte non compaiono più sulle REAL.
