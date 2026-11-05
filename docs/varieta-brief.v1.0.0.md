# Varietà semantica dei brief — v1.0.0

Implementazione della issue #45, basata sull'indice testuale della #44 e sul
[protocollo editoriale v3.0.0](protocollo-editoriale.md). È uno studio locale dei
**testi inglesi**, prima delle acquisizioni. Nessun indicatore modifica brief,
immagini, approvazioni, ricerca REAL, generazione SLOP o probabilità del gioco.

Il [rapporto leggibile](rapporto-varieta-brief.v1.0.0.md), il
[riepilogo JSON](rapporto-varieta-brief.v1.0.0.json), i
[vicini di tutti i brief](vicini-brief.v1.0.0.csv), la
[copertura del corpus](copertura-brief.v1.0.0.csv) e lo
[stato dei brief](stato-brief.v1.0.0.csv) documentano l'esecuzione sui 100 testi.
Non contengono vettori. Gli snapshot completi restano privati in `.pipeline/`.
La PR è basata sul branch della #44 finché quella dipendenza non è integrata.

## Dati e fonti delle misure

Il CLI richiede un percorso esplicito allo snapshot della #44 e rilegge il
catalogo tramite il validatore esistente. Verifica versione, stato completo,
normalizzazione, dimensione, encoder, ID/revisione/stato/medium di ogni voce,
hash del testo e del contenuto, checksum dei vettori e identità dello snapshot.
Non mescola revisioni o spazi vettoriali diversi. Le fixture richiedono
`--fixture` e vengono etichettate come non semantiche.

Il [corpus esterno v1.0.0](../data/editorial/brief-reference.v1.0.0.json) contiene
48 probe inglesi, tutti in bozza: 36 esplorazioni di temi ulteriori e 12
parafrasi di temi del seed come controllo. Ogni probe ha ID/revisione, mezzo,
descrizione e provenienza. Non contiene prompt SLOP, query o immagini REAL.
Le esplorazioni sono state redatte separatamente dai tag e dai prompt del seed;
l'autore dell'implementazione ha comunque visto il catalogo. **Non è un corpus
umano indipendente e cieco**, né una raccolta esaustiva dei soggetti possibili.
Review d'implementazione: lingua, chiarezza e contesto; review del proprietario
ancora da svolgere. Microscopia e astronomia sondano anche limiti rappresentativi:
non sono automaticamente scene editorialmente ammissibili.

Controlli ed esplorazioni sono sempre separati nel rapporto. Una distanza alta
indica copertura limitata **rispetto a questo corpus**. Non dimostra un vuoto
oggettivo nell'universo delle immagini, una buona idea, una fonte reperibile o
un motivo per rifiutare una fotografia interessante fuori brief.

## Distanze, vicini e dispersione

La distanza è `1 - dot(a,b)` su vettori L2, limitata a [0,2] per assorbire gli
errori numerici. Le autodistanze sono escluse da coppie e vicini; i duplicati
restano presenti con distanza zero. Parità: ID lessicografico, senza casualità.
I quantili usano interpolazione lineare sulla posizione `(N-1)*p`.

Per i 100 brief si misurano tutte le **4.950 coppie**. Oltre il budget
`max_pairs`, la distribuzione usa reservoir sampling uniforme con seed;
conteggi totale/campionato e istogramma di 20 intervalli sono espliciti.
I vicini sono comunque esatti sulla matrice completa, con limite configurabile
massimo di 1.500 brief; il codice rifiuta campioni maggiori invece di esaurire
silenziosamente la memoria. Non è il benchmark prestazionale della futura #49.

Per k=1,5,10 sono conservati vicini, media delle distanze e distanza del k-esimo.
Se `N-1<k`, il valore è **non calcolato**: k non viene ridotto di nascosto.
La densità locale è il numero e la frazione degli altri brief entro un raggio
coseno dichiarato. Non è una densità geometrica calibrata in dimensioni ignote.
La dispersione è la media delle distanze euclidee quadratiche dal centroide dei
vettori normalizzati. Gli outlier usano media kNN(5), oppure kNN(1) quando
N non consente k=5: soglia descrittiva mediana + 3×1,4826×MAD, almeno 3 righe.
MAD zero e duplicati sono gestiti senza divisioni infinite. Nessun flag elimina
una voce o ne stabilisce la qualità.

## PCA e cluster esplorativi

