# Dashboard e wizard REAL — specifica 2.5.0

Stato: vigente (con decisioni future indicate a parte). Aggiornata: 2026-11-15T17:35:03Z. La 2.5.0 fa analizzare la REAL intera invece della copia 4:5. Versione consolidata (riordino della documentazione dell'owner del 2026-11-14): riunisce
senza strati `dashboard-admin-wizard-real.v1.3.0` e le parti su dashboard e wizard di `didascalie-wizard.v1.0.0` e
`anteprima-descrizione.v1.2.0`, che restano nella cronologia git.

**Stato del ramo 1.27.0:** implementata la pipeline della specifica `generazione-slop` 5.3.0; produzione ancora 1.26.0 fino al rilascio autorizzato.

## 1. Decisioni dell'owner

- Cinque sezioni; le Impostazioni contengono solo comandi, le Statistiche solo visualizzazioni (2026-11-12).
- La dashboard segnala il caricamento invece di restare vuota (2026-11-13).
- Wizard REAL in quattro passi, con l'inquadratura dopo acquisizione e tag (2026-11-13).
- Nella ricerca su Commons il tasto che svuota il campo sta in una casella separata alla fine del campo, perché non copra il testo; un
  tocco breve su una foto la seleziona e la mette subito tra le selezionate; la selezione resta con una nuova ricerca (2026-11-14).
- Una pressione prolungata su una miniatura la ingrandisce con titolo, descrizione e link a Commons; la finestra resta aperta e si
  chiude con una × nell'angolo. Vale anche nel Database e nello studio SLOP (2026-11-14).
- La **descrizione Commons modificabile dall'owner** è quella mostrata alla fine della partita (2026-11-14).
  La nuova **descrizione editoriale generata con i tag** rimane privata; il suo contenuto può essere corretto durante
  il caricamento senza sostituire automaticamente quello mostrato nel gioco.

## 2. Dashboard `/admin`

- Accesso con le credenziali dell'owner (`ADMIN_TOKEN`).
- **Sezioni:** Caricamento REAL (predefinita), Generazione SLOP (specifica `generazione-slop`), Database immagini
  (specifica `database-immagini`), Statistiche e Impostazioni (specifica `statistiche-impostazioni`).
- **Caricamento:** accanto al titolo «Caricamento della dashboard…» con un indicatore che gira (fermo con «riduci movimento») finché
  tutte le sezioni non sono pronte; ogni sezione ha il suo segnaposto. Il wizard REAL si monta per primo.
- **Riquadro dei batch automatici** in cima a ogni sezione, con il numero delle proposte sul pulsante «Generazione SLOP»
  (specifica `generazione-slop`, sezione 8).
- Tornando a «Caricamento REAL», il wizard toglie le foto spostate nel cestino, pubblicate o eliminate altrove, con un avviso.

## 3. Anteprima a pressione prolungata

- **Gesto:** dito o tasto sinistro premuto per 500 ms senza spostarsi (più di 10 px annulla); anche il tasto destro e il tasto del menu
  contestuale (Maiusc+F10). Il clic che segue la pressione viene ignorato, quindi il tocco breve conserva il suo significato; il menu di
  sistema del telefono non compare.
- **Finestra:** immagine grande, larga quanto la finestra e alta al più il 70% dello schermo; sotto, i testi. Resta aperta finché non si
  tocca la × nell'angolo in alto a destra (o Esc); il tocco sullo sfondo non la chiude.
- **Contenuti:** risultato di Commons: anteprima da 1280 px, titolo del file, descrizione di Commons (300 caratteri), «Apri la pagina su
  Commons». REAL del Database: copia di gioco, titolo, descrizione, link alla fonte. SLOP del Database: copia, titolo, prompt, tag di
  partenza. Immagine della revisione nello studio: prompt, tag di partenza, tag dell'analisi.

## 4. Wizard REAL

Quattro passi; «Indietro» torna al precedente. La bozza (immagini acquisite e passo) resta nella sessione del browser; le immagini
acquisite sono comunque nella libreria privata.

**1. Seleziona le immagini.**
- Ricerca su Commons per rilevanza o data recente, a pagine con due frecce; le pagine già viste si rimostrano senza nuove richieste.
  Risultati come sole miniature (il titolo resta come testo alternativo); categorie correlate in un elenco chiuso; «Colonne»
  (automatiche o da 1 a 6), ricordate nel browser.
- Il campo termina con il tasto «×» («Cancella la ricerca»): una casella a sé, alta come il campo, sempre presente e disattivata a campo
  vuoto. Svuota il campo e ci rimette il cursore; risultati e selezione restano. Il tasto nativo del browser è nascosto.
- **Tocco breve** su una miniatura: la spunta e la aggiunge subito a «Immagini selezionate»; un secondo tocco, o la × sulla miniatura
  scelta, la toglie. La selezione resta cambiando pagina e con nuove ricerche; si svuota con l'acquisizione o con «Inizia un nuovo
  caricamento». Al massimo 100 immagini.
- Le selezionate sono miniature senza titolo che aprono la loro pagina di Commons in una nuova scheda.
- «Aggiungi link di Wikimedia Commons», chiuso all'inizio: più link incollati, uno per riga.
- «Avanti: tag» acquisisce ogni immagine nella quarantena privata e ne prepara la copia di gioco nel browser. Duplicati, link non validi
  e licenze ND vengono rifiutati con il motivo; una copia fallita si ripete dal passo 3.

**2. Tag.**
- Per ogni foto: anteprima, titolo, **descrizione** modificabile (fino a 1000 caratteri, precompilata da Commons, salvata uscendo dal
  campo, «la leggono i giocatori alla fine della partita»), tag come pillole colorate per categoria, campo per un nuovo tag con
  suggerimenti dal vocabolario e scelta della categoria, avviso se manca il tag di Tempo, «Titolo e metadati» (autore, licenza,
  dimensioni, link alla fonte e alla licenza), «Togli dal caricamento» (sposta nel cestino, ripristinabile dal Database).
- **Genera tag e descrizione con IA:** dialogo di scelta delle REAL da analizzare (preselezionate quelle mai analizzate o
  rifiutate senza addebito; esiti incerti deselezionati con avviso), poi una conferma per **una chiamata per REAL**.
  Produce contemporaneamente tag e descrizione editoriale privata, distinta dal campo Commons. I tag delle foto selezionate
  vengono sostituiti; una REAL già analizzata non è selezionabile per ripetere automaticamente una chiamata pagata, ma
  può ricevere un'analisi nuova su richiesta esplicita, con conferma, nel Database. Le altre REAL non cambiano.
- **Descrizione editoriale:** mostrare nella scheda della REAL il contenuto **visibile**, il **contesto documentato Commons**
  e le **incertezze**, ciascuno modificabile dall'owner. Se Commons non documenta un fatto, non inventarlo per riempire
  la descrizione. Le correzioni del testo non cancellano i tag. Non sostituisce automaticamente la descrizione destinata
  ai giocatori né altera l'attribuzione/licenza.
- **Ripristina i tag generati:** per le immagini scelte, senza costi; le modifiche dell'owner ai tag si perdono. La descrizione
  editoriale ha una propria revisione: ripristinare i tag non deve sovrascriverla.
- Le modifiche di una foto partono una dopo l'altra, ciascuna con la revisione più recente.
- Si passa al 3 solo se ogni foto ha almeno un tag.

**3. Inquadratura.** Ogni foto con la sua copia di gioco, il formato e le dimensioni; «Cambia inquadratura» apre l'editor di formato e
ritaglio (specifica `copie-di-gioco`, sezione 3); «Prepara la copia di gioco» se manca. Si passa al 4 solo se ogni foto ha la copia.
  **Vincolo editoriale:** l'inquadratura deve conservare gli elementi che determinano i tag tematici e il significato della foto;
  l'owner corregge eventuali ritagli che li eliminano. Non servono tag distinti per l'originale e per il 4:5.
  Se l'inquadratura cambia dopo l'analisi, non effettuare nuove chiamate automatiche; l'owner può correggere manualmente
  la descrizione quando qualche dettaglio secondario non è più visibile.

**4. Riepilogo e pubblicazione.** Ogni foto con la copia servita dal gioco e il marchio «RS» sovrapposto, la descrizione e i tag.
L'owner dichiara di aver verificato autenticità, provenienza e condizioni della licenza; poi le immagini si approvano e si pubblicano una
alla volta. Dopo un errore quelle già pubblicate non si ripetono; gli errori restano indicati.

## 5. Limiti

- Commons non certifica l'autenticità: una pagina e una licenza compatibile non dimostrano che una foto sia REAL. La verifica è
  dell'owner.
- La descrizione di Commons è spesso in inglese e tagliata: ora la leggono i giocatori, quindi va riletta. Una descrizione riscritta è un
  testo dell'owner e nel gioco sta in un paragrafo separato dai crediti dell'autore.
- La pubblicazione di un gruppo non è transazionale: dopo un errore di rete alcune foto possono restare approvate.

## Descrizione editoriale privata

Nel passo dei tag, tre campi modificabili: elementi visibili, contesto Commons documentato e incertezze. La stessa chiamata che genera i tag li compila, sulla REAL intera (l’originale, non il ritaglio 4:5: decisione dell’owner del 2026-11-15). Le modifiche si salvano senza rifare i tag e senza sovrascrivere la descrizione destinata ai giocatori. Inquadratura conserva gli elementi fondamentali della REAL.
