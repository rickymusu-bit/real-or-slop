# Changelog

## Unreleased
- Demo remota senza dipendenza da R2, D1 esistente con ID esplicito e profilo separato per gli emulatori locali.
- Rilascio demo con destinazione verificata, migrazioni/seed separati dalla build e provisioning automatico disabilitato.
- Corretto il flusso build/packaging Cloudflare: output Vite esplicito, build Wrangler da checkout pulito e verifica index/risorse pubblicate.
- Documentata la dipendenza dal codice applicativo ancora fuori da main e le impostazioni della dashboard esistente.

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