La PCA centra i vettori e diagonalizza la matrice di Gram con Jacobi simmetrico.
Il rapporto conserva spettro, varianza spiegata, rango numerico, convergenza e
residuo. La dimensione effettiva è `(somma lambda)^2 / somma(lambda^2)`;
si riporta anche `exp(-somma p*log(p))`, con `p=lambda/somma lambda`.
Campioni identici danno varianza e dimensione zero; N<2 è insufficiente.
Oltre 500 righe la PCA usa un sottoinsieme riproducibile, con ID registrati:
lo spettro viene etichettato come campionato. Non è una stima esatta del corpus
completo. I segni degli assi sono fissati; autovalori uguali permettono comunque
rotazioni. La proiezione 2D è un supporto esplorativo: distanze e lacune si
misurano nello spazio originale, non sull'aspetto della mappa.

DBSCAN è un'alternativa semplice per N piccolo che ammette rumore e nessun
cluster. Usa distanza coseno e `min_samples` comprensivo del punto stesso.
La griglia versionata prova epsilon 0,1/0,2/0,3/0,4 e min_samples 3/5;
default 0,3 e 3. Ogni corsa conserva gruppi, dimensioni, assegnazioni e rumore.
La stabilità è il Jaccard delle coppie nello stesso cluster, escludendo il
rumore; quando non esistono coppie raggruppate è **non calcolato**, non un
successo perfetto. Si registrano anche i cambi di stato rumore/gruppo.
La griglia misura sensibilità ai parametri, non riproducibilità su nuovi testi,
bootstrap o qualità dei cluster. Non si sceglie il parametro per forzare dieci
categorie o ridurre il rumore.

## Copertura e baselines

Per ogni probe si conserva il brief più vicino e
`min_b(1-cosine(probe,b))`, poi mediana/P90 e frazioni entro raggi dichiarati.
I raggi sono strumenti diagnostici: nessuna soglia abilita o vieta acquisizioni.
Un corpus vuoto e un catalogo vuoto hanno stati distinti e valori nulli.
I probe usano esattamente l'encoder dello snapshot e la stessa rappresentazione
neutrale `description + medium`; i loro vettori vengono memorizzati con il
meccanismo immutabile della #44.

Due confronti affiancano il risultato completo:

- 100 sottoinsiemi casuali di 25 brief attivi, senza reinserimento, con seed
  45…144 e PRNG Mulberry32/Fisher–Yates registrati; si conserva ogni selezione.
- Una selezione per nuovi tag, riusando `pipeline.v2.brief_catalog.select`,
  con lo **stesso budget 25 e la stessa popolazione attiva**. I ritirati sono
  esclusi da entrambe queste selezioni. Non sono quote per il gioco.

Le mediane/P90 dei sottoinsiemi casuali descrivono variabilità del baseline;
non sono intervalli di confidenza di un corpus umano campionato. Il catalogo
completo con 100 righe può solo migliorare le distanze minime rispetto ai suoi
sottoinsiemi: tale confronto non prova la qualità di una selezione.

Il secondo encoder è la baseline TF-IDF della #44, fittata **solo sul catalogo**
e applicata ai probe senza rifit. Vocabolario, IDF e hash del fit sono registrati;
per probe si riporta la frazione di parole note. Termini nuovi possono sparire
e lasciare frasi contestuali comuni: il risultato non equivale alla copertura
semantica MiniLM. Si confrontano identità dei vicini e terne annotate; le scale
di distanza dei due encoder non sono calibrate e non si sottraggono come misure
intercambiabili.

La diagnostica registra lunghezza delle descrizioni, correlazione di Spearman
fra differenza di lunghezza e distanza (ranghi medi per parità, null per costanti),
confronti entro/fuori il primo tag, stesso/diverso medium e trigrammi condivisi
almeno dal 20% dei testi. Questi confondenti e le categorie del seed non sono
prove di varietà visiva. Il testo da incorporare esclude prompt e query.

La [lettura annotata dei vicini](../data/editorial/brief-neighbor-review.v1.0.0.json)
include corrispondenze pertinenti, casi fuorvianti e contesti condivisi con
soggetti diversi. Ad esempio, dipinti interi incorniciati sono vicini plausibili;
un gatto e una tenda vicini alla finestra non sono soggetti ridondanti.
La review è dell'implementazione, successiva all'esplorazione, non una
validazione indipendente del proprietario. Le 8 terne della #44 sono riusate,
con confronto casuale teorico al 50%; non si deducono superiorità statistica o
capacità formativa da questo piccolo campione.

