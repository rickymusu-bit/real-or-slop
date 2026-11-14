# Dashboard e wizard REAL — specifica 2.0.0

Stato: vigente. Aggiornata: 2026-11-14T12:00:00Z. Versione consolidata (riordino della documentazione dell'owner del 2026-11-14): riunisce
senza strati `dashboard-admin-wizard-real.v1.3.0` e le parti su dashboard e wizard di `didascalie-wizard.v1.0.0` e
`anteprima-descrizione.v1.2.0`, che restano nella cronologia git.

## 1. Decisioni dell'owner

- Cinque sezioni; le Impostazioni contengono solo comandi, le Statistiche solo visualizzazioni (2026-11-12).
- La dashboard segnala il caricamento invece di restare vuota (2026-11-13).
- Wizard REAL in quattro passi, con l'inquadratura dopo acquisizione e tag (2026-11-13).
- Nella ricerca su Commons il tasto che svuota il campo sta in una casella separata alla fine del campo, perché non copra il testo; un
  tocco breve su una foto la seleziona e la mette subito tra le selezionate; la selezione resta con una nuova ricerca (2026-11-14).
- Una pressione prolungata su una miniatura la ingrandisce con titolo, descrizione e link a Commons; la finestra resta aperta e si
  chiude con una × nell'angolo. Vale anche nel Database e nello studio SLOP (2026-11-14).
- La descrizione delle REAL si corregge durante il caricamento e si mostra alla fine della partita (2026-11-14).

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
- **Genera i tag con IA:** dialogo di scelta delle immagini (preselezionate quelle mai generate o rifiutate senza addebito; un esito
  incerto resta deselezionato e la conferma lo avverte), poi conferma della chiamata a pagamento per immagine. I tag delle immagini
  scelte vengono sostituiti; le altre non cambiano; un'immagine già generata non è selezionabile.
- **Ripristina i tag generati:** per le immagini scelte, senza costi; le modifiche dell'owner su quelle immagini si perdono.
- Le modifiche di una foto partono una dopo l'altra, ciascuna con la revisione più recente.
- Si passa al 3 solo se ogni foto ha almeno un tag.

**3. Inquadratura.** Ogni foto con la sua copia di gioco, il formato e le dimensioni; «Cambia inquadratura» apre l'editor di formato e
ritaglio (specifica `copie-di-gioco`, sezione 3); «Prepara la copia di gioco» se manca. Si passa al 4 solo se ogni foto ha la copia.

**4. Riepilogo e pubblicazione.** Ogni foto con la copia servita dal gioco e il marchio «RS» sovrapposto, la descrizione e i tag.
L'owner dichiara di aver verificato autenticità, provenienza e condizioni della licenza; poi le immagini si approvano e si pubblicano una
alla volta. Dopo un errore quelle già pubblicate non si ripetono; gli errori restano indicati.

## 5. Limiti

- Commons non certifica l'autenticità: una pagina e una licenza compatibile non dimostrano che una foto sia REAL. La verifica è
  dell'owner.
- La descrizione di Commons è spesso in inglese e tagliata: ora la leggono i giocatori, quindi va riletta. Una descrizione riscritta è un
  testo dell'owner e nel gioco sta in un paragrafo separato dai crediti dell'autore.
- La pubblicazione di un gruppo non è transazionale: dopo un errore di rete alcune foto possono restare approvate.
