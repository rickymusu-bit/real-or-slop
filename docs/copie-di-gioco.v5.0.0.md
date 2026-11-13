# Copie di gioco nel formato della foto, intere su ogni schermo — specifica 5.0.0

Stato: decisione dell'owner del 2026-11-13 («Elimina inquadratura e procedi», riferito alla vista iniziale 4:5); testo proposto con la
PR dell'app 1.22.0, vigente al merge. Senza migrazioni. Aggiornata: 2026-11-13T19:00:00Z. Precedente: `docs/copie-di-gioco.v4.0.2.md` (storica), che
resta valida per tutto ciò che questa versione non cambia; proposta originale `docs/copie-di-gioco.v4.0.0.md`.
Cambia rispetto alla 4.0.2: niente vista iniziale 4:5; la foto si mostra intera, nel suo formato, su ogni schermo; «Inquadratura»
sceglie solo formato e ritaglio. MAJOR perché toglie un elemento del modello dei dati (la vista) e una decisione della 4.0.0.
Modifica come la 4.0.2 `docs/gioco-a-livelli.v1.0.1.md` (la foto e lo swipe, sezione 5), `docs/wizard-slop.v1.4.1.md` (sezione 4) e i
crediti di `docs/privacy-note-legali.v1.0.2.md`. Resta il principio della 2.0.0: l'owner approva la copia e il gioco serve
esattamente quei byte.

## 1. Decisioni dell'owner (2026-11-13)

- **Sostituita il 2026-11-13 (5.0.0):** ~~Nella partita, su telefono e schermi verticali, la foto si presenta in un riquadro 4:5~~.
  Ora la foto si presenta intera, nel suo formato, anche sugli schermi verticali; il giocatore può trascinarla e ingrandirla con le
  dita; un tasto torna alla foto intera. La vista iniziale 4:5 è eliminata, anche da «Inquadratura».
- Il giocatore deve poter vedere la foto intera, non solo il ritaglio.
- Niente swipe per rispondere: il dito sposta la foto.
- La copia di gioco è la foto ritagliata al più vicino di un insieme di formati comuni.
- Il formato di una REAL è la scelta del fotografo per il soggetto; per una SLOP deve valere lo stesso: il contesto fisso dei prompt
  dice che il formato deve essere adatto al soggetto rappresentato.

Motivo: con la 3.0.1 le REAL vengono composte dal fotografo e poi tagliate in 4:5, mentre le SLOP nascono già composte per il 4:5.
È un indizio di composizione, che sparisce se entrambe arrivano nel loro formato.

