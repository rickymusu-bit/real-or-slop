> Aggiornamento 2026-11-02T15:25:07+01:00: le regole su countdown complessivo e disponibilità PvP sono superate da [Tempi e protezione v1.0.0](gioco-tempi-protezione-v1.0.0.md). Documento storico conservato.

# Real or Slop — Istruzioni per Codex: Digital Gallery e caricamento immagini

**Versione:** 1.0.0  
**Data:** 25 ottobre 2026  
**Destinatario:** Codex sul repository `rickymusu-bit/real-or-slop`  
**Tipo:** specifica di implementazione; non equivale a codice già realizzato.  
**Rilascio:** branch dedicato + PR in bozza, **senza** merge, deploy remoto, modifiche cloud o billing non autorizzati.

## Prompt da assegnare a Codex

> Sei lo sviluppatore responsabile di Real or Slop. Esamina il codice esistente prima di modificare alcunché. Implementa il tema visivo approvato **Digital Gallery** e il precaricamento robusto delle immagini per Allenamento, A tempo e, compatibilmente con il protocollo di sincronizzazione, PvP. Mantieni stack TypeScript/Vite + Cloudflare Worker, D1, Durable Objects e gli adapter storage esistenti, senza introdurre servizi a pagamento. Non reinventare il progetto né modificare le regole di classificazione.

### 1. Stato esistente da rispettare

- Il frontend usa `src/main.ts`, `src/style.css`, `src/play.ts` e `src/pvp.ts`.
- Backend: `worker/game.ts` (sessioni, risposte, media), `worker/room.ts` (PvP), `worker/storage.ts` (media demo/R2).
- Attualmente `POST /api/sessions` assegna già la scadenza assoluta (`expires_at`) per la modalità a tempo; `GET /api/sessions/:id` restituisce soltanto il round corrente e imposta `presented_at`; `/api/sessions/:id/media/:roundId` richiede un round presentato. **Di conseguenza creare un preload solo nel browser non basterebbe**: il timer scorrerebbe durante il caricamento iniziale e non si potrebbero richiedere i round futuri.
- Il frontend calcola un conto alla rovescia usando `expiresAt` e `serverNow`; il backend rifiuta le risposte dopo la scadenza. In PvP il Durable Object conserva `deadline` e `startedAt`, valida lato server e trasmette il medesimo round a entrambi.
- Conserva cookie/session ownership, anti-spoiler e idempotenza degli invii. Non usare timer solo browser per decidere i risultati.

### 2. Sistema grafico approvato — Digital Gallery

Tema **dark** predefinito, sobrio, quasi da museo di fotografia contemporanea, con dettagli da laboratorio visivo. Il contenuto è la fotografia: nessun effetto cosmetico che interferisca con l'immagine presentata.

| Token | Valore | Uso |
|---|---|---|
| `--bg` | `#0D0F14` | Sfondo primario |
| `--surface` | `#1B2030` | Pannelli e superfici |
| `--text` | `#F4F6FB` | Testo principale |
| `--muted` | `#AAB4C5` | Etichette secondarie |
| `--real` | `#54DEC8` | Pulsante/stato REAL |
| `--slop` | `#B892FF` | Pulsante/stato SLOP |
| `--hairline` | `#30394C` | Bordi sottili / traccia del progresso |
| `--on-accent` | `#0D0F14` | Testo sulle azioni colorate |

