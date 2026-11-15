# Copie di gioco — specifica 9.1.1

Stato: decisioni approvate, **da implementare** (#136 e successivo loop di credibilità in `generazione-slop` 5.0.1); in produzione c'è la 8.0.0
(app 1.26.0: copia nel formato della foto, trattamento verso un'altra REAL). Aggiornata: 2026-11-15T11:08:00Z. La 9.0.0 riporta tutte
le copie di gioco al formato verticale 4:5 e prende le misure del trattamento dalla REAL di origine. Le versioni precedenti restano
nella cronologia git. Principio invariato dalla 2.0.0: l'owner approva la copia e il gioco serve esattamente quei byte.

## 1. Decisioni dell'owner

- **Tutte le copie di gioco in 4:5 verticale** (2026-11-15), REAL e SLOP. Il ritaglio permette di togliere da una SLOP una zona con
  un errore troppo evidente e le dà un'inquadratura diversa da quella della REAL di riferimento. Annulla la decisione del 2026-11-13
  (copia nel formato più vicino a quello della foto), presa perché con il 4:5 le REAL apparivano tagliate e le SLOP composte per quel
  riquadro. Quel difetto non torna: una SLOP viene generata nel formato derivato dalla REAL e poi ritagliata in 4:5; **non** deve però assomigliare alla REAL per composizione o soggetti.
- La foto si mostra **intera su ogni schermo**; il giocatore la esplora con le dita o il mouse; niente swipe per rispondere
  (2026-11-13, invariato). Nessuna vista iniziale diversa dalla foto intera.
- Trattamento delle SLOP: copia le REAL, non le supera (2026-11-14). Le misure vengono dalla **REAL di riferimento** (2026-11-15): prese
  da un'altra REAL avevano rovinato il lotto del 2026-11-15 (sezione 4.1). Il trattamento è un suggerimento fotografico leggero,
  **non** un vincolo a rendere la scena simile alla REAL; la credibilità della copia finale prevale (specifica `generazione-slop` 5.0.1).

## 2. Formati

- **Copia di gioco:** sempre 4:5 verticale. Altezza al massimo 1536 px, larghezza `round(0,8 × altezza)` (al massimo 1229 × 1536),
  mai ingrandita.
- **Generazione delle SLOP:** il generatore riceve la dimensione del formato comune più vicino alle proporzioni dell'originale della
  REAL di origine; la copia 4:5 si ritaglia da lì. Insieme fisso nel codice:

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

- Uguale per REAL e SLOP, dopo il trattamento delle SLOP (sezione 4): ritaglio 4:5, WebP qualità 0,85, altezza al massimo 1536 px,
  mai ingrandita, sRGB, sfondo bianco per le trasparenze, nessun metadato.
- La copia si crea nel browser dell'owner appena l'immagine entra nella libreria, con il ritaglio 4:5 più grande, centrato; il server
  verifica formato, dimensioni e corrispondenza con il ritaglio.
- **Inquadratura** (passo 3 del wizard REAL, revisione dello studio SLOP e dettaglio del Database, per nuove e approvate): un riquadro
  4:5 che l'owner sposta o rimpicciolisce sull'originale. Salvato in `copy_crop` (`{x, y, width, height, format: "4:5"}`). Salvare lo
  stesso ritaglio non rifà la copia e lascia le statistiche. Il formato non si sceglie.
- Approvare e pubblicare richiedono una copia 4:5. Una copia di una ricetta precedente (formato diverso) va rifatta: il server rifiuta
  di approvarla o pubblicarla, e le pubblicate con una copia non 4:5 escono dal gioco al rilascio (sezione 7).
- **Licenze ND** escluse dal gioco: il ritaglio è una modifica.
- Il ritaglio toglie molto a una REAL orizzontale: di una 3:2 resta poco più di metà della larghezza. È il costo accettato della
  decisione; l'owner sceglie l'inquadratura, e una foto che non regge il ritaglio non si carica.

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

- Il browser misura **ogni copia di gioco**, REAL e SLOP, quando la crea, senza modelli e senza costi, e le salva in `copy_metrics`:
  lato lungo in pixel; **rumore** (deviazione standard del residuo ad alta frequenza nelle zone più uniformi, escluse quelle bruciate
  a bianco o a nero); **nitidezza** (energia del laplaciano sulla luminanza); **contrasto** (distanza tra i percentili 2 e 98 della
  luminanza); **saturazione** media; **dominante** (scarto medio dei canali dal grigio nelle zone neutre); versione dell'algoritmo.
- Limite noto: le copie delle REAL, ridotte da scansioni grandi e ricompresse, hanno poca grana a questa scala (mediana 0,55 sulle 55
  REAL del 2026-11-14), come le SLOP: la differenza che l'occhio vede non sta nel rumore misurato così.
- Le copie senza misure, o con misure di una versione precedente, si misurano all'apertura della dashboard (gratuito).
- Il codice delle misure è condiviso (`shared/copy-treatment.ts`) e provato con immagini di prova nei test.

### 4.3 Trattamento

- Si applica a ogni SLOP gemella (studio, batch, rigenerazione) prima della copia di gioco: l'originale del generatore resta intatto
  nella quarantena.
- **Obiettivo indicativo:** le misure della copia di gioco della REAL di riferimento, con i limiti descritti. Senza REAL di riferimento,
  o se non è misurata, nessun trattamento. Se il trattamento crea artefatti, colori o illuminazione incoerenti, usare la versione
  senza trattamento o riprogettare la scena; **non** sacrificare la credibilità per la somiglianza delle metriche.
- **Passi** (versione 3 dell'algoritmo), in quest'ordine, con un seme registrato perché il risultato sia ripetibile:
  1. ritaglio 4:5 dell'inquadratura;
  2. riduzione all'altezza della copia della REAL di origine (mai un ingrandimento, mai sotto 480 px);
  3. contrasto verso quello della REAL, con un fattore tra 0,85 e 1,2;
  4. bianco e nero o seppia, con la tinta della REAL, se il Colore della REAL lo è; altrimenti dominante (al massimo ±8 per canale) e
     saturazione (fattore tra 0,7 e 1,3) verso quelle della REAL;
  5. sfocatura fino alla nitidezza della REAL, con raggio al massimo 1;
  6. grana di luminanza fino al rumore della REAL, ammorbidita nelle immagini grandi, mai a blocchi;
  7. una compressione JPEG intermedia a qualità 0,85, poi la ricetta della copia (sezione 3).
- **Correzioni leggere.** I limiti dei passi 3–5 sono più stretti della versione 2 (contrasto fino a 1,6, saturazione da 0,3, raggio
  fino a 3): il trattamento ritocca, non stravolge. Niente effetti disegnati: ogni passo segue una misura della REAL.
- Dopo il trattamento il browser misura la copia e registra lo scarto dall'obiettivo; il dettaglio del Database lo mostra.
  **Lo scarto metrico non è una misura di realismo.** Nel loop di `generazione-slop` 5.0.1 il valutatore multimodale vede
  **l'immagine generata intera, prima del ritaglio e del trattamento**. Solo se la candidata è accettata, il browser prepara
  la copia 4:5 e applica il trattamento. L'owner controlla la copia risultante nella revisione; il crop non deve condizionare
  il prompt né innescare una nuova generazione automatica per concentrare i soggetti nel 4:5.
- **Registro** `copy_treatment`: REAL da cui vengono le misure (identificativo e misure), Colore, parametri di ogni passo, seme,
  versione dell'algoritmo. Una copia fatta con una versione precedente si rifà con quella corrente alla prossima «Inquadratura» o al
  prossimo comando del trattamento.
- **Comandi** nel dettaglio del Database di una SLOP nuova o approvata e nella revisione dello studio, gratuiti: «Senza trattamento» e
  «Con trattamento». «Altra REAL campione» sparisce. Cambiare il trattamento rifà la copia come «Inquadratura»: azzera le statistiche
  e, per una pubblicata, passa da «Modifica».
- «Inquadratura» su una SLOP ritaglia l'originale e riapplica lo stesso trattamento.
- Le REAL non hanno trattamento: la loro ricetta resta quella della sezione 3.

## 5. Nella partita

- Il riquadro è 4:5; la foto entra intera nello spazio disponibile, con i pulsanti sempre visibili.
- **Esplorare:** trascinare con un dito o il mouse; ingrandire con due dita o la rotella, fino a due pixel CSS per pixel della copia (mai
  meno di 4 volte); un doppio tocco ingrandisce 2,5 volte sul punto toccato e su una foto ingrandita torna alla foto intera; «Foto
  intera» torna all'inizio. Il tempo scorre mentre si esplora.
- La lista di fine partita mostra le foto intere.

## 6. Rischi

- **REAL tagliate:** una REAL orizzontale perde quasi metà della scena; soggetti larghi non reggono il 4:5. Vale per le SLOP allo
  stesso modo, perché nascono nel formato della loro REAL.
- **Trattamento sbagliato:** le Statistiche confrontano le misure delle copie pubblicate di REAL e SLOP per gruppo; non correggere
  automaticamente le copie solo per ridurre quella distanza, che può essere naturale per scene diverse.
- **Costo:** la dimensione chiesta al generatore dipende dal formato della REAL (tra 1,3 e 2,4 milioni di pixel).

## 7. Passaggio dalle copie nel formato della foto

- Al rilascio le copie esistenti hanno il formato della foto. Una migrazione ritira dal gioco le pubblicate (tornano approvate) e
  nessuna copia non 4:5 si può approvare o pubblicare.
- Nel Database il filtro «Copia da rifare in 4:5» e l'azione in gruppo «Rifai la copia in 4:5» (ritaglio centrato, gratis, nel
  browser) rifanno le copie; l'owner rivede le inquadrature e ripubblica. Le statistiche delle foto ripartono, perché contano solo i
  round giocati con la copia attuale.
- Le partite in corso finiscono con le copie con cui sono iniziate.
