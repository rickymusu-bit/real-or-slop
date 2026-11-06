# Mappa canonica — versione 2.1.2

Snapshot: `docs/MASTER.v2.1.2.md`. Percorsi relativi alla radice del repository.
Verificato: 2026-11-06T18:51:20.887633Z, main `67ecf494ba8fe86d551525e1db330d1f31764975`.
La PR #58 (`77f6cb8`) contiene l'audit. Il branch #56 aggiunge la nuova discovery;
entrambi sono da revisionare e non integrati in main. Ricontrollare le ref.
Non attesta lo stato del database remoto o dei gate in produzione.

## Ingressi e autorità

`AGENTS.md` contiene le istruzioni operative. Questo file identifica le decisioni
correnti senza duplicarne i contratti. In caso di conflitto registrare la decisione
secondo AGENTS; non scegliere semplicemente il numero di versione più alto.

| Ambito | Fonte corrente | Ambito e limite |
| --- | --- | --- |
| Metodo editoriale | `docs/protocollo-editoriale.md`, versione interna 3.0.0 | Brief condivisi congelati, SLOP solo testo, revisione individuale, API dirette |
| Nuova discovery REAL #56 | `docs/ricerca-real.v1.0.0.md`, `pipeline/real/`; `shared/real-discovery*.v1.0.0.json` | Nuovo percorso esplicito in questa PR: 432 intenzioni nominali, A/B GPT, HTTP validato; nessun match obbligatorio a brief o quote di copertura |
| Ciclo e pilota REAL | `docs/ciclo-discovery-real.v1.0.0.md`, `pipeline/real/workflow.py`, `pilot.py` | Ripresa, feedback, galleria privata, dossier revisionati ed export approvate; pilota GPT Commons eseguito; documenti/review pendenti |
| Ledger nuovo percorso | `worker/real-discovery.ts`, tabella esistente `editorial_usage` | Endpoint autenticato di sola prenotazione; gate chiuso per default, nessun nuovo schema o publish |
| Criteri del proprietario | `docs/criteri-editoriali.md`; `pipeline/v2/editorial_policy.py` | In main: contesto visibile, opere ambientate; nessuna adozione anticipata di v4 |
| Brief e freeze | `pipeline/v2/brief_catalog.py`, `pipeline/v2/briefs.py`; `data/editorial/briefs.v1.json` | Seed italiano draft; selezione 5 brief/10 immagini, massimo 25/50 |
| Dati e verifiche v2 | `shared/editorial-v2.json`, `shared/editorial-v2.ts`, `pipeline/v2/protocol.py`; `tests/editorial-v2-contract.json` | Schema 2.0.0 riusato dal metodo v3; non è la versione del metodo |
| Presentazione corrente | `docs/cropping-assistito-v2.md`; `pipeline/v2/direct.py`, `presentation.py`, `smart_crop.py` | 1024×1024, crop Terra con gate; profilo legato ai pixel finali |
| Origine e diritti | `docs/licenze-immagini.md`; `shared/licenses.json`, `shared/licenses.ts`, `pipeline/licenses.py` | Identità/versione/giurisdizione preservate; licenza distinta da autenticità |
| Revisione privata | `docs/coda-revisione-unica.md`, `docs/archivio-privato-generazioni-v1.0.0.md` | Inbox per singola immagine; giudizi non pubblicano né verificano diritti |
| Somiglianze | `docs/controllo-somiglianze-v1.md`; `shared/similarity.ts`, `worker/similarity.ts` | SHA/dHash/DINOv2; REAL–REAL e AI–AI, nessun confronto incrociato |
| Pubblicazione | `worker/editorial.ts`, `worker/moderation.ts`, `migrations/0008_editorial_publication.sql` | Percorso esplicito e bilanciato; studio v2 senza endpoint di pubblicazione |
| Gioco | `docs/gioco-tempi-protezione-v1.0.0.md`, `docs/campionamento-stratificato-v2.0.0.md`, `docs/precaricamento-immagini-v1.0.0.md` | REAL/AI indipendenti al 50%; timer server 10/20/30, PvP pubblico sospeso |
| Runtime, storage e rilascio | `wrangler.jsonc`, `docs/cloudflare.md`, `docs/importazione-diretta-r2.md` | D1/R2 esistenti; procedure remote richiedono autorizzazione |
| Verifiche | `.github/workflows/checks.yml`, `package.json`, `docs/verification.md` | CI riusata; verification contiene evidenze storiche, non certificazioni attuali |

Il protocollo v3 è adottato come metodo, ma il repository conserva esecutori
v1/Batch, studio v2 sperimentale e gate distinti. Presenza del codice non significa
attivazione. L'approvazione di un'immagine in archivio non implica che esista già
un percorso automatico per pubblicarla nel gioco. Non correggere questo scarto
di implementazione con una pubblicazione implicita.

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
| #56 | Nuovo percorso implementato nel branch dedicato, non attivato | Commons live 200 con User-Agent della pipeline; controllo manuale reale completato, pilota GPT completato (11/19 file per braccio); Openverse challenge 403, review umana ancora pendente |
| #57 / PR #58 | Prima consegna documentale draft | Audit e piano base di questa implementazione; nessun merge implicito |

Le versioni 4.0–4.3 nella #55 formano una catena: leggere 4.3 insieme alle versioni
che eredita. Non importare le sue regole su crop, opere, caption o licenze in main
solo perché sono più recenti. Piano di integrazione e decisioni aperte:
`docs/piano-integrazione-editoriale.v1.0.0.md`.

## Navigazione dell'audit

- `docs/audit-architettura.v1.0.0.md`: ref osservate, file → responsabilità →
  interfacce → test, conflitti e rischi verificati.
- `docs/indice-documentazione.v1.3.2.md`: catalogo vigente/proposta/storica/archivio,
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
- `docs/openverse-registrazione.v1.0.0.md`: guida OAuth; email scelta, registrazione bloccata
  dalla challenge, esito in `docs/openverse-registrazione-esito.v1.0.0.md`.
- `docs/openverse-accesso.v1.0.0.md`: challenge verificata e bozza di segnalazione;
  il proprietario ha scelto di non pubblicarla.

App in main: `package.json` 0.15.0. Metodo v3, dati v2 e istruzioni 2.1.0 sono
versioni diverse. Per adottare una modifica strutturale aggiungere una decisione
esplicita, aggiornare questa mappa e AGENTS con nuovi snapshot; preservare i vecchi.
