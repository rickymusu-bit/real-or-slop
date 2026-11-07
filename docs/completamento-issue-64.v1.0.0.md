# Completamento dashboard editoriale — 1.0.0

Aggiornato: 2026-11-07T19:27:14Z. Base verificata: main `bac6edf`, PR #75 integrata.

## Decisioni prima dell'implementazione

| Fonte / stato | Contraddizione o lacuna | Decisione, impatto e verifica |
| --- | --- | --- |
| Issue #64, decisione prioritaria; PR #75 integrata | OFF era descritto come blocco anche degli embedding | OFF blocca solo suggerimenti; indicizzazione singola esplicita indipendente, test HTTP |
| Issue #64, decisione senza tassonomia | PR #74 propone classificazione obbligatoria | Non importare #74; nessuna matrice obbligatoria |
| Main, `similarTopic` e `/suggest` | Vettori archiviati ma suggeritore ancora lessicale e storico troncato | Confronto con tutto lo storico compatibile, vicini e valutazione GPT dei casi simili; test eventi distinti e parafrasi |
| Main, memoria semantica | Storico e pending non indicizzabili dall'admin; descrizioni non editabili | Comandi espliciti per singolo argomento, revisioni conservate, nessun batch automatico e nessun retry di incerti |
| Main, ranking REAL | Preferenza estetica non misura pertinenza visiva al tema | Confronto separato dopo profilo pixel-only, nessuna attestazione di evento/licenza e nessun dato passato a SLOP |
| Main, ricerca Commons | Errori silenziati e confusi con zero risultati | Diagnostica persistente, risultati parziali e fallimenti distinguibili |

## Risultato

Contratto corrente: [dashboard 2.0.0](editorial-intelligence.v2.0.0.md), MASTER e
AGENTS 8.0.0 con snapshot corrispondenti. Nuova migrazione additiva 0023.

- `worker/topic-recommender.v1.0.0.ts` e `shared/topic-vectors.v1.0.0.ts`:
  confronti vettoriali compatibili, storico completo dei temi, esiti a zero hit,
  motivazioni e verifica distinta dei duplicati. Le preferenze REAL/SLOP non
  entrano nel suggeritore Topic.
- `worker/topic-semantic-memory.v1.0.0.ts` e `worker/editorial-workspace.ts`:
  indicizzazione esplicita di temi storici/pending, modifica descrizioni,
  revisioni immutabili, riuso dei vettori ripristinati e lock legato a testo/modello.
- `worker/editorial-intelligence.v1.0.0.ts` e learner: confronto della pertinenza
  successivo al profilo pixel-only, scelte manuali prima della ricerca, diagnostica
  dei provider, acquisizioni visibili e conteggi dei formati. Capacità SLOP prenotata
  atomicamente e formati ruotati indipendentemente dai pixel REAL.
- Frontend: comandi corrispondenti, aggiornamento preferenze/deficit al voto,
  miniature prive di overflow mobile. CI estesa al browser con API simulate.

## Verifiche eseguite

| Verifica | Esito locale |
| --- | --- |
| `npm run lint` | PASS |
| `npm test` | PASS: 30 file TS e 258 test Python |
| `npm run build` | PASS, inclusi TypeScript frontend/Worker e controllo asset |
| `npm run deploy:check` | PASS, controllo offline della destinazione |
| `npm run db:migrate` e `npm run db:seed` | PASS, soltanto database locale |
| `npm run dry-run` | PASS, nessun upload/deploy remoto |
| Integrazione standard | PASS sulla versione finale |
| Profili Batch e v2 | PASS; pipeline legacy e ledger invariati dalle ultime modifiche |
| Profilo senza R2 | PASS in esecuzione isolata |
| `ROS_TEST_REAL=1` e `ROS_TEST_CYCLE=1` | PASS, ledger e budget locali |
| `ROS_TEST_BROWSER=1 npm run test:editorial` | PASS, desktop e mobile fino ad ammissione e pubblicazione locale |
| Snapshot, riferimenti nuovi e `git diff --check` | PASS |

Il primo tentativo senza R2 ha ricevuto un 503 durante una ricompilazione del
server locale. Il log attestava il reload; la riesecuzione senza build concorrenti
è passata. Non è stato cambiato il codice del gioco per mascherare il problema.
Il test mobile ha individuato overflow nelle miniature, corretto disponendo
immagine ed etichetta in colonna; la riesecuzione completa è passata.

Anteprime prodotte dal browser reale (dati e ricevute **simulati**):
[desktop](../artifacts/editorial-browser/desktop.png),
[mobile](../artifacts/editorial-browser/mobile.png),
[pubblicazione desktop](../artifacts/editorial-browser/desktop-publication.png),
[pubblicazione mobile](../artifacts/editorial-browser/mobile-publication.png).
Sono artefatti locali ignorati da Git e riproducibili con il comando sopra.

## Limiti e rilascio

Nessuna chiamata a un modello reale, migrazione remota, modifica di secret/gate,
deploy, merge o pubblicazione di produzione. La nuova CI è configurata, ma non
è stata eseguita su GitHub per questo delta locale. L'issue non viene chiusa
automaticamente: il rilascio richiede approvazione esplicita e verifica dei dati
reali secondo AGENTS.

Le fixture testano i confini del sistema; non misurano qualità dei suggerimenti,
autenticità/licenze né assenza di bias di formato nel catalogo reale. Commons è
l'unico adapter automatico; altre fonti restano acquisibili tramite upload owner.
L'indicizzazione dello storico è singola ed esplicita, non un batch automatico.
I record incerti restano bloccati; i file privi di geometria e i JPEG senza
orientamento risolto rimangono sconosciuti nell'audit dei formati.
