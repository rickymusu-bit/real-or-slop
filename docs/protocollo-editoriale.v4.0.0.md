---
version: 4.0.0
created_at: 2026-11-05T20:15:00Z
status: implementation-in-pull-request-not-activated
source_issue: https://github.com/rickymusu-bit/real-or-slop/issues/53
---

# Protocollo editoriale v4.0.0

La matrice **12 emozioni × 12 temi** seleziona un’intenzione di ricerca prima del
brief inglese. Il brief viene congelato prima dei due rami REAL/SLOP. Ogni
immagine e ogni didascalia richiedono giudizi espliciti e indipendenti del
proprietario. Nessuna coppia completa è obbligatoria. Non sono autorizzati da
questa implementazione spesa, ricerca live, cron, deploy, migrazione remota,
pubblicazione o cancellazione. La versione [v3](protocollo-editoriale.v3.0.0.md)
e i cataloghi precedenti restano conservati.

## Audit, precedenza e dipendenze

Audit del 2026-11-05: main `67ecf49`; #44 implementata nella PR draft #51
(`16e9efd`), #45 nella PR draft #52 (`822b315`, dipendente dalla #51).
La v4 riusa questi branch per catalogo inglese, encoder e metriche; non li mergea
in main e non ne certifica la revisione del proprietario. #46–#50 restano aperte.
Non esistono MASTER o AGENTS nel checkout. La PR #54 per lo swipe resta separata.

La #53 prevale solo sui conflitti: #18 non impone sorpresa/bizzarria; #34 conserva
varietà, esclusione degli ibridi e distinzione tra origine e veridicità, mentre
il popolamento parte dalle celle e i rami condividono il brief; #44 conserva la
migrazione inglese e l’indice neutrale; #45/#46 restano diagnostiche, senza soglia
obbligatoria testo–immagine; #47 misura reperibilità e diritti; #48 può sviluppare
l’adattamento offline richiesto; #49 usa un solo pannello `/admin/variety`;
#50/#28 restano separate e non forniscono preferenze editoriali. Nessuna issue
viene chiusa come duplicata e nessuna graduatoria REAL→SLOP viene ripristinata.

## Tassonomia, brief e libertà compositiva

`shared/editorial-taxonomy.v4.0.0.json` è la tassonomia canonica: slugs inglesi,
definizioni ed esempi per 12 reazioni e 12 temi, neutralità inclusa. La reazione è
interpretativa: una cella è un’intenzione, non una proprietà oggettiva dei pixel
né una misura dell’effetto formativo. Le etichette effettive possono essere
corrette; emozioni secondarie e profili visivi restano metadati trasversali.

`data/editorial/briefs.v4.0.0.json` contiene 288 **bozze**, due per cella, create da
un vocabolario originale di scene e varianti di inquadratura. Sono materiale di
partenza, non un benchmark fotografico o una prova di risposta emotiva. Nessun
testo deriva da fotografie trovate. Tutti i brief restano draft; il proprietario
può rivederli o preparare nuove revisioni. Il mapping storico conserva ID/hash
inglesi senza inventare etichette semantiche o importare voti legacy.

Description, tags e prompt nuovi sono inglesi; le query possono essere espanse
in altre lingue quando utile a una fonte. Contesto e sfondo leggibile sono
richiesti; opere d’arte intere nel loro ambiente, cornice quando presente. Nessun
obbligo di spettacolarità, difetti AI, persone o estetica uniforme. Le immagini
ordinarie sono ammesse in entrambe le origini.

Il freeze include ID/revisione, tassonomia/cella, descrizione/tags/query/prompt,
seed, modello/versione istruzioni, modelli visivi, catalogo e selezione con hash,
parametri finali. Le query successive hanno un log proprio. Una modifica richiede
un nuovo freeze: resume con input diversi è rifiutato. Il CLI prepara cinque
brief / al massimo dieci immagini per default; tetto 25 brief / 50 immagini.

## Due rami indipendenti e gate documentali

REAL usa provider ufficiali già esistenti, alternati per resa documentale e con
limiti di fonte/numero richieste. Registra anche zero risultati, errori e tentativi
incerti. Prima di download/valutazione visiva occorrono fonte, autore, autenticità,
licenza riconosciuta, obblighi e diritti compatibili, verificati su un canale
separato. Una licenza dichiarata da un indice non basta. Deduplica per identità e
SHA; la diagnostica DINOv2 resta nel sistema esistente, senza deduplica incrociata.

Una fotografia valida lontana dal brief resta conservata: correggere
l’attribuzione effettiva, senza cambiarne l’intenzione di ricerca. Il profilo
visivo riusa il motore diretto, che riceve solo pixel finali e istruzioni neutre.
La verifica documentale non viene fatta passare per una valutazione dei pixel.

