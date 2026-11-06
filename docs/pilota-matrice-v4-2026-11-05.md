> Aggiornamento successivo del proprietario: la [v4.1.0](protocollo-editoriale.v4.1.0.md)
> consente contesto tramite didascalia e fotogrammi interi, senza obbligo di
> ambiente esterno per i quadri. I risultati e i freeze descritti qui restano storici.

# Pilota della matrice v4 — 2026-11-05

Il proprietario ha autorizzato cinque REAL e cinque SLOP, con tetto complessivo
**2 USD** e senza pubblicazione. Il pilota ha prodotto **10 varianti finali
1024×1024**, con originali, provenienza, ricevute e profili conservati privatamente.
Il costo stimato dai consumi delle ricevute è **0,329570 USD**; il ledger locale
ha prenotato **1,50 USD**. La stima non è una verifica della fattura.

Il codice eseguito è `f26cf8277e1abf571e3505ef7972567e3c9579d7`, nella PR draft
[#55](https://github.com/rickymusu-bit/real-or-slop/pull/55). Nessun deploy,
migrazione remota, approvazione o pubblicazione è stato effettuato.

## Freeze e campione

Il ciclo `pilot-2026-11-05-v4` usa cinque celle selezionate uniformemente con seed
53, senza giudizi storici. Catalogo, descrizioni, query iniziali e prompt sono
stati congelati **prima della ricerca**, alle `2026-11-05T21:42:44.350365Z`.

| Intenzione della cella | Brief originale, sintetizzato | Esito |
| --- | --- | --- |
| outrage · people_everyday_life | Sala d’attesa con sedie vuote e ambiente visibile | REAL con una persona; SLOP senza persone |
| tenderness · people_everyday_life | Spazio intorno a una tavola familiare prima del pasto | REAL di una sala d’albergo; SLOP con tavola apparecchiata |
| tenderness · homes_architecture | Balcone coperto con tavolino e contesto | Entrambe acquisite; ritaglio REAL da rivedere |
| nostalgia · arts_crafts | Grande opera incorniciata su una parete dello studio, stanza visibile | REAL senza stanza esterna all’opera; SLOP con contesto |
| amusement · products_consumption | Oggetto domestico usato accanto al suo ripostiglio | Aspirapolvere REAL; tagliere SLOP; ritaglio REAL da rivedere |

Le etichette sono **intenzioni**, non emozioni osservate o confermate. In
particolare il testo della sala d’attesa non rende evidente l’indignazione:
il catalogo draft richiede revisione semantica prima di aumentare il volume.
Un campione di cinque celle non misura l’equilibrio della matrice o l’efficacia
dello scheduler adattivo.

Identità conservate:

- Freeze SHA-256: `acc2c4a995363aff536f69e06ff62c8311d616c289e7ac3343df6987da14ae7d`.
- Catalogo SHA-256: `2a019d9bab781ba1ae20e218d0602d81023d31ead55bec0c7fbdd40dc6425dc3`.
- Coorte delle dieci varianti finali: `4d3e49b6888e77ff6462b3425e6abbbf45f2dca865dccaa70f252fc79c5390e9`.

## Ricerca e documentazione REAL

Sono registrati **18 tentativi e 44 hit**, con cinque fotografie documentate
acquisite. I dieci tentativi iniziali hanno restituito PDF, zero risultati,
errori HTTP o configurazione mancante. Otto query successive, più brevi e con
filtro bitmap, sono state scritte dall’operatore e registrate in piani separati;
brief e prompt SLOP sono rimasti immutati. La ricerca non ha usato motori pagati.

La selezione e la verifica sono assistite dall’operatore, non un benchmark di
ricerca autonoma. I cinque dossier Commons conservano attribuzioni, dichiarazioni
di origine, licenze della fotografia, storico delle schede e dati di ripresa
quando disponibili. Le foto selezionate hanno caricamenti storici tra il 2017 e
il 2022. Un sesto risultato del 2025, con dichiarazione own-work e CC0 ma senza
ulteriore riscontro di ripresa nel documento recuperato, è rimasto incerto e
non è entrato nel ramo verificato. Le altre hit non sono tutte verificate:
**5/44 non è una stima generale dell’ammissibilità documentale**.

Una sorgente con estensione `.jpg` era un MPO con due fotogrammi, non accettato
direttamente dagli adapter. L’originale completo è conservato. Il fotogramma
primario è stato estratto in PNG dopo orientamento EXIF, verificando l’uguaglianza
dei byte RGB decodificati; trasformazione e hash sono nel dossier. Non sono
state applicate ricostruzioni generative o correzioni semantiche.

Il controllo dei ritagli ha segnalato **quattro REAL** per revisione. Per il
quadro il modello si è astenuto: nessun ritaglio include l’ambiente esterno
all’opera. Il fallback centrale è conservato come variante diagnostica,
senza trasformare l’astensione in un’approvazione. La galleria mostra anche
i fotogrammi interi e le incongruenze rispetto ai brief.

## Generazione, spesa e didascalie

Sono riuscite **5 chiamate Images e 15 Responses dirette**: cinque generazioni
GPT Image 2, cinque scelte di ritaglio e dieci profili Terra sui pixel finali.
Parametri: `gpt-image-2`, qualità medium, `1024x1024`, una immagine per richiesta;
`gpt-6.1-terra`, reasoning none, massimo 2.000 token per profilo. Nessun Batch,
fallback di modello, rigenerazione o retry implicito.

I cinque payload di generazione sono stati verificati contro i prompt congelati:
solo modello, prompt testuale, numero, dimensioni e qualità. Nessun pixel, URL,
titolo, didascalia o profilo REAL è stato fornito al generatore. Non sono stati
riscritti prompt dopo aver visto le fotografie.

Il Worker con D1/R2 e il ledger erano **esclusivamente locali**, in una directory
isolata del ciclo, senza credenziali OpenAI nel Worker. Le prenotazioni erano
0,15 USD per generazione e 0,05 USD per valutazione, con tetto aggregato 2 USD.
I prezzi usati per stimare i consumi sono quelli standard già verificati il
2026-11-04 e riportati nel [benchmark diretto](benchmark-diretto-v2.1.0.md),
inclusi cache read/write Terra. Al termine il gate locale è stato richiuso
e il Worker arrestato.

Sono state redatte dieci didascalie italiane dopo l’ispezione delle varianti
finali, con generatore dichiarato `codex-visible-pilot.v1.0.0`, senza altre
chiamate API. Sono bozze legate agli hash dei pixel; le REAL descrivono soltanto
contenuto visibile, le SLOP mantengono il flag di contesto sintetico privato.
Non costituiscono una prova di generazione automatica delle didascalie.

## Verifica del percorso privato e revisione

Tutte le dieci candidate sono conservate nell’archivio v2 e nell’inbox locale.
Il percorso matrice ha accettato cinque REAL e cinque bozze di didascalia.
Ha rifiutato con HTTP 400 le associazioni delle cinque SLOP: la licenza di
distribuzione è `null`, in attesa della scelta del proprietario. Non è stata
attribuita automaticamente una licenza Creative Commons alle generazioni.
Le SLOP restano visibili nella galleria privata e nell’inbox, ma non sono
proposte registrate nella matrice. Questo passaggio va risolto prima di una
futura attivazione, separatamente dai giudizi sulla qualità.

Le richieste senza autenticazione ricevono 401. Il replay effettivo di freeze,
ricevute, tentativi e associazioni REAL è idempotente: **81 eventi**, costo
prenotato 1,50 USD, nessun doppio conteggio. Le proposte della matrice sono cinque
REAL pending; approvazioni, rifiuti e classificazioni confermate sono zero.
I tassi di approvazione restano non disponibili e la copertura osservata è zero.

La galleria comprende dieci immagini, confronto affiancato, originali di
consultazione, note facoltative, giudizi immagine/didascalia separati e
classificazione da confermare esplicitamente. Le scelte si salvano nel browser
e si esportano in JSON legato a coorte, freeze e hash delle immagini.

Verificato in Chromium a **390 e 1440 pixel**: caricamento di tutte le immagini,
assenza di overflow e errori JavaScript, filtri, zoom, persistenza delle note,
esportazione e indipendenza dei tre giudizi. I giudizi sintetici usati nel test
sono stati rimossi: non sono decisioni del proprietario. Dieci bozze di
didascalia passano il validatore canonico. Cinque pannelli PNG incollano i pixel
finali senza ridimensionamento; è disponibile anche un PDF di cinque pagine.

Gli artifact privati locali sono in `artifacts/pilot-v4-2026-11-05/`; originali,
ricevute e audit completo in `.pipeline/matrix/pilot-2026-11-05-v4/`. Sono esclusi
dal Git. La galleria è pronta per la revisione del proprietario; non sono ancora
misurabili qualità approvata, resa on-target o costo per immagine approvata.
