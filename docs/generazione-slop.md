# Generazione delle SLOP: riferimenti REAL, valutazione e batch — specifica 5.0.1

Stato: **decisioni editoriali approvate il 2026-11-15, da implementare** tramite PR successive. Aggiornata: 2026-11-15T11:08:00Z.
In produzione resta l'app 1.26.0; la specifica 4.0.0 e l'issue #136 descrivono una pipeline precedente, **superata su somiglianza alla REAL,
cambiamento singolo e numero di generazioni**. Rimangono validi, salvo diversa indicazione qui, il 4:5 e il trattamento leggero di
`docs/copie-di-gioco.md` 9.1.1; tag e contesti in `docs/libreria-immagini.md`; contenuti in `docs/contenuti-e-trasparenza.md`.
Le versioni precedenti sono nella cronologia Git.

## 1. Obiettivo e principi non negoziabili

- **Obiettivo principale: credibilità fotografica.** Una SLOP deve poter essere scambiata per una fotografia autentica della tecnica,
  dell'epoca e della situazione rappresentata. Non basta l'aderenza letterale a un prompt. Il valutatore può sbagliare: l'accettazione
  automatica è una stima editoriale, non una certificazione, e precede sempre la normale approvazione dell'owner.
- **REAL come riferimento, non come modello da copiare.** La REAL fornisce ancoraggi tematici, semantici e fotografici per contribuire
  al bilanciamento del catalogo. La SLOP può avere soggetti, numero di persone, azione, punto di vista, luce, stagione, composizione
  e ambientazione differenti. La somiglianza visiva non è un obiettivo né un requisito di qualità.
- **Nessun obbligo di cambiare un solo elemento.** Il precedente campo `change {element,from,to}` e la relativa UI vengono rimossi
  dalla pipeline nuova. Il modello progetta liberamente una scena coerente con gli ancoraggi editoriali: non conta quanti aspetti
  cambiano rispetto alla REAL.
- **Vincoli editoriali, non imitazione.** La coerenza semantica e contestuale è un requisito minimo del brief, non un punteggio da
  massimizzare. Se la fotografia è credibile e rispetta questi vincoli, si può accettare anche quando differisce dal prompt operativo.
- **SLOP integralmente sintetiche;** niente editing parziale della REAL per produrre il contenuto. Le persone della SLOP sono
  inventate secondo `contenuti-e-trasparenza`. Nessuna SLOP e la propria REAL di origine compaiono nella stessa partita.
- **Selezione REAL qualitativa:** usare gli otto principi della issue #138 (non filtri rigidi, soggetti centrati obbligatori o
  benchmark per singolo generatore). La selezione editoriale rimane all'owner; per ora nessun avviso nel wizard.
- **Tutte le chiamate API a pagamento richiedono autorizzazione esplicita** e registrazione; nessun retry automatico di chiamate
  con esito incerto. Le immagini non pubblicate non sono accessibili nel gioco.

## 2. Legame con la REAL e bilanciamento

- `generation_source` identifica la **REAL di riferimento**, non un vincolo di somiglianza. Il nome storico «gemella» resta solo
  dove necessario per la compatibilità; la UI preferisce «SLOP da REAL di riferimento».
- Una REAL approvata o pubblicata può alimentare al massimo **una SLOP attiva** (`new`, `approved`, `published`) secondo le
  regole esistenti; una candidata scartata durante il loop **non** occupa quel posto. Cestinare la SLOP lo libera.
- La proposta di riequilibrio resta basata sulle REAL approvate/pubblicate e sulle SLOP con un'origine associata, con soglia
  configurata e batch massimi di 10. I tentativi falliti non contano come SLOP.
- L'ancoraggio semantico mira a una **copertura aggregata** di tema, genere fotografico, epoca e ambiente, non alla corrispondenza
  esatta di tutti i tag. I tag effettivi della SLOP sono prodotti **dall'immagine accettata**, non copiati dal brief. Il sistema
  confronta gli ancoraggi richiesti con i tag rilevati e segnala le divergenze all'owner; non falsifica i tag per far quadrare i conti.
