# Anteprima a pressione prolungata, selezione immediata, descrizione delle REAL, tag di partenza delle SLOP — specifica 1.1.0

Stato: decisioni dell'owner del 2026-11-14; testo proposto con la PR dell'app 1.24.0, vigente al merge. Nessuna migrazione.
Aggiornata: 2026-11-14T10:00:00Z. Precedente: `docs/anteprima-descrizione.v1.0.0.md`. 1.1.0: sezione 6, persone nelle SLOP (testo
proposto dei prompt SLOP); verifiche e codice nelle sezioni 7 e 8.
Modifica `docs/didascalie-wizard.v1.0.0.md` (sezione 4, tasto che svuota la ricerca), `docs/dashboard-admin-wizard-real.v1.3.0.md`
(passi 1 e 2 del wizard), `docs/database-immagini.v1.0.1.md` (schede e dettaglio), `docs/wizard-slop.v1.4.1.md` (revisione) e
`docs/gioco-a-livelli.v1.0.1.md` (lista finale); precisa la sezione 11.1 di `docs/libreria-immagini.v1.8.0.md` (persone e minori nelle SLOP). Dove quei testi dicono altro, vale questa specifica.

## 1. Decisioni dell'owner (2026-11-14)

1. «La x per cancellare il testo nella casella di ricerca deve stare in una casella separata alla fine della casella di testo, perché
   se no copre il testo della ricerca.»
2. «Una pressione prolungata sulla foto ingrandisce il thumbnail, al di sotto del quale c'è il titolo, la descrizione e il link alla
   pagina di Commons dell'originale. La finestra rimane aperta e si chiude schiacciando una x in un angolo.»
3. «La pressione veloce seleziona l'immagine (spunta verde nella casella nell'angolo) e viene subito messa nella sezione sottostante
   delle immagini selezionate.» Prima, spuntata una foto, una nuova ricerca la faceva sparire.
4. L'ingrandimento con la pressione prolungata vale anche per le immagini del Database e per quelle della generazione SLOP.
5. Per le SLOP generate automaticamente l'owner vuole vedere i tag di partenza.
6. La descrizione delle REAL si modifica durante il caricamento e si mostra nello svelamento alla fine della partita.
7. «Metti la nuova formulazione come proposta nel codice»: il testo dei prompt SLOP della sezione 6.

Il ritiro del 2026-11-13 di un'anteprima a pressione prolungata (wizard 1.9.0) riguardava un'altra soluzione: l'anteprima si chiudeva
al rilascio e non mostrava testi. Questa la sostituisce.

## 2. Ricerca su Commons

- **Tasto «×»** (etichetta «Cancella la ricerca»): una casella a sé, attaccata alla fine del campo, alta come il campo. È sempre
  presente e resta disattivato finché il campo è vuoto, così il campo non cambia larghezza mentre si scrive. Svuota il campo e ci
  rimette il cursore; risultati e selezione restano.
