## 0.16.0 — 2026-11-05 (proposta in PR, non pubblicata)

- Input opzionale mediante swipe orizzontale sull'immagine: sinistra = REAL, destra = SLOP, utilizzabile con touch, mouse e penna in Allenamento, A tempo e PvP.
- Pulsanti e tastiera conservati; click/tap e Invio/Spazio sull'immagine mantengono lo zoom. Soglia di trascinamento, protezione contro risposte accidentali e scorrimento verticale preservato.
- I gesti richiamano i pulsanti già esistenti, senza alterare API, tempi, punteggi, controllo server o contenuti editoriali.
- Gesture annullate su scroll verticale, multitouch, perdita della cattura, cambio pagina e scadenza; coordinate finali e soglia stabile per tutta la gesture.
- Aggiunti test delle sequenze di eventi e verifica browser con mouse e touch emulato; specifica `docs/swipe-gestures-v1.0.0.md`. Nessun deploy eseguito.

## 0.15.0 — 2026-11-03 (sperimentale, non attivata)

- Protocollo editoriale v2 indipendente: scoperta REAL multicanale e generazioni SLOP da idee originali o prompt aperti, senza fotografie di riferimento, classifica condivisa, soglie di sorpresa o preferenze storiche.
- Contratto multidimensionale Python/TypeScript, verifica documentale separata, esclusione degli ibridi, feedback con incertezza ed evidenze, regole accessibili prima del gioco.
- Studio privato `/admin/editorial-v2`, migrazione additiva 0013, checkpoint D1/R2, budget atomici, revisione umana con audit e nessun collegamento al catalogo pubblicabile. Gate assenti/disabilitati per default.
- Trasporto Batch condiviso con la compatibilità v1; simulazione riproducibile di 120 fixture e analisi della resa, copertura, duplicati e trasferimento. Le fixture non sostituiscono il benchmark fotografico o i test umani.
- Nessuna migrazione remota, chiamata pagata, schedule, pubblicazione, riclassificazione o rimozione di asset.

## 0.14.2 — 2026-11-03T15:18:33.817420+01:00

- Galleria privata in apertura dello Studio: lotto più recente caricato automaticamente, tutte le REAL e le SLOP archiviate, incluse quelle sotto soglia, con sorgente e generazione affiancate. Editor manuale e pubblicazione in sezioni avanzate.
- Fotografia sorgente visibile anche nella coda Approva/Rifiuta e nella gestione avanzata; il link al generatore è distinto dalla provenienza della fotografia. API arricchite soltanto nell’amministrazione autenticata.
- Nessuna nuova migrazione, dipendenza o chiamata OpenAI. Punteggi, soglie, revisione umana e catalogo pubblicato invariati.

## 0.14.1 — 2026-11-02T21:24:07.507675+01:00

- Archivio privato in R2 anche per generazioni scartate o fallite dopo la produzione del file, con manifest D1 immutabile e preview nello Studio. Nessuna importazione o pubblicazione aggiuntiva.
- Migrazione additiva 0012, controlli condivisi di integrità, recupero idempotente e verifica delle capacità prima delle chiamate pagate. Nessuna attivazione o modifica remota.

## 0.14.0 — 2026-11-02T16:30:46Z

- Workflow editoriale con quattro fasi OpenAI Batch, prompt esclusivamente testuali, valutazione finale cieca, risultati associati per custom_id e nessuna fallback sincrona. Prova da due fotografie / una generazione.
- Checkpoint privati D1/R2, lease e revisione CAS, invii incerti riconciliati senza duplicazioni, prenotazioni atomiche per batch/run/giorno e tetto cumulativo configurabile per i 5 USD della prova.
- Migrazione additiva 0011: prenotazione e deduplicazione delle sorgenti fra run, conservazione di dati e modalità esistenti. Stato tecnico separato dalla revisione Approva/Rifiuta.
- Test con provider fittizio, documentazione Batch e recupero; nessun nuovo secret, dipendenza, cron, pagamento, deploy, migrazione remota o pubblicazione del catalogo.

## 0.13.0 — 2026-11-02T15:58:55+01:00

- Revisione visiva con immagine e Approva/Rifiuta, senza campi o checkbox; preparazione automatica prima della coda, snapshot e conferma umana atomica.
- Preferenze bayesiane persistenti da decisioni umane, esplorazione del 25%, ricerca diversificata e brief morbidi senza cambiare classifica, soglie, libertà generativa o bilanciamento. Nessun training a pagamento.
- Migrazione additiva 0010 e dettagli/gestione avanzata separati. Nessuna attivazione o modifica remota.

## 0.12.0 — 2026-11-02T15:25:07+01:00

