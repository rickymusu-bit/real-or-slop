---
version: 1.0.0
created_at: 2026-11-06T13:42:06Z
status: vigente
supersedes: null
---

# Checklist per una issue affidata a Codex

Compilare i campi come delta rispetto a [MASTER](../MASTER.md) e
[AGENTS](../AGENTS.md). Non ricopiare l'architettura; linkare i contratti.

```markdown
## Base verificata
- Branch e SHA main/checkout:
- PR dipendenti con base/head/stato; ref ricontrollate il (ISO 8601):

## Obiettivo osservabile
- Trigger e comportamento atteso:
- Criteri di accettazione:

## Scope
- File/interfacce interessati:
- Non-obiettivi:

## Contratti e compatibilità
- Fonti correnti da MASTER:
- Contraddizioni e decisione proposta (fonte, stato, sostituzione, test):
- Dati/eventi/API da preservare; migrazione e rollback locale:

## Verifica
- Baseline e fallimenti preesistenti:
- Fixture/test di regressione e comandi CI pertinenti:
- Limiti che una fixture non può certificare:

## Autorizzazioni operative
- Azioni esplicitamente autorizzate nella sessione:
- Azioni esterne eventualmente necessarie e ancora non autorizzate:

## Deliverable
- PR/base e suddivisione delle fasi:
- Specifiche/report SemVer, aggiornamenti MASTER/AGENTS se strutturali:
- Evidenze di verifica, rischi e lavoro rinviato:
```

Per #56 indicare in particolare intenzione vs classificazione osservata, freeze
SLOP antecedente al retrieval, profili provider e validazione deterministica,
feedback separato per retrieval/diritti/giudizi e fixture senza API a pagamento.
Una proposta non concede permessi per produzione, costi, merge o pubblicazione.