- Logo centrato sulle parole **REAL or SLOP**, quattro lettere + «or» piccolo + quattro lettere. Usare Space Grotesk Bold per titolo/logo, Inter per UI e testi, con fallback locali. Non caricare un servizio font terzo senza una valutazione privacy/performance; se si includono file locali, rispettare licenze e peso.
- Pulsanti affiancati di pari ampiezza e gerarchia, REAL turchese e SLOP viola. **Etichette interne/server restano `REAL` e `AI`**; il testo visibile «SLOP» è una scelta editoriale, non un nuovo valore API/DB. Fornire testo accessibile «Generata con IA» per disambiguazione senza spoiler.
- Fotografia protagonista, grande e centrata, mostrata **integra**; `object-fit: contain` nell'area di gioco, aspect ratio responsivo, fondo uniforme. Non applicare filtri di colore, contrasto, saturazione, grana, blur o glitch prima della risposta.
- Status minimalista: progresso, round, punteggio e tempo a disposizione se pertinente. Evitare in modo prioritario lo scroll in verticale nella schermata di domanda su smartphone/tablet, salvo zoom esplicito.
- Round completion e reveal: animazioni brevi e facoltative; eventualmente un glitch leggero **solo dopo** l'invio. Rispettare `prefers-reduced-motion`.
- Hover, focus e disabled chiari; contrasto WCAG AA, navigazione tastiera, etichette accessibili, comunicazioni `aria-live` e controlli toccabili di dimensione comoda. Non distinguere REAL/SLOP solo tramite colore.
- Applicare design a home, scelta modalità, gioco, risultati, pagine informazioni/crediti e PvP; admin può usare una variante coerente ma funzionale. Eliminare i vecchi accenti lime dominanti e centralizzare i token CSS: non disseminare valori hardcoded nei componenti.
- Tema chiaro opzionale solo se implementabile senza complicazioni: salvare la scelta localmente, dark predefinito, `color-scheme` corretto, nessun flash all'avvio. Non ritardare il compito prioritario per questa opzione.
- **Demo attuale:** usa figure geometriche sintetiche e deve continuare a dichiararsi demo. Non inventare fotografie reali né pubblicare contenuti non verificati.

### 3. Obiettivo di caricamento e definizione di «pronto»

La visualizzazione di un round e il tempo non devono dipendere dalla latenza di rete evitabile.

Implementare un **Image Preload Manager** riusabile e testabile:
- scaricamento e deduplicazione per URL opaco, concorrenza configurabile limitata (es. 2–4), priorità al prossimo round, cancellazione richieste inutili quando termina la sessione;
- `new Image()`/fetch appropriato + `decode()` per confermare decodifica, non semplicemente risposta HTTP; rilevare errori, timeout, file corrotti e zero dimensioni;
- cache browser HTTP e memory cache best-effort; non conservare inutilmente 50 bitmap decodificate in RAM mobile: politica a finestra con budget memoria, e prefetch rete per il resto quando necessario;
- l'immagine attiva deve essere eager/high priority, non `loading="lazy"`; mantenere il nodo nascosto finché la risorsa non è pronta. L'immagine può essere visualizzata subito se già in cache;
- progress indicator iniziale («Preparing your challenge», numero immagini pronte) e stato di ripristino comprensibile con retry; mai mostrare un placeholder come se fosse il vero soggetto della domanda;
- fallback di formato PNG/JPEG/WebP dalle risorse esistenti; AVIF/WebP e `srcset` solo se la pipeline è in grado di generare vere varianti e si può mantenere qualità coerente. Non manipolare REAL e AI in modi diversi.
- target indicativo mobile: max lato lungo circa 1280–1600 px, con attenzione ai dettagli importanti; target peso tipico 150–400 KB, **non** un vincolo che distrugga prove visive. Calcolare i budget effettivi con test.

### 4. Problema cruciale: tempo **validato dal server**

**NON** implementare la falsa soluzione `clearInterval()`/pausa solo client: il server continuerebbe a scadere, rendendo la partita ingiusta. Il vecchio comportamento `expires_at = now + duration` alla creazione va corretto per la preparazione.

