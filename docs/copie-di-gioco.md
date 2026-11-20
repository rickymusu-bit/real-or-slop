# Copie di gioco — specifica 13.0.0

Stato: implementata nel ramo 1.50.0, da rilasciare. Aggiornata: 2026-11-20T16:30:00Z.

## 1. Decisioni dell'owner

- **Tutte le copie di gioco in 4:5 verticale** (2026-11-15), REAL e SLOP. Il ritaglio permette di togliere da una SLOP una zona con
  un errore troppo evidente e le dà un'inquadratura diversa da quella della REAL di riferimento. Annulla la decisione del 2026-11-13
  (copia nel formato più vicino a quello della foto), presa perché con il 4:5 le REAL apparivano tagliate e le SLOP composte per quel
  riquadro. Quel difetto non torna: una SLOP viene generata nel formato derivato dalla REAL e poi ritagliata in 4:5; **non** deve però assomigliare alla REAL per composizione o soggetti.
- La foto intera è l’inquadratura predefinita delle nuove copie. L’originale è centrato nel 4:5 con bande nere sopra e sotto o ai
  lati secondo le proporzioni. «Inquadratura» mostra subito il riquadro sulla stessa area, bande comprese. Allontanare due dita
  allarga il riquadro. Avvicinarle lo restringe (2026-11-20).
- Durante il salvataggio l’editor resta visibile sotto un avviso di elaborazione che blocca i comandi fino all’esito (2026-11-19).
- La foto si mostra **intera su ogni schermo**; il giocatore la esplora con le dita o il mouse; niente swipe per rispondere
  (2026-11-13, invariato). Nessuna vista iniziale diversa dalla foto intera.
- Trattamento delle SLOP: copia le REAL, non le supera (2026-11-14). Le misure vengono dalla **REAL di riferimento** (2026-11-15): prese
  da un'altra REAL avevano rovinato il lotto del 2026-11-15 (sezione 4.1). Il trattamento è un suggerimento fotografico leggero,
  **non** un vincolo a rendere la scena simile alla REAL; la credibilità della copia finale prevale (specifica `generazione-slop` 5.2.0).
- **Bianco e nero, seppia o colore dalle misure** (2026-11-20). Con il ritiro dei tag il trattamento non legge più il Colore della
  REAL: lo ricava dalla crominanza residua misurata sulla sua copia (sezione 4.2). Le foto di una galleria hanno già un trattamento
  simile, quindi il tag aggiungeva poco. Il Supporto non interveniva nei passi del trattamento e non viene sostituito.
- **Trattamento regolabile dall'owner** (2026-11-16), come l'inquadratura: cursori per ogni parametro, che partono dal trattamento
  proposto in base alla REAL di riferimento (sezione 4.4).
- **Le copie le prepara il browser** (2026-11-16): inquadratura, trattamento, conversione in WebP e misure; il Worker controlla e
  conserva. Annulla la decisione del 2026-11-15, che le aveva affidate al Worker. Decodifica, ricampionamento e codifica sono quelli
  del browser (canvas), non codice scritto per il progetto.

## 2. Formati

- **Copia di gioco:** sempre 4:5 verticale. Altezza al massimo 1536 px, larghezza `round(0,8 × altezza)` (al massimo 1229 × 1536),
  mai ingrandita.
- **Generazione delle SLOP:** il generatore riceve la dimensione del formato comune più vicino alle proporzioni dell'originale della
  REAL di origine. La copia 4:5 viene preparata a partire dal file generato. Insieme fisso nel codice:

| Formato | Dimensione chiesta al generatore |
|---|---|
| 3:2 orizzontale | 1536 × 1024 |
| 2:3 verticale | 1024 × 1536 |
| 4:3 orizzontale | 1536 × 1152 |
| 3:4 verticale | 1152 × 1536 |
| 16:9 orizzontale | 1536 × 864 |
| 9:16 verticale | 864 × 1536 |
| 1:1 quadrato | 1536 × 1536 |

Le dimensioni rispettano i vincoli della guida OpenAI per GPT Image 2 e successivi (lati multipli di 16, rapporto non oltre 3:1). I
modelli con sole dimensioni fisse (GPT Image 1.5, 1 mini, `chatgpt-image-latest`) usano la più vicina tra 1:1, 3:2 e 2:3. Il modello
di testo non sceglie più il formato.

