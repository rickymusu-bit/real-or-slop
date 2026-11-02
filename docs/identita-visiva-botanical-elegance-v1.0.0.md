# Real or Slop — Identità visiva «Botanical Elegance» v1.0.0

**Stato:** design approvato; implementazione colori e classi UI sul branch `design/botanical-elegance-v1`.  
**Data:** 2026-11-02 (Europe/Rome)  
**Ambito:** sola interfaccia, brand, asset editoriali della mascotte; nessuna modifica alla pipeline REAL/SLOP, all'API o ai dati.

## 1. Concetto

**REAL** è una fotografia acquisita dal mondo reale, non necessariamente analogica. **SLOP** è un'immagine creata sinteticamente. I colori sono *identità dell'origine*, non voti di qualità e non indicatori automatici di risposta corretta.

Il sistema visivo è «Digital Gallery» evoluto in «Botanical Elegance»: galleria scura e sobria, con verde naturale per REAL e gradiente fucsia/rosa per SLOP. Le fotografie restano sempre protagoniste, senza filtri decorativi.

## 2. Mascotte approvata: due raganelle distinte

Il soggetto **non** è più una rana divisa a metà. Sono **due** raganelle sovrapposte, con la più piccola seduta affettuosamente sul dorso della più grande:

- **Rana inferiore — REAL:** più grande, verde botanico/oliva, pelle anfibia naturale e lucida, occhi espressivi; **nessun** tratto fantastico.
- **Rana superiore — SLOP:** più piccola (indicativamente 55–65% della larghezza della rana inferiore), fucsia/rosa, rivestimento di piume sottili, ali di **uccello** con remiganti riconoscibili, zampe artigliate aviane. Nessun elemento horror, corna, glitch, ali da insetto o tecnologia.
- Le due rane rimangono individui distinti, non si fondono mai. Il rapporto di dimensioni e i tratti del volto restano coerenti in ogni posa.
- **Stile render:** semi-fotorealistico raffinato per le illustrazioni principali; geometrico/minimal per l'icona. Atteggiamento curioso, affettuoso, non infantile.

### 2.1 Asset approvati dall'utente (presenti in `public/brand/`)

| Ruolo | File sorgente fornito | Destinazione convenzionale | Formato |
|---|---|---|---|
| Mascotte completa | `Rane realistiche in volo rosa e verde.png` | `public/brand/mascot-real-slop-v1.0.0.png` | PNG RGBA quadrato 1254×1254 |
| Copertina | `Rane incantate nella foresta pluviale.png` | `public/brand/hero-real-slop-v1.0.0.png` | PNG RGB 1672×941 (16:9) |
| Logo / illustrazione stilizzata | `Rane adorabili con ali rosa.png` | `public/brand/logo-real-slop-v1.0.0.png` | PNG RGBA quadrato 1254×1254 |

**Stato:** i tre PNG sono versionati dal commit `c16b2a5`; hash, decodifica, dimensioni e trasparenza sono stati verificati direttamente. La build continua a verificare la loro identità prima di attivare il brand. Non usare immagini mancanti, URL temporanei o sostituti. Conservare una copia senza ritagli degli originali. Il PNG stilizzato resta un'**illustrazione raster**, non va dichiarato SVG vettoriale.

### 2.2 Impieghi consentiti

- **Hero:** immagine forestale 16:9, rana a destra e spazio negativo a sinistra, testo HTML indipendente, non incorporato nell'immagine. Desktop: `object-fit: cover`, punto focale sulla rana; mobile: preferire crop mirato o immagine in blocco separato, mai tagliare gli occhi e le ali.
- **Mascotte:** PNG trasparente in home, introduzioni, onboarding e stati vuoti. Non introdurre ombre pesanti o sfondi a scacchi.
- **Logo:** PNG stilizzato nel marchio/header, come app icon di grandi dimensioni. Favicon: derivati PNG trasparenti separati a 16/32 px, ispezionati in Chromium su sfondo chiaro/scuro. A 16 px si riconoscono silhouette e colori, non i dettagli del volto; a 32 px la coppia è più leggibile. Gli originali restano integri.
- **Mai** utilizzare queste immagini come prova di fotografie REAL nel catalogo. Sono asset di branding generati sinteticamente.

### 2.3 Integrazione della home e fallback sicuro

