# Istruzioni Codex — versione canonica 2.2.0

Snapshot: `docs/AGENTS.v2.2.0.md`. Percorsi relativi alla radice del repository.
Aggiornato: 2026-11-06T20:00:04Z. La 1.0.0 resta conservata. Questa revisione
collega la discovery REAL #56 alla coda privata del sito, prima della review umana.

## Prima di modificare

1. Controllare `git status --short --branch`, HEAD, `origin/main` aggiornato e
   base/head/stato delle PR coinvolte. Le ref locali possono essere obsolete.
   Non sovrascrivere modifiche dell'utente; isolare il lavoro se necessario.
2. Leggere `MASTER.md`, le specifiche correnti lì indicate e la issue richiesta.
   Distinguere codice in main, codice nel checkout e proposte non integrate.
3. Registrare le contraddizioni tra richiesta, codice e contratti prima di
   codificare: fonte, stato, decisione, impatto e test. Non applicare tacitamente
   una issue incompatibile. Proseguire sul lavoro indipendente; chiedere solo
   decisioni davvero mancanti che bloccano il comportamento richiesto.
4. Limitare il delta alla issue. Riutilizzare moduli, fixture e CI esistenti;
   nessun nuovo framework o refactoring cosmetico. Audit #57/PR #58 e discovery
   #56/PR #59 sono integrati; le correzioni partono da main aggiornato, senza
   importare automaticamente #51/#52/#55.

## Precedenza e versioni

- Le istruzioni esplicite dell'utente e quelle della sessione prevalgono.
  `AGENTS.md` regola il lavoro; `MASTER.md` identifica architettura e contratti
  correnti. Le specifiche esplicitamente indicate valgono nel proprio ambito.
- Issue e PR propongono delta: non sono automaticamente contratti vigenti o
  autorizzazioni operative. I documenti storici servono per audit e migrazione.
- Nuovi report e specifiche: `nome.vMAJOR.MINOR.PATCH.ext`, senza date nel nome,
  con timestamp ISO 8601 nel contenuto. Non riscrivere versioni storiche.
  `AGENTS.md` e `MASTER.md` sono ingressi a nome fisso: dichiarare la versione
  canonica e conservarne snapshot SemVer in `docs/`. Per cambi strutturali MAJOR
  aggiornare entrambi e aggiungere nuovi snapshot; non cambiare quelli precedenti.
  I numeri di app, protocollo, schema dati e documenti sono indipendenti.

## Confini da preservare

- Python è una pipeline offline/CLI; frontend Vite/TypeScript e Worker Cloudflare
  restano separati. Usare JSON condivisi e fixture comuni per i contratti Python/TS.
- Il nuovo percorso `pipeline.real.run` segue `docs/ricerca-real.v1.0.0.md`:
  intenzione → strategie A → adattamento B → HTTP deterministico → dossier →
  profilo cieco → review. Non obbligare embedding, cataloghi vecchi o coppie.
  Per nuovi run usare i contratti `shared/real-discovery*.v1.0.0.json`;
  non convertire checkpoint/eventi v2/v3/v4. Modelli pagati richiedono i gate
  client/server e il ledger esistente; nessun reinvio su ricevuta incerta.
- Il ciclo `pipeline.real.workflow` segue anche `docs/ciclo-discovery-real.v1.0.0.md`:
  dossier e profili hanno revisioni distinte; conservare i byte di ogni revisione.
  Il pilota `pipeline.real.pilot` verifica le query contro ricevute A/B e distingue
  fixture, controllo manuale e misure reali. Feedback HTTP non sono voti umani.
- La review personale avviene nella coda unica `/admin`, come richiesto in
  `docs/coda-revisione-unica.md` e `docs/discovery-coda-sito.v1.0.0.md`. Le
  candidate vanno importate pending prima dell'approvazione; gli HTML locali
  sono diagnostiche. Riutilizzare `scripts/sync-review-inbox.py` con le credenziali
  Cloudflare configurate: questo percorso non richiede l'admin token dell'app.
  Non dichiarare la consegna completa senza verificare righe e pixel nel sito.
- Per nuovi cicli, congelare il prompt SLOP originale prima di osservare REAL.
  Mai passare al generatore pixel, titoli, metadati, descrizioni o risultati REAL.
  Il codice legacy che deriva prompt da fotografie non è un modello da riusare.
- Retrieval, origine/licenza, giudizio visivo sui soli pixel, decisione umana e
  pubblicazione sono passaggi distinti. Hit, punteggi e `draft` non approvano nulla.
- Conservare D1/R2, originali, freeze, cataloghi, giudizi, hash e audit. Non
  uniformare dHash storici al nuovo contratto di similarità. Preservare deduplica
  per origine, pubblicazione bilanciata, monete 50/50 indipendenti e API del gioco.
- Non dedurre da issue/PR precedenti permessi per secret, produzione, cron,
  inferenze a pagamento, deploy, merge, migrazioni remote o eliminazioni.
  Eseguire queste azioni solo con autorizzazione esplicita pertinente alla sessione.
  Non stampare credenziali. Migrazioni nuove solo additive e provate localmente.

## Verifica e consegna

- Seguire `.github/workflows/checks.yml`: Node da `.nvmrc`, Python 3.12,
  `pipeline/requirements.txt`, `ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci`.
- Baseline: `npm run lint`, `npm test`, `npm run build`, `npm run deploy:check`;
  per schema/storage/Worker usare migrazioni e seed locali, `npm run dry-run` e
  `npm run test:integration`, anche profili Batch, v2, senza R2 e
  `ROS_TEST_REAL=1` come in CI. `npm run benchmark:real` è solo fixture offline.
  Non avviare suite Wrangler concorrenti: condividono stato/porta locali.
- Per sole modifiche documentali verificare anche link, snapshot e
  `git diff --check`. Riutilizzare una baseline appena eseguita se codice e
  configurazione non cambiano; distinguere fallimenti preesistenti e limiti locali.
- Nessuna API pagata nei test: usare provider fittizi e fixture. Per nuovi confini
  coprire contaminazione SLOP, parametri inventati, errori/zero hit/risultati parziali,
  licenze ambigue e assenza di approvazioni implicite.
- Resoconto finale: file e comportamento cambiati, verifiche/esiti, rischi,
  limitazioni e azioni non eseguite. Template per issue future:
  `docs/checklist-issue-codex.v1.0.0.md`.
- Dismissione: non cancellare interi alberi legacy. Prima separare le utilità
  condivise e verificare recupero dei run; conservare lettori, migrazioni, dati,
  cataloghi, freeze e audit. Non modificare workflow schedulati per questa pulizia.