## 3. Ricetta

- Uguale per REAL e SLOP, dopo il trattamento delle SLOP (sezione 4): inquadratura 4:5, WebP qualità 0,85, altezza al massimo 1536 px,
  mai ingrandita, sRGB, sfondo bianco per le trasparenze, nessun metadato.
- **La copia la prepara il browser** (`src/game-copy.ts`) dall'originale privato: orientamento applicato, foto intera centrata o ritaglio
  scelto dall’owner, ridimensionamento del canvas in qualità alta, trattamento delle SLOP (sezione 4) con la
  compressione JPEG intermedia del browser, eventuali bande nere aggiunte dopo il trattamento, WebP qualità 85 e misure della copia
  decodificata di nuovo. Il browser la carica
  (`POST /:id/copy?crop=…`, misure e trattamento nelle intestazioni `X-Copy-Metrics` e `X-Copy-Treatment`); il Worker toglie i
  metadati e rifiuta un file non WebP, con dimensioni diverse da quelle della ricetta (o del lato lungo del trattamento), oltre 4 MB,
  o un trattamento non valido (sezione 4). Le stesse inquadratura e trattamento non rifanno la copia, salvo `force=1`.
- **Quando nasce:** al passo 1 del wizard REAL, subito dopo l'acquisizione; per una SLOP accettata, all'apertura della revisione
  nello studio o del batch automatico (il Workflow del ciclo non la prepara più); con «Prepara la copia di gioco» nel dettaglio del
  Database per un'immagine senza copia. Le copie senza misure della versione corrente si misurano in background aprendo il Database.
- **Un solo codificatore** per REAL e SLOP, quello del browser dell'owner: due codificatori diversi (Images sul server per alcune,
  il browser per altre) potrebbero distinguere l'origine dalla compressione. Usare sempre lo stesso browser (Chrome, Edge o Firefox:
  Safari non esporta WebP). Per aggiornare una vecchia copia si apre «Inquadratura» nel dettaglio della foto.
- **Inquadratura** (passo 3 del wizard REAL, revisione dello studio SLOP e dettaglio della galleria, per nuove e approvate): lo
  sfondo è sempre la foto adattata al 4:5. L’editor parte dall’intera area o applica i vincoli al riquadro salvato. Il riquadro si
  sposta liberamente dentro la foto quando può esservi contenuto. Se supera l’altezza della foto, si centra in verticale per
  pareggiare le bande sopra e sotto. Se supera la larghezza, si centra in orizzontale per pareggiare le bande laterali. Sull’altro
  asse resta libero entro la foto. Con pixel interi le bande possono differire di un pixel. Si sposta con trascinamento o frecce e
  si ridimensiona con maniglie, due dita o + e −. «Salva» resta visibile durante lo scorrimento. Ripetere la stessa inquadratura
  conserva copia e statistiche.
- `copy_crop` conserva `{x, y, width, height, format: "4:5"}`. Per la foto intera il browser invia `,fit` dopo il formato. Per il
  ritaglio sulla foto adattata invia `,padded` e il Worker valida le coordinate sull’area 4:5 alla risoluzione dell’originale.
  Il browser disegna i pixel corrispondenti dall’originale e aggiunge le bande comprese nel riquadro. Per le SLOP le bande si
  aggiungono dopo il trattamento. I ritagli salvati nelle coordinate dell’originale si riaprono nella posizione corrispondente
  sull’area adattata. Le copie `fit-width` si riaprono intere. L’upload senza `crop` conserva il ritaglio centrato dei client precedenti.
- Approvare e pubblicare richiedono una copia 4:5. Una copia di una ricetta precedente (formato diverso) va rifatta: il server rifiuta
  di approvarla o pubblicarla, e le pubblicate con una copia non 4:5 escono dal gioco al rilascio (sezione 7).
- **Licenze ND** escluse dal gioco: la copia è una versione modificata.

## 4. SLOP

### 4.1 Perché il trattamento, e da quale REAL

Le REAL d'epoca hanno l'aspetto che dà loro la strada percorsa (una stampa scansionata a 272 px, un fotogramma a 700 px); le SLOP
escono dal generatore a 1536 px, nitide ovunque. Chi fa disinformazione riduce e ricomprime le immagini generate; il gioco fa lo
stesso, copiando le REAL senza superarle (2026-11-14).

