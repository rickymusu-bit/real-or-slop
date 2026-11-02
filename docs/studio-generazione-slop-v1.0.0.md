> Aggiornamento 2026-11-01T22:00:00Z — documento storico. La
> [pipeline editoriale v1.0.0](pipeline-editoriale-real-slop-v1.0.0.md) supera
> difficoltà preassegnata, relativi filtri/template e pubblicazione per singola
> approvazione. Restano le regole compatibili su diritti, fonti, audit e, per il
> campionamento v2, monete Bernoulli indipendenti. La cronologia seguente è conservata.

# Studio di generazione SLOP — v1.0.0

Implementazione dell'app **0.8.0**, secondo il [protocollo SLOP](protocollo-generazione-slop-v1.0.0.md) e il [protocollo REAL](protocollo-selezione-real-v1.0.0.md). La sezione privata `/admin/slop` progetta concept, costruisce testi e importa manualmente risultati prodotti altrove. Non chiama generatori, non acquista crediti, non scarica riferimenti e non crea immagini.

## Procedura editoriale

1. Dalla coda `/admin` aprire lo studio e creare una scheda. Selezionare categoria/sottocategoria, paese, luogo, periodo, soggetto, medium e composizione, usando anche i vocabolari condivisi con la curatela REAL. Specificare scena, elemento inventato, meccanismo cognitivo, indizio investigabile, dettagli materiali e trattamento tecnico confrontabile con REAL.
2. Inserire fino a sei fatti di contesto, ciascuno con testo, fonte e URL HTTPS della scheda effettiva. Il sistema non inventa riferimenti: fonti e cronologie devono essere controllate dal revisore. Non attribuire alla fotografia sintetica l'autenticità dell'archivio che documenta il contesto.
3. Costruire le proposte di prompt e spiegazione. Il pulsante sostituisce esplicitamente i due testi; entrambi sono modificabili. Le bozze incomplete mostrano segnaposto e non sono importabili con quei segnaposto. Dopo modifiche al concept aggiornare anche i testi. Salvare con una motivazione conserva una revisione privata e la proposta del template separata dal prompt effettivo.
4. Generare manualmente con uno strumento esterno scelto dal proprietario. Registrare modello, prompt integrale realmente usato, data effettiva, autore/proprietario, versione o identificativo del tentativo e URL pubblico del servizio o della generazione, senza credenziali. L'URL della fonte sarà mostrato dopo la risposta. Annotare risultati e valutazioni nella scheda.
5. Prima dell'invio, salvare tutte le modifiche, selezionare un file JPEG/PNG/WebP e confermare generazione IA, fatti, diritti, innocuità e comparabilità con REAL. Il dHash offline è facoltativo; lo SHA-256 è calcolato all'upload. L'importazione crea esclusivamente un candidato AI `in-review`, non demo, e il caricamento usa la quarantena privata esistente. Un upload fallito può essere riprovato senza creare un altro candidato.
6. Aprire la coda di revisione collegata. Il revisore vede modello, prompt integrale, data, dichiarazione e dossier; può modificare la spiegazione post-risposta dopo aver osservato il risultato. Approvazione e rifiuto usano la moderazione esistente. Approvare richiede file, storage, licenza ammessa e conferme umane; il solo salvataggio o invio non approva l'immagine.

La provenienza del dossier viene congelata all'importazione: non si può riscrivere il prompt del tentativo già collegato a un'immagine. Per un altro risultato usare “Nuova iterazione”: copia il concept e incrementa l'iterazione, ma azzera data, versione della generazione, valutazioni e dichiarazione. La nuova scheda ha una propria cronologia. Le successive note editoriali e valutazioni dell'immagine restano disponibili nella curatela e nella moderazione esistenti. Se cambia la spiegazione nella decisione finale, `review_events.notes` conserva note e differenza `before`/`after` in JSON; la proposta originaria rimane nel dossier.

## Template e difficoltà

| Profilo | Istruzioni del template | Importazione |
|---|---|---|
| Facile | Scena inizialmente plausibile, un indizio verificabile che richiede ragionamento; niente assurdità, anacronismi grossolani o gag | Sì, dopo revisione |
| Medio | Una o due incongruenze sottili, osservabili e contestualizzabili | Sì, dopo revisione |
| Difficile | Evento, opera, prototipo o oggetto inventato ma plausibile; nessun errore tecnico intenzionale | Sì, dopo revisione |
| Esperto | Finzione innocua e credibile con possibilità ragionevole di verifica | Solo template privato; importazione rifiutata |

Per Difficile/Esperto sono ammessi soltanto i meccanismi di finzione plausibile o falsa familiarità, non anacronismi o errori tecnici progettati. Le API pubbliche e lo schema delle immagini mantengono le tre difficoltà originali. I template richiedono risoluzione, compressione, medium e composizione comparabili con REAL; vietano attribuzioni archivistiche inventate, false accuse, crimini, tragedie ed eventi sensibili fittizi. Queste istruzioni e le conferme non certificano automaticamente il contenuto: l'ammissibilità resta responsabilità del revisore.

