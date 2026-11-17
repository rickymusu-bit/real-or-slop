# Generazione SLOP — specifica 7.0.0

Stato: implementata nel ramo 1.38.0, da rilasciare. Aggiornata: 2026-11-17T10:19:38Z.

## Due modalità e avviso sul dataset

Decisione dell'owner del 2026-11-17: in «Generazione SLOP» ci sono «Generazione manuale» e «Generazione automatica».
La proposta di generazione, Ignora/Chiudi e l'impostazione per attivarla spariscono. Un avviso mostra soltanto lo sbilanciamento
tra REAL e SLOP approvate/pubblicate, contando separatamente le SLOP nuove ancora da decidere. Non avvia processi e non impone una quantità.

**Manuale:** l'owner scrive prompt inglese, tag di partenza e brief (ancoraggi obbligatori, preferenze, elementi liberi ed esclusioni).
Non occorre una REAL. Preparare e modificare il processo prima del primo tentativo è gratuito; nessuna chiamata scrive o riscrive
il prompt manuale. Poi partono lo stesso ciclo di generazione e valutazione, la revisione e la copia 4:5. I tag di partenza restano
nello snapshot; i tag finali descrivono l'originale prodotto, con la normale analisi dopo accettazione. Nessun trattamento da una REAL mancante.

**Automatica:** l'owner sceglie da una a dieci SLOP, entro il numero di REAL libere con descrizione. La quantità può essere diversa
dallo sbilanciamento, anche quando il catalogo è in pareggio. Campione casuale uniforme, senza ripetizioni. Una chiamata testuale
per REAL scrive brief e prompt dai tag e dalla descrizione salvati. La conferma mostra il massimo di chiamate del numero scelto.

## Ispirazione e disponibilità

Una SLOP automatica è ispirata a una REAL, senza obbligo di somiglianza. Sono disponibili le REAL approvate/pubblicate con descrizione
che non hanno una figlia esistente né una prenotazione aperta. Il registro privato `slop_reference_uses` prenota atomicamente la madre
alla creazione del processo e registra la figlia accettata. La madre resta esclusa se la figlia è nuova, approvata, pubblicata o nel
cestino; solo cancellare definitivamente la figlia la libera. Chiudere un processo senza figlia libera la sua prenotazione. Gli esiti
incerti e in revisione richiedono prima la decisione dell'owner. Eliminare un processo già accettato non libera una madre con figlia
ancora presente. Eliminare la madre non elimina la figlia né blocca il processo: descrizione, tag e misure sono nello snapshot.

Nessun riferimento è inviato al giocatore o inserito nei file. Il campionamento del gioco è invariato: madre e figlia possono apparire
nella stessa partita. La migrazione 0055 non inventa i legami pregressi rimossi dalla 0053: l'esclusione per uso è garantita per le
nuove generazioni tracciate.

## Varietà di composizione

La posizione e lo sguardo presenti nella descrizione REAL sono incidentali, non ancoraggi da copiare. Nei processi automatici una
rotazione copre nove combinazioni di peso visivo sinistra/centro/destra e sguardo sinistra/frontale/destra. La preferenza è nello
snapshot e nelle richieste di brief e generazione; resta tra i tentativi. Per scene senza sguardo viene ignorata, senza inventare
persone né forzare pose. Non è un vincolo di accettazione e non causa tentativi extra: la conformità reale del generatore va osservata
sulle immagini, non è dimostrabile con le API finte. I prompt manuali restano sotto il controllo dell'owner.

## Analisi REAL e brief

La chiamata multimodale di catalogazione vede l'originale REAL intero e il contesto Commons, e produce insieme tag e descrizione neutra: elementi visibili, contesto documentato e incertezze. Non conosce le SLOP. Nessun fatto viene inventato per completare Commons.