- A tempo: scadenze server per singola immagine, scelta 10/20/30 secondi e numero di round; manifest limitato al round corrente, timeout senza risposte fittizie e feedback senza consumo del round successivo.
- Allenamento: tempo misurato nel riepilogo, senza effetti su punti o spareggi.
- Oscuramento locale al cambio scheda/focus e chiusura dell’ingrandimento, senza pausa del timer; ostacoli al salvataggio diretto limitati alle immagini di gioco.
- PvP sospeso nella navigazione e nelle API pubbliche; attore, binding e dati storici conservati.
- Migrazione additiva 0009; vecchie sessioni e deadline preservate. Nessuna migrazione, pubblicazione o generazione remota eseguita.

## 0.11.2 — 2026-11-02T13:34:37+01:00

- Avvio manuale del workflow con scelta esplicita di 2 o 20 fotografie; default
  controllato da due riferimenti, massimo una generazione e quattro analisi visive.
- Raccolta CLI con `--limit` 1–20, mantenendo il lotto quotidiano normale a 20.
- Indicazioni operative per la prima attivazione e per vedere candidate/dossier
  nel sito e file scartati negli artifact privati. Nessuna attivazione a pagamento.

## 0.11.1 — 2026-11-02T09:43:07+01:00

- Workers Builds può pubblicare quando tutte le migrazioni D1 risultano già
  applicate, senza ripetere migrazioni/seed né richiedere una deroga permanente.
- Nuove migrazioni richiedono ancora preflight, backup e approvazione; cronologia
  D1 non disponibile/incoerente o migrazione incompleta interrompono il rilascio.
- I deploy conservano le variabili del Worker, inclusi interruttori e budget.

## 0.11.0 — 2026-11-01T22:00:00Z (non attivata)

- Classifica visiva unica REAL/SLOP, reinterpretazione testuale con generatore libero,
  API OpenAI configurabili e valutazione finale cieca con tentativi/budget limitati.
- Registro privato immutabile delle sorgenti, dossier e recupero senza rigenerazione.
- Rimozione della difficoltà operativa con archivio dei dati precedenti.
- Approvazione distinta da pubblicazione atomica 50/50, note di revisione facoltative,
  diagnostica privata e integrazione Studio/admin; campionamento indipendente invariato.
- Migrazioni 0007/0008 locali, test mock ed emulatori; nessuna attivazione pagata,
  migrazione remota, pubblicazione del catalogo o deploy.

# Changelog

## Unreleased
- Versionati i binding R2 QUARANTINE/IMAGES confermati dal proprietario e aggiornata la guardia di deploy:demo, mantenendo Worker, D1 e modalità demo esistenti. Nessun provisioning automatico.
- Flusso diretto file locali → D1/R2 senza Google Drive, con anteprima, originali privati immutabili su R2, import ripetibile e ripresa degli upload. Spiegazioni modificabili nella revisione sia per REAL sia per AI.
- Aggiunto supporto alle sei famiglie CC BY/BY-SA/BY-NC/BY-ND/BY-NC-SA/BY-NC-ND 2.0, 3.0 e 4.0, incluse le varianti pubblicate, per il sito non commerciale e senza adattamenti. Elenco condiviso pipeline/Worker, versione e giurisdizione conservate; conferme umane obbligatorie.
- Demo remota senza dipendenza da R2, D1 esistente con ID esplicito e profilo separato per gli emulatori locali.
- Rilascio demo con destinazione verificata, migrazioni/seed separati dalla build e provisioning automatico disabilitato.
- Corretto il flusso build/packaging Cloudflare: output Vite esplicito, build Wrangler da checkout pulito e verifica index/risorse pubblicate.
- Documentata la dipendenza dal codice applicativo ancora fuori da main e le impostazioni della dashboard esistente.

## 0.10.0 — 2026-10-26
- Gestore di immagini condiviso con fetch/decode, deduplica, due download concorrenti, priorità corrente, cache a finestra, budget e cancellazione; risposte abilitate solo dopo decodifica.
- Preparazione persistita per A tempo, manifest opachi e start atomico/idempotente dopo verifica di tutti i file; scadenza assegnata dal server, TTL di preparazione e countdown monotono.
- Allenamento con finestra corrente + due immagini, presentazione esplicita dopo decode e retry senza nuove estrazioni o punti.
- PvP con preparazione per-round, conferme autenticate di entrambi, deadline comune e limite di attesa di 45 secondi; riconnessione e pacchetti obsoleti gestiti senza riavviare il tempo.
- Annullamento distinto dal completamento in caso di guasto, audit e statistiche che escludono risultati invalidati; ultima risposta/completamento e annullamento protetti da transazioni concorrenti.
- Migrazione additiva, compatibilità delle assegnazioni legacy e override operativo per nuove partite; query aggregate per lotti fino a 50 round.
- Test unitari/HTTP/browser, fixture corrotte e lente, benchmark Chromium riproducibile con banda condivisa e documentazione del protocollo v1.0.0. Nessun deploy o modifica Cloudflare.