La home e il marchio sono integrati in `src/main.ts`. `vite.config.ts` definisce `__ROS_BRAND_READY__` in base alla presenza e **identità SHA-256 esatta** di tutti e tre gli asset in `public/brand/`.

- Tutti e tre i PNG corretti → header con logo stilizzato, hero fotografica con overlay testuale accessibile, mascotte trasparente nella sezione modalità, favicon PNG.
- Uno o più PNG assenti → visualizzazione demo senza richieste 404. Se tutti e tre sono presenti ma un hash differisce, la build fallisce.
- La hero usa copy HTML indipendente: su desktop il testo sta nella zona scura a sinistra e le rane a destra; su tablet e smartphone (fino a 960 px) il contenuto testuale precede l'immagine in un blocco 16:9.
- L'icona del brand è decorativa dentro il link il cui nome accessibile è già `REAL or SLOP, inizio`. Anche la mascotte e la cover hanno `alt=""` quando decorano contenuti esplicativi già presenti.
- L'attivazione di asset non equivale a inserimento nel catalogo REAL/AI. Le illustrazioni rimangono marcate come branding, e la demo continua a dichiarare le risposte simulate.

La build non obbliga a possedere asset grafici nel checkout, ma con gli asset presenti non tollera sostituzioni silenziose: la loro integrità è verificata.

### 2.4 Derivati e performance

- Pubblicare derivati WebP/AVIF opzionali solo dopo confronto visivo con gli originali; lasciare accessibili i PNG master.
- Hero responsiva: `srcset` circa 640 / 960 / 1440 / 1672 px, `sizes` esplicito, `decoding="async"`; preload/fetchpriority alto **solo se è davvero LCP**.
- Mascotte: `width`/`height`, trasparenza alfa conservata; non caricare il PNG full-res se un derivato più piccolo basta.
- Non aggiungere filtri CSS, tinte o distorsioni all'immagine. Riservare eventuali glow SLOP ad aree decorative esterne.
- Tenere distinti gli asset del brand dalle immagini di gioco e dagli originali in quarantena o R2.

## 3. Palette e token CSS

Definizione canonica: `src/style.css` (`:root`).

| Token | Valore | Semantica |
|---|---|---|
| `--bg` | `#0F1115` | Fondo principale |
| `--surface` | `#1A1D24` | Card, pannelli, dialog |
| `--surface-2` | `#232733` | Livello rialzato |
| `--text` | `#F3F5F7` | Testo |
| `--muted` | `#B8BEC8` | Testo secondario |
| `--real` | `#6F8A57` | Verde REAL principale |
| `--real-hover` | `#596F46` | Verde scuro opzionale (non per testo piccolo) |
| `--real-soft` | `#A6BA92` | Evidenze e link accessibili |
| `--slop` | `#DA2B91` | Fucsia SLOP principale |
| `--slop-soft` | `#FF87D2` | Rosa chiaro, testo/accenni |
| `--slop-control` | `#E83CA0` | Fucsia più luminoso per controlli |
| `--slop-gradient` | 135° `#DA2B91 → #FF87D2` | Brand e decorazione |
| `--slop-control-gradient` | 135° `#E83CA0 → #FF87D2` | Pulsanti e aree con etichette piccole |
| `--hairline` | `#343943` | Divisori |
| `--control-border` | `#747D8C` | Bordi controlli |
| `--focus-ring` | `#D4E2BE` | Focus tastiera |
| `--error` | `#FFB5A5` | Errori indipendenti dalla natura REAL/SLOP |

**Regole:** il verde non deve diventare lime o turchese. Il rosa va concentrato su SLOP, non applicato universalmente. Lo sfondo resta neutro e quasi nero. Non usare colore come unico vettore d'informazione.

## 4. Componenti principali

