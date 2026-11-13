# Niente didascalie, inquadratura come passo del wizard, caricamento della dashboard — specifica 1.0.0

Stato: decisioni dell'owner del 2026-11-13; testo proposto con la PR dell'app 1.23.0, vigente al merge. Migrazione
`0047_remove_captions.v1.0.0.sql`. Aggiornata: 2026-11-13T22:00:00Z.
Modifica `docs/libreria-immagini.v1.8.0.md` (didascalia, sezioni 4 e 10), `docs/dashboard-admin-wizard-real.v1.3.0.md` (passi del
wizard), `docs/gioco-a-livelli.v1.0.1.md` (foto con didascalia), `docs/database-immagini.v1.0.1.md` (campo didascalia) e
`docs/wizard-slop.v1.4.1.md` (analisi delle SLOP). Dove quei testi parlano di didascalie, vale questa specifica.

## 1. Decisioni dell'owner (2026-11-13)

1. «Segnala il caricamento della dashboard, non lasciare tutto vuoto.»
2. «Metti un tasto alla fine della barra di ricerca delle immagini di Commons per cancellare il contenuto.»
3. «Togliamo le didascalie», precisato: ovunque, e quelle già scritte vengono cancellate.
4. «La scelta dell'inquadratura dovrebbe essere un passaggio separato del wizard, dopo l'acquisizione e la scrittura dei tag.»

## 2. Niente didascalie

- **Partita:** sotto la foto non c'è testo; nemmeno nella lista finale. Il server non invia didascalie.
- **Analisi a pagamento:** il modello di testo riceve la richiesta dei soli tag (schema JSON con il solo campo `tags`); una
  didascalia nella risposta è ignorata. Una generazione sostituisce solo i tag; «Ripristina i tag generati» riporta quelli.
- **Dashboard:** nessun campo didascalia nel wizard REAL, nella sezione Database e nella revisione delle SLOP. Approvare richiede
  copia di gioco e almeno un tag. `PATCH` con `caption` è rifiutato («Campi non previsti»).
- **Contesto dei modelli:** la proposta del codice (`worker/model-context.v1.3.0.ts`) non chiede più la didascalia. Le versioni salvate
  sono testi dell'owner e restano come sono: se la versione vigente della parte «Tag» (prima «Tag e didascalie») parla ancora di
  didascalie, il modello riceve istruzioni inutili ma risponde comunque con i soli tag. Conviene salvarne una nuova dalle
  Impostazioni.
- **Dati:** la migrazione 0047 svuota `images.caption`, `images.generated_caption` e `game_rounds.caption`. Le colonne restano, inutilizzate:
  toglierle ricostruirebbe la tabella delle immagini senza vantaggi. **Non reversibile**: le didascalie scritte finora sono perse.
- `shared/caption.v1.0.0.ts` resta nel codice, non più usato dalle versioni vigenti.

## 3. Wizard REAL in quattro passi

1. **Seleziona le immagini** (ricerca su Commons e link incollati), come prima.
2. **Tag**: tag a mano o generati con l'IA, «Togli dal caricamento». Si passa al 3 solo se ogni foto ha almeno un tag; l'avviso
   sul tag di Tempo mancante resta un avviso.
3. **Inquadratura**: ogni foto con la sua copia di gioco (già ritagliata al formato comune più vicino all'acquisizione), il formato e
   le dimensioni; «Cambia inquadratura» apre l'editor di formato e ritaglio (`src/crop-editor.v3.0.0.ts`); «Prepara la copia di gioco»
   se manca. Si passa al 4 solo se ogni foto ha la copia.
4. **Riepilogo e pubblicazione**, come prima, senza didascalie.

«Indietro» torna al passo precedente. La bozza nella sessione del browser ricorda il passo.

## 4. Ricerca su Commons

Il campo di ricerca termina con un tasto «×» (etichetta «Cancella la ricerca»), visibile solo quando il campo non è vuoto: svuota il
campo e ci rimette il cursore; risultati e selezione restano. Il tasto nativo del browser è nascosto, perché sui telefoni manca.

## 5. Caricamento della dashboard

- Accanto al titolo «Caricamento della dashboard…», con un piccolo indicatore che gira (fermo con «riduci movimento»), finché
  tutte le sezioni non sono pronte.
- Ogni sezione ha il suo segnaposto («Caricamento del wizard…», «Caricamento delle immagini…», «Caricamento dello studio SLOP…»,
  Statistiche, contesto dei modelli), sostituito dal contenuto.
- Il wizard REAL, la sezione che si vede per prima, si monta per primo.

## 6. Verifiche

Integrazione: `library.v1.9.0`, `analysis.v1.9.0`, `database.v1.4.0`, `game.v2.4.0` (catalogo di prova `catalog_v1_2_0.py`). Nel
browser, desktop e mobile: `library_browser.v1.14.0` (caricamento, niente campo didascalia), `real_wizard.v1.14.0` (quattro passi,
inquadratura, tasto che svuota la ricerca), `slop_browser.v1.3.0`, `database_browser.v1.6.0`, `game_browser.v1.4.0`.

## 7. Codice

Worker: `library.v1.19.0`, `analysis.v1.19.0`, `game.v2.4.0`, `model-context.v1.3.0`, `slop-generation.v1.10.0`, `slop.v1.11.0`.
Browser: `library.v1.22.0`, `real-wizard.v1.16.0` (CSS `real-wizard.v1.6.0.css`), `play.v2.4.0`, `slop-studio.v1.5.0`,
`slop-auto.v1.2.0`, `stats.v1.2.0`, `admin-loading.v1.0.0.css`.