SLOP usa esclusivamente il piano text-only derivato dal freeze. Anche l’associazione
server verifica prompt, modello, parametri e cronologia del freeze. Il suo adapter
non legge gli output REAL. Si conservano modello, parametri, costo prenotato,
request ID, output, SHA e checkpoint. Originali, varianti, errori e scarti restano
privati. Ramo vuoto e rifiuto di un’immagine non attivano il partner. I gate
pagati esistenti e il ledger server restano obbligatori, insieme al gate v4.

## Feedback, stime e selezione

Gli eventi sono append-only e legati ai pixel finali. I giudizi provengono dalla
coda unica esistente; retry/import/export non duplicano il conteggio. Per ogni
immagine prevale la revisione esplicita più recente, comprese revoca a pending e
correzione della classificazione. Note e motivi strutturati sono facoltativi.

Per cella/origine si distinguono tentativi, hit, idoneità documentale, duplicati,
proposte, approvate/rifiutate/pending, fuori obiettivo, spesa e date. Il tasso
osservato usa solo `approved/(approved+rejected)`; foto mai mostrate e pending
non sono rifiuti. Si mostrano N, Wilson 95%, posterior Beta(2,2) e dati
insufficienti sotto dieci giudizi. Il prior è provvisorio, da calibrare sul pilota.

Il peso combina soprattutto il posterior REAL **on target**, novità, disponibilità
documentale, costo e raffreddamento di sette giorni delle celle poco produttive.
L’approvazione della qualità non conferma automaticamente la classificazione: le
approvate senza attribuzione esplicita restano segnalate e non inventano copertura
o osservazioni on target. Il revisore conferma o corregge la cella con un evento
separato. Le approvate fuori obiettivo contano nella copertura osservata, senza aumentare
la resa on target dell’intenzione. Le approvazioni SLOP rimangono separate;
un fallimento del generatore non prova indisponibilità fotografica.

La compensazione dei margini usa copertura REAL e SLOP (70/30), con iterative
proportional fitting e quota di esplorazione predefinita 25%. Ogni cella mantiene
probabilità positiva; non si impone 1/144 a ogni intersezione. Il CLI parte uniforme;
`--adaptive` è esplicito. La selezione è riproducibile con seed e senza ripetere
una cella nello stesso ciclo. I margini sono obiettivi di lungo periodo, non una
promessa per un lotto di cinque o una partita corta.

## Didascalie neutrali

La didascalia è una frase italiana breve, obiettivo 60–100 caratteri e massimo
120 inclusi spazi. Aggiunge coordinate contestuali, senza emoji, clickbait,
imperativi persuasivi, superlativi o emozione prescritta. Non è un messaggio social
né una domanda sulla verità del testo: REAL/SLOP continua a indicare l’origine.

REAL può usare solo informazioni visibili/generiche oppure fatti specifici da
provenienza documentale verificata, con riferimenti privati esistenti. Il controllo
automatico di struttura e riferimenti non certifica il significato della frase:
il proprietario deve verificare luogo/data e ogni inferenza personale. SLOP usa
contesto narrativo coerente, senza false attribuzioni a persone/organizzazioni o
eventi reali. La provenienza REAL non alimenta la didascalia SLOP.

La didascalia si propone **dopo i pixel finali** e ne conserva SHA, versione,
revisione, generatore, riferimenti, natura narrativa e giudizi separati. Non è
alt accessibile, titolo fonte, prompt o spiegazione post-risposta. Una nuova
immagine v4 richiede approvazione immagine e ultima didascalia per la pubblicazione.
Una modifica al testo non modifica il voto sull’immagine; nelle immagini già
pubblicate resta disponibile l’ultima didascalia approvata finché la nuova non
viene approvata. Nessuna didascalia retroattiva per il catalogo legacy.

Il round congela insieme all’assegnazione il solo testo pubblico e, privatamente,
revisione/natura narrativa. Refresh, retry e reconnect riusano quel testo. Il
client prepara pixel e frase prima dell’avvio server; nessun secondo countdown.
10/20/30 secondi, scoring e monete indipendenti 50/50 restano invariati. Il flag
narrativo può comparire solo nel feedback dopo risposta. Il PvP pubblico resta
sospeso; l’attore archiviato conserva una sola caption per entrambi i giocatori.

I 48 esempi `caption-fixtures.v1.0.0.json` sono bozze di stile, due contesti per
emozione/origine, non frasi già verificate su fotografie. Diagnostica comparativa
per lunghezza, specificità e classificatore lessicale con fold per emozione;
controllo positivo con leakage artificiale. Questo campione piccolo non dimostra
assenza di indizi su un catalogo reale né sostituisce la revisione del proprietario.

## Admin, osservabilità ed esportazione

`/admin/variety` estende il cruscotto privato #49: 144 celle, copertura per origine,
filtri, margini/scarti, conteggi, tassi/N/incertezza, tentativi/spesa, peso e ragioni,
trend, ultimi brief e immagini in quarantena. Permette giudizio immagine,
correzione effettiva e revisione autonoma della caption. Nessuna azione avvia
ricerca, generazione o pubblicazione. `/admin/similarity` resta separata.

