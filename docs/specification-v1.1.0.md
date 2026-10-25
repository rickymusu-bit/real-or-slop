# Real or Slop — Quattro prompt operativi per Codex

**Versione:** 1.1.0  
**Data:** 25 ottobre 2026  
**Deriva da:** `slop_game_codex_prompts_v1.0.0.md`, fornito dal proprietario  
**Stato:** specifiche aggiornate; nome ufficiale **Real or Slop**; implementazione e deploy da eseguire e verificare

Il gioco consiste nel riconoscere immagini autentiche e documentate oppure immagini generate con IA dal proprietario. Il nome commerciale è Real or Slop; le etichette interne restano `REAL` e `AI`. La parola “Slop” nel titolo non introduce una valutazione automatica della qualità delle immagini.

## Uso e regole di consegna

Usare i quattro prompt in ordine nel repository dedicato [rickymusu-bit/real-or-slop](https://github.com/rickymusu-bit/real-or-slop). Copiare integralmente un blocco `text` alla volta: ogni prompt contiene anche i vincoli di hosting e revisione. Non modificare i repository Stringhe o Fool. Il branch di produzione e destinazione finale delle PR è `main`; ogni fase si sviluppa su un branch separato con PR in bozza e anteprima.

**Mai eseguire merge, abilitare auto-merge o pubblicare in produzione senza approvazione esplicita del proprietario.** Una PR pronta, un test superato o una preview funzionante non costituiscono approvazione. Se i prompt precedenti non sono ancora confluiti in `main`, continuare sul lavoro disponibile e dichiarare la dipendenza tra PR, senza eseguire merge per sbloccare la fase successiva.

## Configurazione Cloudflare richiesta

| Voce | Valore / comportamento richiesto |
| --- | --- |
| Hosting iniziale | Cloudflare Workers **Free**, con Workers Static Assets e API nel Worker |
| Repository GitHub | `rickymusu-bit/real-or-slop` |
| Branch produzione | `main` |
| Directory di lavoro per build | Radice del progetto contenente `package.json` e `wrangler.jsonc` |
| Build command | `npm run build` |
| Deploy command produzione | `npx wrangler deploy` — solo dopo approvazione |
| Preview command per branch/PR | `npx wrangler preview`, previa verifica della versione Wrangler |
| Verifica locale senza pubblicare | `npm ci`, controlli/test pertinenti, `npm run build`, poi `npx wrangler deploy --dry-run --outdir .wrangler/dry-run` |
| URL iniziale | Sottodominio `workers.dev`; dominio personalizzato facoltativo in seguito |
| Dati iniziali | Fixture, D1 locale e storage locale/mocks; nessuna risorsa remota obbligatoria per sviluppare |
| Evoluzione successiva | D1 remoto per metadati e partite; R2 Standard per immagini; risorse di preview separate dalla produzione |

Questi sono comandi del progetto e della piattaforma di hosting, non comandi universali di Codex. `package.json` deve realmente definire `build`; `wrangler.jsonc` deve corrispondere ai file prodotti. Workers Builds distingue build, deploy di produzione e preview. [Configurazione ufficiale Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

Le attuali Worker Previews richiedono Wrangler **4.135.0 o successivo**, installato nel progetto. Se una configurazione precedente usa `wrangler versions upload`, non considerarla automaticamente un ambiente isolato: le Version URLs possono usare risorse di produzione. Verificare e adottare Worker Previews senza sostituire il comando preview con quello di produzione. [Avvio delle Previews](https://developers.cloudflare.com/workers/previews/get-started/), [confronto dei flussi](https://developers.cloudflare.com/workers/previews/compare-workflows/).

“Gratuito” significa restare nel piano Workers Free e nelle quote applicabili, comprese quelle di build. D1 e R2 hanno quote e condizioni proprie; R2 Standard include una franchigia gratuita, ma il superamento può comportare costi. Nessun upgrade, attivazione di fatturazione o acquisto è autorizzato da questi prompt. [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [R2](https://developers.cloudflare.com/r2/pricing/).

### Stato della verifica al 25 ottobre 2026

- I quattro prompt originali sono stati letti dal file v1.0.0 allegato e ne sono conservati obiettivi, categorie, schema dati, pipeline, modalità di gioco e requisiti editoriali.
- Il repository `rickymusu-bit/real-or-slop` è visibile tramite il collegamento GitHub e dichiara `main` come branch predefinito. I metadati riportano dimensione 0; le richieste di `package.json` e `wrangler.jsonc` su `main` restituiscono 404, coerentemente con un repository ancora da inizializzare.
- **Compatibilità del codice non ancora verificabile:** non sono disponibili i due file, un lockfile o un'applicazione da compilare. I prompt impongono di crearli/verificarli e riportare gli esiti effettivi; questo documento non certifica una build o un deploy riusciti.
- Non sono stati modificati repository, impostazioni Cloudflare, DNS o risorse remote; questo aggiornamento consegna soltanto le specifiche Markdown.

## Prompt 1 — Architettura, dati e scheletro del progetto

```text
HOSTING, GITHUB E APPROVAZIONI — OBBLIGATORI PER QUESTA FASE
- Lavora esclusivamente in rickymusu-bit/real-or-slop, branch di produzione main, su un branch di lavoro separato. Non modificare Stringhe o Fool e non creare un altro repository se quello dedicato esiste già.
- Hosting: Cloudflare Workers Free con Static Assets/API. Mantieni build command npm run build e deploy command di produzione npx wrangler deploy. Prepara la successiva integrazione D1/R2 Standard senza richiederne l'attivazione remota per la demo.
- Prima di dichiarare compatibilità, leggi package.json, lockfile e wrangler.jsonc: verifica script build e relativi hook, versione locale di Wrangler, entry point, percorso degli asset, compatibility_date, binding e output effettivo. Crea i file mancanti; non assumere che i due comandi funzionino per qualunque stack.
- Esegui npm ci con lockfile valido, controlli pertinenti, npm run build e npx wrangler deploy --dry-run --outdir .wrangler/dry-run. Se mancano dipendenze o accessi, indica precisamente quali verifiche non hai eseguito; non spacciare il dry-run per un deploy riuscito.
- Per branch/PR prepara Worker Previews con npx wrangler preview e Wrangler locale compatibile (alla verifica del 25 ottobre 2026: almeno 4.135.0). Non usare npx wrangler deploy per le anteprime. Se manca accesso Cloudflare, consegna demo locale e configurazione preview con passaggi mancanti, senza inventare URL.
- Le anteprime devono usare fixture o risorse D1/R2 di test separate; verifica i binding effettivi. Non presumere isolamento dei dati dal solo URL di preview. Non eseguire migrazioni o import verso produzione.
- Consegna PR in bozza verso main con anteprima e risultati verificabili. Non eseguire merge, non abilitare auto-merge, non fare push diretto a main, non pubblicare in produzione e non cambiare DNS o billing senza approvazione esplicita del proprietario. Il collegamento a Workers Builds può pubblicare al primo avvio: non abilitarne il trigger di produzione prima dell'approvazione.
- Se main non ha ancora alcun commit, prepara tutto sul branch di lavoro e segnala che il proprietario deve autorizzare o completare il bootstrap di main per rendere possibile la PR. Non aggirare il vincolo con un push su main.

Agisci come sviluppatore full-stack senior. Realizza la prima fase di un nuovo gioco web chiamato ufficialmente "Real or Slop": il giocatore riconosce se un'immagine proviene da una fonte autentica/documentata o è stata generata con IA. Non confondere il termine colloquiale "AI slop" con qualsiasi immagine generata con IA.

VINCOLI DI PROGETTO
- Repository GitHub dedicato esistente: rickymusu-bit/real-or-slop; usa main come base quando disponibile e branch codex/01-architettura per questa fase. Se il collegamento non è disponibile, predisponi i file nel workspace e indica il passaggio mancante; non creare duplicati.
- Stack: TypeScript; Vite per frontend responsive mobile-first; Cloudflare Worker con Static Assets/API sul piano Free. Architettura predisposta per Cloudflare D1 per metadati, sessioni, risposte e classifiche e Cloudflare R2 Standard per i file immagine. Nella prima fase usa D1 locale emulato e storage locale/mocks; l'integrazione con D1/R2 remoti viene dopo la demo, senza richiedere billing o credenziali cloud per lavorare. Prepara configurazione Wrangler, migrazioni versionate e adapter di storage, evitando di dover riscrivere il gioco in seguito.
- Configura package.json con uno script build reale per compilare frontend e controllare TypeScript, senza pubblicazioni o migrazioni remote negli script di build/installazione. Aggiungi Wrangler alle devDependencies con versione riproducibile nel lockfile e Node compatibile con le dipendenze; documenta la versione Node anche per Workers Builds.
- In wrangler.jsonc imposta nome Worker real-or-slop, compatibility_date valida, entry point esistente e assets.directory coerente con l'output di Vite (normalmente ./dist), binding ASSETS e gestione SPA quando necessaria. Se usi un adapter/plugin che genera la configurazione, verifica il file effettivamente usato e documenta la scelta. Per /api/* garantisci il passaggio al Worker: una API inesistente deve restituire errore JSON, non index.html.
- Prepara il blocco previews per variabili e risorse di test, senza inventare UUID D1, nomi di bucket esistenti o credenziali. Mantieni gli esempi di risorse future fuori dalla configurazione attiva se non sono utilizzabili. Controlla il packaging con Wrangler dry-run e servi localmente sia asset sia API; la sola compilazione Vite non dimostra compatibilità Workers.
- Scrivi nel README i valori esatti per Workers Builds: repository rickymusu-bit/real-or-slop, branch main, build npm run build, deploy npx wrangler deploy, preview npx wrangler preview e directory radice corretta. Prepara Preview Builds per i branch diversi da main e i controlli CI delle PR, mantenendo inattivo il trigger di produzione fino all'approvazione. Se non puoi configurare l'account, consegna istruzioni puntuali senza dichiarare effettuato il collegamento.
- Conserva le risposte corrette sul server: non inviare al browser label, prompt IA o spiegazione prima della consegna della risposta. Usa chiavi immagine opache senza prefissi real/fake.
- Per la classificazione dell'archivio usa REAL (immagine autentica con provenienza verificata) e AI (immagine generata dall'amministratore). Nell'interfaccia italiana mostra "Reale" e "Generata con IA".
- Categorie iniziali con sottocategorie: Storia, Arte, Ingegneria civile (ponti, viadotti, dighe), Architettura (edifici, monumenti), Automobili, Macchine e trasporti (treni, navi, aerei, robot), Scienza e spazio, Cinema e spettacolo. Il sistema deve essere facilmente estendibile a nuove categorie e permettere appartenenze multiple.
- Livelli: facile, medio, difficile. Gestisci il livello come attributo curato inizialmente dall'amministratore, modificabile in seguito in base alle statistiche reali.
- Database con tabelle almeno: categories, images, image_categories, sources, licenses, review_events, game_sessions, game_rounds, answers, players, challenges, challenge_players; aggiungi eventuali vincoli e indici. Campi immagine: id opaco, tipo REAL/AI, titolo interno, descrizione, autore, pagina fonte, licenza/URL licenza, riferimento a prova di autenticità, file R2, modello IA e prompt se AI, categorie, difficoltà, stato candidato/in-revisione/approvato/rifiutato, hash, data verifica diritti, spiegazione post-risposta.
- Non esporre pubblicamente informazioni identificative non necessarie. Gestisci i dati minimi, cookie/sessioni e un'informativa privacy proporzionata. Prevedi pagina crediti/fonti e disclaimer che le immagini AI sono create per un gioco di fantasia.
- Prevedi percorsi /, /allenamento, /tempo, /pvp, /informazioni, /crediti e /admin (quest'ultimo protetto server-side). Se il backend non è configurato, mostra dati dimostrativi dichiarati come demo.
- Interfaccia accessibile da mobile, tablet e desktop, con tastiera, alt-text utili senza spoiler, layout che evita scroll durante la domanda e opzione di visualizzare l'immagine ingrandita.
- Test automatici di schema, API e navigazione, lint, build, README con comandi locali e istruzioni di deploy. Non scaricare browser/headless superflui in ogni esecuzione: test browser solo quando richiesti e riusa cache.
- Versiona le specifiche con SemVer e changelog, senza documentazione ridondante.

LAVORO DA CONSEGNARE
1. Struttura repo e architettura ragionata con diagramma testuale.
2. Migrazioni SQL per D1 testate localmente, adapter per la futura integrazione R2 e dataset demo sintetico senza materiale copyright di terzi.
3. Frontend navigabile e Worker API iniziale con test.
4. PR in bozza con anteprima locale/preview, elenco comandi eseguiti e risultati, verifica package.json/wrangler.jsonc e istruzioni Cloudflare Workers Builds. Se main non è inizializzato, consegna il branch e segnala il bootstrap necessario alla sola apertura della PR.
Non fare merge, non cambiare configurazioni di produzione, non acquistare servizi e non usare segreti reali senza autorizzazione.
```

## Prompt 2 — Ricerca automatica, licenze e revisione immagini

```text
HOSTING, GITHUB E APPROVAZIONI — OBBLIGATORI PER QUESTA FASE
- Lavora esclusivamente in rickymusu-bit/real-or-slop, branch di produzione main, su un branch di lavoro separato. Non modificare Stringhe o Fool e non creare un altro repository se quello dedicato esiste già.
- Hosting: Cloudflare Workers Free con Static Assets/API. Mantieni build command npm run build e deploy command di produzione npx wrangler deploy. Prepara la successiva integrazione D1/R2 Standard senza richiederne l'attivazione remota per la demo.
- Prima di dichiarare compatibilità, leggi package.json, lockfile e wrangler.jsonc: verifica script build e relativi hook, versione locale di Wrangler, entry point, percorso degli asset, compatibility_date, binding e output effettivo. Crea i file mancanti; non assumere che i due comandi funzionino per qualunque stack.
- Esegui npm ci con lockfile valido, controlli pertinenti, npm run build e npx wrangler deploy --dry-run --outdir .wrangler/dry-run. Se mancano dipendenze o accessi, indica precisamente quali verifiche non hai eseguito; non spacciare il dry-run per un deploy riuscito.
- Per branch/PR prepara Worker Previews con npx wrangler preview e Wrangler locale compatibile (alla verifica del 25 ottobre 2026: almeno 4.135.0). Non usare npx wrangler deploy per le anteprime. Se manca accesso Cloudflare, consegna demo locale e configurazione preview con passaggi mancanti, senza inventare URL.
- Le anteprime devono usare fixture o risorse D1/R2 di test separate; verifica i binding effettivi. Non presumere isolamento dei dati dal solo URL di preview. Non eseguire migrazioni o import verso produzione.
- Consegna PR in bozza verso main con anteprima e risultati verificabili. Non eseguire merge, non abilitare auto-merge, non fare push diretto a main, non pubblicare in produzione e non cambiare DNS o billing senza approvazione esplicita del proprietario. Il collegamento a Workers Builds può pubblicare al primo avvio: non abilitarne il trigger di produzione prima dell'approvazione.
- Se main non ha ancora alcun commit, prepara tutto sul branch di lavoro e segnala che il proprietario deve autorizzare o completare il bootstrap di main per rendere possibile la PR. Non aggirare il vincolo con un push su main.

Sul repository "Real or Slop" implementa una pipeline automatica per raccogliere candidate REAL solo da sorgenti autorizzate e dotate di API ufficiali: Wikimedia Commons, Openverse, Metropolitan Museum Open Access, Library of Congress (inclusi archivi HABS/HAER/HALS), Smithsonian Open Access e NASA dove compatibile. Implementa i connettori con Python 3.12, eseguibili manualmente e tramite GitHub Actions programmata, senza richiedere un server sempre acceso. I connettori devono essere separati, attivabili singolarmente, rispettare rate limit, User-Agent, timeout, retry con backoff e termini d'uso. Usa un branch dedicato, ad esempio codex/02-pipeline-immagini. Python è uno strumento offline/CI della pipeline: non introdurre un backend Python sempre acceso nel Worker. Mantieni distinti i controlli Python dalla build web npm run build.

Sviluppa prima con fixture/mock e comandi manuali; prepara il workflow pianificato ma attivalo solo quando la destinazione di revisione, gli accessi e le quote sono stati configurati dal proprietario. Non eseguire codice PR non attendibile con segreti di produzione. Nel piano gratuito considera anche le quote GitHub Actions del repository privato: niente scansioni o import illimitati. Niente scraping massivo, niente query a motori di ricerca generalisti, niente download di contenuti senza diritti compatibili.

L'amministratore deve impostare ricerche con combinazioni di: macro-categoria, sotto-categoria, soggetto, contesto, luogo, periodo storico, tipologia, fonte, licenza e numero massimo di risultati. Prevedi query in inglese e varianti lessicali controllate. Importa titolo, URL originale, autore, data, diritti, prova della fonte e metadati di contesto. Verifica licenza a livello di singolo asset: CC0, pubblico dominio verificato, CC BY e CC BY-SA con attribuzioni e obblighi corretti; se incompleta o ambigua metti in revisione. Un'origine istituzionale da sola non prova assenza di copyright. Le immagini NASA e archivi pubblici possono contenere materiale di terzi; applica le eccezioni specifiche.

Prima di scaricare, deduplica per URL/identificativo fonte; dopo download, hash crittografico e hash percettivo; niente immagini senza metadati minimi e niente import automatico di etichette REAL senza passaggio di verifica. La valutazione semantica automatica può suggerire pertinenza, non provare autenticità. Ottimizza le immagini senza rimuovere crediti e rispetta termini di licenza; salva nel bucket R2 destinato al gioco solo asset approvati. Per i candidati usa una quarantena privata locale o di staging; un'immagine in revisione non deve essere accessibile dalle API pubbliche.

Per la successiva integrazione remota, usa D1 per metadati e audit e R2 Standard per i file approvati attraverso adapter già testabili localmente. Una preview PR usa database e bucket di test, mai quelli di produzione. Il clic editoriale "approva" registra la decisione, ma nella fase demo/staging non deve pubblicare sul sito di produzione: l'eventuale promozione dei dati è un passaggio successivo esplicito, distinto dal deploy del codice. Non attivare R2, billing o job remoti per il solo completamento di questa PR.

Realizza una coda di moderazione privata, con anteprima, filtri, pagina della fonte, prove, licenza, stato, pulsanti approva/rifiuta, modifica categorie e difficoltà, registrazione della decisione. Richiedi autenticazione/autorizzazione server-side e proteggi API admin e upload. Nessuna credenziale o chiave segreta nel frontend.

Prevedi inoltre import manuale di immagini AI create dal proprietario, con modello/generatore, prompt, data, titolo, categorie, difficoltà e dichiarazione dell'autore; richiedi verifica editoriale che il presunto evento/opera/film sia effettivamente inventato. Usa un identificativo pubblico neutro; non mostrare il prompt al giocatore prima della risposta.

Scrivi test con fixture e mock delle API, documenta limiti dei provider e predisponi esecuzione pianificata solo verso la coda di revisione (mai pubblicazione automatica). Produci una PR in bozza con demo, senza merge né deploy di produzione.
```

## Prompt 3 — Allenamento, modalità a tempo e statistiche

```text
HOSTING, GITHUB E APPROVAZIONI — OBBLIGATORI PER QUESTA FASE
- Lavora esclusivamente in rickymusu-bit/real-or-slop, branch di produzione main, su un branch di lavoro separato. Non modificare Stringhe o Fool e non creare un altro repository se quello dedicato esiste già.
- Hosting: Cloudflare Workers Free con Static Assets/API. Mantieni build command npm run build e deploy command di produzione npx wrangler deploy. Prepara la successiva integrazione D1/R2 Standard senza richiederne l'attivazione remota per la demo.
- Prima di dichiarare compatibilità, leggi package.json, lockfile e wrangler.jsonc: verifica script build e relativi hook, versione locale di Wrangler, entry point, percorso degli asset, compatibility_date, binding e output effettivo. Crea i file mancanti; non assumere che i due comandi funzionino per qualunque stack.
- Esegui npm ci con lockfile valido, controlli pertinenti, npm run build e npx wrangler deploy --dry-run --outdir .wrangler/dry-run. Se mancano dipendenze o accessi, indica precisamente quali verifiche non hai eseguito; non spacciare il dry-run per un deploy riuscito.
- Per branch/PR prepara Worker Previews con npx wrangler preview e Wrangler locale compatibile (alla verifica del 25 ottobre 2026: almeno 4.135.0). Non usare npx wrangler deploy per le anteprime. Se manca accesso Cloudflare, consegna demo locale e configurazione preview con passaggi mancanti, senza inventare URL.
- Le anteprime devono usare fixture o risorse D1/R2 di test separate; verifica i binding effettivi. Non presumere isolamento dei dati dal solo URL di preview. Non eseguire migrazioni o import verso produzione.
- Consegna PR in bozza verso main con anteprima e risultati verificabili. Non eseguire merge, non abilitare auto-merge, non fare push diretto a main, non pubblicare in produzione e non cambiare DNS o billing senza approvazione esplicita del proprietario. Il collegamento a Workers Builds può pubblicare al primo avvio: non abilitarne il trigger di produzione prima dell'approvazione.
- Se main non ha ancora alcun commit, prepara tutto sul branch di lavoro e segnala che il proprietario deve autorizzare o completare il bootstrap di main per rendere possibile la PR. Non aggirare il vincolo con un push su main.

Nel repository "Real or Slop" implementa interamente due modalità: Allenamento e A tempo, riusando il frontend e le API esistenti. Prima di scrivere codice verifica struttura attuale, migrazioni e test, e non rompere la pipeline immagini. Usa un branch dedicato, ad esempio codex/03-modalita-gioco. Mantieni il nome ufficiale Real or Slop in titolo pagina, schermate e README; conserva REAL/AI come etichette interne e "Reale"/"Generata con IA" come descrizioni italiane comprensibili.

Le sessioni e le risposte devono funzionare con D1 locale/emulato senza account cloud. Predisponi la successiva persistenza D1 remota e il caricamento immagini da R2 senza modificare il contratto delle API. In preview configura esclusivamente dati di test e non inviare risultati alle classifiche reali. Se mostri fixture dimostrative, dichiara la modalità demo; non implementare una finta verifica server-side nel solo browser.

IMPOSTAZIONI: selezione multipla di categorie e sotto-categorie; difficoltà facile, media e difficile; in allenamento quantità di domande configurabile, in modalità a tempo durata configurabile (es. 60, 120, 180 secondi). Mantieni circa 50% REAL e 50% AI per ogni partita nei limiti del catalogo, campionando senza ripetizioni e segnalando quando mancano immagini approvate.

ALLENAMENTO: una immagine alla volta, due pulsanti "Reale" e "Generata con IA", nessun timer, risposta immediata, visualizzazione della fonte/crediti e spiegazione SOLO dopo la risposta, progresso e riepilogo. Non mostrare etichette nella URL, nome file, metadata o API prima della risposta.

A TEMPO: conto alla rovescia complessivo, risposte rapide, punteggio per correttezza, statistiche e classifica opzionale con nickname; fine immediata alla scadenza. Definisci chiaramente punteggi e criteri di parità; evita che il client possa falsificare punteggi. Lato server memorizza sessioni, domande assegnate, timestamp e risposte.

COMUNE: prevenzione doppio invio, tasti tastiera, touch feedback, loading/errori, rete instabile, ripresa sessione quando possibile, mobile/tablet, accessibilità e tutela privacy. Statistiche aggregate per immagine e categoria utili a proporre un ricalcolo della difficoltà solo con campioni sufficienti, senza aggiornamento automatico indiscriminato.

Consegna test unitari e di integrazione: bilanciamento, non ripetizione, timer, scadenze server-side, accesso ai crediti solo a risposta conclusa, refresh e doppio click. Prepara PR in bozza, anteprima e resoconto test, senza merge.
```

## Prompt 4 — PvP online, integrazione D1/R2 e pubblicazione guidata

```text
HOSTING, GITHUB E APPROVAZIONI — OBBLIGATORI PER QUESTA FASE
- Lavora esclusivamente in rickymusu-bit/real-or-slop, branch di produzione main, su un branch di lavoro separato. Non modificare Stringhe o Fool e non creare un altro repository se quello dedicato esiste già.
- Hosting: Cloudflare Workers Free con Static Assets/API. Mantieni build command npm run build e deploy command di produzione npx wrangler deploy. Prepara la successiva integrazione D1/R2 Standard senza richiederne l'attivazione remota per la demo.
- Prima di dichiarare compatibilità, leggi package.json, lockfile e wrangler.jsonc: verifica script build e relativi hook, versione locale di Wrangler, entry point, percorso degli asset, compatibility_date, binding e output effettivo. Crea i file mancanti; non assumere che i due comandi funzionino per qualunque stack.
- Esegui npm ci con lockfile valido, controlli pertinenti, npm run build e npx wrangler deploy --dry-run --outdir .wrangler/dry-run. Se mancano dipendenze o accessi, indica precisamente quali verifiche non hai eseguito; non spacciare il dry-run per un deploy riuscito.
- Per branch/PR prepara Worker Previews con npx wrangler preview e Wrangler locale compatibile (alla verifica del 25 ottobre 2026: almeno 4.135.0). Non usare npx wrangler deploy per le anteprime. Se manca accesso Cloudflare, consegna demo locale e configurazione preview con passaggi mancanti, senza inventare URL.
- Le anteprime devono usare fixture o risorse D1/R2 di test separate; verifica i binding effettivi. Non presumere isolamento dei dati dal solo URL di preview. Non eseguire migrazioni o import verso produzione.
- Consegna PR in bozza verso main con anteprima e risultati verificabili. Non eseguire merge, non abilitare auto-merge, non fare push diretto a main, non pubblicare in produzione e non cambiare DNS o billing senza approvazione esplicita del proprietario. Il collegamento a Workers Builds può pubblicare al primo avvio: non abilitarne il trigger di produzione prima dell'approvazione.
- Se main non ha ancora alcun commit, prepara tutto sul branch di lavoro e segnala che il proprietario deve autorizzare o completare il bootstrap di main per rendere possibile la PR. Non aggirare il vincolo con un push su main.

Nel repository "Real or Slop" realizza il PvP online con codice stanza da condividere (lobby di due giocatori). Usa Cloudflare Durable Objects con storage SQLite, compatibili con Workers Free entro le relative quote, per lo stato e la sincronizzazione in tempo reale; D1 per storicizzare sfide, risposte e classifiche. Usa un branch dedicato, ad esempio codex/04-pvp-cloudflare. Prepara i binding e le migrazioni delle classi Durable Objects per SQLite; non scegliere il backend legacy key-value che richiede un piano diverso. Verifica consumo di richieste/durata, usa hibernation WebSocket dove appropriato e gestisci i limiti del piano con messaggi chiari. Prevedi un fallback ragionevole per riconnessione e perdita di rete. Non introdurre servizi esterni a pagamento e non attivare billing senza consenso.

I due giocatori ricevono la stessa immagine e hanno uguale tempo massimo per rispondere; rivela la soluzione solo dopo che entrambi hanno risposto o che il tempo comune è scaduto. Risposte e timer validati dal server, non dal client. Non fare arrivare prompt IA, origine, etichetta o spiegazione prima del reveal. Alterna le immagini fino al numero di round scelto; punti per risposta corretta e tempo di risposta solo come spareggio; riepilogo finale con fonti/licenze. Gestisci ingresso stanza, nickname, codice casuale non prevedibile, timeout, abbandono, riconnessione, doppie risposte, rate limiting, restrizioni dei dati personali e banale anti-spam.

INTEGRAZIONE SUCCESSIVA D1/R2
- Dopo la demo locale, completa adapter e istruzioni per usare D1 remoto per il catalogo, audit, sessioni, risposte e classifiche, e R2 Standard per immagini con chiavi opache. I file immagine restano fuori dalle tabelle SQL; in D1 salva riferimenti e metadati.
- Mantieni un percorso locale funzionante. Prepara migrazioni versionate, seed di test idempotente, script di import, backup/export metadati e piano di ripristino; testa tutto su risorse locali o di test. Una nuova versione del Worker non annulla automaticamente migrazioni D1 o modifiche agli oggetti R2: pianifica compatibilità dello schema e recupero dei dati separatamente dal rollback del codice.
- Configura previews.d1_databases e previews.r2_buckets con destinazioni di test diverse da produzione quando sono disponibili, verificando gli identificativi effettivi. Due preview con lo stesso database_id o bucket_name condividono dati: documenta se usano uno staging comune oppure risorse distinte per PR. Non applicare migrazioni preview usando implicitamente il binding D1 di produzione; usa una configurazione di migrazione dedicata e verifica che punti allo stesso database di test della preview.
- Per Durable Objects verifica la compatibilità delle migrazioni e l'isolamento dello stato nelle Worker Previews con la versione Wrangler installata. Prova due client sullo stesso URL di anteprima. Non promettere che una vecchia Version URL sia una demo PvP completa e isolata; se la preview non è disponibile, consegna la demo locale con limite dichiarato.
- Non creare o modificare risorse remote di produzione, non eseguire migrazioni remote di produzione e non caricare dataset reali in produzione senza approvazione. Se mancano accessi o attivazioni, consegna configurazioni di esempio separate con segnaposto espliciti e una lista puntuale dei passaggi mancanti. Non inserire segreti nel repository né credenziali nel frontend; distingui gli ID di risorsa non segreti dalle credenziali e valorizzali solo dopo aver verificato account e destinazione.

PUBBLICAZIONE GUIDATA CLOUDFLARE WORKERS FREE
1. Prepara una checklist per account Cloudflare, collegamento GitHub a rickymusu-bit/real-or-slop, main come branch di produzione e directory del progetto corretta. Configura o documenta build command npm run build e deploy command npx wrangler deploy, verificati attraverso package.json e wrangler.jsonc; mantieni la produzione non attivata finché non approvo.
2. Prepara prima le anteprime PR con npx wrangler preview e risorse di test. Verifica asset, API, sessioni, admin e PvP sulla preview senza pubblicare su main. Consegna URL e commit effettivi solo se esistono, altrimenti demo locale e istruzioni di completamento.
3. Prepara bindings, secrets server-side, login amministratore, D1 e R2 Standard per la fase successiva, indicando quote, condizioni di attivazione e possibili costi. Non abilitare fatturazione o passare a Workers Paid automaticamente.
4. Usa inizialmente workers.dev. Un dominio .it o altro dominio personalizzato è facoltativo, ha un costo distinto e non serve per l'hosting gratuito. Documenta separatamente l'eventuale registrazione, DNS e HTTPS; nessun acquisto o cambio DNS senza autorizzazione.
5. Presenta la PR, i risultati e il piano di rilascio. Aspetta l'approvazione esplicita del proprietario prima di qualsiasi merge o deploy di produzione. Se il merge su main attiva Workers Builds, l'approvazione deve coprire anche quel rilascio; un'autorizzazione al solo merge non autorizza la pubblicazione implicita. Se l'integrazione tenta un deploy iniziale, non avviarlo senza tale approvazione.
6. Solo dopo l'approvazione del rilascio, usa il flusso concordato: deploy automatico Workers Builds da main oppure esecuzione manuale di npx wrangler deploy dal commit approvato, evitando due rilasci concorrenti. Verifica il risultato con un controllo delle funzioni principali e conserva la procedura di rollback.

CONSEGNA
Fornisci demo PvP locale con due finestre/browser e test automatizzati, con ambiente di test separato da produzione. Prepara PR in bozza. Non effettuare acquisti, merge, deploy in produzione o modifiche DNS senza mia autorizzazione esplicita.
```

## Checklist del proprietario

1. Verificare l'accesso a `rickymusu-bit/real-or-slop` e l'esistenza di `main`. Se il repository è vuoto, autorizzare o completare un commit iniziale minimo su `main`; poi le implementazioni arrivano tramite PR in bozza su branch separati.
2. Usare Cloudflare Workers Free e il sottodominio `workers.dev`. Il dominio personalizzato resta una scelta successiva, con costi propri.
3. Collegare il repository a Workers Builds quando pronti a farlo: directory radice corretta, branch produzione `main`, build `npm run build`, deploy `npx wrangler deploy`. Prima di completare il collegamento controllare se avvia subito un deploy: l'avvio della produzione richiede approvazione esplicita.
4. Abilitare/configurare Worker Previews per i branch di lavoro con `npx wrangler preview`, senza produzione. La versione locale di Wrangler, nel lockfile, deve supportare il comando. Non sostituirlo con `wrangler deploy` per risolvere un errore di anteprima.
5. Verificare `package.json`, `wrangler.jsonc`, asset generati, API, test e dry-run. Conservare gli esiti; segnalare separatamente i controlli non eseguiti per mancanza di accessi.
6. Dopo l'MVP locale, predisporre D1 e R2 Standard remoti: ad esempio database `real-or-slop-db` e `real-or-slop-preview-db`, bucket `real-or-slop-images` e `real-or-slop-preview-images`. Sono nomi proposti, non risorse già create. Controllare quota e condizioni R2 prima di ogni attivazione; nessuna sottoscrizione è implicita.
7. Configurare binding e segreti sul server, admin protetto, migrazioni e import mirati. Le risorse di preview e produzione devono avere identificativi diversi. Per test distruttivi usare risorse dedicate, senza coinvolgere altre PR o staging condivisi.
8. Approvare editorialmente il dataset, verificare provenienza/licenze e testare da Android, desktop e due client PvP. Controllare che la soluzione non sia visibile prima della risposta.
9. Revisionare la PR e approvare esplicitamente l'eventuale merge e rilascio. Non attivare auto-merge. Il trigger automatico su `main` deve rispettare questa approvazione, anche per il primo deploy.
10. In futuro, se desiderato, acquistare/collegare un dominio e configurare DNS/HTTPS con autorizzazione specifica; mantenere un piano di rollback sia del codice sia dei dati.

## Criteri di accettazione delle quattro PR

- [ ] Nome ufficiale Real or Slop coerente; repository dedicato corretto; nessuna modifica a Stringhe o Fool.
- [ ] Branch di lavoro separato; destinazione finale `main`; PR in bozza, oppure blocco documentato per bootstrap/accessi mancanti.
- [ ] `npm run build` esiste in `package.json` e produce l'output configurato in `wrangler.jsonc`; dipendenze riproducibili nel lockfile.
- [ ] Test pertinenti e `npx wrangler deploy --dry-run --outdir .wrangler/dry-run` superati, oppure limite specifico dichiarato.
- [ ] Preview PR o demo locale verificata; nessun deploy di produzione usato per ottenere l'anteprima.
- [ ] D1/R2 locali o di test funzionanti; collegamento remoto successivo documentato; nessun binding preview verso dati di produzione.
- [ ] Nessun segreto nel frontend/repository e nessuna soluzione esposta prima del reveal.
- [ ] Nessun merge, auto-merge, push diretto a `main`, modifica DNS, acquisto o billing effettuato senza l'approvazione prevista.

## Note tecniche verificate

- Con Vite senza adapter dedicato, il percorso degli asset in Wrangler deve coincidere con la cartella prodotta dalla build; le API richiedono un routing distinto dal fallback SPA. [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/).
- Il dry-run Wrangler compila e prepara il pacchetto senza distribuirlo ai server; non prova da solo l'esito di un deploy o l'accesso alle risorse remote. [Comando deploy](https://developers.cloudflare.com/workers/wrangler/commands/workers/).
- L'isolamento D1/R2 nelle preview dipende dalle risorse collegate: ID D1 e nomi bucket uguali condividono i dati. La guida include un flusso di migrazione D1 con configurazione dedicata alle preview. [Risorse e isolamento](https://developers.cloudflare.com/workers/previews/resources/).
- Il PvP può usare Durable Objects sul piano Free con backend SQLite e relative quote; non è necessario imporre un servizio a pagamento per la demo. [Limiti Durable Objects](https://developers.cloudflare.com/durable-objects/platform/limits/).

Le indicazioni dipendenti dalla piattaforma sono state confrontate con le fonti ufficiali il 25 ottobre 2026. Al momento dell'implementazione ricontrollare schema Wrangler e funzionalità disponibili nell'account, senza cambiare piano o destinazione di deploy per aggirare un limite.

## Versioning e changelog

Il documento segue SemVer: PATCH per correzioni e chiarimenti; MINOR per requisiti compatibili aggiunti; MAJOR per cambi sostanziali incompatibili di architettura o flusso. La versione dei prompt è distinta dalla futura versione dell'app. Conservare la v1.0.0 originale e salvare ogni revisione con versione nel nome file.

### 1.1.0 — 25 ottobre 2026

- Adottato il nome ufficiale Real or Slop nei quattro prompt.
- Specificati repository `rickymusu-bit/real-or-slop`, branch `main` e gestione iniziale del repository vuoto.
- Integrati Workers Free, collegamento GitHub/Workers Builds, `npm run build`, `npx wrangler deploy` e controlli effettivi di `package.json`/`wrangler.jsonc`.
- Distinte anteprime PR con Worker Previews dalla produzione; aggiunti controllo versione Wrangler, dry-run e verifica dell'isolamento dati.
- Ribaditi PR in bozza, assenza di merge/auto-merge e pubblicazione solo dopo approvazione, compresi i trigger automatici e il primo deploy.
- Ordinata l'integrazione D1/R2 in sviluppo locale, risorse di test e successivo collegamento remoto; mantenuto PvP con Durable Objects SQLite compatibili con Free.
- Reso facoltativo il dominio personalizzato e chiariti quote gratuite, R2 e attivazioni di fatturazione.
- Conservati categorie, pipeline Python, revisione/licenze, schema dati, allenamento, modalità a tempo, statistiche, PvP e controlli anti-spoiler della v1.0.0.

### 1.0.0 — 25 ottobre 2026

- Specifiche iniziali del file fornito: quattro prompt per architettura/dati, pipeline immagini, modalità di gioco e PvP/pubblicazione; nome provvisorio “Reale o IA”.