Una chiamata testuale per processo legge soltanto descrizione e tag salvati e produce brief e prompt inglese. Non vede l'immagine REAL. Il brief distingue ancoraggi obbligatori, preferenze, elementi flessibili ed esclusioni; prompt e scena possono cambiare, gli ancoraggi restano immutabili dopo il primo tentativo. Non si richiedono somiglianza visiva o un solo elemento modificato. Le persone sono inventate; valgono i limiti di `contenuti-e-trasparenza`. Gli edifici devono essere plausibili per stile, luogo ed epoca, senza fedeltà obbligatoria a un monumento reale.

Prima del primo tentativo è possibile salvare o riscrivere brief e prompt. Ogni riscrittura a pagamento aggiunge una chiamata al massimo mostrato. Un contesto prompt della pipeline precedente blocca le chiamate fino al suo aggiornamento esplicito.

## Ciclo e valutazione

Workflow Cloudflare: brief, generazione, valutazione e analisi dei tag dopo accettazione. Continua anche chiudendo la dashboard. Ogni chiamata è acquisita nel database prima dell'invio; gli esiti incerti non si ripetono automaticamente. La ripresa esegue solo passi ancora disponibili. Lo stop termina prima della successiva chiamata; quella già inviata può concludersi.

Il valutatore vede la SLOP intera, non ritagliata né trattata. Restituisce accetta, riprova, riscrivi prompt, riprogetta scena o revisione umana, con difetti critici/minori, vincoli, incertezze e motivazione. Credibilità prima dell'aderenza letterale; difetti critici mai compensabili. Luogo, data e identità non verificabili dai pixel sono annotazioni, non ragioni automatiche di rifiuto. La revisione del prompt conserva gli ancoraggi e le esclusioni del brief. Il controllo testuale non dimostra che il modello li abbia realmente rispettati: resta necessario il controllo umano.

Tentativi massimi 1–5, tolleranza 0–2. A tolleranza zero, difetti minori provocano un nuovo tentativo entro il limite. Snapshot dei modelli, qualità e limiti all'avvio. Massimo iniziale per SLOP automatica: una chiamata brief, due per tentativo (immagine e valutazione), una analisi tag dopo accettazione. In manuale manca la chiamata brief: 1 + 2N invece di 2 + 2N. Nei test solo API fittizie. Nessun punteggio di difficoltà deriva dal numero di tentativi.

## Revisione e copie

Solo una candidata accettata entra nella libreria privata come nuova SLOP. Analisi tag sull'intero originale. Copia 4:5 preparata dopo accettazione nel browser, con identica codifica WebP delle REAL, senza metadati. Il trattamento usa misure numeriche salvate, senza identificativo della REAL e senza rileggerla. I cursori permettono correzioni manuali; una REAL eliminata non impedisce di rifare la copia. Se mancano le misure, la copia è senza trattamento.

Accettazione automatica, approvazione dell'owner e pubblicazione sono distinte. Esauriti, in revisione, falliti e incerti restano in evidenza con tentativi e valutazioni finché l'owner li chiude. Per un processo in revisione si può accettare una candidata valutata senza difetti critici, anche se il modello non conferma un vincolo; la conferma avverte delle incertezze e autorizza una chiamata per i tag. Chiusura esplicita e manutenzione consentono poi la rimozione dei tentativi dopo sette giorni.

## Batch automatici

Un solo batch automatico aperto. Il ciclo gira sul server e continua chiudendo la dashboard. Un batch concluso passa in revisione
e si chiude quando tutti gli esiti sono decisi, oppure con il comando esplicito dopo aver deciso le immagini nuove. La chiusura
libera le prenotazioni dei processi non avviati; gli esiti senza SLOP restano in evidenza fino alla loro chiusura esplicita.
I batch precedenti restano consultabili senza riprese a pagamento incompatibili.

## Rilascio

La 0055 aggiunge il registro privato, elimina le proposte ignorate e la loro opzione. Non esegue chiamate né backfill di identità. Prima del rilascio devono terminare i Workflow precedenti: non registrerebbero il nuovo utilizzo delle REAL. Migrazione e deploy richiedono l'autorizzazione di rilascio dell'owner. Nessuna chiamata né migrazione remota fa parte delle verifiche locali.