**Allenamento:**
- caricamento dell'immagine corrente e prefetch delle successive 2–3; l'utente non può inviare risposta finché l'immagine corrente non è decodificata; nessuna scadenza server da modificare;
- per i round futuri fornire un protocollo autenticato, con identificatori e URL neutri, che non riveli `type`, fonte, titolo, licenza, spiegazione, prompt o correttezza. Non esporre via filename e attributi descrittivi indizi sull'origine;
- in errore persistente consentire retry o **sostituzione senza punteggio/penalità**, mantenendo unicità e registrando il motivo sul server. Evitare incrementi falsi delle domande risposte.

**A tempo (countdown complessivo 60/120/180 s):**
- introdurre una **fase server-side di preparazione** e una fase separata **start** idempotente; `expires_at` e istante di partenza si impostano **soltanto** quando il gioco passa da «preparing» a «active» in una transazione/operazione SQL coerente; gli endpoint delle risposte devono rifiutare sessioni non avviate;
- il server decide ordine dei round e fornisce media opachi **senza risposte** per il batch preparatorio, accessibili solo alla sessione autorizzata e senza alterare `presented_at`/risultati; dopo preparazione, `POST /api/sessions/:id/start` restituisce `serverNow` ed `expiresAt`. Start doppio/retry non riavvia né estende il tempo; la preparazione ha una TTL di abbandono e limiti di risorse;
- **preferire precaricare tutta la sessione a tempo prima dello start** (o un sottoinsieme garantito con strategia di fallback realmente corretta lato server), mostrando peso/progresso. Se il numero di immagini del catalogo rende il preloading totale eccessivo, predisporre limite ragionevole, avviso su consumo dati e scelta tecnica documentata; non mentire dicendo «tutte pronte» quando non lo sono;
- countdown dall'istante del server e `serverNow`, con `performance.now()` come base locale per rendere fluida la visualizzazione e risincronizzazione alle risposte. Refresh/riconnessione NON devono riavviare il timer;
- **guasti durante una partita attiva:** nessuna pausa arbitraria client-only e nessuna proroga illimitata tramite caricamenti artificialmente lenti. Se un round non può essere visualizzato, offrire riprova a tempo server ancora attivo, oppure invalidare equamente l'intera sessione con stato distinto da `completed`, senza classifica, spiegando il problema. Per sospensioni vere servirebbe un protocollo server-side con limite/rate limit/audit: proporlo separatamente, non introdurlo in modo aggirabile.
- **Fairness:** precaricare contenuti prima della partenza rende tecnicamente possibile ispezionarli con DevTools. Non promettere antifrode assoluta; mantenere risposta/crediti segreti e non abilitare graduatorie competitive ad alto valore senza analisi ulteriore. Nessun countdown di preparazione controllato dal solo client.

**PvP:**
- fase per-round `prepare/ready` sul **Durable Object**: stesso round/immagine per entrambi, consegna URL neutro e capacità di scaricare/decodificare prima di attivare un deadline comune; deadline assegnata lato DO dopo readiness verificata di entrambi o policy di timeout esplicita; non fidarsi di data/ora client, né rivelare la soluzione.
- evitare che un giocatore blocchi indefinitamente l'altro: finestra massima di preparazione, disconnessione, rinuncia, sostituzione/annullamento round e rientro idempotente devono avere stati espliciti. Non cambiare il conteggio punti (correttezza e spareggio per tempo) senza specifica.
- riconoscere il rischio che una readiness dichiarata dal client possa essere manipolata e che la visione anticipata tramite strumenti di sviluppo non è eliminabile completamente. Non attribuire garanzie anti-cheat che non ci sono.
- se il protocollo PvP richiede un refactoring significativo, separare in seconda PR dipendente, **senza regredire PvP esistente** e senza presentarlo come già corretto.

### 5. Sicurezza, diritti e qualità dell'esperimento