- La qualità editoriale del catalogo non è rappresentata dal solo rapporto REAL/SLOP: monitorare in futuro distribuzioni e
  riconoscibilità delle categorie, senza aggiungere vincoli di matching non approvati.

## 3. Pipeline di una REAL

La pipeline è per foto, tracciabile e riprendibile: `REAL → descrizione visiva → brief bloccato → prompt operativo → [genera → valuta immagine INTERA → (accetta | rigenera | correggi prompt)] → copia 4:5 e trattamento → tag → nuova SLOP in libreria → revisione owner → pubblicazione`.

1. **Descrizione visiva della REAL.** Il modello vede soltanto la copia di gioco 4:5 della REAL, senza titolo, tag, origine né
   indicazioni sull'uso delle immagini generate. Descrizione inglese, le sette sezioni già previste (soggetto, persone, scritte,
   ambiente, luce, camera, resa); solo ciò che è visibile, con incertezze esplicite e senza inventare trascrizioni. Salvata e
   correggibile dall'owner; un cambio della copia la marca come da rivedere (hash/revisione della copia), non la sostituisce
   silenziosamente. Una REAL già descritta può riutilizzarla.
2. **Brief editoriale immutabile per il singolo processo.** Il modello riceve descrizione, tag per categoria e descrizione Commons
   per definire: (a) ancoraggi **obbligatori** semantici/fotografici minimi, (b) preferenze non vincolanti, (c) libertà di
   reinterpretazione, (d) esclusioni contenutistiche. Gli ancoraggi devono essere pochi, significativi, verificabili nell'output
   e compatibili con una scena diversa; non vanno inventati da dettagli incerti. L'owner può esaminare/modificare il brief **prima**
   di avviare il loop. Durante i tentativi è congelato, con versione e hash.
3. **Prompt iniziale in inglese.** Il modello inventa una scena plausibile e una resa fotografica specifica. Nessuna imitazione
   obbligatoria della composizione della REAL; niente enfasi cinematografica, cliché o dettagli storici dedotti arbitrariamente.
   Le scritte devono essere poche quando possibile e descritte con precisione solo se essenziali. Il modello non sceglie il formato.
4. **Generazione della candidata integrale.** Il generatore riceve il prompt operativo e la dimensione scelta da `copie-di-gioco`;
   produce un'immagine completamente sintetica, nel **suo formato originale di generazione**. Il file intero resta privato fino
   alla decisione. **Non ritagliare né trattare l'immagine prima della valutazione.** Il generatore e il valutatore non devono
   essere condizionati dal riquadro 4:5 in cui la fotografia sarà successivamente mostrata nel gioco.
5. **Valutazione multimodale sull'immagine INTERA.** Vede la fotografia generata completa, mai un ritaglio 4:5,
   e il brief immutabile e il prompt operativo. Distingue: (I) credibilità
   fotografica, (II) plausibilità fisica e contestuale, (III) rispetto dei soli ancoraggi editoriali obbligatori. L'aderenza a
   dettagli secondari del prompt non è un requisito. Deve riportare difetti **osservabili** e incertezze, senza proclamare
   «foto autentica» o dedurre identità, licenze, provenienza o verità storica dai pixel.
6. **Decisione del valutatore:** `accept`, `retry_same_prompt`, `revise_prompt`, `replan_scene`, `review_needed`. I cambiamenti
   proposti al prompt sono ammessi solo se mantengono il brief; il server verifica almeno struttura, vincoli dichiarati e revisioni.
   Una rigenerazione con lo stesso prompt è appropriata per anomalie occasionali; la revisione per istruzioni ambigue o ricorrenti;
   la riprogettazione per scene sistematicamente troppo difficili. Ogni nuova generazione consuma un tentativo.
