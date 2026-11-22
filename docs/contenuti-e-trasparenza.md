# Contenuti delle SLOP e trasparenza — specifica 1.4.2

Stato: implementata nel ramo 1.57.0, da rilasciare. Aggiornata: 2026-11-22T18:00:00Z.
Valgono per ogni modello che produce contenuti del sito e per la revisione dell'owner.

## 1. Che cosa può comparire in una SLOP

- **Persone vive o morte da meno di 50 anni:** escluse. Conta la somiglianza, non il nome: una SLOP che somiglia in modo
  riconoscibile a una persona reale la ritrae anche senza dirlo. Nei prompt quindi queste persone non si nominano e il loro aspetto non
  si descrive; le persone della scena sono gente comune dell'epoca e del luogo, con tratti concreti e volti visibili. Il prompt non
  deve mai dire che i volti sono indistinti, anonimi o non riconoscibili: il modello di testo trascrive i vincoli nei prompt e volti
  nascosti diventerebbero un indizio dell'origine (batch del 2026-11-14: 10 prompt su 10 con «faces are indistinct» o simili).
- **Personaggi storici** morti da almeno 50 anni: ammessi, anche in eventi mai accaduti, perché riconoscere un falso storico è parte del
  gioco. Esclusi crimini e atrocità attribuiti a loro e ogni scena degradante. Per questo i generi che implicano un reato o una colpa
  (foto segnaletiche, arresti, processi) si generano solo con persone inventate (2026-11-14).
- **Marchi reali:** ammessi.
- **Regimi e ideologie:** documentare sì, celebrare no. Ammessi manifesti, bandiere e simboli come contesto storico di una scena;
  escluse le immagini che esaltano un regime, un leader o un'ideologia, compresi manifesti di propaganda creati ex novo, che fuori dal
  gioco sarebbero indistinguibili da quelli autentici (in Italia valgono le norme sull'apologia del fascismo).
- **Nudità:** nessuna nudità umana, tranne nelle opere d'arte presenti nella scena (statue, dipinti, affreschi). Mai contenuti sessuali;
  mai nudità che riguardi minori, nemmeno nelle opere.
- **Stile:** fotografico e plausibile per l'epoca e il luogo, senza nominare fotografi, agenzie o archivi; formato scelto per il
  soggetto come farebbe un fotografo (specifica `copie-di-gioco`, sezione 4).

## 2. Come si applicano

- Le regole arrivano al **modello di testo** attraverso le istruzioni dei prompt e della valutazione (specifica `generazione-slop`).
  Il generatore di immagini riceve solo il testo del prompt e applica anche le proprie regole d'uso, che possono rifiutare richieste
  ammesse qui.
- Nel wizard SLOP l’owner legge e corregge premesse e prompt prima di confermare la generazione. Le idee approvate delle
  REAL possono richiedere luoghi o edifici riconoscibili e un fatto inventato significativo per un evento, trattato come ipotesi editoriale.
  L’owner rivede anche le immagini generate, compresi elementi aggiunti dal generatore come volti e scritte.
- Dal 2026-11-20 nessun modello descrive le REAL; i modelli che restano (proposte e valutazione delle SLOP) lavorano sulle SLOP.
- Le REAL di Commons possono ritrarre persone vive: sono foto autentiche. Le valuta l'owner al caricamento.

## 3. Trasparenza e protezioni

- **Deepfake.** Per l'AI Act (art. 50) quasi ogni SLOP fotorealistica che richiama luoghi, marchi, eventi o persone esistenti è un
  deepfake. La risposta è la trasparenza: il sito dichiara che molte immagini sono generate dall'IA, ogni foto rivela l'origine dopo la
  risposta e tutte portano un marchio visibile.
- **Marchio «RS».** Identico su tutte le immagini del gioco, REAL e SLOP, sovrapposto in pagina e non inciso nei file: in basso a destra
  dentro l'immagine, lato circa il 5% del lato corto, lettere bianche semitrasparenti con contorno scuro. Un marchio solo su alcune
  immagini rivelerebbe la risposta. Serve come attrito alla diffusione fuori contesto, non come protezione tecnica.
- **Salvataggio scoraggiato:** nel gioco sono bloccati tasto destro, trascinamento e pressione prolungata sulle immagini. Nella
  dashboard la pressione prolungata apre invece l'anteprima.
- **Metadati:** il gioco serve solo le copie WebP senza metadati, uguali per REAL e SLOP; gli originali restano nella quarantena privata.
- **Trattamento delle SLOP** (decisione dell'owner del 2026-11-14, specifica `copie-di-gioco`, sezione 4): le SLOP possono essere
  ridotte, sfocate, sgranate o virate come le REAL del loro genere ed epoca, perché le immagini false in circolazione lo sono. Il
  trattamento non aggiunge materiale fotografico: resta un'immagine generata. Lo dicono, con l'app 1.25.0, «Come funziona» («Le SLOP
  possono essere anche ridotte, sgranate o sbiadite, come le immagini false che circolano davvero», al posto di «REAL e SLOP passano per
  la stessa preparazione», che non sarebbe più vera), «Fonti e crediti» e i Termini d'uso (specifica `privacy-note-legali`, sezione 3,
  su richiesta dell'owner del 2026-11-14; la frase dei Termini è stata verificata da un legale lo stesso giorno).
- **Durante la partita** nessun testo accompagna la foto; crediti delle REAL, prompt e modello delle SLOP arrivano solo alla fine.
- **Licenze:** le SLOP non hanno licenza restrittiva; valgono i termini d'uso del sito, che vietano di diffonderle come vere o di
  togliere il marchio (specifica `privacy-note-legali`).
