# Digital Gallery — v1.0.0

Applicazione **0.9.0**, prompt 4. Implementa esclusivamente la parte grafica delle [istruzioni approvate](istruzioni-codex-tema-precaricamento-v1.0.0.md). Il precaricamento, la preparazione server-side e le modifiche ai timer sono riservati al prompt 5. Nessun cambiamento a Worker, database, campionamento, assegnazioni o protocollo delle sessioni.

## Aspetto e immagini

Tema scuro predefinito con token centralizzati in `src/style.css`: sfondo `#0D0F14`, superficie `#1B2030`, testo `#F4F6FB`, testo secondario `#AAB4C5`, REAL `#54DEC8`, SLOP `#B892FF`, bordi `#30394C`. Il marchio REAL or SLOP usa due colonne della stessa ampiezza e un “or” più piccolo. Home, selezione modalità, gioco, risultati, PvP e pagine informative condividono tipografia e superfici; admin e studio ereditano gli stessi controlli.

Space Grotesk Bold per logo/titoli e Inter 400/600 per testi/interfaccia sono file WOFF2 locali, subset latino con accenti italiani, `font-display: swap` e fallback Arial/sans-serif. Versione Fontsource 5.3.0; licenze OFL 1.1 integrali e provenienza in [public/fonts](../public/fonts/README.md), collegate anche nei crediti. Nessun caricamento da servizi font esterni. Le frecce decorative della home sono SVG del progetto, indipendenti dalla copertura dei glifi del font.

Le immagini del gioco hanno `object-fit: contain`, fondo uniforme, nessun filtro, grana, ombra, ritaglio o trasformazione. Lo zoom conserva il fotogramma. La home riutilizza le illustrazioni geometriche originali come studi sintetici dichiarati: non introduce fotografie o immagini di catalogo. Le indicazioni demo restano visibili nelle modalità e durante la domanda.

REAL e SLOP hanno identiche dimensioni e gerarchia, colori diversi e testo esplicito. Il nome accessibile di SLOP include “generata con IA”. **Nei dati e nelle richieste rimangono `REAL` e `AI`**. Le scorciatoie restano R e I. Durante la domanda si mostrano round, progresso e punti, più timer quando previsto; in PvP restano anche i punteggi e lo stato della connessione. Le note sul catalogo sono apribili senza occupare tutta l'area immagine.

Header compatto e footer escluso dalla schermata di domanda lasciano spazio all'immagine; il footer rimane disponibile sulle altre pagine. L'altezza dell'immagine usa il viewport piccolo `svh`, con un limite minimo per non far sparire il soggetto. Nei viewport di prova la domanda non richiede scroll verticale. Schermi molto bassi, zoom del browser, messaggi lunghi o note aperte possono richiederlo: non vengono nascosti contenuti o disabilitato lo scorrimento. Dopo la risposta, spiegazioni e crediti possono scorrere normalmente.

## Accessibilità

- Contrasti sRGB misurati: testo/sfondo **17,73:1**, testo/superficie **14,99:1**, secondario/sfondo **9,17:1**, secondario/superficie **7,75:1**. Testo scuro su REAL **11,56:1**, su SLOP **7,84:1**. Bordi dei controlli/superficie **3,29:1**; i bordi decorativi più tenui non sono l'unico indicatore dei controlli.
- Link “Salta al contenuto”, focus visibile, focus sul contenuto dopo navigazione SPA e raggruppamento delle categorie con fieldset/legend. Link con target o download mantengono il comportamento nativo, incluse le licenze locali.
- Azioni principali almeno 48 px; risposte 56–60 px. Checkbox di categoria con etichetta cliccabile di almeno 44 px. Nomi distinti delle risposte e tasti mostrati senza dipendere dal colore.
- Immagine ingrandibile con Invio o Spazio, dialog chiudibile con Escape, ripristino del focus sull'immagine. Feedback singolo con `aria-live` e focus; reveal PvP come stato; progresso e timer con ruoli accessibili.
- Unica nuova animazione: ingresso breve del feedback, dopo risposta. `prefers-reduced-motion: reduce` elimina animazioni e transizioni. Nessuna animazione o modifica cosmetica dell'immagine prima della risposta.

L'albero di accessibilità Chromium è verificato automaticamente; non equivale a una prova con tutti gli screen reader o dispositivi assistivi. Il tema chiaro non è incluso.

## Verifica riproducibile

```sh
npm run lint
npm test
npm run build
npm run test:integration
ROS_TEST_PROFILE= npm run test:integration
npm run test:gallery
npm run deploy:check
```

`test:gallery` richiede un Chromium già installato, selezionabile con `CHROMIUM_PATH`; non installa browser o librerie. Usa CDP/WebSocket nativi, Worker/D1/R2/DO locali, stato separato `.wrangler/gallery`, porte 8789/9224 e profilo browser temporaneo. Avvia/chiude i propri processi, senza scrivere credenziali o toccare risorse remote. Eseguire le suite in sequenza: i comandi Wrangler usano lo stesso output `dist/` e l'hook di build.

Il controllo visita home, impostazioni delle tre modalità, informazioni e crediti a **1440×1000, 768×1024, 390×844 e 360×640**. Completa partite singole reali, verifica timer a tempo, crea due client PvP, controlla che il reveal attenda entrambi, verifica immagini integre, simmetria e nomi dei pulsanti, assenza di overflow, albero accessibile, tastiera/focus, movimento ridotto e richieste delle pagine soltanto locali. Screenshot e misure in `artifacts/gallery/`, ignorati da Git. Le altre integrazioni continuano a verificare autorizzazioni, timer server, idempotenza, anti-spoiler e riconnessione.

## Peso e limiti

Build Vite, dimensioni decimali arrotondate:

| Asset | 0.8.0 | 0.9.0 |
|---|---:|---:|
| CSS | 10,21 kB / 3,20 kB gzip | 12,88 kB / 3,85 kB gzip |
| JavaScript | 48,07 kB / 15,46 kB gzip | 49,47 kB / 15,91 kB gzip |
| Font locali | nessuno | 60,96 kB WOFF2 complessivi |

Le licenze aggiungono 8,88 kB di testo, scaricati soltanto se aperti. Le immagini e il loro trattamento sono invariati; nessuna nuova dipendenza applicativa. Questo confronto misura il costo del tema, non latenza, RAM o velocità di start. Non è stato eseguito un benchmark di preloading: timer e problemi di caricamento esistenti restano da affrontare nella fase successiva. Le prove usano fixture geometriche, non un catalogo fotografico verificato.

PR in bozza dal branch `codex/10-digital-gallery`, senza merge, pubblicazione o modifiche Cloudflare. Nessuna migrazione necessaria; un rollback del frontend ripristina il tema precedente senza conversione dei dati.
