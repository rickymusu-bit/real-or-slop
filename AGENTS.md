# Istruzioni per gli agenti

Versione 39.0.0, aggiornata il 2026-11-27T08:14:46Z. Percorsi relativi alla radice del repository; le versioni precedenti sono nella
cronologia git.
Valgono per Codex e per Claude Code (`CLAUDE.md` importa questo file).

## Il progetto

REAL or SLOP è un gioco educativo, personale e non commerciale: per ogni foto il giocatore dice se è una fotografia autentica (REAL, da
Wikimedia Commons) o un'immagine generata con l'IA (SLOP). Una dashboard privata (`/admin`) gestisce la libreria delle immagini, la
generazione delle SLOP e le impostazioni. Frontend Vite e TypeScript, Worker Cloudflare con D1 e R2, modelli OpenAI per prompt, immagini e
valutazioni.

**Dove leggere:** `MASTER.md` per la mappa (file in uso, specifiche vigenti, migrazioni, rilascio), le specifiche in `docs/` per il
comportamento di ogni area, `CHANGELOG.md` per la storia delle versioni.

## Principi che non cambiano senza l'owner

- **Origine nascosta fino alla risposta.** Nessun indizio dell'origine nei file serviti (copie WebP senza metadati, stessa ricetta finale
  e stesso formato per REAL e SLOP), nell'interfaccia (marchio «RS» su tutte, nessun testo durante la partita) o nei dati inviati
  al browser prima della risposta. Su richiesta confermata, un modello descrive la REAL intera per assi durante il caricamento o dalla
  galleria (decisione del 2026-11-23, specifica `libreria-immagini`, sezione 11). La descrizione visiva è privata. Il protocollo adottato il 2026-11-25 (`generazione-slop` 17.0.0, implementata nel ramo 1.60.0) prepara una scena inglese dalle descrizioni, variando zero o più parametri con probabilità da calibrare sulle REAL.
  Ambiente e configurazione della luce restano vincolati di default; i cambi di ambiente/genere coordinano gli assi dipendenti; gli assi descrivono la scena, i parametri controllano le variazioni.
  Usura, danno, invecchiamento e pulizia sono separati; il contenuto dello schermo è distinto da acceso/spento. La prima
  generazione riceve solo testo. Il rapporto d'aspetto della foto intera è un parametro, da coordinare con soggetto e genere
  fotografico e applicare alle dimensioni API; se non estratto si conserva. Le copie di gioco restano 4:5.
  Evitare copie riconoscibili e ricorrenze statistiche che rivelino l'origine.
- **Risultati** (decisioni del 2026-11-20, che sostituiscono quella del 2026-11-19). A fine partita, per ogni REAL titolo, autore,
  licenza con link, link alla foto originale e indicazione delle modifiche della copia, senza descrizione editoriale né data di
  consultazione; per ogni SLOP il prompt e il modello. Le SLOP non hanno descrizione.
- **Dashboard** (decisione del 2026-11-19). Gallerie è la sezione iniziale. Ogni galleria apre la propria griglia e i wizard
  «Carica REAL» e «Genera SLOP» su indirizzi dedicati nella stessa scheda. Il wizard REAL acquisisce dalle ricerche su Commons.
  Le altre sezioni sono Statistiche e Impostazioni. Nella galleria la selezione offre approvazione, pubblicazione, cestino,
  cambio galleria; le vecchie proposte SLOP non compaiono più sulle REAL. La generazione passa dalla pipeline della galleria. La barra lascia visibile la griglia.
