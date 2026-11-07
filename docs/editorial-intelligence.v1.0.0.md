# Dashboard editoriale intelligente — 1.0.0

Aggiornato: 2026-11-07T13:53:02.815Z. Issue #64; implementazione proposta nella PR #66.

## Principio

`/admin` rimane l'unico ambiente operativo del proprietario. Prima di una ricerca GPT l'owner può proporre file o link. La ricerca e la generazione partono esclusivamente da azioni esplicite. I giocatori non devono registrarsi né fornire email, password o fotografie.

Il ramo REAL e il ramo SLOP condividono **soltanto l'argomento scelto**, non fotografie, titoli, descrizioni, prompt fotografici o valutazioni del ciclo corrente. Il nuovo ramo non richiama `pipeline/v2/smart_crop.py`; i file accettati mantengono il proprio rapporto d'aspetto. Le vecchie copie quadrate restano nell'archivio storico.

## Tre sistemi

### Topic Discovery
- GPT legge nomi di argomenti registrati, suggerimenti precedenti e titoli del catalogo; usa anche le preferenze REAL riassunte in statistiche. Propone cinque temi concreti (evento, luogo, intervallo, azione), non categorie.
- `shared/editorial-intelligence.v1.0.0.ts` deduplica con normalizzazione, termini e sinonimi comuni; questa è una verifica lessicale/euristica, **non** un embedding semantico completo. Va misurato il tasso di falsi duplicati/non duplicati.
- La UI espone Esplora, Scarta e Rimanda, registrati in `editorial_topic_suggestions`. Nessuna proposta viene cercata senza una successiva scelta.
- Conoscere titoli di immagini già presenti non equivale a sapere se un argomento sia stato cercato senza risultato: `editorial_topic_explorations` registra anche ricerche concluse a zero.

### REAL Editorial Preference
- `editorial_image_profiles` contiene profili del contenuto **visibile**: soggetto, azione, ambiente, composizione, leggibilità, interesse e tag visivi. GPT non legge nome file, metadati o archivio licenze nel task di profilazione.
- `worker/editorial-learning.v1.0.0.ts` aggrega solo voti correnti con SHA coincidente e revisioni corrispondenti. Scarti per diritti, guasti tecnici, generazione o immagine incerta non sono gusti negativi.
- Il modello iniziale è un ranking probabilistico regolarizzato con esplorazione, non un fine-tuning di GPT. Si registrano anche fotografie già votate ma non ancora profilate, da analizzare con un'azione esplicita.
- I tag appresi entrano nella preparazione delle query Commons; il modello non attesta autenticità, licenza o veridicità delle manifestazioni.

### SLOP Prompt Preference
- Al momento della creazione dell'argomento viene congelato un record con argomento e giudizi storici **solo SLOP**; non viene letta alcuna fotografia REAL.
- Quando l'owner lo richiede, GPT riceve **solo** questo record `editorial_topic_slop_seed` e genera una banca immutabile di prompt testuali. Non riceve originali REAL, titoli di REAL o i loro giudizi.
- La generazione usa una variante congelata e un formato deciso indipendentemente (panoramico 1536×1024, verticale 1024×1536, quadrato 1024×1024). Il numero è limitato dalle REAL correntemente approvate e dalle SLOP già approvate o in revisione.
- Le SLOP entrano in quarantena e coda singola `editorial_review_inbox`, con metadati di testo-only, ricevuta modello e hash della banca congelata. Voti e scarti sulle SLOP successive informano il modello dei cicli nuovi.
- Non ci sono generazioni su cron, al caricamento di un argomento, in risposta a upload o su ogni voto.

## Acquisizione fotografica e sicurezza

`worker/commons-editorial.v1.0.0.ts` supporta URL di pagine File: di Wikimedia Commons o URL di file/thumb sul dominio Wikimedia. Risolve tramite API Commons (`imageinfo` con URL e metadati), valida l'host del download, disabilita redirect, verifica firma JPEG/PNG/WebP e dimensioni/byte limitati, poi salva i file nella quarantena privata. Nessun server-side fetch di URL arbitrari immessi dall'owner. Le altre fonti restano proposte registrate, non acquisizioni automatiche.

La scheda di revisione non certifica il carattere REAL. I metadati Commons su licenza e autore sono **indizi documentali** che l'owner deve verificare separatamente. Se l'originale non rientra nel limite di byte, Commons può fornire una copia proporzionale: ciò viene annotato in `original_is_preview`; il file storico originale sulla piattaforma non è sovrascritto.

I file binari e le ricevute rimangono privati; gli endpoint sono subordinati all'autenticazione admin già implementata nel Worker. Ogni inserimento è pending. La pubblicazione resta manuale attraverso `worker/editorial-cycle.ts` e bilanciata REAL/SLOP (50/50). Alcune candidate manuali con diritti non documentati non sono ancora ammissibili: è un blocco intenzionale, non un errore del ranking.

## Configurazione: default nessuna spesa

- `WORKSPACE_AI_ENABLED=true` (nuovo flag Worker), `OPENAI_API_KEY` (nuovo **secret Worker**): senza entrambi, il pannello AI non funziona. Non esporre il secret nel frontend, GitHub Actions o bundle.
- Riutilizzare flag `ENABLE_REAL_DISCOVERY_PAID=true`, `REAL_DISCOVERY_MODEL`, `REAL_DISCOVERY_CALL_USD`, `REAL_DISCOVERY_RUN_USD`, `REAL_DISCOVERY_DAILY_USD`, `REAL_DISCOVERY_TOTAL_USD`, `REAL_DISCOVERY_MAX_CALLS` e tabella `editorial_usage`.
- Per generazione: `ENABLE_EDITORIAL_CYCLE_GENERATION=true`, `EDITORIAL_CYCLE_IMAGE_MODEL`, `EDITORIAL_CYCLE_GENERATION_USD`, `EDITORIAL_CYCLE_MAX_GENERATIONS`, con lo stesso ledger e i medesimi limiti totali/giornalieri.
- Ogni operazione è registrata prima della prenotazione, prenotazione prima del POST esterno. Risposte incerte diventano `uncertain` e non vengono ritentate automaticamente, perché si potrebbe fatturare due volte. Il registro dei jobs è visibile nell'admin.

## Limiti e rollout

- La ricerca usa una sola fonte implementata e non può garantire un numero preciso di foto disponibili né risolvere origini e diritti. Openverse e altri adapter restano futuri; non abilitarli via URL libero.
- Per il profilo GPT, la copia inviata al modello è limitata a 2 MB. Un owner con fotografia originale maggiore deve generare e collegare una miniatura fedele prima di profilare: la funzione automatica di anteprima ridotta resta da aggiungere.
- Il criterio di novità è una deduplica lessicale con sinonimi, non un embedding semantico completo. Se risultano prestazioni insufficienti, valutare embeddings testuali sul registro degli argomenti.
- Nuove immagini non quadrate sono preservate; diversi componenti legacy continuano a gestire copie quadrate e devono essere auditati prima di ritirare il vecchio percorso.
- Configurare la migrazione additiva `0020_editorial_intelligence.v1.0.0.sql` dopo `0019_editorial_workspace.v1.0.0.sql` e dopo controllo backup/migrazioni pendenti. La PR non applica migrazioni remote.
- Prima del rilascio: suite lint/TS/Python, Workers/D1/R2 locale, test anti-SSRF e file falsificati, test E2E browser responsive, controllo storico costi e revisione visiva con owner; nessun merge automatico.