7. **Candidato accettato:** solo **dopo la valutazione dell'immagine intera**, il browser prepara il ritaglio 4:5 e l'eventuale
   trattamento leggero per la copia di gioco. Solo allora la SLOP entra nella libreria ordinaria come `new`, con originale,
   copia, prompt finale, brief, REAL di riferimento, modello, qualità, configurazione e tracciabilità dell'esito.
   L'analisi dei tag usa la copia che sarà giocata e distingue le evidenze visive dai desideri del prompt. L'owner verifica
   che il ritaglio non comprometta il risultato; eventuali correzioni di crop o trattamento **non producono feedback automatico
   per riscrivere il prompt e non forzano il generatore a comporre per il 4:5**. Approvare e pubblicare restano azioni
   separate dell'owner. Nessuna pubblicazione automatica.

Il valutatore può proporre la revisione del prompt **nella propria risposta strutturata**, senza obbligare a una chiamata ulteriore.
Se l'owner cambia il brief tra due esecuzioni, deve partire un processo nuovo (mai mutare retroattivamente un processo in corso).

## 4. Contratto di valutazione e tolleranze

La valutazione **non** consiste nella media di tre numeri che compensi un difetto grave. Impiega un giudizio qualitativo:
- **Difetti critici (rifiuto):** deformazioni anatomiche evidenti, errori fisici o geometrici vistosi, testo centrale insensato,
  composizione o resa immediatamente artificiale, contraddizioni contestuali decisive, violazioni contenutistiche o mancato
  rispetto di un ancoraggio editoriale obbligatorio.
- **Difetti minori (tollerabili):** imperfezioni sottili che potrebbero esistere in una fotografia genuina e non compromettono
  credibilità, plausibilità né ancoraggi. La soglia di tolleranza editoriale è configurabile, separatamente dai tentativi.
- **Incertezza:** quando il giudizio dipende da testo illeggibile, dettagli non verificabili o scarsa affidabilità del modello,
  usare `review_needed`, non accettare automaticamente.

Output strutturato minimo per tentativo: `attempt_id`, `decision`, `critical_findings[]`, `minor_findings[]`,
`editorial_constraints_met`, `uncertainty_notes[]`, `action_reason`, `revised_prompt` (solo se pertinente).
Ogni rilievo cita un punto o una regione dell'immagine e una conseguenza osservabile; niente spiegazioni inventate.
Il giudizio sulla **naturalità fotografica dell'immagine intera** va distinto dall'aderenza al brief. Una valutazione effettuata mostrando il brief e
l'immagine nella stessa chiamata può essere influenzata dal testo: non chiamarla «valutazione cieca». Se si vorrà una valutazione
davvero cieca, servono richieste separate o un disegno sperimentale esplicito.

## 5. Numero di cicli e rapporto con la difficoltà

- Impostazione owner **`max_generation_attempts`**, intero da **1 a 5**, predefinito **3**. Un tentativo = **una generazione di
  immagine più la relativa valutazione**. Il primo tentativo conta; mai ciclo illimitato.
- L'owner sceglie il limite prima di avviare studio o batch; viene fissato nello snapshot dell'esecuzione. Lo stesso limite vale
  anche se la sessione viene ripresa. Una soglia di tolleranza qualitativa è impostazione **distinta**.
- Più tentativi aumentano le opportunità di ottenere una candidata credibile, **non garantiscono** che l'immagine risulti più
  difficile da distinguere per il giocatore, né trasformano il limite in una «difficoltà» misurata. Questa potrà essere stimata
  solo dalle statistiche dei giocatori, con campioni adeguati. Non attribuire livelli automatici di difficoltà in base ai cicli.
- **Stop anticipato** alla prima candidata che supera tutte le condizioni editoriali e di credibilità, senza consumare i tentativi
  residui. Nessuna chiamata superflua per «migliorare comunque» un'immagine già accettata.
