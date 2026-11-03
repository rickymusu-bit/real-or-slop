# Benchmark editoriale v2.0.0

Stato: strumenti implementati, studio reale e approvazione dell'attivazione pendenti.
La specifica è [protocollo editoriale 2.0.0](pipeline-editoriale-real-slop-v2.0.0.md).

Aggiornamento: [pilota rapido del 2026-11-03](benchmark-editoriale-v2-pilota-2026-11-03.md)
eseguito su 10 candidate REAL e 10 SLOP, con 20 analisi visive sincrone richieste
dal proprietario. Non sostituisce lo studio completo e non pubblica asset.

## Esecuzione locale senza rete

```sh
python3 -m pipeline.v2.discovery --exploratory pipeline/v2/exploration.example.json
python3 -m pipeline.v2.run pipeline/v2/slop-plan.example.json
python3 -m pipeline.v2.run pipeline/v2/slop-plan.example.json --simulate --run-id esempio-slop
npm run benchmark:editorial-v2
```

La simulazione non legge `OPENAI_API_KEY`, non effettua chiamate remote e non
approva immagini. `artifacts/editorial-v2/report.json` dichiara `data_kind: fixture`
e `publication_ready: false`. Il campione ha 60 elementi per origine per esercitare
il software; la dimensione non è una quota editoriale o una misura di efficacia.
Le pseudo-REAL sono fixture sintetiche dichiarate, con autenticità non verificata.
Il riuso del benchmark genera lo stesso report, senza sovrascrivere dati di studio.
Usare directory distinte per fixture e studi reali.

## Studio fotografico reale

Prima di nuove chiamate pagate, approvare configurazione, motori, licenze e budget
dello studio. Non basta la presenza di credenziali nell'esecutore. Non copiare
segreti fra esecutore, Actions e Worker; nessuna configurazione remota è inclusa
in questi comandi locali.

1. Congelare il protocollo e le ipotesi prima dei risultati. Confrontare baseline
   tematica storica, query multidimensionali, generiche e query esplorative LLM
   indipendenti; registrare modello, istruzioni e output delle query libere.
2. Usare stessi motori, budget economico e numero di risultati esaminati per
   confronto. Valutare Commons/Openverse e altri motori con termini compatibili.
   Brave/Google richiedono un adattatore e verifica separata, non scraping.
3. Raccogliere 100–200 candidate complessive REAL e SLOP autonome, senza recuperare
   SLOP derivate dal vecchio archivio. Il campione di studio non è una quota da
   pubblicare. Annotare casi ordinari, sorprendenti, texture e scene dense in
   entrambe le origini; non creare coppie fotografiche.
4. Completare provenienza, diritti, profili e revisione umana. Misurare resa per
   query, duplicati esatti/quasi duplicati, copertura, costo per candidata approvata
   utilizzabile. Campi non misurati restano mancanti, non vengono stimati dal nulla.
5. Esaminare distribuzioni per classe: composizione, trattamento, contenuti,
   ordinarietà, sorpresa, plausibilità, risoluzione, rapporto d'aspetto e formato.
   La distanza di variazione totale è un avviso descrittivo, senza soglia automatica
   di eliminazione. Registrare motivi ed eventuali eccezioni di selezione.
6. Se si usa un classificatore di controllo, escludere fonte, prompt ed etichetta
   dalle feature; separare famiglie di duplicati e gruppi di fonte/generatore fra
   train/test. Accuratezza alta può includere genuini indizi di sintesi: analizzare
   le feature e fare verifiche umane, senza chiamarla automaticamente bias.
7. Condurre un piccolo studio utenti con gruppi di immagini/fonti/generatori
   mai visti. Separare apprendimento del catalogo e trasferimento; controllare
   errori «strano = AI», «troppo bello = AI», «ordinario = REAL» e l'utilità delle
   spiegazioni. Conservare risultati e lotti per confronti riproducibili.

### Manifest REAL

Lista di oggetti con solo `id`, `file`, `provenance`. Il file è relativo al manifest.
Esempio documentale nel test `tests/editorial-v2-contract.json`; non è una fonte
reale da importare. `authenticity` può essere `unverified`, `uncertain`, `hybrid`
o `verified`: soltanto l'ultima, senza manipolazione semantica e per fotografie,
consente approvazione. Ogni dossier conserva prove con ID, URL e dichiarazione
specifica, autore, licenza, fonte e trasformazioni documentate.