Report #45/#46 si importano in sola lettura nello stesso pannello; dati mancanti
sono «non calcolati». Non si creano distanze testo–immagine da DINOv2, filtri
SigLIP o deduplica incrociata. Il projection adapter riusa l’indice #44 con testo
neutro, senza includere emozioni, prompt o query nell’embedding. L’origine del
mapping resta nella versione v4; gli snapshot vecchi non vengono modificati.

Eventi e snapshot sono privati, paginati e versionati. Il replay admin è limitato
a 20.000 eventi; oltre tale soglia l’export a pagine di 1.000 alimenta il calcolo
offline (limite 100.000 eventi per snapshot). Nessuna analisi pesante viene
eseguita durante una richiesta di gioco. Nessun URL originale, prompt, dossier,
embedding o flag narrativo viene aggiunto al payload pre-risposta.

## Procedura locale e rollout

```sh
python3 -m pipeline.v2.matrix_v4_0_0 --check
python3 -m pipeline.v2.matrix_v4_0_0 --dry-run --count 5 --seed 53
python3 -m pipeline.v2.matrix_v4_0_0 --out .pipeline/matrix/cycle-001 --cycle-id cycle-001
npm run matrix:editorial -- --dry-run --events EVENTS.json --adaptive
npm run benchmark:matrix
```

Il freeze di default registra modelli `unconfigured`: non può essere eseguito a
pagamento. Modelli, quality e parametri devono essere scelti prima di un nuovo
freeze. Le funzioni di adapter riusano `SearchClient`, `DirectEngine`, quarantena
e ledger esistenti. `export_review` prepara un manifest compatibile con
`sync-review-inbox.py` e associazioni v4, senza inviare nulla. L’upload resta
un’operazione separata ed esplicita. Non convertire fixture in prove REAL.

Prima del rollout: backup D1/R2, verifica isolamento, review delle bozze e del
benchmark, pilota REAL con verifiche documentali e giudizi del proprietario,
calibrazione del prior e della parità didascalie, autorizzazione esplicita della
migrazione **0018**, deploy e gate operativi. Le migrazioni vengono applicate qui
solo agli emulatori isolati. L’ordine di test REAL→SLOP non cambia il freeze comune.

Rollback: non eliminare tabelle/eventi o asset. Disabilitare i gate v4 e quelli
pagati, conservare i freeze e tornare alla revisione manuale/lettura storica.
Mantenere un Worker che comprende le colonne additive e le caption dei round
assegnati; non cancellare una migration già applicata e non ricreare caption da
brief o titoli legacy. Un rollback del solo scheduler non cambia partite già
assegnate, approvazioni o archivio.

### Collegamento alla coda e pubblicazione

Dopo la lavorazione, `export_review(cycle)` prepara un manifest immagini per il
comando esistente `scripts/sync-review-inbox.py`. Il nuovo
`python3 scripts/sync-matrix.v4.0.0.py CYCLE` mostra il piano senza rete; `--apply`
è un’operazione distinta, esplicita e autenticata, successiva all’upload privato.
Registra freeze, log e associazioni, senza approvare o pubblicare. Rifiuta di
proporre fixture simulate come immagini v4. Tutti i retry conservano identità e
hash. Il piano SLOP non viene riscritto durante questi passaggi.

I gate documentali e la moderazione della copia di gioco restano nel flusso
esistente. La pubblicazione conserva il bilanciamento aggregato REAL/AI: non
richiede che le due immagini provengano dallo stesso brief e non avvia mai un
ramo mancante. Una revoca esplicita dell’approvazione v4 esclude la candidata da
nuove assegnazioni senza cancellare asset, audit o round già assegnati. Legare un
asset legacy già pubblicato alla v4 richiede prima una sua revisione esplicita;
non lo ritira silenziosamente dal catalogo.

### Risultati di verifica

[Benchmark sintetico](benchmark-matrice.v4.0.0.md) e
[misure complete](benchmark-matrice.v4.0.0.json): 540 contro 564 approvazioni
simulate a pari budget; nessuna misura riguarda fonti o approvazioni reali.
I test separano prenotazione di costo e ricevuta, per non duplicare spese al
resume; crop, profilo e ricevute non aumentano i tentativi di recupero REAL.

Build/lint, suite Node/Python, integrazione D1/R2 e gallery Chromium locale
verificano schema, conservazione, gate, idempotenza, didascalie, privacy e
compatibilità legacy. La gallery aggiunge 360/390 px per 10/20/30 secondi,
caption prima della readiness server, zoom/AX/markup e matrice da 144 celle.
Gli screenshot restano in `artifacts/gallery/`, fuori dal repository.
Le prove reali su dispositivi, la review del proprietario, il pilota documentale,
la calibrazione e l’autorizzazione del rollout restano pendenti.
