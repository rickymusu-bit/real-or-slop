# Changelog

## Unreleased
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