Con l'app 1.26.0 le misure venivano da un'altra REAL con lo stesso colore, supporto e decennio. Nel lotto del 2026-11-15 questo ha
rovinato le copie: saturazione, contrasto e dominante dipendono dalla scena, non dal supporto. Una scena di saccheggio a colori ha
preso la saturazione di una foto quasi grigia (ridotta a un terzo), un incendio ha perso l'arancione, una scena di strada è stata
ridotta a 357 px e virata come la foto segnaletica presa a campione. Le REAL di origine avevano invece misure vicine agli originali del
generatore, o più sature. Le misure vengono quindi dalla **REAL di riferimento**, che fornisce un contesto fotografico ma può ritrarre una scena
completamente diversa. La REAL campione separata non serve più. L'algoritmo può proporre una resa analoga, senza forzare
corrispondenza di luminosità, colore o saturazione quando renderebbe la SLOP meno credibile.

### 4.2 Misure

- Il browser misura **ogni copia di gioco**, REAL e SLOP, quando la crea, senza modelli, e il Worker le salva in `copy_metrics`
  (`POST /:id/metrics {metrics, sha256}` registra le misure di una copia esistente, fatte nel browser aprendo il Database):
  lato lungo in pixel; **rumore** (deviazione standard del residuo ad alta frequenza nelle zone più uniformi, escluse quelle bruciate
  a bianco o a nero); **nitidezza** (energia del laplaciano sulla luminanza); **contrasto** (distanza tra i percentili 2 e 98 della
  luminanza); **saturazione** media; **dominante** (scarto medio dei canali dal grigio nelle zone neutre); **tinta** ai mezzitoni (dalla versione 3 delle misure: scarto di ogni canale dalla luminanza su tutti i pixel, in proporzione al peso dei mezzitoni; quella di una seppia, quasi zero in un bianco e nero neutro); **crominanza residua** (dalla versione 4: differenza media tra il canale più alto e il più basso, divisa per 255, una volta tolta la tinta, sui pixel con luminanza fra 24 e 231, quindi senza bande nere né zone bruciate); versione dell'algoritmo. La dominante guarda solo i pixel quasi grigi, che in una seppia sono i meno virati: per questo la tinta si misura a parte.
- **Monocromia** (`monochromeOf`). Una REAL con crominanza residua sotto 0,025 è monocroma: seppia se la tinta varia di almeno 10
  livelli fra i canali, altrimenti bianco e nero. Sopra la soglia è a colori. Taratura del 2026-11-20 su foto campione rese grigie,
  calde o seppia, con e senza rumore, passate per il JPEG e il WebP della copia: monocrome al massimo 0,013, a colori da 0,048,
  colori ridotti a un terzo della saturazione da 0,017. Un'immagine con una sola dominante uniforme su tutta la scena è vicina alla
  soglia e può risultare seppia: l'owner la corregge con il cursore «Colore». Misure precedenti alla versione 4, senza crominanza
  residua: vale il Colore che il registro della SLOP aveva conservato (`copy_style` o `color` del trattamento); senza quel dato è
  monocroma solo un'immagine con saturazione sotto la soglia.
- Limite noto: le copie delle REAL, ridotte da scansioni grandi e ricompresse, hanno poca grana a questa scala (mediana 0,55 sulle 55
  REAL del 2026-11-14), come le SLOP: la differenza che l'occhio vede non sta nel rumore misurato così.
- Le copie senza misure, o con misure di una versione precedente, si misurano all'apertura della dashboard (gratuito).
- Il codice delle misure è condiviso (`shared/copy-treatment.ts`) e provato con immagini di prova nei test.

### 4.3 Trattamento

- Si applica a ogni SLOP (studio, batch, rigenerazione) prima della copia di gioco: l'originale del generatore resta intatto
  nella quarantena.
- **Obiettivo indicativo:** le misure anonime salvate nel processo, con i limiti descritti. Nessun identificativo della REAL viene conservato. Senza misure, nessun trattamento. Se il trattamento crea artefatti, colori o illuminazione incoerenti, usare la versione
  senza trattamento o riprogettare la scena; **non** sacrificare la credibilità per la somiglianza delle metriche.
