# Istruzioni Codex — versione canonica 9.0.0

Snapshot: `docs/AGENTS.v9.0.0.md`. Percorsi relativi alla radice del repository.
Aggiornato: 2026-11-07T23:12:00Z. Base main `a10401a6c87586ef4d7517ad4f5e5e53dddad784`.
Le sezioni precedenti alla revisione 9 restano contesto storico; il delta corrente
riguarda soltanto la conferma delle descrizioni richiesta nella #64 / #78.

## Aggiornamento #64 / #78 — conferma delle descrizioni 9.0.0

Aggiornato: 2026-11-07T23:12:00Z. La specifica corrente è
`docs/topic-description-confirmation.v1.0.0.md`; in questo ambito sostituisce il
ramo title-only della versione 8.0.0 e della memoria semantica 2.0.0.

Per nuovi argomenti senza descrizione, la richiesta esplicita dell'owner prepara
una proposta GPT inglese di massimo 500 caratteri, modificabile e con ambiguità
visibili. Non creare il tema definitivo, il seed SLOP o un embedding prima di
**Approva e registra**. Rigenera e Annulla sono azioni separate; la rigenerazione
richiede una nuova conferma di costo. Una descrizione già scritta dall'owner
segue direttamente la registrazione/indicizzazione senza riscrittura GPT.

La migrazione additiva 0024 introduce bozze private e ricevute dedicate `describe`;
non ricostruisce tabelle storiche. Approvazione vincolata a ID, titolo e hash della
proposta; testo confermato, tema e memoria pending sono salvati atomicamente.
Una bozza superata o annullata non può essere approvata. Deduplicazione normalizzata
prima dei costi, prenotazione sul ledger esistente, nessun retry di esiti incerti.
I gate sono `WORKSPACE_AI_ENABLED`, `ENABLE_REAL_DISCOVERY_PAID` e i limiti REAL
Discovery esistenti; l'embedding usa i propri tetti. Discovery OFF non blocca
questo flusso. Errori o budget assente consentono una descrizione manuale senza
perdere il titolo. Non attivare credenziali, gate, budget, merge o deploy.

Testare HTTP con il vero Worker/D1/R2 e API simulate, doppio clic/concorrenza,
proposte stale, testo modificato, annullamento, budget/gate assenti ed esiti
incerti; verificare editor e ripresa dopo refresh su desktop/mobile.
La #76 non rientra in questa consegna, su istruzione esplicita dell'owner.

## Completamento #64 — contratto corrente 8.0.0

Aggiornato: 2026-11-07T19:21:24Z. `docs/editorial-intelligence.v2.0.0.md` è il riferimento corrente
per la dashboard owner-first e sostituisce, in questo ambito, le indicazioni
precedenti che descrivono ancora il suggeritore vettoriale come futuro.

La migrazione additiva 0023 conserva revisioni semantiche immutabili, embedding
per proposte, controlli di novità, pertinenza fotografica separata, diagnostica
retrieval, scelta manuale prima della ricerca e prenotazioni atomiche del deficit
SLOP. L'owner può modificare descrizioni e indicizzare singoli temi storici/pending
anche con Topic Discovery OFF. Esiti incerti non vengono ritentati. Il ripristino
di una revisione riusa vettori compatibili già archiviati.

Il suggeritore usa lo storico dei temi e i vettori compatibili, mostra i vicini e
fa distinguere a GPT parafrasi da eventi/prospettive differenti. Non usa gusti REAL
o SLOP. Il profilo resta pixel-only; il confronto con il tema è successivo e non
attesta provenienza, licenza o fatti storici. SLOP legge soltanto il seed congelato
prima delle REAL; i nuovi formati dipendono dall'ID del tema, mai dalle REAL.

Verifica aggiuntiva: `npm run test:editorial` e
`ROS_TEST_BROWSER=1 npm run test:editorial`, con D1/R2 veri locali e tutte le API
simulate. La CI esegue anche il browser desktop/mobile fino alla pubblicazione
bilanciata di fixture. Nessuna inferenza a pagamento, migrazione remota, deploy o
merge è autorizzata implicitamente. Documentare i limiti di corpus non indicizzati
e formati sconosciuti; non certificare la neutralità del catalogo reale con fixture.

