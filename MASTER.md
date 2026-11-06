# Mappa canonica — versione 1.0.0

Snapshot: `docs/MASTER.v1.0.0.md`. Percorsi relativi alla radice del repository.
Verificato: 2026-11-06T13:42:06Z, main `67ecf494ba8fe86d551525e1db330d1f31764975`.
Questa mappa descrive quel main; ricontrollare le ref prima di implementare delta.
Non attesta lo stato del database remoto o dei gate in produzione.

## Ingressi e autorità

`AGENTS.md` contiene le istruzioni operative. Questo file identifica le decisioni
correnti senza duplicarne i contratti. In caso di conflitto registrare la decisione
secondo AGENTS; non scegliere semplicemente il numero di versione più alto.

| Ambito | Fonte corrente | Ambito e limite |
| --- | --- | --- |
| Metodo editoriale | `docs/protocollo-editoriale.md`, versione interna 3.0.0 | Brief condivisi congelati, SLOP solo testo, revisione individuale, API dirette |
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

## Stato delle proposte

| Fonte | Stato verificato | Trattamento |
| --- | --- | --- |
| PR #51, `16e9efd` | Draft su main | Catalogo inglese e indice locale; non presenti in main |
| PR #52, `822b315` | Draft sulla #51 | Metriche di varietà; diagnostiche, non gate |
| #53 / PR #55, `0577284` | Draft sulla #52; protocollo 4.3.0, app 0.19.0 | Matrice 12×12, caption, whole-frame, licenza SLOP e ricette ancora proposte rispetto a main |
| PR #54, `a80a556` | Draft indipendente su main; app 0.16.0 | Swipe, nessuna dipendenza editoriale |
| #56 | Specifica funzionale aperta, subordinata a #57 | 432 intenzioni e due stadi GPT; non implementata né adottata da questa mappa |
| #57 | Prima consegna documentale | Audit e piano; refactoring e feature in PR successive |

Le versioni 4.0–4.3 nella #55 formano una catena: leggere 4.3 insieme alle versioni
che eredita. Non importare le sue regole su crop, opere, caption o licenze in main
solo perché sono più recenti. Piano di integrazione e decisioni aperte:
`docs/piano-integrazione-editoriale.v1.0.0.md`.

## Navigazione dell'audit

- `docs/audit-architettura.v1.0.0.md`: ref osservate, file → responsabilità →
  interfacce → test, conflitti e rischi verificati.
- `docs/indice-documentazione.v1.0.0.md`: catalogo vigente/proposta/storica/archivio,
  sostituzioni per ambito; gli originali restano intatti.
- `docs/piano-integrazione-editoriale.v1.0.0.md`: ordine #51/#52/#55/#56,
  contratti candidati, test mancanti e suddivisione delle PR.
- `docs/checklist-issue-codex.v1.0.0.md`: template breve per nuove issue.

App in main: `package.json` 0.15.0. Metodo v3, dati v2 e istruzioni 1.0.0 sono
versioni diverse. Per adottare una modifica strutturale aggiungere una decisione
esplicita, aggiornare questa mappa e AGENTS con nuovi snapshot; preservare i vecchi.