La proposta post-risposta dichiara la generazione IA, distingue l'elemento inventato dai fatti citati e riporta soltanto i riferimenti forniti. Non afferma che l'immagine sia autentica o che i link siano stati verificati dal software. Nessuna analisi automatica dei fatti o dell'immagine è inclusa.

## Persistenza e API private

La migrazione additiva `0005_slop_studio.sql` aggiunge `slop_plans` e `slop_plan_events`; non riscrive immagini, assegnazioni, sessioni o difficoltà. Applicare lo schema prima di eseguire il nuovo backend, anche quando si usano soltanto la demo o le vecchie schermate amministrative. Nessuna migrazione remota viene avviata dalla build.

| Metodo e percorso | Comportamento |
|---|---|
| `GET /api/admin/slop` | Ultime 100 schede con stato derivato dall'immagine collegata |
| `POST /api/admin/slop/preview` | `{plan}` → proposte testuali e versione template; nessuna scrittura |
| `POST /api/admin/slop` | `{plan, reason}` → bozza e audit iniziale |
| `GET /api/admin/slop/:id` | Scheda, stato e ultimi 100 eventi; gli eventi precedenti restano conservati |
| `PUT /api/admin/slop/:id` | `{plan, revision, reason}` → sostituzione completa della bozza; conflitto `409` se obsoleta o importata |
| `POST /api/admin/slop/:id/import` | Revisione, motivazione e quattro conferme → candidato collegato e URL upload |
| `PUT /api/admin/assets/:imageId` | Upload privato esistente, massimo 12 MB, dHash facoltativo |
| `POST /api/admin/review/:imageId` | Decisione esistente, spiegazione facoltativa modificabile e audit |

Le quattro conferme dell'importazione sono `facts_confirmed`, `rights_confirmed`, `safety_confirmed`, `comparability_confirmed`, tutte booleane `true`; `owner_declaration` appartiene alla scheda. I campi, vocabolari e limiti canonici sono in `shared/slop.ts`: schema scheda `1`, template `1.0.0`, iterazione 1–1000, prompt massimo 8000 caratteri, spiegazione 4000, motivazione 2000, limite del corpo delle API studio 64.000 su Content-Length e lunghezza del testo. I fatti richiedono tutti e tre i campi; URL con credenziali o protocolli diversi da HTTPS, date inesistenti, date future all'importazione e campi sconosciuti sono rifiutati. Bozze parziali sono ammesse, con titolo obbligatorio; l'importazione esige concept, fonti e provenienza completi.

Ogni modifica registra snapshot, motivazione, revisione e impronta della credenziale amministrativa, mai il token. Non esistono account personali dei revisori: l'impronta distingue credenziali, non persone. Gli eventi del dossier sono immutabili con trigger. Controllo della revisione e batch D1 atomici impediscono sovrascritture concorrenti; una sola importazione crea immagine, fonte, licenza, categorie, curatela e collegamento. Un retry dopo importazione restituisce lo stesso candidato. L'audit della curatela conserva il contesto trasferito; luogo/data della finzione non diventano fatti verificati.

Pagina, API, anteprima e upload ereditano autenticazione amministrativa server-side, protezione Origin e `no-store`. Prompt, modello, meccanismo, fatti e dossier non entrano nei payload della domanda o negli asset pubblici. Il file approvato passa soltanto dagli URL opachi assegnati dal gioco; la spiegazione e i crediti arrivano dopo la risposta. Le etichette Bernoulli indipendenti, i filtri, timer, sessioni e la sequenza PvP condivisa restano invariati.

## Verifiche e limiti operativi

`npm run lint`, `npm test` e `npm run build` verificano entrambi i target TypeScript, template, validazione, migrazione additiva, immutabilità e compatibilità. `npm run test:integration` usa soltanto Worker/D1/R2 locali: revisioni e importazioni concorrenti, provenienza esatta, upload, approvazione/rifiuto, spiegazione modificata con audit, immagine realmente assegnata senza spoiler, tre difficoltà pubbliche e regressioni Allenamento/A tempo/PvP. `ROS_TEST_PROFILE= npm run test:integration` verifica separatamente il profilo demo senza R2. Le fixture sono sintetiche, non un corpus generato o verificato.

La demo remota attuale non configura R2: progettazione e salvataggio richiedono D1 aggiornato e token admin; caricamento e approvazione richiedono i binding di quarantena e immagini già previsti. Il flusso completo è verificato sugli emulatori locali. Questa fase non crea bucket, non configura risorse remote e non pubblica il nuovo schema. Fonti, termini del generatore, diritti, fedeltà del risultato al prompt e qualità editoriale devono essere controllati da una persona; non viene importata alcuna immagine reale di produzione.