- Conservare `REAL`/`AI` solo lato server sino al reveal, con media IDs casuali e nessun percorso `/real/` o `/ai/`. Verificare headers/cache: gli asset devono essere cacheabili nella misura possibile, ma nessun endpoint di rivelazione deve diventare pubblico prima della risposta.
- Conservare crediti, licenze e prove e mostrarli dopo la scelta; eventuali obblighi che richiedano attribuzione visibile prima della risposta non vanno aggirati, bensì gestiti in revisione editoriale. Non rimuovere watermark imposti da diritti.
- Non usare euristiche come «l'immagine è più compressa, quindi è AI». La pipeline deve trattare REAL/AI in modo equivalente.
- Conservare stati e ripristino in D1, con transizioni atomiche e autorizzazioni esistenti; non usare `sessionStorage` come prova di identità.
- Nessun D1/R2/Workers remoto creato, nessuna variazione Cloudflare o acquisto; `main` e ambiente produzione invariati finché la PR non è approvata.

### 6. Test e criteri di accettazione

**Unit test:** coda concorrente; deduplica; `decode` successo/errore; timeout; budget memoria e cancellazione; cambio round; caricamento da cache; `prefers-reduced-motion` e componenti responsive.

**Integrazione Worker/D1 locale:**
1. Sessione a tempo creata in stato preparazione: niente `expires_at` attivo, niente risposta consentita.
2. Preload autorizzato: media ottenibili senza metadati REAL/AI o soluzione; sessione altrui non può leggere; nessuna risposta prima di start.
3. Start idempotente: due start concorrenti producono una sola deadline; `expires_at` lato server e 410 a tempo scaduto.
4. Refresh durante partita avviata: identica deadline, round coerente, no ripetizioni/doppi punteggi.
5. Connessione lenta e immagini non caricabili: no perdita punti immotivata nella preparazione; durante gioco attivo il server resta autorevole e l'errore segue la policy definita.
6. Allenamento: prefetch successivi; risposta bloccata fino a immagine pronta; no spoiler.
7. PvP se toccato: entrambi ready, deadline condivisa, reconnect, un giocatore inattivo, race conditions, risultati.
8. Prestazioni con 24 fixture demo e set sintetico di 50 immagini su profili throttled (es. slow 3G/4G) senza scrivere «zero latenza» se non misurato.
9. UI mobile (360 px e tablet), desktop, tastiera, focus, accessibilità, screenshot locali quando supportati.

Comandi minimi: `npm ci`, `npm run lint`, `npm test`, `npm run build`, `npm run test:integration`, `npm run deploy:check`, `npx wrangler deploy --dry-run --outdir .wrangler/dry-run` (senza pubblicazione). Esaminare i comandi effettivamente presenti in `package.json` e adattare; non installare Chromium/Playwright a ogni esecuzione: riutilizzare ambiente predisposto o test HTTP/unitari, dichiarando la mancanza di verifica visiva se necessario.

### 7. Consegna

- Codice TypeScript, CSS e migrazioni SQL realmente necessari, con retrocompatibilità e rollback.
- Descrizione chiara di cosa sia pronto in **Allenamento**, **A tempo** e **PvP**; se una modalità resta limitata, segnalarlo esplicitamente.
- Screenshot/anteprima locale per valutazione dove possibile e resoconto con benchmark prima/dopo (dimensione asset, memoria, tempo start).
- Modifica documentazione tecnica e changelog applicativo, con versionamento semantico.
- **Una PR in bozza verso `main`, senza merge, deploy remoto, provisioning, segreti o pubblicazione.** Se emergono modifiche architetturali importanti, motivarle prima e suddividere in PR piccole.
- Verificare in particolare che il timer server non inizi **prima** della preparazione e che REAL/SLOP non trapelino dai nomi file o dalle risposte delle API.

## Nota editoriale

Il tema proposto e il flusso di preloading sono stati approvati come direzione di lavoro. Le precedenti descrizioni divulgative parlavano di «sospendere il timer se l'immagine tarda»: **in una partita già avviata con scadenza server, questo richiede un accordo esplicito col server oppure l'annullamento equo della sessione**; non è ottenibile sospendendo soltanto l'intervallo grafico nel browser.
