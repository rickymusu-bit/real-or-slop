# Copie di gioco — specifica 7.0.1

Stato: approvata dall'owner il 2026-11-14, implementata nell'app 1.25.0 con la migrazione 0048 (in revisione). Aggiornata: 2026-11-14T16:30:00Z.
La 7.0.1 chiama «REAL campione» la foto da cui il trattamento prende le misure. La 7.0.0 aggiunge le misure di ogni copia e il trattamento delle SLOP, che ne avvicina l'aspetto a quello delle REAL del loro gruppo
(sezione 4). La 6.0.0 era la versione consolidata (riordino della documentazione dell'owner del 2026-11-14) della 5.0.0,
senza la storia del passaggio dalle copie 4:5, concluso; le versioni precedenti restano nella cronologia git. Principio invariato dalla
2.0.0: l'owner approva la copia e il gioco serve esattamente quei byte.

## 1. Decisioni dell'owner (2026-11-13)

- La copia di gioco è la foto ritagliata al più vicino di un insieme di formati comuni: il formato di una REAL è la scelta del fotografo,
  e quello di una SLOP deve essere adatto al soggetto. Con tutte le foto in 4:5 le REAL apparivano tagliate e le SLOP composte per quel
  riquadro: un indizio dell'origine.
- La foto si mostra **intera, nel suo formato, su ogni schermo**; il giocatore la esplora con le dita o il mouse. Niente vista iniziale
  4:5: metteva in svantaggio chi gioca sul telefono.
- Niente swipe per rispondere: il dito sposta la foto.

## 2. Formati

Insieme fisso nel codice:

| Formato | Uso tipico | Dimensione chiesta al generatore |
|---|---|---|
| 3:2 orizzontale | reflex e mirrorless | 1536 × 1024 |
| 2:3 verticale | | 1024 × 1536 |
| 4:3 orizzontale | telefoni, compatte | 1536 × 1152 |
| 3:4 verticale | | 1152 × 1536 |
| 16:9 orizzontale | panoramiche | 1536 × 864 |
| 9:16 verticale | | 864 × 1536 |
| 1:1 quadrato | medio formato | 1536 × 1536 |

Le dimensioni rispettano i vincoli della guida OpenAI per GPT Image 2 e 2.6 (lati multipli di 16, rapporto non oltre 3:1). I modelli
con sole dimensioni fisse (GPT Image 1.5, 1 mini, `chatgpt-image-latest`) offrono al modello di testo solo 1:1, 3:2 e 2:3.

## 3. Ricetta

- Uguale per REAL e SLOP, dopo il trattamento delle SLOP (sezione 4): formato più vicino dell'insieme (distanza sul logaritmo del rapporto), ritaglio centrato più grande, WebP
  qualità 0,85, **lato lungo al massimo 1536 px**, mai ingrandita, sRGB, sfondo bianco per le trasparenze, nessun metadato. Lo stesso
  massimo per tutte evita che lo zoom riveli l'origine dalla risoluzione.
- La copia si crea nel browser dell'owner appena l'immagine entra nella libreria; il server verifica formato, dimensioni e
  corrispondenza con il ritaglio.
- **Inquadratura** (passo 3 del wizard REAL e dettaglio del Database, per nuove e approvate): un riquadro nel formato scelto, centrato
  all'inizio, che l'owner sposta o rimpicciolisce; il formato si cambia tra quelli dell'insieme. Salvato in `copy_crop`
  (`{x, y, width, height, format}`). Salvare lo stesso ritaglio non rifà la copia e lascia le statistiche.
- Approvare e pubblicare richiedono una copia con formato.
- **Licenze ND** escluse dal gioco: il ritaglio è una modifica.
- Il ritaglio toglie poco a una REAL (al massimo circa il 13% di un lato), tranne alle panoramiche più larghe del 16:9.

## 4. SLOP

- Il modello di testo sceglie per ogni prompt il formato più adatto al soggetto (campo `format` della risposta, uno dei sette); il
  contesto «Prompt per le SLOP» lo chiede. L'owner può cambiarlo nello studio, senza costi.
- Il generatore riceve il testo del prompt e la dimensione del formato. Rigenerare dal Database usa il formato della copia attuale.

### 4.1 Perché il trattamento (decisione dell'owner del 2026-11-14)

Le REAL d'epoca hanno l'aspetto che dà loro la strada percorsa: una pagina di giornale rifotografata, un fotogramma di pellicola a 700 px,
una piccola stampa scansionata a 272 px. Le SLOP escono dal generatore a 1536 px, nitide ovunque, con un istogramma pulito: nessuna
fotografia d'epoca è così. Il 2026-11-14 12 REAL su 55 avevano il lato lungo sotto i 1536 px e nessuna SLOP: «piccola e morbida»
voleva dire REAL. Chi fa disinformazione riduce, ricomprime e sporca le immagini generate; il gioco fa lo stesso, ma copiando le REAL
del gruppo e senza superarle, perché «rovinata» non diventi il nuovo indizio.

### 4.2 Misure

- Il browser misura **ogni copia di gioco**, REAL e SLOP, quando la crea, senza modelli e senza costi, e le salva in `copy_metrics`:
  lato lungo in pixel; **rumore** (deviazione standard del residuo ad alta frequenza nelle zone uniformi); **nitidezza** (energia del
  laplaciano sulla luminanza); **contrasto** (distanza tra i percentili 2 e 98 della luminanza); **saturazione** media; **dominante**
  (scarto medio dei canali dal grigio nelle zone neutre).
- Le copie esistenti si misurano all'apertura della dashboard, una alla volta, scaricando la copia dalla quarantena (gratuito).
- Il codice delle misure è condiviso (`shared/`) e provato con immagini di prova nei test.

### 4.3 Trattamento

- Si applica a ogni SLOP generata (studio, batch, rigenerazione) prima della copia di gioco: l'originale del generatore resta intatto
  nella quarantena.
- **Obiettivo:** le misure della REAL campione dello slot (specifica `generazione-slop`, sezione 4); per una SLOP rigenerata
  dal Database, la stessa REAL se esiste ancora, altrimenti una a caso del suo gruppo.
- **Passi**, in quest'ordine, con un seme registrato perché il risultato sia ripetibile:
  1. ritaglio dell'inquadratura;
  2. riduzione al lato lungo della REAL campione (mai un ingrandimento);
  3. effetti del **Supporto** dello slot: `newspaper-print` e `magazine-print` retino e contrasto da stampa; `photo-print` e `postcard`
     carta, bordi morbidi e lieve ingiallimento; `film-still` e `slide` dominante e alone sulle alte luci; `instant-photo` colori
     compressi; `digital-photo` e `phone-photo` nessun effetto oltre a quelli seguenti; gli altri supporti nessun effetto;
  4. curva di tono verso contrasto e dominante dell'obiettivo; saturazione verso quella dell'obiettivo; bianco e nero o seppia se il
     Colore dello slot lo è e l'immagine generata non lo è già;
  5. sfocatura fino alla nitidezza dell'obiettivo;
  6. grana di luminanza fino al rumore dell'obiettivo, con grana più grossa nelle immagini piccole;
  7. una compressione JPEG intermedia, poi la ricetta della copia (sezione 3).
- Dopo il trattamento il browser misura la copia e registra lo scarto dall'obiettivo; il dettaglio del Database lo mostra.
- **Registro** `copy_treatment`: REAL campione (identificativo e misure, che restano valide anche se la REAL viene eliminata),
  Supporto e Colore applicati, parametri di ogni passo, seme, versione dell'algoritmo.
- **Comandi** nel dettaglio di una SLOP nuova o approvata e nella revisione dello studio, gratuiti: «Altra REAL campione» (ne pesca
  un'altra del gruppo e rifà la copia), «Senza trattamento» e «Con trattamento». Cambiare il trattamento rifà la copia come
  «Inquadratura»: azzera le statistiche e, per una pubblicata, passa da «Modifica».
- «Inquadratura» su una SLOP ritaglia l'originale e riapplica lo stesso trattamento.
- Le REAL non hanno trattamento: la loro ricetta resta quella della sezione 3.

## 5. Nella partita

- Il riquadro ha il formato della copia; la foto entra intera nello spazio disponibile, con i pulsanti sempre visibili.
- **Esplorare:** trascinare con un dito o il mouse; ingrandire con due dita o la rotella, fino a due pixel CSS per pixel della copia (mai
  meno di 4 volte); un doppio tocco ingrandisce 2,5 volte sul punto toccato e su una foto ingrandita torna alla foto intera; «Foto
  intera» torna all'inizio. Il tempo scorre mentre si esplora.
- La lista di fine partita mostra le foto intere, nel loro formato.

## 6. Rischi

- **Distribuzione dei formati:** se il modello di testo sceglie formati diversi da quelli dei fotografi, la frequenza diventa un indizio.
  Le Statistiche mostrano i formati delle copie pubblicate di REAL e SLOP, per correggere il contesto se divergono.
- **Foto piccole sul telefono:** un 16:9 su un telefono verticale è basso e alcuni indizi si vedono solo ingrandendo; vale per REAL e
  SLOP allo stesso modo.
- **Trattamento sbagliato:** un trattamento troppo forte o troppo debole crea un indizio opposto. Le Statistiche confrontano le misure
  delle copie pubblicate di REAL e SLOP per gruppo, come fanno con i formati.
- **Costo:** le dimensioni dei formati hanno tra 1,3 e 2,4 milioni di pixel; il costo di un'immagine cambia con la dimensione.
