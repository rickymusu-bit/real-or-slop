# Mappa canonica — versione 3.0.0

Snapshot: `docs/MASTER.v3.0.0.md`. Percorsi relativi alla radice del repository.
Verificato: 2026-11-06T21:45:55Z, base main `05c6bfc9035debb6c078160a1fe79b7997dfc77a`.
Le PR #58, #59 e #60 sono integrate. Il delta `feat/editorial-cycle` implementa
il ciclo completo richiesto dal proprietario; non attesta un deploy remoto.
La migrazione 0018, i nuovi gate e nuove inferenze non sono attivati in produzione.

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
