# Copie di gioco nel formato della foto, esplorabili nella partita — specifica 4.0.0

Stato: **proposta**, da approvare dall'owner. Creata: 2026-11-13T09:40:00Z. Sostituisce, quando approvata, `docs/copie-di-gioco.v3.0.1.md`
(che resta storica); modifica `docs/gioco-a-livelli.v1.0.1.md` (sezioni sulla foto e sullo swipe) e `docs/wizard-slop.v1.4.1.md`
(dimensione chiesta al generatore e contesto fisso dei prompt). Resta il principio della 2.0.0: l'owner approva la copia e il gioco
serve esattamente quei byte.

## 1. Decisioni dell'owner (2026-11-13)

- Nella partita, su telefono e schermi verticali, la foto si presenta in un riquadro 4:5, ma il giocatore può trascinarla per vedere
  il resto e ingrandirla o rimpicciolirla con le dita; un tasto torna alla vista predefinita.
- Il giocatore deve poter vedere la foto intera, non solo il ritaglio.
- Niente swipe per rispondere: il dito sposta la foto.
- La copia di gioco è la foto ritagliata al più vicino di un insieme di formati comuni.
- Il formato di una REAL è la scelta del fotografo per il soggetto; per una SLOP deve valere lo stesso: il contesto fisso dei prompt
  dice che il formato deve essere adatto al soggetto rappresentato.

Motivo: con la 3.0.1 le REAL vengono composte dal fotografo e poi tagliate in 4:5, mentre le SLOP nascono già composte per il 4:5.
È un indizio di composizione, che sparisce se entrambe arrivano nel loro formato.

## 2. Formati

Insieme fisso nel codice (`shared/formats.v1.0.0.ts`), i formati fotografici più comuni:

| Formato | Uso tipico | Dimensione chiesta al generatore |
|---|---|---|
| 3:2 orizzontale | reflex e mirrorless | 1536 × 1024 |
| 2:3 verticale | | 1024 × 1536 |
| 4:3 orizzontale | telefoni, compatte | 1536 × 1152 |
| 3:4 verticale | | 1152 × 1536 |
| 16:9 orizzontale | panoramiche, video | 1536 × 864 |
| 9:16 verticale | | 864 × 1536 |
| 1:1 quadrato | medio formato, social | 1536 × 1536 |

Il 4:5 non è nell'insieme. Le dimensioni rispettano i vincoli di GPT Image 2 e 2.6 nella guida ufficiale
(developers.openai.com/api/docs/guides/image-generation, letta il 2026-11-13): lati multipli di 16, rapporto tra i lati non oltre 3:1,
lato massimo 3840 px, totale tra 655.360 e 8.294.400 pixel. La guida non riporta i vincoli di GPT Image 2.5; la 3.0.1 li dava per
uguali. Va confermato alla prima generazione autorizzata.

## 3. Ricetta della copia

- Uguale per REAL e SLOP: **formato più vicino** dell'insieme (distanza sul logaritmo del rapporto), ritaglio centrato più grande,
  WebP qualità 0,85, **lato lungo al massimo 1536 px**, mai ingrandita, sRGB, sfondo bianco per le trasparenze, nessun metadato.
- Il lato lungo scende da 2048 a 1536 perché con lo zoom si vedrebbe la differenza di risoluzione: oggi le REAL arrivano a 2048 px e le
  SLOP a 1280–1536. Con lo stesso massimo per tutte, ingrandire non rivela l'origine. Le REAL più piccole di 1536 px restano più
  piccole: è così anche oggi.
