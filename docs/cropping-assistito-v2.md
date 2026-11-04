# Ritaglio assistito da Terra

Decisione del proprietario, 2026-11-04: **Terra è il metodo predefinito per i
ritagli v2**. `pipeline.v2.presentation` usa `--method terra` e il modello
`gpt-6.1-terra` in assenza di override; `--method center` conserva la baseline
locale esplicita. Restano obbligatori i limiti di costo e l'abilitazione con
`--execute` per gli invii. I casi dubbi e le astensioni non diventano approvazioni.

Prova reale del **2026-11-04** completata sul pilota: 20 varianti, **16 chiamate
sincrone** a `gpt-6.1-terra`, quattro fotogrammi già quadrati saltati. Sette scelte
diverse dal centro; sei segnalazioni di revisione, inclusa un'astensione con centro
provvisorio. Nessun errore API, retry, Batch, nuovo profilo o pubblicazione.
44.558 token di input e 964 di output; costo stimato **0,060506 USD** con le tariffe
archiviate del pilota 2026-11-03, inclusi cache write (non fattura verificata).
Prenotazione locale totale: 0,288 USD. Una ripresa completa, senza accesso di rete,
ha ricostruito il report e la galleria senza nuove chiamate. Tutte le 20 copie
sono 1024×1024 RGB, con originali e dossier precedenti invariati.

L'ispezione visiva di due confronti mostra che la proposta può conservare parti
di persone tagliate dal centro e includere un watermark prima escluso. Non è una
misura indipendente di superiorità: le valutazioni umane restano da raccogliere.
La galleria è `artifacts/editorial-v2-pilot/terra-crop-2026-11-04/index.html`.

Il formato finale v2 è **1024×1024, RGB, WebP q85**. Il modello sceglie
l'inquadratura; il codice ritaglia e ridimensiona i pixel dell'originale. Nessuna
generazione, ricostruzione, deformazione o pubblicazione automatica.

`pipeline.v2.smart_crop` propone fino a cinque quadrati di area massima lungo
il lato maggiore del fotogramma orientato. Invia al modello il fotogramma completo
(lato massimo 1024) e le alternative (512×512), in ordine riproducibile mescolato.
Le coordinate rimangono quelle dell'originale orientato. Non invia provenienza,
etichetta, nome del file o prompt SLOP. Una fotografia già quadrata salta l'API.

Il criterio è conservare contenuto, soggetti, relazioni e contesto, comprese
texture e scene senza soggetto dominante. Nessun incentivo a bellezza, stranezza,
presunta origine o rimozione dei difetti. A contenuto equivalente preferire il
centro. La risposta JSON vincolata può indicare un ID proposto o astenersi.
L'astensione mantiene il centro soltanto come copia provvisoria segnalata.
Un modello può scegliere male o non vedere piccoli crediti: tutte le varianti
restano da revisionare e non ereditano il profilo dell'inquadratura precedente.

## Comando e costi

L'esecuzione predefinita pianifica senza rete, credenziali o scritture. Per il
pilota autorizzato il 2026-11-04 sono previsti 16 invii e quattro immagini già
quadrate, con prenotazione locale di 0,018 USD per invio e tetto aggiuntivo 0,30 USD.
Le prenotazioni non sono il costo fatturato né un limite imposto dal provider.
La prenotazione massima 0,288 USD, sommata ai precedenti 1,68 USD del pilota, resta
entro il tetto originario di 2 USD. Il ledger di questo comando è locale, separato
dal Worker: non è un limite globale per altri esecutori o altri workspace.

```sh
python3 -m pipeline.v2.presentation \
  --states .pipeline/v2/pilot-2026-11-03/runs/pilot-20261103-sync-real/state.json .pipeline/v2/pilot-2026-11-03/runs/pilot-20261103-sync-slop/state.json \
  --out artifacts/editorial-v2-pilot/terra-crop-2026-11-04 \
  --model gpt-6.1-terra --budget-usd 0.30 --reservation-usd 0.018 --max-calls 16
# Aggiungere --execute per effettuare le chiamate sincrone autorizzate.
```

Ogni invio scrive prima un intento durevole e conserva prenotazione, hash del
payload e versione delle istruzioni. La risposta completa e il request ID sono
salvati prima dell'interpretazione. Nessun Batch, retry automatico o cambio di
modello. Risposte incomplete, rifiuti e invii incerti sospendono il run senza
rimborsi presunti. La ripresa con gli stessi input e limiti salta le scelte
completate, verificando gli hash delle varianti; quelle incerte richiedono
ispezione delle ricevute. Un lock impedisce due esecutori sulla stessa cartella.

## Confronto umano

`index.html` mostra centro e proposta, con fotogramma completo e motivazione
consultabili. I voti «Centro», «Proposta», «Equivalenti», «Nessuno» rimangono nel
browser e possono essere esportati in JSON. Non approvano le candidate. Questo
confronto esplorativo ha posizioni fisse e motivazioni consultabili: non è uno
studio cieco della superiorità del modello.

`state.json` conserva scelte, coordinate, hash, modello effettivo e token delle
risposte; `receipts/` le ricevute API; `variants.json` le nuove copie con profilo
nullo e revisione pendente; `report.json` conta chiamate, astensioni, scelte
diverse dal centro e casi segnalati. I documenti e gli originali precedenti
restano invariati. Il report non trasforma il giudizio del modello in una misura
di efficacia: questa richiede le valutazioni umane.

## Normalizzazione tecnica richiesta sulle approvate

Quando il proprietario richiede esplicitamente di uniformare le immagini già
approvate, la presentazione può essere registrata separatamente dalla sorgente
approvata. Non si trasferisce il vecchio profilo ai nuovi pixel e non si dichiara
che il proprietario abbia visto un fotogramma nuovo: il voto originale conserva
il proprio hash. La normalizzazione autorizzata conserva soggetto e contesto,
non ha flag di dubbio, ha una traccia distinta e un nuovo profilo. Le successive
revisioni dell'utente riguardano l'hash della presentazione effettiva.

Verifica del 2026-11-04: 81 approvate nella coda e una nel catalogo privato
precedente, escluse le fixture demo. Ottanta file sono già 1024×1024; due REAL
misurano 1024×683 e 1600×1067. Preparate due copie standard con Terra, senza
rigenerare immagini: una scelta diretta già archiviata è riutilizzata dopo la
verifica degli hash, una nuova scelta è effettuata via Responses diretta e due
profili nuovi sono calcolati sui file finali. Entrambi i ritagli conservano il
contesto senza segnalazioni del modello; questo non prova una superiorità
misurata rispetto ad altri tagli. L'applicazione online rimane un passaggio
separato dalla preparazione e richiede il rilascio del supporto alle presentazioni.
