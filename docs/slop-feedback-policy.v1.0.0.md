# Feedback per l'apprendimento dei prompt SLOP — 1.0.0

Aggiornato: 2026-11-07T15:29:28.252Z. Completa un criterio della issue #64.

Il terzo sistema di apprendimento deve distinguere qualità editoriale e problemi di generazione.

| Decisione dell'amministratore | Motivo | Ranking del gusto SLOP | Apprendimento dei prompt SLOP |
|---|---|---|---|
| Approva | Editoriale | Positivo | liked |
| Rifiuta | Editoriale | Negativo | disliked |
| Rifiuta | Difetto di generazione | Escluso | generation_defect |
| Rifiuta | Problema tecnico, diritti, provenienza | Escluso | Escluso |
| In attesa di voto | Qualsiasi | Escluso | Escluso |

La classificazione `generation_defect` permette di evitare o riformulare in futuro strategie e istruzioni che hanno prodotto anatomie, composizioni o artefatti fallimentari; non significa che un soggetto o un tema siano sgraditi.

`shared/slop-feedback-policy.v1.0.0.ts` centralizza la regola. `worker/editorial-learning.v1.0.0.ts` la applica esclusivamente allo storico **SLOP**, senza accesso a fotografie REAL o alle loro valutazioni. I feedback vengono congelati nella fotografia dello stato del ciclo successivo; le banche di prompt già congelate rimangono immutabili.

Non è introdotto un nuovo modello, addestramento di pesi, cron, chiamata API o generazione automatica. Si applica soltanto ai dati usati quando l'owner chiederà esplicitamente di preparare un nuovo lotto di prompt. Il vecchio storico resta intatto.

Test: `tests/slop-feedback-policy.v1.0.0.test.ts`.