Motivo della 5.0.0: il riquadro 4:5 sul telefono reintroduceva un taglio, scelto dall'owner con la vista iniziale, e metteva in
svantaggio chi gioca sul telefono, che doveva trascinare la foto mentre il tempo scorre, rispetto a chi gioca sul computer e la vede
subito intera. La classifica mette insieme i due tipi di schermo.

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
- **Inquadratura**, nel passo 2 del wizard REAL e nella sezione Database: un solo riquadro, il **ritaglio** al formato (centrato
  all'inizio; l'owner lo sposta o lo rimpicciolisce, il formato resta quello scelto; può cambiare formato tra quelli dell'insieme).
  Colonna `copy_crop` (`{x, y, width, height, format}`). Salvare lo stesso ritaglio non invia nulla: copia e statistiche restano.
- **Niente vista iniziale.** La colonna `copy_view` (migrazione 0046) resta nello schema, inutilizzata: una nuova copia la svuota,
  la scheda dell'immagine non la riporta, `POST /:id/view` non esiste più (404) e il parametro `view` di `POST /:id/copy` è ignorato.
  Nessuna migrazione: togliere la colonna non serve e una migrazione distruttiva non porterebbe nulla.
- Il server verifica che il formato sia nell'insieme e che le dimensioni della copia corrispondano al ritaglio.

## 4. SLOP

- Il **contesto fisso dei prompt SLOP** (Impostazioni) aggiunge: «Scegli il formato più adatto al soggetto, come farebbe un fotografo:
  orizzontale per paesaggi e scene larghe, verticale per persone in piedi, edifici alti, ritratti; quadrato solo se il soggetto lo
  chiede». Il testo è dell'owner e si salva come nuova versione; il codice aggiorna solo la proposta.
- Il **formato della risposta** (nel codice) aggiunge a ogni prompt il campo `format`, uno dei sette. Un valore fuori dall'insieme è
  un errore del modello di testo, come oggi un JSON non valido.
- I modelli di immagini con dimensioni libere (GPT Image 2, 2.5, 2.6) generano nella dimensione della sezione 2. Gli altri in elenco
  (GPT Image 1.5, 1 mini, `chatgpt-image-latest`) hanno solo 1024 × 1024, 1536 × 1024 e 1024 × 1536: con loro il modello di testo
  riceve solo 1:1, 3:2 e 2:3.
- Il proprietario può cambiare il formato di ogni prompt nello studio, senza costi.
- I prompt scritti prima di questa versione non hanno formato: le loro immagini si generano in 3:4, il formato più vicino al 4:5 per cui
  erano stati scritti.
- Rigenerare una SLOP dalla sezione Database usa il formato della sua copia attuale.
- La proposta del codice per il contesto fisso (`worker/model-context.v1.2.0.ts`) contiene la frase sul formato e, per le didascalie,
  l'apertura con luogo e data seguiti da un punto («Parigi, 17 ottobre 2026.»; decisione dell'owner del 2026-11-13). Restano proposte:
  valgono quando l'owner le salva dalle Impostazioni.

## 5. Partita

- **Ogni schermo**, verticale o orizzontale: il riquadro ha il formato della copia e la foto entra intera nello spazio disponibile,
  in larghezza e in altezza, così che didascalia e pulsanti restino visibili. Una foto orizzontale su un telefono verticale è più
  piccola del vecchio riquadro 4:5 (un 16:9 largo 390 px è alto circa 220 px), ma si vede tutta.
- **Esplorare:** un dito (o il mouse) trascina la foto ingrandita, due dita (o la rotella) ingrandiscono e rimpiccioliscono, dalla foto
  intera fino a due pixel CSS per pixel della copia, mai meno di 4 volte (circa 8 volte per un 16:9 sul telefono). Un doppio tocco (o
  doppio clic) ingrandisce 2,5 volte sul punto toccato; su una foto già ingrandita torna alla foto intera. Il tasto «Foto intera»,
  sotto il riquadro, torna alla foto intera ed è attivo solo dopo uno spostamento. La didascalia resta sotto.
- Un round non conserva più una vista (la colonna `copy_view` di `game_rounds` resta, inutilizzata); conserva didascalia e copia.
- **Risposte:** pulsanti REAL e SLOP sempre visibili, anche sul telefono; tasti R e S sul computer. Lo swipe è eliminato.
- Il tempo del round scorre mentre il giocatore esplora: esplorare costa tempo, come guardare.
- **Lista finale:** le foto della partita si vedono intere, nel loro formato (prima erano tagliate in un riquadro 4:5).
- Le partite in corso al rilascio continuano con le loro copie; la vista eventualmente salvata nei loro round è ignorata.

## 6. Licenze ND

Restano escluse: il ritaglio al formato più vicino è comunque una modifica della foto.

## 7. Passaggio dalle copie 4:5

- Le copie 4:5 esistenti restano giocabili finché l'owner non le rifà, mostrate intere: un 4:5 nella partita indica una copia vecchia,
  non l'origine, perché fino al rilascio REAL e SLOP erano tutte 4:5. Approvare o ripubblicare un'immagine richiede invece una copia
  della ricetta nuova.