- **Esaurimento tentativi:** il processo termina `exhausted`, senza SLOP nuova/approvata/pubblicata e senza occupare la REAL;
  anteprima e motivazioni all'owner, eventuale riavvio solo con una **nuova conferma di spesa**. `review_needed` blocca il processo
  fino alla decisione umana, non consuma automaticamente nuovi tentativi.
- Il limite vale per il **numero di generazioni**, non per durata e non per una promessa di successo.

## 6. Stato, spese, ripresa e conservazione

- **Conferma preventiva del tetto massimo** delle chiamate del batch, non del numero esatto effettivo: per REAL senza descrizione,
  nella versione base sono al più `1 descrizione + 1 brief/prompt + 2 × N (generatore e valutatore) + 1 analisi tag` = `3 + 2N`
  chiamate; con descrizione riusata `2 + 2N`. Il preventivo deve distinguere i tipi di chiamata, modello e limite di tentativi;
  il costo monetario resta gestito dal limite OpenAI del progetto.
- Ogni chiamata a pagamento è registrata **prima** dell'invio con ID univoco, tipo, immagine, processo e tentativo. I passi e gli
  output sono persistenti con stati `pending / completed / failed / uncertain`. Nessuna chiamata `uncertain` viene ripetuta
  automaticamente; la singola foto è sospesa, il resto del batch può proseguire. Problemi di account OpenAI fermano il batch.
- Concorrenza: impedire che doppio clic, due schede o ripresa dopo refresh inviino la stessa chiamata; sequenza per foto
  idempotente a livello applicativo. Registrare prima dell'invio **non prova** che un esito di rete incerto non abbia consumato
  crediti: comunicarlo senza promesse assolute.
- Ogni tentativo conserva privatamente prompt, modello, qualità, esito, motivi, eventuale bozza di revisione e riferimento alla
  candidata per consentire ripresa e revisione; **i tentativi rifiutati non entrano nella libreria delle immagini e non sono
  pubblicati**, né generano nuove REAL/SLOP attive. Prevedere pulizia dei file temporanei non più necessari, senza creare
  archivi permanenti delle eliminazioni in contrasto con `AGENTS.md`.
- Conservare l'esito e l'identità del processo accettato con la nuova SLOP per audit editoriali; le anteprime della libreria
  riportano solo contenuti privati all'owner. Nessun criterio o risposta corretta viene inviato al giocatore prima della scelta.
- Il batch automatico continua a girare con la dashboard aperta, al massimo uno alla volta. Se una REAL esaurisce i tentativi,
  le altre proseguono; il risultato dell'intero batch mostra accettate, esaurite, sospese e ancora da rivedere.

## 7. Studio e interfaccia amministrativa

Quattro passaggi evolutivi: **REAL** (scelta da 1 a 10), **Descrizione e brief** (revisione e prompt iniziale),
**Generazione e valutazione dell'immagine intera** (avanzamento per foto e per tentativo, decisione, difetti e correzione del prompt),
**Revisione** (solo candidate accettate automaticamente, più eventuali casi sospesi visibili separatamente).
Mostrare il numero massimo di tentativi, la tolleranza, il preventivo massimo delle chiamate e il totale effettivo.

In revisione: originale della SLOP **intero**, poi copia 4:5 preparata dopo l'accettazione (con/senza trattamento), prompt finale, ancoraggi, tag effettivi,
divergenze tematiche, dettagli della valutazione, Inquadratura, Analizza, Approva, Pubblica, Cestino. Nessun tasto per cestinare
la REAL dalla revisione della SLOP. La rigenerazione manuale non scavalca i controlli e richiede conferma di una nuova esecuzione.
Una SLOP `new` non è automaticamente una SLOP `published`.