Le sezioni storiche seguenti rimangono contesto per i contratti precedenti;
per le estensioni appena elencate prevale questa sezione e la specifica 2.0.0.

## Delta owner-first #64 (PR in bozza, non attivo in produzione)

Aggiornato: 2026-11-07T13:15:33.448Z. Leggere `docs/admin-workspace.v1.0.0.md` e issue #64 prima di estendere i flussi editoriali.
Per i nuovi percorsi, l'owner sceglie un argomento e può prima proporre fotografie tramite link o file; solo dopo può autorizzare un'eventuale ricerca GPT. I link non sono fotografie acquisite. Gli upload sono REAL solo come **categoria candidata**, non come attestazione: preservare file, hash e rapporto d'aspetto. Verifica documentale, voto e pubblicazione rimangono distinti.
Tre sistemi di apprendimento **indipendenti**: Topic Discovery (novità/varietà e storico temi), REAL Preference (profilo pixel-only + giudizi editoriali, non licenze), SLOP Prompt Preference (solo feedback su SLOP e prompt). Il preparatore SLOP non può accedere a fotografie REAL, titoli, metadati, descrizioni o voti del ciclo corrente; isolare fisicamente il payload, non soltanto filtrare nomi campo; congelare la banca prompt prima del retrieval/manual REAL. Nessuna nuova chiamata a pagamento, cron o pubblicazione senza autorizzazione esplicita dell'owner nell'admin.
La nuova migrazione 0019 è additiva, non va applicata in produzione dalla PR. Il legacy 1024×1024 rimane fuori dall'incremento iniziale e va sostituito con una strategia a rapporti d'aspetto preservati, senza cancellare originali o run storici. Prima del merge fornire anteprima visuale, test, CI e approvazione esplicita.

## Nuovo ambito owner-first #64 (PR in bozza)

Aggiornato: 2026-11-07T13:53:33.858Z. Prima di modificare la discovery o lo studio editoriale leggere `docs/editorial-intelligence.v1.0.0.md` e l'issue #64. I tre sistemi Topic, REAL e SLOP sono indipendenti. La ricerca GPT è facoltativa dopo le proposte manuali; mai avviarla alla scelta del topic o al voto. Gli input SLOP sono limitati allo snapshot frozen dell'argomento e ai feedback storici SLOP; non far entrare nel modello fotografie, titoli, profili, descrizioni o giudizi REAL del ciclo. Non chiamare modelli esterni senza ricevuta, prenotazione contabile e consenso esplicito nell'admin. Se un invio è incerto, non ritentare. Nessun account, fotografia o credenziale richiesta ai giocatori.

Il nuovo upload e retrieval preservano il rapporto d'aspetto, le SLOP nuove ruotano formati verticali/orizzontali/quadrati. Le vecchie pipeline 1024×1024 non si riscrivono senza migrazione testata. Nessuna autorizzazione a deploy/migrazioni remote/merge è implicita nell'issue o nella PR. Prima del merge controllare test di compilazione, DB/R2, limiti file/SSRF, anteprima e consenso dell'owner.

## Nuovo criterio formati #64 (PR di completamento)

Aggiornato: 2026-11-07T14:58:05.001Z. Per ogni **nuova** fotografia preservare il rapporto originale; non usare la trasformazione di quadratura `standard_copy`/smart_crop nel flusso ordinario, e non alterare esperimenti storici. Usare `--method preserve` o il percorso owner-first della dashboard; conservare originali, orientamento EXIF, hash, dimensioni e verifica umana. La vecchia pipeline Terra/center resta invocabile soltanto esplicitamente per gli studi legacy. `docs/presentazione-proporzionale.v1.0.0.md` formalizza il nuovo comportamento.

Motivi distinti di rifiuto: editoriale, generazione, tecnico, diritti/licenza, provenienza/autenticità incerta. Non usare rifiuti per provenienza come segnali di gusti negativi. Eseguire CI e test E2E su desktop e mobile; nessun merge/deploy senza anteprima e conferma editoriale.