La scoperta scrive un manifest tecnico di acquisizione, con evidenze grezze e
licenze. Non viene convertito automaticamente in una dichiarazione di autenticità:
prima del run REAL preparare la scheda documentale v2, preservando la provenienza.

### Esecuzione sperimentale esplicita

Solo dopo migrazione 0013 approvata nell'ambiente di test e configurazione dei gate
e dei budget v2 (vedere `pipeline/v2/editorial.env.example`):

```sh
# I comandi seguenti sono un esempio operativo, non sono stati eseguiti qui.
python3 -m pipeline.v2.run .pipeline/studio/slop.json --origin AI --start --execute --run-id studio-slop-01 --base https://AMBIENTE-DI-TEST
python3 -m pipeline.v2.run .pipeline/studio/real.json --origin REAL --start --execute --run-id studio-real-01 --base https://AMBIENTE-DI-TEST
# Raccogli esiti senza autorizzare nuove fasi pagate:
python3 -m pipeline.v2.run --resume studio-slop-01 --base https://AMBIENTE-DI-TEST
# Invia la successiva fase solo con budget/gate espliciti:
python3 -m pipeline.v2.run --resume studio-slop-01 --execute --base https://AMBIENTE-DI-TEST
python3 -m pipeline.v2.run --status studio-slop-01 --base https://AMBIENTE-DI-TEST
python3 -m pipeline.v2.run --cancel studio-slop-01 --base https://AMBIENTE-DI-TEST
```

Un solo tick non completa necessariamente la fase. Un invio dall'esito incerto
resta sospeso o viene riconciliato mediante metadata/file; nessun reinvio implicito.
`--adopt-batch-id` adotta solo un job verificato. Conservare workspace e run ID.
I file originali e gli scarti rimangono nei checkpoint privati anche senza candidata.
L'archiviazione delle candidate concluse è idempotente e recuperabile.

## Report e trasferimento

Esportare le candidate revisionate dallo studio privato, filtrando per run quando
necessario; la lista è limitata a 200 elementi. I checkpoint locali comprendono
solo i dossier iniziali: usare l'esportazione amministrativa per includere gli
esiti della revisione umana.

```sh
python3 -m pipeline.v2.benchmark --states .pipeline/studio/real-reviewed.json .pipeline/studio/slop-reviewed.json --queries .pipeline/studio/queries.json --trials .pipeline/studio/trials.json --heldout-groups source:NUOVA-FONTE generator:NUOVO-MODELLO --out artifacts/editorial-v2-study
```

Ogni file di candidate ha `candidates: [...]`. Il registro query ha `queries` con
`channel` (`baseline`, `generic`, `vocabulary`, `exploration`), `examined`,
`new_candidates`, `approved`, `cost_usd` e dati identificativi. `matched_search_budget`
è falso se mancano gruppi o costi; il report non simula l'equivalenza del confronto.
Non è un certificato automatico della metodologia del motore.

Le risposte dello studio sono una lista di oggetti con `participant` anonimo,
`candidate_id`, `phase` (`training`/`evaluation`), `choice` (`REAL`/`AI`) e
facoltativamente `confidence` fra 0 e 1 per la risposta scelta. Ordinare per
esposizione. L'analisi usa solo la prima esposizione a un'immagine e, per il
trasferimento, esclude gruppi di fonte/generatore già presenti nel training.
Non raccogliere dati identificativi; concordare informativa e conservazione
prima dello studio. Conservare valutazioni indipendenti per i casi limite.

Il report restituisce numerosità, accuratezza e intervalli Wilson al 95%, tasso
d'errore per immagine con incertezza e Brier score quando disponibile. Non assegna
livelli di difficoltà. Per inferenze fra utenti, considerare anche dipendenze e
campionamento: questi intervalli descrittivi non sostituiscono il disegno di studio.

## Attivazione e lavoro necessariamente successivo allo studio

Restano da ottenere risultati su immagini vere, valutazione umana delle spiegazioni
e trasferimento a fonti/generatori nuovi. Non si dichiarano risolti con fixture.
La pubblicazione v2 è strutturalmente assente: nessuna approvazione nello studio
scrive `images` o `published_images`. L'integrazione nel catalogo richiederà un
rilascio dedicato dopo revisione del benchmark e delle migrazioni. Conserverà
50/50 del catalogo, scelte indipendenti dei round e preflight di capacità.
