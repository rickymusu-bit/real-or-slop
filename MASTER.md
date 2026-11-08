# Mappa canonica — versione 10.0.0

Snapshot: `docs/MASTER.v10.0.0.md`. Percorsi relativi alla radice del repository.
Verificato: 2026-11-08T02:30:59Z. Base main `ff11c3dcd1b4ad6118ac72d443a680113b646e7a`.
La PR #79 è integrata; questo delta implementa la successiva decisione della
sessione sulla plausibilità dei temi e sulla libertà dei rami REAL/SLOP.
La migrazione 0025 è provata soltanto in locale; nessun rilascio remoto incluso.

## Decisione corrente #64 — significato prima della distanza (10.0.0)

Aggiornato: 2026-11-08T02:30:59Z. Specifica: `docs/scoperta-argomenti-prudenti.v1.0.0.md`.
La decisione esplicita dell'owner nella sessione corrente sostituisce la ricerca
obbligatoria di cluster vuoti/zone poco coperte proposta nella #64. Le sezioni
9.0.0 e precedenti rimangono contesto storico per gli ambiti non sostituiti.

Topic Discovery propone prima argomenti comprensibili, specifici e fotograficamente
plausibili. Una prima autovalutazione negativa/incompleta impedisce l'embedding;
una seconda revisione controlla ammissibilità e duplicati. Entrambe sono stime del
modello, separate dal voto dell'owner. Una proposta molto distante può essere
inammissibile; episodi distinti possono essere validi anche con coseno elevato.
Nessuna ricerca di vettori arbitrari o generazione per riempire regioni vuote.

La distanza resta diagnostica secondaria di confronto con lo storico; mai una
percentuale di qualità o prova di novità. Separare vicini dello stesso lotto e
vicini storici. I contatori descrivono il corpus, senza attestare automaticamente
maturità, qualità o copertura in base al numero di vettori. La valutazione utile
richiede dati sufficientemente rappresentativi e giudizi dell'owner; nessun
benchmark di efficacia reale su un corpus ancora in popolamento.

La descrizione confermata continua nella memoria semantica e nel confronto di
pertinenza già esistente. Non propagarla automaticamente alle query REAL o ai
prompt SLOP: REAL usa titolo e preferenze per pianificare keyword; SLOP mantiene
solo titolo e feedback storici congelati prima delle REAL. Eventuali esperimenti
con la descrizione sono separati, espliciti e da valutare prima di cambiare default.

La migrazione additiva 0025 conserva valutazioni del modello distinte dalle
scelte umane e un registro idempotente per lotto. Non cambiare gate, tetti,
secret, dati remoti o pipeline storiche. Restano fino a due chiamate testo e
cinque embedding per richiesta esplicita, senza chiamate reali nei test.
Verificare corpus vuoto, outlier esclusi, alta somiglianza con episodio diverso,
risposte invalide/incerte, replay concorrenti e isolamento REAL/SLOP nel browser.

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

## Delta proposto in PR #64 — studio editoriale owner

Aggiornato: 2026-11-07T13:15:33.448Z. Specifica e stato: `docs/admin-workspace.v1.0.0.md`.
Questa PR aggiunge il workspace privato `/admin`, la tabella di argomenti e proposte in `migrations/0019_editorial_workspace.v1.0.0.sql`, il Worker `worker/editorial-workspace.ts` e i validatori `shared/editorial-workspace.v1.0.0.ts`.
I link dell'owner sono proposte da acquisire, mentre gli upload entrano come file REAL *pending* e senza attestazione di origine o diritti. Per ora **nessuno dei tre learner è attivato**: Topic Discovery, REAL Preference e SLOP Prompt Preference sono separati nel contratto, con ordine di implementazione e isolamento specificati nel documento. Nessun costo, cron, deploy, ricerca GPT o pubblicazione vengono attivati. La migrazione 0019 non va applicata automaticamente in produzione.

Le indicazioni legacy sotto rimangono descrizioni dei percorsi precedenti: il nuovo workflow owner-first della #64 ha precedenza per i futuri cicli una volta approvato e rilasciato; nessun run precedente è riscritto.

## Nuovo percorso owner-first #64 (PR in bozza)