## Admin: copie di profilazione proporzionali #64

Aggiornato: 2026-11-07T15:06:47.075Z. I file fotografici originali fino a 12 MB non vanno ridimensionati/sovrascritti per permettere il profiling. L'admin prepara una miniatura WebP fedele e senza ritaglio (lato massimo 1152, ≤1,5 MB) con conferma esplicita. Il Worker verifica hash originale, MIME, geometria, rapporto d'aspetto e hash preview prima di prenotare una chiamata GPT. Non usare titolo, URL, autore o metadati per produrre il profilo visivo. Il profilo è valutazione dei pixel, non prova di provenienza né licenza. Test e specifica in `docs/profilazione-visiva.v1.0.0.md`. Nessun deploy o merge è implicito.

## Contratto architetturale #64 — input = memoria incrementale

Aggiornato: 2026-11-07T17:50:01.887Z. Leggere `docs/topic-discovery-semantic-learning.v2.0.0.md`. **Non confondere l'interruttore Topic Discovery con l'indicizzazione degli argomenti.** Il primo controlla soltanto i suggerimenti autonomi e rimane OFF al primo avvio; la seconda avviene al salvataggio di ciascun nuovo argomento owner-first anche con Discovery OFF. Conservare testo originale, descrizione fino a 500 caratteri, template/versione/hash, modello, vettore numerico, token e stato. Mai sostituire un embedding non disponibile con un vettore inventato, mai ritentare automaticamente invii potenzialmente fatturati.

Le richieste automatiche embedding sugli input richiedono credenziali di server e tetti di spesa dedicati, da configurare esplicitamente. Nessun modello deve essere chiamato quando non è configurato: il testo resta `pending` e la UI lo comunica. Non introdurre campi obbligatori di luogo/data/evento o tassonomie per Topic Discovery. Modifiche a questa architettura richiedono prove reali di provider simulato, persistenza locale e verifica del frontend. Aggiornare MASTER/AGENTS ai cambiamenti maggiori e conservare gli snapshot.

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
- Il ciclo completo dei nuovi run è `pipeline.cycle`, regolato da
  `docs/ciclo-editoriale.v1.0.0.md`: casella → brief/banca prompt congelati →
  ricerca → coda sito → voto REAL → generazione sul deficit → coda SLOP →
  voto → verifica documentale separata → pubblicazione bilanciata del ciclo.
  La richiesta corrente supera l'opzionalità del brief nel solo ciclo completo.
  Le copie tecniche possono essere riviste prima di origine/licenza: nessuna
  attestazione viene inventata e nessun voto le conferma implicitamente.
  `watch` è un processo CLI esplicito e limitato; non installare cron.
- I voti del sito, legati ai pixel e alla revisione corrente, sono l'autorità.
  SLOP pending conta come capacità: rigenerare solo il deficit, usando varianti
  congelate inutilizzate entro limiti immutabili e ledger testo/immagini comune.
  I rifiuti editoriali REAL/SLOP informano prior distinti; guasti tecnici, difetti
  del generatore e problemi di diritti restano diagnostica esplicita.
- Le nuove ammissioni e pubblicazioni passano da `worker/editorial-cycle.ts`
  e dalla migrazione additiva 0018. L'ammissione richiede voto personale sui
  pixel correnti e attestazioni documentali separate; pubblicazione atomica
  con quantità uguali, eccedenze in attesa e audit conservato. Non ripetere
  il voto visivo e non importare automaticamente le approvazioni storiche.
- La discovery isolata `pipeline.real.run` segue `docs/ricerca-real.v1.0.0.md`:
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
  Non dichiarare una consegna remota completa senza verificare righe e pixel nel sito.
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
  `npm run test:integration`, anche profili Batch, v2, senza R2,
  `ROS_TEST_REAL=1` e `ROS_TEST_CYCLE=1` come in CI. `npm run benchmark:real` è solo fixture offline.
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