- **Inquadratura**, nel passo 2 del wizard REAL e nella sezione Database, con due riquadri:
  1. il **ritaglio** al formato (centrato all'inizio; l'owner lo sposta o lo rimpicciolisce, il formato resta quello scelto; può
     cambiare formato tra quelli dell'insieme);
  2. la **vista iniziale 4:5** dentro la copia, quella che il giocatore vede per prima su uno schermo verticale (centrata all'inizio).
  Colonne `copy_crop` (ritaglio, come oggi) e `copy_view` (vista, `{x, y, height}` in pixel della copia), migrazione additiva.
- Il server verifica che il formato sia nell'insieme, che le dimensioni della copia corrispondano al ritaglio e che la vista stia
  nella copia.

## 4. SLOP

- Il **contesto fisso dei prompt SLOP** (Impostazioni) aggiunge: «Scegli il formato più adatto al soggetto, come farebbe un fotografo:
  orizzontale per paesaggi e scene larghe, verticale per persone in piedi, edifici alti, ritratti; quadrato solo se il soggetto lo
  chiede». Il testo è dell'owner e si salva come nuova versione; il codice aggiorna solo la proposta.
- Il **formato della risposta** (nel codice) aggiunge a ogni prompt il campo `format`, uno dei sette. Un valore fuori dall'insieme è
  un errore del modello di testo, come oggi un JSON non valido.
- I modelli di immagini con dimensioni libere (GPT Image 2, 2.5, 2.6) generano nella dimensione della sezione 2. Gli altri in elenco
  (GPT Image 1.5, 1 mini, `chatgpt-image-latest`) hanno solo 1024 × 1024, 1536 × 1024 e 1024 × 1536: con loro il modello di testo
  riceve solo 1:1, 3:2 e 2:3.
- Rigenerare una SLOP dalla sezione Database usa il formato registrato nel suo prompt.

## 5. Partita

- **Schermo verticale** (più alto che largo): un riquadro 4:5 che parte dalla vista iniziale. Un dito trascina la foto, due dita la
  ingrandiscono o la rimpiccioliscono, da «foto intera nel riquadro» fino a 4 volte la vista iniziale. Il tasto «Vista iniziale» torna
  alla vista 4:5. La didascalia resta sotto il riquadro.
- **Schermo orizzontale:** la foto intera nel suo formato, nello spazio disponibile, con lo stesso zoom e lo stesso tasto.
- **Risposte:** pulsanti REAL e SLOP sempre visibili, anche sul telefono; tasti R e S sul computer. Lo swipe è eliminato.
- Il tempo del round scorre mentre il giocatore esplora: esplorare costa tempo, come guardare.
- Le partite in corso al rilascio finiscono con le copie con cui sono iniziate (24 ore al massimo).

## 6. Licenze ND

Restano escluse: il ritaglio al formato più vicino è comunque una modifica della foto.

## 7. Passaggio dalle copie 4:5

- Le copie 4:5 esistenti restano giocabili finché l'owner non le rifà: un 4:5 nella partita indica una copia vecchia, non l'origine,
  perché fino al rilascio REAL e SLOP erano tutte 4:5.
- Nella sezione Database un filtro «copia da rifare» e un comando che rifà nel browser le copie scelte con ritaglio e vista centrati,
  da controllare e approvare come oggi. Le statistiche di una foto ripartono da zero con la copia nuova (regola della 3.0.1).
- Le SLOP già generate in 4:5 vengono ritagliate a 3:4 (perdono circa il 6% dell'altezza); quelle in 2:3 restano intere.

## 8. Rischi e limiti

- **Distribuzione dei formati.** Se il modello di testo sceglie formati diversi da quelli dei fotografi (per esempio quasi sempre 3:2),
  la frequenza dei formati diventa un indizio statistico. Proposta: nelle Statistiche, sotto «Equilibrio del catalogo», la
  distribuzione dei formati tra REAL e SLOP pubblicate, per correggere il contesto fisso se divergono.
- **Composizione.** Il ritaglio al formato più vicino toglie poco a una REAL (al massimo circa il 13% di un lato), tranne le panoramiche più larghe del 16:9: una foto 3:1 perde circa il 40% della larghezza.
- **Costo.** Le dimensioni della sezione 2 hanno tra 1,3 e 2,4 milioni di pixel, contro 1,3 milioni del 1024 × 1280 di oggi: il costo
  di un'immagine cambia con la dimensione. Non è stimato.
- **GPT Image 2.5:** vincoli sulle dimensioni non documentati nella guida (sezione 2).
- **Riconoscere l'esplorazione:** su un telefono piccolo trascinare e ingrandire in 5 secondi (livello Esperto) è difficile; il livello
  resta quello, il giocatore può rispondere senza esplorare.

## 9. Verifiche previste

Test unitari sul formato più vicino, sui ritagli e sulle dimensioni del generatore per modello; integrazione su copie, vista,
migrazione e prompt con `format`; nel browser, su desktop e mobile, editor di ritaglio e vista, zoom e trascinamento nella partita,
pulsanti di risposta sul telefono, tasto «Vista iniziale».