- **Tocco breve** su una miniatura: la spunta (casella nell'angolo, colore REAL) e la aggiunge subito a «Immagini selezionate». Un
  secondo tocco, oppure «×» sulla miniatura scelta, la toglie. Non c'è più il pulsante «Aggiungi le selezionate».
- **La selezione resta** cambiando pagina e con una nuova ricerca; si svuota con l'acquisizione (passo 2) o con «Inizia un nuovo
  caricamento». Limite di 100 immagini per caricamento, come prima.
- Spuntare una foto aggiorna solo la sezione delle selezionate: la griglia dei risultati non torna in cima.

## 3. Anteprima a pressione prolungata

Codice comune: `src/image-preview.v1.0.0.ts`.

- **Gesto:** dito o tasto sinistro premuto per 500 ms senza spostarsi (più di 10 px annulla, come lo scorrimento). Si apre anche
  con il tasto destro e con il tasto del menu contestuale (Maiusc+F10), per chi usa la tastiera.
- **Finestra:** l'immagine grande, larga quanto la finestra e alta al più il 70% dello schermo; sotto, i testi. Resta aperta dopo il
  rilascio e si chiude con «×» nell'angolo in alto a destra (anche con Esc). Il tocco sullo sfondo non la chiude.
- **Il tocco breve conserva il suo significato:** il clic che segue una pressione prolungata viene ignorato, quindi la foto non si
  spunta (wizard) e il dettaglio non si apre (Database). Il menu di sistema del telefono (salva immagine, condividi) non compare.
- **Contenuti:**
  - risultato di Commons: anteprima da 1280 px (o l'originale se più piccolo), titolo del file, descrizione di Commons (i primi 300
    caratteri, come li restituisce la ricerca), «Apri la pagina su Commons»;
  - REAL del Database: copia di gioco, titolo, descrizione salvata, «Apri la pagina su Commons» se la fonte c'è;
  - SLOP del Database: copia di gioco, titolo, prompt, tag di partenza (sezione 5);
  - immagine della revisione nello studio SLOP: prompt, tag di partenza, tag dell'analisi.
- Nel gioco la pressione prolungata sulle foto resta bloccata (sezione 11.3 di `docs/libreria-immagini.v1.8.0.md`): l'anteprima
  esiste solo nella dashboard.

## 4. Descrizione delle REAL

- **Wizard, passo 2:** sotto il titolo, il campo «Descrizione (la leggono i giocatori alla fine della partita)», fino a 1000
  caratteri, precompilato con la descrizione di Commons. Si salva uscendo dal campo («Descrizione salvata.»); un testo non ancora
  salvato sopravvive al ridisegno della pagina. Le modifiche di una foto partono una dopo l'altra, ciascuna con la revisione più
  recente, perciò una descrizione e un tag salvati di seguito non entrano in conflitto. I metadati in fondo alla scheda («Titolo e
  metadati») non ripetono più la descrizione.
- **Riepilogo (passo 4):** ogni foto mostra la descrizione sopra i tag, oppure «Nessuna descrizione.».
- **Database:** il campo «Descrizione» del dettaglio c'era già e vale lo stesso testo.
- **Fine partita:** nella lista finale ogni REAL mostra la descrizione sopra titolo, autore, licenza e fonte; una REAL senza
  descrizione non mostra nulla al suo posto. Le SLOP mostrano il prompt, come prima. Il server la invia solo dopo la fine
  (`worker/game.v2.5.0.ts`); durante la partita nessun testo accompagna la foto.
- La descrizione è un testo dell'owner, mostrato in un paragrafo distinto dai crediti dell'autore: corretta o riscritta, non va
  attribuita all'autore della foto.

## 5. Tag di partenza delle SLOP

- Sono il **tema** e i tag dello **slot** da cui il modello di testo ha scritto il prompt (`generation.slot` della vista
  dell'immagine, già salvato dalla migrazione 0040). Valgono per ogni SLOP generata, dai batch automatici e dallo studio; una SLOP
  caricata a mano non ne ha.
- Si vedono nel dettaglio del Database (sotto i tag, «Tag di partenza», con la nota che i tag dell'immagine sono quelli
  dell'analisi) e nell'anteprima; i tag del tema hanno l'indicazione «tema». Il colore è quello della categoria.
- Sola lettura: i tag dell'immagine restano quelli dell'analisi (`docs/wizard-slop.v1.4.1.md`).

## 6. Persone nelle SLOP (testo proposto dei prompt SLOP)

**Problema.** Nel batch automatico del 2026-11-14 (tag `color`) tutti e 10 i prompt chiudevano con «faces are indistinct», «no
recognizable faces», «faces turned away» o simili, e tutti descrivevano persone «adult». Il testo in vigore diceva «Solo figure
plausibili e non riconoscibili», che il modello di testo legge come «volti non visibili», e «mai minori», che legge come «nessun
minore», mentre la sezione 11.1 vieta solo la nudità che riguardi minori. Volti nascosti e assenza di bambini diventano un indizio
dell'origine per i giocatori.

**Regola, invariata nella sostanza.** Escluse le persone vive o morte da meno di 50 anni. Conta la somiglianza, non il nome: una SLOP
che somiglia in modo riconoscibile a una persona reale la ritrae anche senza didascalia. «Non riconoscibile» significa «non
identificabile con una persona reale», non «con il volto nascosto».

**Testo proposto** (`worker/model-context.v1.5.0.ts`), due righe cambiate:

- «Persone vive o morte da meno di 50 anni: mai. Le persone nella scena sono inventate: volti visibili e naturali, coerenti con epoca
  e luogo, come in una vera fotografia, ma senza somiglianza con persone reali identificabili. Non nascondere i volti e non
  descriverli come indistinti.»
- «Nudità: nessuna nudità umana, tranne nelle opere d'arte presenti nella scena (statue, dipinti, affreschi); mai contenuti sessuali;
  mai nudità che riguardi minori.»

Resta una proposta: Impostazioni, «Contesto dei modelli», parte «Prompt per le SLOP», la mostra accanto al testo in vigore finché
l'owner non la salva. Le versioni salvate restano nello storico. Il generatore di immagini applica le proprie regole e può ancora
sfocare o girare qualche volto: si corregge in revisione o rigenerando.

## 7. Verifiche

Integrazione: `game.v2.5.0` (descrizione nei crediti delle REAL, nessuna per le SLOP; catalogo di prova `catalog_v1_3_0.py`). Nel
browser, desktop e mobile, con pressione prolungata del dito (eventi touch di Chrome) sul telefono e del mouse sul computer
(`tests/long_press_v1_0_0.py`): `real_wizard.v1.15.0` (casella «×» accanto al campo, tocco che aggiunge subito, selezione conservata
da una nuova ricerca, anteprima che resta aperta e non spunta, descrizione modificata e nel riepilogo), `database_browser.v1.7.0`
(anteprima di REAL e SLOP, il dettaglio non si apre), `slop_browser.v1.4.0` (anteprima della revisione), `slop_auto_browser.v1.1.0`
(tag di partenza nel dettaglio e nell'anteprima), `game_browser.v1.5.0` (descrizioni nella lista finale). `scripts/integration.py` 2.9.0.

## 8. Codice

Browser: `image-preview.v1.0.0` (con CSS), `real-wizard.v1.17.0` (CSS `real-wizard.v1.7.0.css`), `library.v1.23.0`,
`slop-studio.v1.6.0`, `play.v2.5.0` (CSS `play.v2.4.0.css`). Worker: `game.v2.5.0`, `model-context.v1.5.0` e, per importarlo,
`library.v1.21.0`, `analysis.v1.21.0`, `slop.v1.13.0`, `slop-generation.v1.12.0` (stesso comportamento). App 1.24.0.