## Utilizzo e approvazione: dati privati facoltativi

Il catalogo e lo snapshot definiscono draft/approved/retired. Un manifest privato
facoltativo, passato con `--activity`, documenta uso e immagini approvate:

```json
{
  "version": "1.0.0",
  "kind": "verified_brief_activity",
  "observed_at": "2026-11-05T00:00:00Z",
  "source": "Riferimento all'esportazione verificata, senza credenziali",
  "briefs": [{
    "id": "brief-0001", "revision": 2,
    "used_in_cycles": ["cycle-id"],
    "real_approved_image_ids": ["real-id"],
    "slop_approved_image_ids": null
  }]
}
```

L'esempio è illustrativo, non documenta approvazioni reali. `[]` significa
nessun elemento verificato; `null`, voce o manifest assenti significano
**sconosciuto**. ID duplicati/sconosciuti o revisioni diverse sono rifiutati;
non si trasferiscono fatti fra revisioni senza verifica. Non si richiedono
coppie: una voce può avere più REAL, più SLOP, una sola origine o nessuna.
I gruppi per origine possono sovrapporsi. Il rapporto misura kNN **interno a
ciascun gruppo** e copertura del corpus per gruppo; non fa deduplicazione
REAL–SLOP. Il report consegnato non dispone di questo manifest: uso e
approvazione per origine sono sconosciuti per tutti i 100 brief. Non sono
stati interrogati database remoti o presunti dati di produzione.

## Riproduzione, esportazione e verifiche

Prerequisiti della #44: Node 24, Python 3.12, `npm ci` e snapshot MiniLM locale.
Se i pesi non sono in cache, la preparazione della #44 permette un download
gratuito esplicito; questo CLI non ha adapter di rete o API a pagamento.

```sh
npm run index:briefs
# Il percorso compare nell'output della #44; sceglierlo esplicitamente:
npm run analyze:briefs -- --index .pipeline/brief-embeddings/snapshots/ID.v1.0.0.json --dry-run
npm run analyze:briefs -- --index .pipeline/brief-embeddings/snapshots/ID.v1.0.0.json
# Per le sole fixture, senza modello e senza rete:
npm run index:briefs -- --fixture
npm run analyze:briefs -- --index .pipeline/brief-embeddings/snapshots/ID-FIXTURE.v1.0.0.json --fixture
```

`--catalog`, `--reference`, `--config`, `--seed`, `--activity`, `--review`,
`--model-cache` e `--out` permettono copie e studi espliciti. Configurazione
versionata: [brief-metrics.v1.0.0.json](../data/editorial/brief-metrics.v1.0.0.json).
Dry-run valida gli input senza nuove inferenze, indici o report. Le normali
esecuzioni restano locali anche con cache dei probe vuota, se i pesi sono
presenti. L'ambiente deve permettere l'IPC locale fra Node e Python.

Output privato: `.pipeline/brief-variety/<snapshot-id>/`, con JSON completo,
CSV coppie/vicini/copertura/stati e rapporto Markdown. Include input e hash,
configurazione, seed, encoder, stime e limiti, tutti i valori per riga e gli
snapshot di confronto. Timestamp ISO 8601 alla prima esportazione; una ripetizione
riusa cache e file identici. File 0600, directory 0700, creazione esclusiva:
non si sovrascrive un contenuto diverso. Gli embedding dei probe/baseline sono
nella sottocartella privata `embeddings/`. Input diversi creano un altro snapshot;
per ricostruire cache danneggiate scegliere una nuova cartella `--out`,
conservando la precedente per audit. I CSV proteggono le celle da formule
involontarie e distinguono true/false/valore vuoto sconosciuto.

I test coprono valori analitici delle distanze/PCA, cluster sintetici noti,
rumore, duplicati, outlier, N piccolo, distanze pari, corpus/catalogo vuoti,
campionamento riproducibile, gruppi sovrapposti, prove mancanti, inglese,
input corrotti, determinismo ed esportazioni immutabili. `npm test` li esegue
con fixture senza inferenza remota; `npm run lint` e `npm run build` verificano
il progetto. Codice e dati non sono importati da Worker o frontend di gioco.
La modifica non attiva pubblicazioni, ricerca, generazioni o nuovi cron.