Aggiornato: 2026-11-07T13:53:33.858Z. Il nuovo sistema in `docs/editorial-intelligence.v1.0.0.md` aggiunge la migrazione 0020, `worker/editorial-intelligence.v1.0.0.ts`, `worker/editorial-learning.v1.0.0.ts`, `worker/commons-editorial.v1.0.0.ts`, `worker/workspace-ai.v1.0.0.ts`, i validatori e la UI `src/editorial-intelligence.v1.0.0.ts` all'admin owner-first della PR #65. Topic Discovery, REAL Preference e SLOP Prompt Preference sono separati, con input e feedback distinti e gate API espliciti. Non è attivo in produzione: ancora da verificare CI, migrazioni, preview e test E2E. I vecchi quadrati delle pipeline legacy restano storici. L'issue non è chiusa.

## Addendum #64: revisione proporzionale senza crop (PR di completamento)

Aggiornato: 2026-11-07T14:58:05.001Z. La procedura ordinaria per le nuove copie di revisione in `pipeline/v2/presentation.py` utilizza **`--method preserve`** e `pipeline/v2/preserve_v1_0_0.py`, come descritto in `docs/presentazione-proporzionale.v1.0.0.md`. Mantiene il rapporto d'aspetto, non ingrandisce e registra hash/EXIF/operazioni senza cambiare gli originali. I metodi `terra` e `center` con crop quadrato restano solo per riprodurre studi legacy. Il pannello admin ha un motivo distinto per provenienza/autenticità incerta, da escludere dall'apprendimento delle preferenze. Questa PR non autorizza deploy, migrazioni o chiamate API.

## Miglioramento della profilazione visiva #64

Aggiornato: 2026-11-07T15:06:47.075Z. Per immagini REAL e SLOP in coda, la dashboard admin crea in browser una **copia proporzionale senza crop** di massimo 1152 px e 1,5 MB, da inviare al modello esclusivamente con autorizzazione esplicita. Il Worker verifica SHA dell'originale archiviato, geometria e hash della miniatura prima della chiamata API. I profili si riferiscono ai pixel della derivata e sono legati all'hash originale per le preferenze. Vedi `docs/profilazione-visiva.v1.0.0.md`. Nessun file sorgente viene sostituito e nessuna funzione viene attivata in produzione dalla PR.

## Decisione #64 — Memoria semantica incrementale, Discovery facoltativo

Aggiornato: 2026-11-07T17:50:01.887Z. Vedere `docs/topic-discovery-semantic-learning.v2.0.0.md`. Il motore **Topic Discovery resta OFF per default**, con switch owner-only `/admin` in migrazione 0021; nessun suggerimento automatico.

Il popolamento manuale ora registra titolo e descrizione semantica e invoca **l'API reale degli embedding per ogni nuovo argomento**, se `OPENAI_API_KEY` e i budget dedicati sono configurati. Questa indicizzazione è **indipendente dal toggle Discovery**. I vettori risultanti (o lo stato `pending/uncertain`) sono registrati nella nuova migrazione 0022 con testo, hash, modello, versione e dimensioni; un argomento accettato dai suggerimenti viene trattato allo stesso modo. Se non si configura il servizio, non viene fabbricato un vettore: il testo resta memorizzato e la UI segnala `pending`.

La raccolta dei feedback REAL e SLOP resta nei rispettivi registri e influenza gli ordinamenti/prompt successivi, senza addestramento di pesi a ogni voto. Il futuro suggeritore potrà usare il corpus di embedding; **la ricerca vettoriale non è ancora implementata**. Non attivare automaticamente secrets, migrazioni remote, spese o deploy. La CI e l'approvazione visiva precedono il merge.

## Ingressi e autorità

`AGENTS.md` contiene le istruzioni operative. Questo file identifica le decisioni
correnti senza duplicarne i contratti. In caso di conflitto registrare la decisione
secondo AGENTS; non scegliere semplicemente il numero di versione più alto.