**Compatibilità preesistente:** i vecchi batch e le immagini già generate restano visualizzabili; i batch in pausa sono
gestiti senza doppie chiamate. Non tentare di riprendere un vecchio batch con un formato di stato incompatibile: segnalarlo e
richiedere un'esplicita scelta operativa. Nessuna migrazione remota, deploy o conversione distruttiva senza autorizzazione owner.

## 8. Prompt, descrizioni, modelli e controlli

- La descrizione della REAL mantiene le sette sezioni: `Subject and action`, `People`, `Lettering`, `Setting`, `Light`,
  `Camera`, `Rendering`. Le scritte illeggibili sono indicate come tali. Non imporre una lunghezza minima che induca ad
  allucinare dettagli; testo preciso e proporzionato alla scena, massimo configurato nella specifica della libreria.
- Il generatore di prompt legge la descrizione, i tag e il contesto Commons della singola REAL. Il **brief** è distinto dal
  **prompt operativo** e contiene un numero contenuto di vincoli verificabili. Prompt e revisione in inglese, formulazioni
  concrete, nessuna enfasi di tipo «cinematic».
- Il valutatore può **cambiare la scena**, purché il brief immutabile sia rispettato: ciò è desiderabile se corregge
  deformazioni, testi insensati o composizioni artificiose. Mai imporre la conservazione della posizione delle persone della REAL.
- I modelli sono selezionabili dalle Impostazioni, inclusa la possibilità futura di generatori differenti; default già
  proposti dalla #136 (`gpt-6.1-sol` testo e `gpt-image-2.5-flare` `high`) finché l'owner non decide diversamente.
- Il valutatore non certifica autenticità: non usare una percentuale di «probabilità che sia REAL» come verità.
- I test usano solo modelli finti; coprire decisioni `accept`, `retry_same_prompt`, `revise_prompt`, `replan_scene`,
  `review_needed`, `exhausted`, vincoli immutabili, massimo tentativi, spesa massima, ripresa e chiamate incerte,
  **valutazione sempre sull'immagine intera (no crop 4:5)**, preparazione del 4:5 **solo dopo l'accettazione**,
  revisione dell'inquadratura senza feedback automatico al prompt e assenza dei tentativi rifiutati dal catalogo/gioco.

## 9. Fuori dallo scopo immediato e decisioni future

- La selezione delle REAL rimane qualitativa come da issue #138, senza nuovi filtri automatici nel wizard.
- La difficoltà effettiva di riconoscimento non è il numero dei tentativi; eventuali livelli si fondano sui dati reali delle partite.
- Nessun training del valutatore né benchmark esteso obbligatorio per ogni generatore.
- Le modalità di generazione completamente indipendenti dalle REAL e il cambio del modello valutatore sono scelte future separate.
- L'esposizione nel resoconto di fine partita delle motivazioni di generazione non è approvata: non introdurla senza decisione owner.

## 10. Sequenza delle PR di implementazione

1. **PR A — specifiche:** allineare `AGENTS.md`, `MASTER.md`, `generazione-slop`, `copie-di-gioco` e le specifiche collegate;
   senza modificare codice, database o produzione.
2. **PR B — backend e persistenza:** brief bloccato, processo/tentativi, chiamate registrate, valutatore e decisioni strutturate,
   limiti e compatibilità dei batch, fake API e test. Migrazione additiva, senza conversione delle immagini esistenti.
3. **PR C — browser e studio:** ciclo visibile, impostazione limite e tolleranza, immagine integrale valutata e 4:5 preparato dopo, progressi e revisione owner,
   test d'integrazione desktop/mobile.
4. **PR D — rilascio:** solo dopo CI, anteprima esaminata e autorizzazione esplicita dell'owner; valutare la migrazione dei batch in
   pausa e le impostazioni persistenti in produzione. Un merge su main avvia automaticamente il deploy.

Le PR B e C non vanno unite senza anteprima e approvazione. Questa specifica non autorizza da sola spese API o deploy.