- **Admin in inglese** (2026-11-25). Tutta l’interfaccia amministrativa, gallerie e pipeline incluse, usa l’inglese: etichette, assi, parametri, conferme, errori e nuovi testi dei modelli. Trascrizioni fotografiche nella lingua originale. Non tradurre automaticamente contenuti dell’owner o dati storici. Il sito pubblico resta in italiano. Le proposte obsolete sono rimosse dal dettaglio delle REAL e il vecchio wizard browser non è più presente; API e dati precedenti restano compatibili per il recupero.
- **Descrizioni REAL sul server** (2026-11-26). Import REAL, galleria e dettaglio inviano la selezione confermata alla preparazione persistente della pipeline. Tutti i lavori vengono registrati insieme prima dell’avvio, con una chiamata per originale per descrizione e profilo; il browser osserva lo stato e legge i risultati. Scheda in secondo piano, ricaricamento e chiusura della pagina non interrompono la coda. Non ritentare esiti incerti né richiedere nuove chiamate per riprendere l’osservazione. La rotta sincrona precedente resta compatibile, protetta dai claim concorrenti. Le preparazioni di una stessa galleria si eseguono in serie (2026-11-26), perché ognuna riusi il dizionario delle categorie scritto dalle precedenti; la riscrittura dei parametri di tutte le REAL è un comando confermato che conserva le descrizioni.
- **Progresso bloccante delle chiamate a pagamento** (2026-11-26). Preparazione dei parametri REAL, scene, immagini, valutazioni e correzioni mostrano una finestra modale dall’invio confermato fino all’esito dei Workflow, con avanzamento. Il resto della pagina è inerte e Esc non chiude la finestra. Dentro resta disponibile l’annullamento gratuito delle richieste in coda, dopo il loro accodamento; le chiamate già inviate terminano. Tornare alla pagina riprende solo l’osservazione dei lavori attivi, senza invii o spese nuovi. Errori/esiti incerti restano segnalati senza retry. Scheda nascosta e chiusura del browser non fermano il server.
- **Un solo wizard SLOP** (2026-11-25). La 1.60.0 usa la pipeline della specifica `generazione-slop` 17.0.0: preparazione
  collettiva delle REAL, regole e probabilità per galleria, scene inglesi modificabili, generazione testuale e valutazione
  confermate, correzioni scelte dall'owner, accettazione, trattamento e copie di gioco. Le vecchie lavorazioni hanno un riquadro
  di recupero; il nuovo flusso non usa il vecchio ciclo automatico. Ogni foto appartiene a una galleria; le REAL restano giocabili.
  Nessun registro permanente REAL–SLOP. Dal 2026-11-26 ogni REAL conserva soltanto un contatore anonimo delle generazioni
  iniziali riuscite, comprese le candidate poi scartate; resta riutilizzabile. Dal 2026-11-27 si recuperano anche gli usi
  storici dimostrabili dai registri, una volta per lavorazione con immagine e valutazione concluse prima della 0078;
  baseline anonima separata per non duplicare il conteggio. Nessun recupero storico inventato o legame con SLOP accettate. I profili e le particolarità sono privati e non sono tag di navigazione.
- **Approvazione nel wizard** (2026-11-26). Le SLOP approvate escono dal passo 4 e restano nella galleria, dove si pubblicano.
  Dal 2026-11-27 approvazione e accodamento dell’osservazione sono atomici sul server; la claim sopravvive alla chiusura del lavoro.
  Il passo 4 mostra soltanto le SLOP nuove da preparare; approvare non cancella foto o osservazioni.
- **Nessun indice delle descrizioni** (2026-11-26). Rimossi comandi, API, identità normalizzate per la ricerca ed embedding degli ambienti. La pipeline usa direttamente descrizioni e profili preparati nella galleria; le distribuzioni restano basate sui parametri osservati. Nessuna chiamata di indicizzazione. Migrazione 0076: elimina solo dati di ricerca obsoleti, conserva assi, profili, immagini e cronologia delle chiamate.
- **Crowding e detail rimossi** (2026-11-26). Nessuna misurazione a pagamento, punteggio, soglia, avviso o contesto di misurazione nell’admin/API. I vecchi flussi non leggono più questi dati: estrazione uniforme e nessun punteggio nei prompt. La migrazione 0077 rimuove soglie di galleria e impostazioni; osservazioni e contesti storici già pagati restano privati, senza nuove letture/scritture delle misure, e le sole osservazioni si cancellano con la foto. Le misure tecniche `copy_metrics` e il trattamento fotografico restano attivi.
- **Bilanciamento del dataset.** Il nuovo protocollo (2026-11-25) considera conteggi, distribuzioni dei parametri e combinazioni
  rilevanti della galleria. Le modifiche possono rendere una console più ordinaria. Non forzare novità vistose o unicità a ogni
  SLOP. Dal 2026-11-26 confronto e pesi usano i parametri osservati sull’originale SLOP intero con osservazione autorizzata,
  senza prompt o profilo richiesto. Dal 2026-11-27 l’approvazione SLOP include automaticamente un’osservazione
  dell’originale ancora mancante, al massimo una chiamata per foto, senza pulsante o conferma separati. Le SLOP non osservate sono indicate ed escluse, mai rimpiazzate con i valori richiesti.
  Le probabilità automatiche sono stime empiriche rivedibili; anche le osservazioni dei modelli restano fallibili. Il controllo delle combinazioni e delle ricorrenze richiede revisione; il 30% del test
  non è un valore definitivo. Dal 2026-11-26 i parametri dipendenti estratti condividono un donatore compatibile; i valori non
  estratti restano vincoli. Le scene della stessa richiesta contano provvisoriamente anche le estrazioni precedenti del gruppo,
  senza nuove chiamate né riserve permanenti (specifica `generazione-slop` 17.9.0).