- Il Worker rifiuta con errore 400 un trattamento con campione malformato o identificativo della REAL; il controllo non deve generare eccezioni per valori JSON primitivi.
- **Passi** (versione 6 dell'algoritmo), in quest'ordine, con un seme registrato perché il risultato sia ripetibile. Ogni valore è
  proposto dalle misure della REAL; l'owner può sostituirli tutti con i cursori (sezione 4.4), che applicano gli stessi passi con i
  suoi valori:
  1. selezione dei pixel dell’inquadratura, con l’intera foto come scelta predefinita;
  2. riduzione all'altezza della copia della REAL di origine (mai un ingrandimento, mai sotto 480 px);
  3. contrasto verso quello della REAL, con un fattore tra 0,85 e 1,2;
  4. bianco e nero o seppia, con la tinta della REAL (registrata come dominante; la sua dominante se è stata misurata prima della tinta), se le misure della REAL sono monocrome (sezione 4.2); fino alla versione 5 decideva il tag Colore della REAL.
     La tinta pesa 4·t·(1−t) con t la luminanza da 0 a 1: piena nei mezzitoni, nulla al nero e al bianco, come in una stampa virata;
     fino alla versione 4 era uguale su ogni pixel, e una seppia senza tinta misurata restava grigia come il bianco e nero; altrimenti dominante (al massimo ±8 per canale) e
     saturazione (fattore tra 0,7 e 1,3) verso quelle della REAL;
  5. sfocatura fino alla nitidezza della REAL, con raggio al massimo 1;
  6. grana di luminanza fino al rumore della REAL, ammorbidita nelle immagini grandi, mai a blocchi;
  7. una compressione JPEG intermedia a qualità 0,85, poi la ricetta della copia (sezione 3).
  I valori proposti sono arrotondati prima di essere applicati, così la proposta riapplicata come impostazione dà gli stessi pixel.
- **Correzioni leggere.** I limiti dei passi 3–5 sono più stretti della versione 2 (contrasto fino a 1,6, saturazione da 0,3, raggio
  fino a 3): il trattamento ritocca, non stravolge. Niente effetti disegnati: ogni passo segue una misura della REAL.
- Dopo il trattamento il browser misura la copia e registra lo scarto dall'obiettivo; il dettaglio del Database lo mostra.
  **Lo scarto metrico non è una misura di realismo.** Nel loop di `generazione-slop` 5.2.0 il valutatore multimodale vede
  **l'immagine generata intera, prima del ritaglio e del trattamento**. Solo se la candidata è accettata, il browser prepara
  la copia 4:5 e applica il trattamento. L'owner controlla la copia risultante nella revisione; il crop non deve condizionare
  il prompt né innescare una nuova generazione automatica per concentrare i soggetti nel 4:5.
- **Registro** `copy_treatment`: misure anonime della REAL, parametri applicati di ogni passo (compresa la scelta fra colore, bianco e
  nero e seppia),
  seme, versione dell'algoritmo e, se l'owner ha regolato il trattamento, le sue impostazioni (`settings`). Il Worker accetta il
  registro solo se le misure vengono dalla REAL di riferimento della SLOP, le impostazioni sono entro i limiti dei cursori e il lato
  lungo coincide con quello delle impostazioni o, senza, con quello proposto. Una copia fatta con una versione precedente si rifà con quella corrente alla prossima «Inquadratura» o al
  prossimo comando del trattamento. I registri fino alla versione 5 contengono anche Supporto e Colore, accettati ma non più scritti.
  Il dettaglio della SLOP scrive «Trattamento fotografico a colori», «in bianco e nero» o «seppia».
- **Comandi** nel dettaglio del Database di una SLOP nuova o approvata e nella revisione dello studio, gratuiti: «Senza trattamento» e
  «Con trattamento». «Altra REAL campione» sparisce. Cambiare il trattamento rifà la copia come «Inquadratura»: azzera le statistiche
  e, per una pubblicata, passa da «Modifica».
- «Inquadratura» su una SLOP ritaglia l'originale e riapplica lo stesso trattamento.
- Le REAL non hanno trattamento: la loro ricetta resta quella della sezione 3.

### 4.4 Trattamento regolato dall'owner

Decisione dell'owner del 2026-11-16: il trattamento della copia si modifica come l'inquadratura.

- **«Regola il trattamento»**, accanto a «Senza/Con trattamento» nel dettaglio del Database e nella revisione dello studio, per una
  SLOP nuova o approvata con una REAL di riferimento misurata. Apre un riquadro con l'anteprima della copia, la copia della REAL di
  riferimento con le sue misure, e i cursori: Colore (a colori, bianco e nero, seppia), contrasto (0,5–1,6), saturazione (0–1,8,
  nascosta per le copie monocrome), dominante o tinta rosso, verde, blu (±40), sfocatura (0–3 px), grana (0–25), dimensione della
  grana (1–3), qualità del JPEG intermedio (0,4–1), lato lungo (480–1536 px, mai oltre il ritaglio).
- **I cursori partono dalla proposta** calcolata nel browser dalle misure della REAL di riferimento sull'inquadratura salvata. Se
  l'owner ha già regolato la copia, partono dalle sue impostazioni (anche se salvate con la versione 4); «Torna alla proposta» le riporta ai valori proposti.
- **Cambiare il Colore** reimposta i cursori della tinta (richiesta dell'owner del 2026-11-16): quelli della proposta se ha quel colore;
  altrimenti, per «Seppia», una tinta seppia di partenza (rosso +15, verde −1, blu −24 ai mezzitoni, circa neutra in luminanza) e,
  per «Bianco e nero» e «A colori», nessuna. Prima la tinta restava quella che c'era, quasi zero, e seppia e bianco e nero davano lo
  stesso grigio.
- **Anteprima nella pagina:** ogni modifica, dopo una breve pausa, ridisegna la copia con quelle impostazioni (trattamento e JPEG
  intermedio, come la copia), con le sue misure e lo scarto dalla REAL; nulla viene salvato. Manca solo la codifica WebP finale.
- **Salvare** rifà la copia con le impostazioni dell'owner e la carica, come «Inquadratura»: azzera le statistiche. Salvare i valori
  proposti torna al trattamento proposto. Le impostazioni restano quando la copia si rifà (nuova
  inquadratura, «Senza/Con trattamento»), finché la REAL di riferimento è la stessa.
- Tutto è gratuito: nessun modello è chiamato.

Dalla 1.50.0 il processo conserva della REAL solo formato e misure anonime (`target_metrics`). I processi creati prima conservano
anche `copy_style` con Colore e Supporto, che la 0058 aveva ricavato dai tag: serve soltanto per le misure senza crominanza residua
(sezione 4.2).

## 5. Nella partita

- Il riquadro è 4:5; la foto entra intera nello spazio disponibile, con i pulsanti sempre visibili.
- **Esplorare:** trascinare con un dito o il mouse; ingrandire con due dita o la rotella, fino a due pixel CSS per pixel della copia (mai
  meno di 4 volte); un doppio tocco ingrandisce 2,5 volte sul punto toccato e su una foto ingrandita torna alla foto intera; «Foto
  intera» torna all'inizio. Il tempo scorre mentre si esplora.
- La lista di fine partita mostra le foto intere.

## 6. Rischi

- **REAL tagliate:** una REAL orizzontale perde quasi metà della scena; soggetti larghi non reggono il 4:5. Vale per le SLOP allo
  stesso modo, perché nascono nel formato della loro REAL.
- **Trattamento forzato a mano:** con i cursori si possono ottenere copie molto più degradate delle REAL (grana, sfocatura, JPEG
  basso), cioè un indizio dell'origine. L'anteprima mostra le misure della REAL accanto a quelle della copia proprio per evitarlo.
- **Browser diversi:** il codificatore WebP e il ridimensionamento dipendono dal browser; copie fatte con browser diversi possono
  differire nella compressione. Preparare le copie sempre con lo stesso browser.
- **Trattamento sbagliato:** confrontare nell’anteprima le misure della copia con quelle di riferimento salvate e correggere con i cursori.
  Non esistono confronti aggregati per gruppi; la credibilità della singola copia prevale sulla distanza numerica.
- **Costo:** la dimensione chiesta al generatore dipende dal formato della REAL (tra 1,3 e 2,4 milioni di pixel).

## 7. Passaggio dalle copie nel formato della foto

- Al rilascio le copie esistenti hanno il formato della foto. Una migrazione ritira dal gioco le pubblicate (tornano approvate) e
  nessuna copia non 4:5 si può approvare o pubblicare.
- Dal dettaglio della foto si può scegliere l’inquadratura 4:5. La nuova copia fa ripartire le statistiche della foto, che contano
  i round giocati con la copia attuale.
- Le partite in corso finiscono con le copie con cui sono iniziate.