- Con l'app 1.19.0 il filtro «Copia: da rifare» e il comando di gruppo «Rifai le copie» hanno rifatto le copie 4:5. Il 2026-11-13 l'owner
  ha comunicato che non ne resta nessuna: dall'app 1.21.0 filtro, comando e segno «copia da rifare» sono tolti. Il server continua a
  rifiutare l'approvazione e la pubblicazione di una copia senza formato. Dalla 5.0.0 il gioco mostra intera ogni copia.
- Le SLOP già generate in 4:5 vengono ritagliate a 3:4 (perdono circa il 6% dell'altezza); quelle in 2:3 restano intere.

## 8. Rischi e limiti

- **Distribuzione dei formati.** Se il modello di testo sceglie formati diversi da quelli dei fotografi (per esempio quasi sempre 3:2),
  la frequenza dei formati diventa un indizio statistico. Proposta: nelle Statistiche, sotto «Equilibrio del catalogo», la
  distribuzione dei formati tra REAL e SLOP pubblicate, per correggere il contesto fisso se divergono.
- **Composizione.** Il ritaglio al formato più vicino toglie poco a una REAL (al massimo circa il 13% di un lato), tranne le panoramiche più larghe del 16:9: una foto 3:1 perde circa il 40% della larghezza.
- **Costo.** Le dimensioni della sezione 2 hanno tra 1,3 e 2,4 milioni di pixel, contro 1,3 milioni del 1024 × 1280 di oggi: il costo
  di un'immagine cambia con la dimensione. Non è stimato.
- **GPT Image 2.5:** vincoli sulle dimensioni non documentati nella guida (sezione 2).
- **Foto piccole sul telefono:** le foto orizzontali occupano meno spazio del vecchio riquadro 4:5 e alcuni indizi (mani, scritte,
  texture) si vedono solo ingrandendo. Il doppio tocco serve a questo; in 5 secondi (livello Esperto) resta difficile, ma vale per
  REAL e SLOP allo stesso modo e per tutti i giocatori dello stesso schermo.
- **Formato come indizio:** il formato è ora visibile anche sul telefono. Vale il rischio sulla distribuzione dei formati descritto
  sopra, già controllato nelle Statistiche.

## 9. Verifiche

Test unitari `tests/game-copy.v3.0.0.test.ts` (formato più vicino, ritagli, dimensioni, dimensioni del generatore per modello; le
funzioni della vista restano in `shared/game-copy.v3.0.0.ts`, inutilizzate dal codice vigente). Integrazione con l'encoder di prova
`tests/game_copy_v3_0_0.py`: `library.v1.8.0` (copie senza vista, parametro `view` ignorato, `POST /:id/view` 404, `copy_view` svuotata),
`game.v2.3.0` (foto senza vista), `slop.v1.3.0`, `database.v1.3.0`, `stats.v1.2.0`. Nel browser, desktop e mobile:
`database_browser.v1.5.0` (formato e ritaglio in un solo riquadro; lo stesso ritaglio non rifà la copia) e `game_browser.v1.3.0`
(riquadro nel formato della copia anche sul telefono, zoom con due dita, rotella e doppio tocco, «Foto intera», foto intere nella lista
finale, pulsanti sul telefono).

## 10. Codice

`src/photo-viewer.v2.0.0.ts` (foto intera, zoom, doppio tocco), `src/play.v2.3.0.ts` e `src/play.v2.3.0.css`,
`src/crop-editor.v3.0.0.ts` (solo ritaglio), `src/game-copy.v3.1.0.ts` (salvataggio dell'inquadratura), `src/library.v1.19.0.ts`,
`src/real-wizard.v1.14.0.ts`; nel Worker `worker/library.v1.18.0.ts` e `worker/game.v2.3.0.ts`, con `analysis.v1.18.0`,
`slop-generation.v1.9.0` e `slop.v1.10.0` invariati salvo l'import della libreria.