- **Niente tag** (decisione del 2026-11-20). Le foto di una galleria condividono quasi gli stessi tag: la galleria basta a
  raggrupparle. Nessun vocabolario, filtro o distribuzione per tag; approvare non richiede tag. I parametri privati del nuovo
  protocollo non introducono tag di navigazione o didascalie. Il trattamento delle SLOP ricava bianco e nero, seppia o colore
  dalle misure della REAL.
- **Fonti REAL controllate su Commons** (decisione del 2026-11-20). Ogni notte 50 REAL (numero modificabile dalle Impostazioni,
  0 sospende), ciascuna tre mesi dopo l'ultimo controllo,
  per sapere se il file esiste ancora. Un file sparito è solo segnalato all'owner, mai ritirato o cancellato in automatico.
- **Credibilità e correzioni confermate** (decisione del 2026-11-25). Il valutatore esamina la SLOP **intera**, prima di crop e
  trattamento, e propone eventuali correzioni con zona, beneficio atteso e rischio. Ogni intervento richiede conferma esplicita
  dell'owner prima della chiamata a pagamento, anche se resta disponibilità nel massimo del batch. Le correzioni usano
  `images/edits` con immagine intera e maschera locale. Nessun ciclo automatico di valutazione/correzione o rigenerazione.
  Un ulteriore intervento o una rivalutazione richiede una nuova decisione. Valutazione e decisione dell'owner restano distinte.
  Una candidata scartata non viene pubblicata; copie 4:5, approvazione e pubblicazione restano passaggi successivi.
  Il nuovo wizard applica questi vincoli; le vecchie API restano compatibili per le lavorazioni precedenti.
- **Copie di gioco 4:5 verticali per tutte** (decisione del 2026-11-15), REAL e SLOP. Il ritaglio non deve eliminare elementi **fondamentali** per il significato della fotografia; in caso contrario
  l'owner corregge l'inquadratura. Le SLOP si valutano **intere** prima di creare la copia 4:5.
- **Inquadratura ed elaborazione** (decisioni del 2026-11-19 e 2026-11-20). Le nuove copie mostrano la foto intera nel 4:5 con bande
  nere. Il rettangolo 4:5 è subito disponibile sulla stessa area, bande comprese, con maniglie per puntatore e touchscreen.
  Si sposta liberamente entro la foto quando ci sta. Quando supera una dimensione della foto, si centra su quell’asse e pareggia le bande.
  Allontanare due dita allarga il rettangolo, avvicinarle lo restringe. Le elaborazioni avviate nella finestra della foto mostrano
  al centro uno stato di lavorazione e bloccano i comandi fino all’esito.