| Elemento | Classe/stato | Trattamento |
|---|---|---|
| Marca testuale | `.brand-real`, `.brand-slop`, `.brand-or` | Verde naturale, gradiente rosa, «or» neutro |
| Header / navigazione | `header`, `header nav a` | Sfondo neutro, link sobri, focus visibile |
| Hero | `.hero`, `.ros-hero-art`, `.ros-mascot` | Testo HTML e foto di brand separati |
| CTA generica | `.primary` | Verde, testo scuro; hover più chiaro |
| CTA SLOP esplicita | `.ros-button-slop` | Gradiente rosa leggibile |
| Scelta partita | `.choices .choice-real`, `.choices .choice-slop` | Pari area, testo esplicito REAL/SLOP |
| Card/modalità | `.mode-card`, `.ros-surface` | Superficie neutra, bordi discreti |
| Badge di provenienza | `.badge-real`, `.badge-slop` | Testo + colore (non solo colore) |
| Progresso/timer | `.round-progress`, `.ros-timer-warning` | Progresso neutro/verde, scadenza in colore di stato |
| Risultati/feedback | `.feedback`, `.ros-feedback[data-source]` | Contenuto chiaro; bordo REAL/SLOP facoltativo per *origine* |
| Galleria di gioco | `.play-image` | Immagine intera, `object-fit: contain`, senza filtri |
| Controlli | `input`, `select`, `textarea`, `.chip` | Contrasto, focus visibile, touch ergonomico |

**Attenzione:** `data-source="REAL"` / `data-source="AI"` descrive il tipo di immagine; **mai** associare verde = risposta giusta o rosa = risposta sbagliata. I valori API/DB rimangono `REAL` e `AI`, mentre la UI mostra `REAL` e `SLOP`.

### 4.1 Esempi markup (dopo caricamento degli asset)

```html
<img class="ros-hero-art" src="/brand/hero-real-slop-v1.0.0.png"
     width="1672" height="941" alt="" />
<img class="ros-mascot" src="/brand/mascot-real-slop-v1.0.0.png"
     width="1254" height="1254"
     alt="Una rana verde porta sul dorso una piccola rana rosa piumata con ali da uccello." />
<span class="badge-real">REAL</span>
<span class="badge-slop">SLOP</span>
<button class="ros-button-slop" type="button">SLOP</button>
```

Se la copertina è meramente decorativa e lo stesso significato compare nel testo vicino, usare `alt=""`. Se la mascotte comunica contenuto nuovo, descriverla in modo conciso. L'icona nel link di home può avere `alt=""` se il link ha già il nome accessibile del sito.

## 5. Tipografia, spaziatura, interazione

- **Space Grotesk Bold** per nome, titoli, punteggi; **Inter 400/600** per UI e testo. WOFF2 locali già nel progetto: non aggiungere font remoti.
- Spaziatura di base multipli di 4 px; contenitore massimo 1440 px; pannelli sobri con raggio 4 px, eventuali pill per badge.
- Azioni principali min 48 px, pulsanti di risposta min 56 px, equivalenza tra le due opzioni; niente fucsia più «premiabile» del verde.
- `:focus-visible` evidente; hover non necessario su touch; disabled non rappresentato con il solo colore; messaggi ARIA per risultato e attesa PvP.
- Animazioni brevi soltanto dopo risposta o negli elementi di brand non invasivi; `prefers-reduced-motion` sempre rispettato.

## 6. Accessibilità e test

Rapporti indicativi WCAG (sRGB):
- Testo principale su sfondo: circa **17,29:1**.
- Testo secondario su superficie: circa **9,03:1**.
- Testo quasi nero su REAL principale: circa **4,90:1**.
- Testo quasi nero su `--slop-control`: circa **5,03:1**.
- `--slop` scuro con testo scuro: circa **4,26:1**, **non** usare per pulsanti con testo piccolo senza adeguare colore/fondo; per questo esiste `--slop-control`.

Verificare in Chromium su 1440×1000, 768×1024, 390×844, 360×640 e zoom browser; controllare il crop dell'hero, trasparenze, lettura a 32 px, focus, contrasto e navigazione tastiera. Il test della composizione non equivale a una certificazione WCAG.

Eseguire in checkout con dipendenze installate:

```sh
npm run lint
npm test
npm run build
npm run test:gallery
```

Non eseguire deploy remoto o mutazioni Cloudflare come effetto di un aggiornamento grafico.

## 7. Versioni e governance

Nome versione: `major.minor.patch`; documentazione dedicata per revisioni importanti, asset derivati versionati, originale conservato. L'ultima versione approvata prevale su `docs/digital-gallery-v1.0.0.md` **solo** per palette, mascotte e aspetto visivo; restano validi i vincoli di copyright, immagini integre, accessibilità, demo esplicitamente dichiarata e regole del gioco.

Non fondere il branch in produzione senza verifica visiva e approvazione del proprietario.