| Ambito | Fonte corrente | Ambito e limite |
| --- | --- | --- |
| Ciclo completo corrente | `docs/ciclo-editoriale.v1.0.0.md`, `pipeline/cycle.py`, `shared/editorial-cycle.v1.0.0.json` | Brief e prompt congelati prima del retrieval; voto REAL → SLOP sul deficit → voto SLOP → ammissione separata → pubblicazione bilanciata; `watch` esplicito |
| Ammissione del ciclo | `worker/editorial-cycle.ts`, migrazione `0018_editorial_cycle_admission.sql` | Conferme documentali dopo voto personale corrente, audit immutabile, eccedenze in attesa; nuovo schema ancora da rilasciare |
| Metodo editoriale storico | `docs/protocollo-editoriale.md`, versione interna 3.0.0 | Brief condivisi congelati, SLOP solo testo, revisione individuale, API dirette |
| Nuova discovery REAL #56 | `docs/ricerca-real.v1.0.0.md`, `pipeline/real/`; `shared/real-discovery*.v1.0.0.json` | Nuovo percorso esplicito in questa PR: 432 intenzioni nominali, A/B GPT, HTTP validato; nessun match obbligatorio a brief o quote di copertura |
| Ciclo e pilota REAL | `docs/ciclo-discovery-real.v1.0.0.md`, `pipeline/real/workflow.py`, `pilot.py` | Ripresa, feedback, galleria privata, dossier revisionati e consegna pending alla coda del sito; pilota GPT Commons eseguito; cinque dossier assistiti e profili completati; candidate nella coda del sito; review del proprietario pendente |
| Ledger nuovo percorso | `worker/real-discovery.ts`, tabella esistente `editorial_usage` | Endpoint autenticato di sola prenotazione, esteso a brief/generazione del ciclo; gate chiusi per default, ledger comune |
| Criteri del proprietario | `docs/criteri-editoriali.md`; `pipeline/v2/editorial_policy.py` | In main: contesto visibile, opere ambientate; nessuna adozione anticipata di v4 |
| Brief e freeze | `pipeline/v2/brief_catalog.py`, `pipeline/v2/briefs.py`; `data/editorial/briefs.v1.json` | Seed italiano draft; selezione 5 brief/10 immagini, massimo 25/50 |
| Dati e verifiche v2 | `shared/editorial-v2.json`, `shared/editorial-v2.ts`, `pipeline/v2/protocol.py`; `tests/editorial-v2-contract.json` | Schema 2.0.0 riusato dal metodo v3; non è la versione del metodo |
| Presentazione corrente | `docs/cropping-assistito-v2.md`; `pipeline/v2/direct.py`, `presentation.py`, `smart_crop.py` | 1024×1024, crop Terra con gate; profilo legato ai pixel finali |
| Origine e diritti | `docs/licenze-immagini.md`; `shared/licenses.json`, `shared/licenses.ts`, `pipeline/licenses.py` | Identità/versione/giurisdizione preservate; licenza distinta da autenticità |
| Consegna discovery alla review | `docs/discovery-coda-sito.v1.0.0.md`, `pipeline/real/inbox.py`, `scripts/sync-review-inbox.py` | Export prima del voto, upload QUARANTINE e verifica della coda esistente; nessuna pubblicazione |
| Revisione privata | `docs/coda-revisione-unica.md`, `docs/archivio-privato-generazioni-v1.0.0.md` | Inbox per singola immagine; giudizi non pubblicano né verificano diritti |
| Somiglianze | `docs/controllo-somiglianze-v1.md`; `shared/similarity.ts`, `worker/similarity.ts` | SHA/dHash/DINOv2; REAL–REAL e AI–AI, nessun confronto incrociato |
| Pubblicazione | `worker/editorial.ts`, `worker/moderation.ts`, `migrations/0008_editorial_publication.sql` | Percorso esplicito e bilanciato; studio v2 senza endpoint di pubblicazione |
| Gioco | `docs/gioco-tempi-protezione-v1.0.0.md`, `docs/campionamento-stratificato-v2.0.0.md`, `docs/precaricamento-immagini-v1.0.0.md` | REAL/AI indipendenti al 50%; timer server 10/20/30, PvP pubblico sospeso |
| Runtime, storage e rilascio | `wrangler.jsonc`, `docs/cloudflare.md`, `docs/importazione-diretta-r2.md` | D1/R2 esistenti; procedure remote richiedono autorizzazione |
| Verifiche | `.github/workflows/checks.yml`, `package.json`, `docs/verification.md` | CI riusata; verification contiene evidenze storiche, non certificazioni attuali |

Il ciclo completo 1.0.0 recepisce la richiesta corrente e supera, per nuovi run
avviati da `pipeline.cycle`, il brief opzionale e la separazione operativa dei
flussi. Rifiuti e pending determinano soltanto la capacità da sostituire; non si
cancellano REAL, SLOP o voti. I processi di discovery isolata e i relativi run
storici restano leggibili. Origine/licenza possono essere completate dopo la
review personale, ma restano obbligatorie prima del catalogo pubblico.

Il protocollo v3 resta il riferimento storico e il repository conserva esecutori
v1/Batch, studio v2 sperimentale e gate distinti. Presenza del codice non significa
attivazione. L'approvazione di un'immagine in archivio non conferma i diritti né pubblica.
Il nuovo ponte del ciclo richiede ammissione documentale e pubblicazione esplicite;
non converte automaticamente i voti storici.