- **Il Worker gestisce ciò che riguarda l'API di OpenAI, il browser tutto il resto** (decisione del 2026-11-16, che sostituisce
  quella del 2026-11-15 sul browser come sola interfaccia). Sul Worker: proposte editoriali, generazione e valutazione (il codice
  attuale usa un Workflow; il nuovo protocollo deve attendere le conferme di correzione dell'owner), oltre a dati e archivio.
  Nel browser: inquadratura, trattamento delle
  SLOP con i cursori, conversione in copia di gioco (WebP) e misure, anche in gruppo con la pagina aperta; il Worker controlla e
  conserva la copia caricata. Un solo codificatore per REAL e SLOP: la compressione non deve distinguerle.
- **Chiamate a pagamento:** solo con conferma esplicita dell'owner del **numero massimo** previsto per la fase, registrate in
  `paid_calls` senza importi, esiti incerti mai ripetuti in automatico; niente prezzi né budget, il limite è quello del progetto
  OpenAI. Le valutazioni previste sono comprese nel massimo; una proposta del valutatore non autorizza la spesa per correggere.
  Autorizzazione permanente dell’owner del 2026-11-27: l’approvazione SLOP include l’osservazione automatica mancante (massimo
  una chiamata per originale); gli adeguamenti necessari alle foto già presenti dopo modifiche o bug fix della pipeline sono
  eseguiti dall’agente tramite API, riusando i risultati disponibili e limitando le chiamate alle foto necessarie. Non richiedono
  un nuovo consenso né pulsanti di recupero nell’interfaccia. Prima si verifica lo stato; esiti incerti mai ripetuti automaticamente.
  Questa autorizzazione non estende la spesa a esperimenti, nuove generazioni o correzioni e non autorizza merge/deploy.
  Nei test software solo modelli finti; gli esperimenti reali richiedono conferma esplicita.
- **Libreria come un file system:** nessun lotto, archivio o registro delle eliminazioni; svuotare il cestino cancella ogni riga e ogni
  file dell'immagine.
- **Contenuti delle SLOP:** regole nella specifica `contenuti-e-trasparenza` (persone vive o morte da meno di 50 anni mai nominate né
  descritte, personaggi storici senza crimini attribuiti, regimi documentati ma mai celebrati, niente nudità fuori dalle opere d'arte).
- **SLOP senza titolo** (decisione del 2026-11-17). Identità tramite ID. Per rifare le copie si conservano formato e misure anonime
  della REAL, nient'altro.
- **Niente didascalie**, né nel gioco né nella dashboard (decisione del 2026-11-13).
- **Privacy:** solo il cookie tecnico, partite cancellate dopo 12 mesi, testi legali verificati da un legale: ogni modifica a Privacy o
  Termini va fatta verificare di nuovo (specifica `privacy-note-legali`).

## Regole di lavoro

1. Prima di modificare: `git status --short --branch`, `origin/main` aggiornato, stato delle PR. Leggere `MASTER.md` e la specifica
   dell'area. Registrare le contraddizioni tra richiesta, specifica e codice e chiedere solo le decisioni davvero mancanti.
2. Le istruzioni esplicite dell'owner prevalgono. Deploy, merge, migrazioni remote e chiamate a pagamento solo con la sua autorizzazione
   nella sessione. Non stampare credenziali.
3. **Versioni** (decisione dell'owner del 2026-11-14). I file hanno nomi stabili, senza versione: la loro storia è in git
   (`git log -p <file>`). L'app ha una sola versione, in `package.json` (MAJOR, MINOR, PATCH); al merge su `main` il workflow
   `release-tag` crea il tag `vX.Y.Z`, quindi ogni file di un rilascio si legge con `git show vX.Y.Z:<file>`. Le specifiche,
   `AGENTS.md` e `MASTER.md` dichiarano nell'intestazione una versione semantica (MAJOR per modifiche strutturali, MINOR per
   modifiche significative, PATCH per correzioni) e il timestamp ISO 8601 dell'ultima modifica, aggiornati a ogni modifica, così si
   possono citare («specifica `libreria-immagini` 2.0.0»). Le intestazioni del codice descrivono lo scopo del file, non la sua
   cronologia. Eccezione: le migrazioni (`migrations/`) non si rinominano mai, perché Wrangler le riconosce dal nome del file.
4. **Documenti.** Ogni area ha una sola specifica vigente, `docs/<area>.md`, che descrive il comportamento attuale per intero: quando una
   decisione lo cambia, si aggiorna la specifica dell'area, non si aggiunge un documento che «prevale dove dice altro». Le specifiche
   registrano le decisioni dell'owner con la data e si citano per nome (specifica `gioco-a-livelli`). I file di codice in uso sono
   elencati in `MASTER.md`, la storia delle versioni dell'app in `CHANGELOG.md`. A ogni modifica si aggiornano la specifica dell'area,
   `MASTER.md` (file e stato) e `CHANGELOG.md`; `AGENTS.md` quando cambiano regole o principi.
   **Schema della pipeline sempre aggiornato** (richiesta esplicita dell'owner, 2026-11-26): ogni modifica al funzionamento della
   pipeline deve aggiornare nella stessa PR lo schema `docs/assets/pipeline-slop.dot`, rigenerare `docs/assets/pipeline-slop.svg`
   e la copia identica `public/docs/pipeline-slop.svg` con `npm run diagram:pipeline` (Graphviz). Seguire i quattro passi del wizard,
   usare etichette comprensibili, distinguere azioni gratuite, conferme e chiamate a pagamento. La build controlla corrispondenza
   della sorgente e delle due copie; la revisione verifica l'allineamento del significato con codice e specifica.
5. **Verifica prima della consegna:** `npm run lint`, `npm test`, `npm run build`, `npm run dry-run`, `npm run test:integration` e, per la
   dashboard e il gioco, `ROS_TEST_BROWSER=1 npm run test:integration` su desktop e mobile. Ogni fase in una PR con anteprima e CI verde.
   **Consegna sempre tramite PR** (preferenza esplicita dell'owner, 2026-11-15): quando le modifiche sono pronte, pubblicare il ramo e
   aprire o aggiornare una PR su GitHub, così possono partire i test CI. Non fermarsi a commit o patch locali; nel resoconto fornire il
   link della PR e lo stato effettivo dei controlli. L'apertura della PR non autorizza merge o rilascio in produzione.
6. **Resoconto finale:** cosa è cambiato, verifiche ed esiti, rischi, azioni non eseguite.
7. **Rilascio:** il merge su `main` avvia da solo build, migrazioni remote e deploy (Workers Builds, comando
   `npx wrangler d1 migrations apply DB --remote && npm run deploy`): il merge è l'autorizzazione dell'owner a entrambi. Le anteprime delle
   PR usano solo il database `real-or-slop-preview` e i bucket `real-or-slop-preview-*` (blocco `previews`, ambiente `preview` per le
   migrazioni), mai quelli di produzione.

