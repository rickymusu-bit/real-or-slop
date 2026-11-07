# Classificazione post-acquisizione della matrice editoriale — 1.0.0

Aggiornato: 2026-11-07T15:47:09.926Z. Issue #64.

La matrice di dodici argomenti, dodici emozioni e tre intensità non sceglie temi né attiva ricerche. È utilizzata esclusivamente per proporre **metadati di classificazione** sulle fotografie REAL e SLOP già acquisite o generate.

Durante il profiling su comando dell'owner, GPT riceve soltanto i pixel dell'immagine insieme alle definizioni della tassonomia `shared/real-discovery-taxonomy.v1.0.0.json`. Non riceve titoli, luoghi, date, documentazione di autenticità o licenze della fotografia. Il profilo conserva soggetto, azione, ambiente, composizione, leggibilità, interesse e tag visivi; in aggiunta propone un topic, un'emozione potenzialmente evocata dall'immagine e un'intensità, più un indicatore di incertezza.

La classificazione è marcata `status: suggested` e versionata. Non è una constatazione sulle emozioni reali dei soggetti, sulla verità dell'evento, sulla licenza o sull'origine reale/sintetica. L'emozione `neutrality` ammette soltanto intensità `low`. I valori fuori tassonomia vengono rifiutati; nessun classificatore determina automaticamente la risposta REAL/SLOP.

Le classificazioni suggerite sono visualizzate nel pannello della shortlist REAL accanto ai giudizi editoriali, ma non provocano pubblicazione e non costituiscono scelta automatica delle categorie del catalogo. L'owner sceglie ancora le categorie ufficiali nell'attestazione di ammissione; l'eventuale correzione esplicita delle etichette suggerite e la misurazione della loro precisione restano un miglioramento UI successivo.

I profili storici privi di classificazione restano leggibili e non vengono forzati a una categoria.

Test: `tests/editorial-taxonomy-classification.v1.0.0.test.ts`. Nessuna migrazione del database o chiamata a pagamento introdotta dalla PR. La classificazione sarà ottenuta come parte della profilazione esistente, se autorizzata dalla dashboard.