La #56 sostituisce la discovery dei nuovi run scelti esplicitamente dal CLI:
non sostituisce il metodo per le esecuzioni storiche. Neutralità media/alta non
significative, intenzione/risultato separati, freeze SLOP opzionale prima di REAL.
Le decisioni sulle incompatibilità sono nella specifica, comprese le policy
v4 non importate. #44–#50 e l'intera #55 non sono prerequisiti del nuovo collector;
le diagnostiche rimangono opzionali. Non rimuovere pipeline legacy ancora usate.

## Stato delle proposte

| Fonte | Stato verificato | Trattamento |
| --- | --- | --- |
| PR #51, `16e9efd` | Draft su main | Catalogo inglese e indice locale; non presenti in main |
| PR #52, `822b315` | Draft sulla #51 | Metriche di varietà; diagnostiche, non gate |
| #53 / PR #55, `0577284` | Draft sulla #52; protocollo 4.3.0, app 0.19.0 | Matrice 12×12, caption, whole-frame, licenza SLOP e ricette ancora proposte rispetto a main |
| PR #54, `a80a556` | Draft indipendente su main; app 0.16.0 | Swipe, nessuna dipendenza editoriale |
| #56 | Nuovo percorso implementato e verificato; integrazione autorizzata | Commons live 200 con User-Agent della pipeline; controllo manuale reale completato, pilota GPT completato (11/19 file per braccio); Openverse challenge 403; cinque candidate con dossier/profili, approvazione individuale pendente |
| #57 / PR #58 | Audit integrato in main | Merge autorizzato dopo Checks riusciti; snapshot storici conservati |

Le versioni 4.0–4.3 nella #55 formano una catena: leggere 4.3 insieme alle versioni
che eredita. Non importare le sue regole su crop, opere, caption o licenze in main
solo perché sono più recenti. Piano di integrazione e decisioni aperte:
`docs/piano-integrazione-editoriale.v1.0.0.md`.

## Navigazione dell'audit

- `docs/audit-architettura.v1.0.0.md`: ref osservate, file → responsabilità →
  interfacce → test, conflitti e rischi verificati.
- `docs/indice-documentazione.v1.6.0.md`: catalogo vigente/proposta/storica/archivio,
  sostituzioni per ambito; gli originali restano intatti.
- `docs/piano-integrazione-editoriale.v1.0.0.md`: ordine #51/#52/#55/#56,
  contratti candidati, test mancanti e suddivisione delle PR.
- `docs/checklist-issue-codex.v1.0.0.md`: template breve per nuove issue.
- `docs/ricerca-real.v1.0.0.md`: contratti, CLI, migrazione/dismissione e limiti API.
- `docs/benchmark-ricerca-real.v1.0.0.json`: confronto fixture riproducibile,
  nessuna efficacia reale misurata; resoconto in `docs/verifica-ricerca-real.v1.0.0.md`.
- `docs/benchmark-commons.v1.0.0.md`: controllo manuale di retrieval reale, piani
  e rapporti 1.0.0/1.1.0 conservati; non è un risultato GPT o un'approvazione.
- `docs/ciclo-discovery-real.v1.0.0.md`: comandi, attese e dismissione; prove in
  `docs/verifica-ciclo-real.v1.0.0.md`.
- `docs/benchmark-gpt-commons.v1.0.0.md`: pilota GPT live, ricevute e costi;
  review documentale rinviata dal proprietario.
- `docs/verifica-documentale-real.v1.0.0.md`: esiti sulle 29 candidate, cinque
  dossier/profili, supporto JPEG/MPO e conferma umana ancora pendente; metriche
  in `docs/benchmark-gpt-commons.v1.1.0.json`.
- `docs/ciclo-editoriale.v1.0.0.md`: nuovo ciclo, CLI, stati, rifiuti, limiti, ammissione e rilascio.
- `docs/discovery-coda-sito.v1.0.0.md`: destinazione obbligatoria `/admin`,
  import pending e verifiche delle cinque candidate sul sito.
- `docs/openverse-registrazione.v1.0.0.md`: guida OAuth; email scelta, registrazione bloccata
  dalla challenge, esito in `docs/openverse-registrazione-esito.v1.0.0.md`.
- `docs/openverse-accesso.v1.0.0.md`: challenge verificata e bozza di segnalazione;
  il proprietario ha scelto di non pubblicarla.

App nella base main: 0.15.0; questo delta porta `package.json` a 0.16.0. Metodo v3, dati v2 e istruzioni 3.0.0 sono
versioni diverse. Per adottare una modifica strutturale aggiungere una decisione
esplicita, aggiornare questa mappa e AGENTS con nuovi snapshot; preservare i vecchi.
