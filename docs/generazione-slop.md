# Generazione SLOP — specifica 6.0.0

Stato: vigente per il ramo 1.36.0. Aggiornata: 2026-11-16T19:41:37Z.

## Ispirazione, non coppie

Decisione dell'owner del 2026-11-16: una SLOP è ispirata a una REAL, ma non è una sua gemella. La stessa REAL può ispirare più processi. REAL e SLOP ispirate ad essa possono apparire nella stessa partita; cestinare o eliminare una non modifica l'altra.

Lo studio seleziona REAL approvate o pubblicate con descrizione editoriale. Alla creazione del processo salva una copia di descrizione, tag, dimensioni e misure fotografiche, senza identificativo, titolo o URL della REAL. I riferimenti scelti esistono solo nella richiesta di creazione. Ogni voce salvata ha un titolo generico «Proposta N». La migrazione 0053 elimina i riferimenti precedenti da immagini, processi, slot e trattamento, preservando identificativi dei processi, tentativi, registro delle chiamate, file e copie già assegnate ai round. Non esegue analisi a pagamento.

## Analisi REAL e brief

La chiamata multimodale di catalogazione vede l'originale REAL intero e il contesto Commons, e produce insieme tag e descrizione neutra: elementi visibili, contesto documentato e incertezze. Non conosce le SLOP. Nessun fatto viene inventato per completare Commons.

Una chiamata testuale per processo legge soltanto descrizione e tag salvati e produce brief e prompt inglese. Non vede l'immagine REAL. Il brief distingue ancoraggi obbligatori, preferenze, elementi flessibili ed esclusioni; prompt e scena possono cambiare, gli ancoraggi restano immutabili dopo il primo tentativo. Non si richiedono somiglianza visiva o un solo elemento modificato. Le persone sono inventate; valgono i limiti di `contenuti-e-trasparenza`. Gli edifici devono essere plausibili per stile, luogo ed epoca, senza fedeltà obbligatoria a un monumento reale.

Prima del primo tentativo è possibile salvare o riscrivere brief e prompt. Ogni riscrittura a pagamento aggiunge una chiamata al massimo mostrato. Un contesto prompt della pipeline precedente blocca le chiamate fino al suo aggiornamento esplicito.

## Ciclo e valutazione

Workflow Cloudflare: brief, generazione, valutazione e analisi dei tag dopo accettazione. Continua anche chiudendo la dashboard. Ogni chiamata è acquisita nel database prima dell'invio; gli esiti incerti non si ripetono automaticamente. La ripresa esegue solo passi ancora disponibili. Lo stop termina prima della successiva chiamata; quella già inviata può concludersi.

Il valutatore vede la SLOP intera, non ritagliata né trattata. Restituisce accetta, riprova, riscrivi prompt, riprogetta scena o revisione umana, con difetti critici/minori, vincoli, incertezze e motivazione. Credibilità prima dell'aderenza letterale; difetti critici mai compensabili. Luogo, data e identità non verificabili dai pixel sono annotazioni, non ragioni automatiche di rifiuto. La revisione del prompt conserva gli ancoraggi e le esclusioni del brief. Il controllo testuale non dimostra che il modello li abbia realmente rispettati: resta necessario il controllo umano.

Tentativi massimi 1–5, tolleranza 0–2. A tolleranza zero, difetti minori provocano un nuovo tentativo entro il limite. Snapshot dei modelli, qualità e limiti all'avvio. Massimo iniziale per SLOP: una chiamata brief, due per tentativo (immagine e valutazione), una analisi tag dopo accettazione. Nei test solo API fittizie. Nessun punteggio di difficoltà deriva dal numero di tentativi.

## Revisione e copie

Solo una candidata accettata entra nella libreria privata come nuova SLOP. Analisi tag sull'intero originale. Copia 4:5 preparata dopo accettazione nel browser, con identica codifica WebP delle REAL, senza metadati. Il trattamento usa misure numeriche salvate, senza identificativo della REAL e senza rileggerla. I cursori permettono correzioni manuali; una REAL eliminata non impedisce di rifare la copia. Se mancano le misure, la copia è senza trattamento.

Accettazione automatica, approvazione dell'owner e pubblicazione sono distinte. Esauriti, in revisione, falliti e incerti restano in evidenza con tentativi e valutazioni finché l'owner li chiude. Per un processo in revisione si può accettare una candidata valutata senza difetti critici, anche se il modello non conferma un vincolo; la conferma avverte delle incertezze e autorizza una chiamata per i tag. Chiusura esplicita e manutenzione consentono poi la rimozione dei tentativi dopo sette giorni.

## Proposte automatiche

Studio disponibile dalla soglia configurata (default 50 REAL). Spread: 100 × (REAL approvate/pubblicate − SLOP approvate/pubblicate) / REAL. Le SLOP nuove da decidere riducono il fabbisogno prima di proporre altre generazioni. Soglia default 33%; massimo dieci immagini per batch e una selezione distinta di REAL disponibili in ciascun batch. Le stesse REAL sono riutilizzabili nei batch successivi. Nessuna proposta con fabbisogno nullo, nessun riferimento descritto, studio chiuso o altro batch automatico aperto. Una proposta ignorata ritorna dopo altri dieci punti di spread. L'avvio richiede conferma esplicita del massimo delle chiamate.

Un batch automatico concluso passa in revisione e si chiude quando tutti gli esiti sono decisi, oppure con il comando esplicito. I batch della pipeline precedente restano consultabili senza riprese a pagamento incompatibili.

## Rilascio

Prima di applicare la migrazione 0053 devono terminare i Workflow della versione precedente: il loro codice usa le colonne rimosse. Migrazione e deploy richiedono l'autorizzazione di rilascio dell'owner. Nessuna chiamata né migrazione remota fa parte delle verifiche locali.
