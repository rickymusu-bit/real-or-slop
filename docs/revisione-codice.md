# Revisione tecnica — versione 1.0.0

Aggiornata: 2026-11-16T19:41:37Z. Base esaminata: `203919df12acc93fe843feb4f7a4b2fb88ede2a6`, app 1.35.1.

## Giudizio

Architettura adatta a un progetto personale: responsabilità browser/Worker comprensibili, campionamento separato, test unitari e integrazione con modelli finti. La pipeline SLOP ha garanzie utili: claim prima delle chiamate, limite di tentativi, candidati privati, analisi dell'intero originale e revisione umana. La qualità reale delle immagini non è dimostrata dai test finti: occorre valutarla su un campione annotato dall'owner.

## Rilievi

1. **Accoppiamento strutturale superato, corretto nella 1.36.0.** `worker/slop-generation.ts`, `worker/library.ts`, `worker/game.ts`, migrazione 0050: riferimento usato per bloccare generazioni e ripristini, filtrare partite e cancellare processi in cascata. Le copie dipendevano dalla lettura successiva della REAL. La migrazione 0053 e gli snapshot anonimi rimuovono questi vincoli conservando audit e trattamento.
2. **Alta priorità: accettazione e storage non atomici.** `materialize()` crea un oggetto R2, una immagine D1 e aggiorna il processo in passi distinti. La ricerca per processo riduce duplicati ma non riconcilia ogni interruzione. Servono test di crash ai confini tra R2, inserimento immagine e aggiornamento processo, e un recupero senza nuove chiamate a pagamento. Non corretto con una riscrittura indiscriminata in questa PR.
3. **Media priorità: letture con effetti sugli stati.** `processViews()` può trasformare un claim in incerto dopo dieci minuti; il timeout del passo Workflow è anch'esso dieci minuti. È una protezione conservativa, ma la visualizzazione decide sul lavoro attivo usando il tempo trascorso. Separare riconciliazione e lettura, con una fonte autorevole sul runner e test sui confini temporali.
4. **Media priorità: conservazione semantica del brief.** `validEvaluation()` confronta gli elenchi che il valutatore dichiara di aver preservato, non prova che il prompt rivisto o l'immagine li rispettino. Questo è un controllo di formato/coerenza, non una verifica semantica indipendente. Il valutatore inoltre vede il prompt, che può influenzarne il giudizio; misurare falsi positivi/negativi su immagini annotate prima di irrigidire il loop.
5. **Media priorità: complessità UI.** `src/library.ts` accorpa navigazione, catalogo, dialoghi, impostazioni e operazioni massive; lo studio ricostruisce la vista durante il polling. La dashboard richiede gerarchia delle azioni, dettagli progressivi e navigazione stabile. Un refactoring dei moduli va tenuto distinto dalle modifiche alla pipeline.
6. **Documentazione incoerente nella base.** Alcune intestazioni indicavano ancora produzione 1.26.0 o una PR da unire mentre `package.json` era 1.35.1. Aggiornare lo stato insieme a ciascun rilascio.

## Sol e Astra

Questa è una ripartizione consigliata per rischio, non un'affermazione che un modello garantisca correttezza.

| Attività | Esecuzione consigliata | Revisione |
|---|---|---|
| Componenti dashboard, CSS responsive, testi, filtri, test browser | Sol | Controllo visivo dell'owner |
| Rimozione riferimenti nelle API e aggiornamento test/documenti con specifica definita | Sol | Astra per la migrazione e gli invarianti |
| Migrazione dati e compatibilità con Workflow già avviati | Astra | Test di upgrade e controllo umano del rilascio |
| Recupero da crash, concorrenza, idempotenza e chiamate a pagamento | Astra | Test di fault injection |
| Prompt e valutatore: criteri, limiti e disegno dell'esperimento | Astra | Owner su immagini reali; Sol implementa gli schemi stabiliti |

Nessuna chiamata reale al generatore è necessaria per verificare queste modifiche strutturali. La valutazione della qualità fotografica richiede un esperimento separato con un numero massimo di chiamate autorizzato.