## 0.9.0 — 2026-10-25
- Tema Digital Gallery su home, modalità, gioco, risultati, PvP, pagine informative e amministrazione: palette approvata, marchio REAL or SLOP e superfici sobrie.
- Space Grotesk Bold e Inter serviti localmente con licenze OFL; nessun servizio font esterno o dipendenza aggiunta.
- Azioni REAL/SLOP simmetriche con valori API REAL/AI invariati; immagine integra senza filtri, progresso e layout compatto su telefono/tablet/desktop.
- Skip link, focus e zoom da tastiera, nomi accessibili, contrasti verificati e movimento ridotto per il feedback post-risposta.
- Verifica browser riproducibile con Chromium esistente, screenshot locali e documentazione v1.0.0. Backend, dati, campionamento e timer invariati; precaricamento riservato alla fase successiva.

## 0.8.0 — 2026-10-25
- Studio privato SLOP per concept, fatti con riferimenti, prompt integrale, modello, versione/data della generazione esterna e valutazioni delle iterazioni.
- Template locali Facile/Medio/Difficile e profilo Esperto soltanto editoriale; proposta di spiegazione modificabile basata esclusivamente sui fatti forniti.
- Salvataggi con revisione e audit immutabile; importazione manuale atomica/idempotente in quarantena e moderazione umana esistente, senza generatori esterni o creazione automatica di immagini.
- Provenienza congelata dopo l'importazione; nuove iterazioni separate, spiegazione finale modificabile durante la revisione con audit della differenza.
- Migrazione additiva, test schema/unitari/HTTP, controlli browser desktop/mobile e documentazione dello studio v1.0.0. API pubbliche, etichette indipendenti, sessioni e timer invariati. Nessuna nuova dipendenza o risorsa Cloudflare.

## 0.7.0 — 2026-10-25
- Corretto il vincolo di quota della 0.6.0: ogni nuova posizione usa una moneta REAL/AI indipendente al 50%, senza compensazioni o limiti alle serie consecutive.
- Capacità calcolata prima delle monete: round limitati allo stock distinto di ciascuna classe; rifiuto con 409 se non è garantibile una partita valida.
- Pesi editoriali comuni, posizioni compatibili con entrambe le classi, ampliamento preventivo degli strati e ottimizzazione delle riserve; nessuna correzione dei conteggi effettivi della partita.
- Simulazioni riproducibili su frequenza globale, storia, varianza binomiale e caratteristiche aggregate; vecchie quote conservate soltanto come controllo negativo dei test.
- Test delle assegnazioni già esistenti e del PvP condiviso; documentazione del campionamento v2.0.0. Nessun merge, deploy o modifica cloud richiesta.

## 0.6.0 — 2026-10-25 (politica delle quote superata dalla 0.7.0)
- Campionamento stratificato condiviso tra Allenamento, A tempo e PvP, con quote REAL/AI e confronti delle distribuzioni editoriali.
- Deduplica per ID, storage, SHA-256 e dHash; famiglie con etichette contrastanti escluse e fallback espliciti per cataloghi incompleti.
- Upload privato con dHash facoltativo calcolato dalla pipeline; un file sostituito senza nuova impronta azzera quella precedente.
- Benchmark riproducibile contro `balanced()`, test sintetici e integrazione su assegnazioni D1 locali, con filtri e protezioni dagli spoiler.
- Sessioni esistenti, timer, punteggi, difficoltà e fixture demo invariati. Nessuna nuova migrazione o dipendenza.

## 0.5.0 — 2026-10-25
- Schede editoriali private REAL/AI con vocabolari controllati, contesto rappresentato, fatti documentati e valutazioni soggettive separati.
- Migrazione D1 additiva, audit immutabile con snapshot e controllo delle revisioni contro sovrascritture concorrenti.
- Modulo amministrativo per classificazioni, prove, note e cronologia; salvataggio separato dalla decisione umana obbligatoria.
- Test di upgrade, autorizzazioni, validazione, concorrenza, compatibilità demo e assenza di spoiler. Nessuna quarta difficoltà, modifica al campionamento o servizio cloud aggiunto.

## 0.1.0 — 2026-10-25
- Architettura Worker/Vite, schema D1, seed sintetico idempotente e adapter storage.
- Navigazione responsive, protezione amministrazione, controlli API/schema e CI.

## 0.2.0 — 2026-10-25
- Connettori Python ufficiali, quarantena privata, controlli diritti/deduplica e workflow manuale inattivo.
- Import REAL/AI, upload privato, revisione editoriale autenticata e audit locale.

## 0.3.0 — 2026-10-25
- Allenamento e A tempo completi con filtri, bilanciamento, sessioni e scadenze D1 server-side.
- Crediti dopo risposta, ripresa, tasti rapidi, zoom, punteggio e statistiche editoriali private.

## 0.4.0 — 2026-10-25
- PvP due giocatori su Durable Objects SQLite e WebSocket hibernation, reveal comune, scadenze e audit D1.
- Riconnessione HTTP/WebSocket, rate limit, abbandono e test con due client reali.
- Backup/restore locali verificabili, configurazione preview fail-closed e piano di rilascio separato dalla produzione.
