---
version: 1.0.0
created_at: 2026-11-06T18:00:00Z
status: implementation-in-pr-not-activated
source_issue: 56
---

# Completamento del ciclo REAL

Base verificata: main `67ecf49`, audit #58 `77f6cb8`, PR #59 `af24eb7`, ancora
draft e non integrati. Il proprietario autorizza il completamento del codice.
Il giudizio positivo sulla galleria è feedback editoriale generale: non assegna
approvazioni per singolo SHA, non verifica diritti e non autorizza pubblicazione,
spesa, merge o deploy. La scelta sul budget GPT resta aperta; la segnalazione
Openverse resta solo in bozza per scelta esplicita.

## Delta e decisioni prima del codice

| Scarto osservato | Intervento limitato |
| --- | --- |
| Comandi per fase separati, senza coordinamento riprendibile | Un ciclo che riusa planning/retrieval/acquisizione/profili, dichiara le attese e conserva la configurazione |
| Planner avvia entrambi i provider | Selezione esplicita, Commons operativo da solo; nessun accesso Openverse implicito |
| Bitmap solo nel controllo manuale | Compilazione deterministica opzionale nel collector, uguale nei bracci del nuovo pilota |
| Review esportata ma non collegata allo scheduler | Eventi idempotenti separati per HTTP, documenti, duplicati e giudizi umani |
| Dossier immutabile impedisce correzioni documentali | Revisioni documentali additive; profili legati ai byte e cache visiva riusata se cambiano soltanto le prove |
| Galleria creata come artefatto locale occasionale | Export privato riproducibile con originali/anteprime, stato per SHA e decisioni importabili |
| Benchmark reale con query manuali | Preparazione del pilota A/B da vere ricevute del client, distinguendo modello reale e fixture |

Nessun nuovo framework, servizio o migrazione. Il ramo SLOP resta un input
autonomo opzionale congelato prima di REAL; questo ciclo non genera immagini
sintetiche o partner. L'export verso i contratti esistenti conserva la review
separata del catalogo e non rende le immagini pubbliche o giocabili.

## Stati del ciclo

Configurazione/freeze → strategie A/adattamento B → retrieval → acquisizione
con host espliciti → attesa dossier → profilo cieco → shortlist → attesa review
individuale → export delle approvate. Zero risultati ed errori fonte restano
stati distinti, con ricevute; un run interrotto non produce retry impliciti.

Senza `--execute` non si chiama il modello. Senza `--live` non si interroga
una fonte né si scaricano file. Le fixture hanno configurazione e tracce
esplicitamente simulate e non sono esportabili al catalogo reale. Un dossier
con diritti/origine pendenti non raggiunge il VLM. Nessuna approvazione deriva
dal numero di hit, da un punteggio visivo o dalla frase “immagini ottime”.

Le correzioni dei dossier hanno una revisione distinta dalle nuove valutazioni
visive: stessi pixel e stessa rubrica/modello possono riusare la ricevuta;
pixel diversi non ereditano il giudizio. I feedback HTTP/documentali non entrano
nel denominatore dei rifiuti umani. Eventi di review e revoche a pending sono
legati alla revisione e riprocessabili senza duplicare il conteggio.

## Cosa rimane esterno al completamento del codice

### Uso e ripresa

I comandi partono dalla radice del repository. Preparazione e stato non fanno
inferenze o accessi alle fonti:

```sh
npm run discovery:cycle -- start --out .pipeline/real/cycle-001 --model gpt-6.1-terra --run-id cycle-001 --topic animals --emotion compassion --intensity medium --count 2
npm run discovery:cycle -- status --out .pipeline/real/cycle-001
```

Dopo autorizzazione operativa e configurazione dei gate client/server, del ledger,
del token admin e della chiave modello, `resume --execute --live --base URL`
esegue soltanto le fasi ancora mancanti e arriva a `awaiting_documents`.
Il percorso del manifest da completare compare in `documentary_input`; le prove
non sono attestate automaticamente dai metadati Commons. Conservare copie dei
manifest compilati con nomi distinti:

```sh
npm run discovery:cycle -- resume --out .pipeline/real/cycle-001 --documents /percorso/dossier.json
# Solo dopo l'abilitazione delle inferenze, genera il profilo sui pixel finali:
npm run discovery:cycle -- resume --out .pipeline/real/cycle-001 --execute --base URL
```

`gallery.html` nello stato punta al file privato apribile nel browser. La pagina
esporta solo le scelte cliccate, legate a SHA/revisione e nome del revisore:

```sh
npm run discovery:cycle -- resume --out .pipeline/real/cycle-001 --reviews /percorso/decisions.v1.0.0.json
npm run discovery:real -- feedback --out .pipeline/real/cycle-001
```

Per correggere dossier esistenti usare `--document-revision 2 --documents ...`;
per chiedere deliberatamente una nuova valutazione visiva `--profile-revision 2`.
Le versioni sono consecutive per i dossier e non possono retrocedere nel ciclo.
Una ricevuta incerta richiede diagnosi e scelta esplicita; la ripresa non reinvia.
L'output `handoff` contiene solo le approvate correnti e l'audit; richiede ancora
la review/importazione del catalogo esistente e non pubblica nulla.

### Pilota GPT e verifica senza spesa

```sh
npm run benchmark:pilot
npm run benchmark:pilot -- --fixture --out .pipeline/real-pilot-fixture
npm run benchmark:pilot -- --report-only --out .pipeline/real-pilot-fixture
```

Il primo comando mostra il piano senza rete: quattro caselle × (una chiamata A +
due B) = 12 richieste modello previste, più eventuali profili successivi. Le
caselle sono quelle del controllo Commons già osservato; le query manuali non
vengono riutilizzate. `--execute --model ... --run-id ... --base ...` prepara
strategie e adattamenti dai due stadi reali; `--live` abilita il retrieval.
La modalità fixture non effettua queste chiamate reali. Il confronto usa testo,
stesso filtro bitmap e identico limite HTTP; query duplicate possono riusare
la cache e il rapporto dichiara il minor numero effettivo di chiamate.

Ogni query è verificata contro la risposta e la ricevuta originale A/B. I bracci di un pilota reale
`retrieval/cell-N/general` e `adapted` possono proseguire con `discovery:cycle
resume --live`, dossier, profili e review. `--report-only` aggiorna le misure
editoriali dalle ricevute locali senza costruire client modello o HTTP; conserva
snapshot del rapporto. Una resa editoriale non misurata resta `null`, non zero.
Il costo prenotato di planning non è una fattura né include profili futuri.

I feedback esportati distinguono eventi HTTP, problemi documentali, duplicati e
decisioni umane. `--history .../feedback-export.v1.0.0.json` sul nuovo `start`
alimenta lo scheduler senza contare errori di fonte come rifiuti. L'importazione
rifiuta gli export marcati simulati.

### Integrazione e dismissione

Le vecchie issue #44–#50 e l'intera catena #51/#52/#55 non sono necessarie per
questo percorso. Il piano di integrazione resta valido per le loro funzionalità
indipendenti. La pulizia futura può togliere ingressi obsoleti dopo verifica
delle dipendenze; conserva lettori di recupero, fixture, cataloghi, originali,
freeze, ledger e audit. Questa consegna non elimina alberi legacy o cron.

### Passaggi operativi rimasti

Pilota pagato con tetto esplicito e ledger; verifiche documentali e decisioni
del proprietario; accesso Openverse consentito dal provider; eventuale rilascio
di produzione separato. Il recupero dei run storici, i cataloghi/freeze, D1/R2,
la pubblicazione bilanciata e le monete 50/50 del gioco rimangono preservati.
