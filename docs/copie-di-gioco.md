# Copie di gioco — specifica 6.0.0

Stato: vigente. Aggiornata: 2026-11-14T12:00:00Z. Versione consolidata (riordino della documentazione dell'owner del 2026-11-14) della 5.0.0,
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

- Uguale per REAL e SLOP: formato più vicino dell'insieme (distanza sul logaritmo del rapporto), ritaglio centrato più grande, WebP
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
- **Costo:** le dimensioni dei formati hanno tra 1,3 e 2,4 milioni di pixel; il costo di un'immagine cambia con la dimensione.
