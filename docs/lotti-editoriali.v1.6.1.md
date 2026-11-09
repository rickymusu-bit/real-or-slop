# Lotti REAL, generazione SLOP e bozze — specifica 1.6.1

Stato: **proposta, in attesa di approvazione dell'owner**. Creata: 2026-11-09T08:00:00Z.
Aggiornata: 2026-11-09T09:00:00Z (1.6.1: persone reali, personaggi storici, marchi, tag in blocco,
marcatura e metadati; precedente: `docs/lotti-editoriali.v1.6.0.md`).
Sostituisce `docs/lotti-editoriali.v1.5.1.md` (versioni precedenti conservate: dalla 1.0.0 alla 1.5.1).
Base: main `9c4aa39` (app 0.28.1, schema 0031). Cambio strutturale: all'approvazione
`AGENTS.md`/`MASTER.md` passano a 15.0.0 con nuovi snapshot in `docs/`.

Decisioni dell'owner del 2026-11-09 che motivano la 1.6.0:
- La generazione SLOP è **scollegata** dal caricamento dei lotti REAL: sono due processi
  distinti e l'owner decide liberamente che cosa generare.
- La generazione avviene in due passi: dai **tag** delle foto (e da un tema) un modello
  linguistico scrive i prompt; i prompt vanno al generatore di immagini. Nessun deepfake di
  eventi reali, nessuna immagine troppo ispirata alle foto appena caricate.
- Tutto ciò che precede la conferma è una **bozza modificabile** salvata nel database;
  alla conferma il contenuto diventa definitivo e la bozza viene **cancellata**.
- Niente descrizioni per foto e niente profili visivi a pagamento per la generazione.

## 1. Obiettivo

Il database viene popolato da due fonti indipendenti:

- **lotti REAL**: gallerie monotematiche di fotografie scelte dall'owner (per ora Commons;
  upload dal dispositivo ammesso);
- **generazioni SLOP**: lotti di immagini sintetiche decisi dall'owner, guidati da un tema e
  da tag, eventualmente presi dai lotti REAL, senza mai passare foto o descrizioni REAL.

## 2. Bozze

Una bozza è il lavoro preparatorio di un lotto REAL o di una generazione SLOP.

- Salvata nel D1, quindi ritrovabile da qualunque dispositivo; **modificabile** liberamente
  (nessun trigger di immutabilità) con revisione ottimistica: due schede aperte non si
  sovrascrivono in silenzio.
- Finché è una bozza **non esistono** lotto, proposte, voci nella coda di revisione o
  immagini: nessun'altra tabella viene scritta. Unica eccezione: le chiamate a pagamento
  della bozza SLOP (sezione 5) lasciano la loro ricevuta nel registro del budget.
- I file caricati dal dispositivo in una bozza REAL stanno in R2 sotto `drafts/<id>/`,
  modificabili e cancellati con la bozza.
- **Conferma**: il contenuto diventa definitivo (lotto e foto, oppure generazione) e la bozza
  viene cancellata con i suoi file temporanei. Dopo la conferma valgono le regole di audit
  e immutabilità di sempre.
- **Elimina bozza**: cancella tutto, senza traccia, con conferma.
- Le bozze non scadono da sole; la dashboard le elenca con data dell'ultima modifica.

## 3. Lotto REAL

Un lotto è una galleria **monotematica**: un singolo tema, argomento o avvenimento.

### 3.1 Bozza del lotto

- Titolo breve (obbligatorio alla conferma, univoco tra i lotti), note facoltative
  (massimo 500 caratteri).
- Elenco di foto: pagine `File:` di Commons (da Esplora Commons o da link incollati, sempre
  ricondotti alla forma canonica) e file dal dispositivo. Aggiungere, togliere e riordinare
  non tocca nient'altro.
- Una bozza può puntare a un **lotto già confermato**: alla conferma le foto si aggiungono a
  quel lotto.
- **Verifica** (facoltativa, nessuna scrittura): per ogni foto il Worker interroga Commons e
  segnala titolo inesistente, formato non supportato, dimensioni, licenza dichiarata e
  duplicati già presenti nel catalogo o nella coda.

### 3.2 Conferma

1. Il Worker ripete la verifica; se qualcosa non va non scrive nulla e indica le foto da
   correggere nella bozza.
2. In un'unica transazione crea il lotto (o usa quello indicato) e le proposte, registra gli
   upload nella coda di revisione e cancella la bozza.
3. Le foto Commons vengono acquisite subito dopo, una per volta. Un'interruzione non perde
   nulla: il lotto mostra «Riprendi acquisizione» per le foto mancanti, senza duplicati.

### 3.3 Lotti e dati esistenti

- Lotti, proposte, scarti (0029) e rimozioni (0030) già registrati restano validi e leggibili.
- Lo scarto di un link e la rimozione di un lotto restano per i dati esistenti; nei nuovi
  lotti non servono più, perché i link sbagliati si tolgono dalla bozza prima della conferma.

## 4. Esplora Commons nella dashboard

Obiettivo: niente più link copiati a mano tra Commons, note e dashboard.

- Pannello **Esplora Commons** nel lotto selezionato: ricerca testuale e navigazione per
  categorie e sottocategorie di Commons (es. `Protests in Paris`).
- Griglia di miniature come sul sito, con selezione sovrapposta; un tocco apre l'anteprima
  grande (1280 px) con titolo, autore, licenza, data, dimensioni, descrizione, selezione,
  navigazione precedente/successiva e link alla pagina `File:`.
- Ricerca limitata alle immagini bitmap (`filetype:bitmap`), ordinabile per pertinenza o per
  data di caricamento. Le categorie collegate stanno in un pannello richiudibile.
- Foto e categorie usano richieste API separate: lo stesso modulo usato insieme come
  generatore e come lista restituisce solo una delle due serie di risultati.
- Selezione multipla con caselle; **Aggiungi alla bozza** mette le pagine `File:` scelte
  nella bozza del lotto; l'acquisizione avviene solo alla conferma.
- Le richieste passano dal Worker, riusando `worker/commons-editorial.v1.0.0.ts` e la sua
  allowlist di host, con un `User-Agent` identificativo (il sito pubblico, mai un indirizzo
  personale), richiesto dalla policy Wikimedia. Nessuna chiamata a pagamento. Già presenti o eliminate in passato
  vengono segnalate prima dell'aggiunta.
- Un iframe di Commons non è adatto: il browser non permette alla dashboard di leggere
  le selezioni fatte in una pagina di un altro dominio.
- I link incollati a mano verso `upload.wikimedia.org` o `thumb.wikimedia.org` vengono
  ricondotti alla pagina `File:` corrispondente prima del salvataggio.

## 5. Tag per singola fotografia

I tag appartengono alla foto, non al lotto. Servono all'owner per cercare e filtrare in un
catalogo ampio e, in futuro, per sfide tematiche. Valgono con lo stesso vocabolario per
REAL e SLOP.

### 5.1 Formato e lingua

- Formato obbligatorio: **tutto minuscolo, nessuno spazio**. Caratteri ammessi: lettere
  Unicode minuscole (anche accentate), cifre e trattino `-` come separatore tra parole;
  massimo 40 caratteri; niente trattini iniziali, finali o doppi.
  Il server rifiuta i tag non conformi; l'interfaccia propone la forma corretta
  (`Burning car` → `burning-car`) senza salvarla da sola.
- **Lingua: inglese** per tutti i tag comuni (`firefighter`, `burning-car`, `computer`,
  `shop-window`, `night`, `close-up`).
- **Nomi propri in qualunque lingua**, nella forma d'uso originale: luoghi, monumenti,
  organizzazioni, persone (`paris`, `place-de-la-république`, `notre-dame`).
  Il server non può riconoscere la lingua: la regola è un'indicazione nell'interfaccia.
- Vocabolario piatto: nessuna categoria o gerarchia di tag. Il completamento automatico
  propone i tag già esistenti; due tag equivalenti si potranno collegare come alias di un
  tag canonico (`fireman` → `firefighter`).
- Conviene descrivere ciò che è visibile (soggetti, azioni, oggetti, ambiente, luce,
  inquadratura); luogo ed evento appartengono al lotto, che è già filtrabile. L'owner può
  comunque creare qualunque tag conforme, anche interpretativo o con nomi propri.
- Nessun tag può rivelare l'origine (`real`, `fake`, `ai`, `ai-generated`, `generated`,
  `synthetic`, nomi di modelli…): l'origine è un campo separato e questi termini sono
  rifiutati dal vocabolario.
- Il testo viene normalizzato NFKC prima dei controlli; univocità per testo del tag.

### 5.2 Assegnazione

- **Solo manuale, nessuna chiamata a pagamento** (decisione dell'owner, 1.5.0): niente
  proposte di tag da modelli di visione o di testo. L'owner scrive o sceglie i tag dal
  vocabolario esistente.
- Aggiunte e rimozioni sono eventi append-only; lo stato corrente è derivato.
- Il legame foto↔tag usa l'identità della foto nella coda (`inbox_id`), non i metadati
  immutabili, e segue la foto anche dopo l'ammissione e la pubblicazione. Ogni evento registra
  l'hash dei pixel visti in quel momento. (1.4.2: non si usa la coppia `(inbox_id, sha256)`
  perché la presentazione standard può cambiare l'hash effettivo e i tag andrebbero persi;
  i tag descrivono il contenuto, che non cambia.)

### 5.3 Almeno un tag per foto

- Ogni foto ha sempre almeno un tag. Quando non ha tag scelti dall'owner riceve il tag
  segnaposto di sistema **`untagged`**, che non si può assegnare o rimuovere a mano e
  scompare appena la foto riceve un tag vero. È derivato (nessuna riga nel database):
  una foto non rifiutata senza tag attivi è `untagged`.
- Le nuove foto, REAL acquisite o caricate e SLOP generate, entrano con `untagged`.
- La revisione ha una sezione **Foto senza tag**: tutte le foto con `untagged`.
- Una foto con il solo `untagged` non può essere approvata, ammessa o pubblicata: il
  segnaposto non conta come tag. Il controllo è nel server, non solo nell'interfaccia.
- Rimozione di un tag dal vocabolario o da una foto: le foto che conservano altri tag
  restano nel proprio stato. Quelle che restano senza tag ricevono `untagged` e compaiono
  in **Foto senza tag**; se erano già pubblicate **restano pubblicate**, se non lo erano
  non possono essere pubblicate finché non ricevono un tag.
- Prima di rimuovere un tag dal vocabolario, la dashboard mostra quante foto riceverebbero
  `untagged`, divise tra pubblicate e non pubblicate, e chiede conferma.

### 5.4 Stato di attuazione (1.4.2)

- **Fase 2a, implementata:** vocabolario con creazione al primo uso, tag per foto in Revisione
  con proposta della forma corretta, filtro «Senza tag», blocco server di approvazione,
  ammissione e pubblicazione di ciclo per le foto `untagged`, rimozione di un tag dal
  vocabolario con impatto e conferma esatta, storico append-only (migrazione 0031).
- **Fase 2b, da fare:** alias tra tag equivalenti. Nessuna proposta automatica a pagamento.
- Il vecchio pubblicatore `/api/admin/editorial/publish` riguarda solo immagini storiche fuori
  dalla coda unica, che non possono avere tag: resta invariato e non tocca i lotti.

## 6. Generazione SLOP

### 6.1 Bozza della generazione

- **Tema**: testo breve scelto dall'owner (per esempio «proteste urbane in Francia»).
  Può essere precompilato dal titolo di un lotto, ma resta modificabile.
- **Tag**: presi da uno o più lotti REAL scelti dall'owner, oppure scritti direttamente.
  L'owner può togliere i tag che non vuole usare. Al modello arrivano **in blocco**, come
  elenco semplice in ordine casuale, senza frequenze né raggruppamenti: massima libertà
  creativa, la selezione la fa l'owner rivedendo prompt e immagini (decisione 1.6.1).
- **Quantità**: numero di immagini deciso dall'owner; formati verticale, orizzontale e
  quadrato a rotazione.
- Nessuna foto, descrizione, metadato o URL REAL entra nella bozza SLOP: solo tema e tag.

### 6.2 Primo passo: i prompt

- Su richiesta esplicita, un modello linguistico riceve **solo** tema, elenco dei tag e
  quantità, e scrive un prompt per ogni immagine, indicando quali tag usa. È libero di
  combinarli e di inventare scene; nessuna distribuzione imposta.
- Regole fisse per il modello (valgono per tutto il sito, sezione 6.4):
  - **non ricopiare la combinazione delle foto REAL**: i nomi propri tra i tag (marchi,
    luoghi, personaggi) non tornano nello stesso ruolo. Con `chanel` e `vandalism` può
    nascere una vetrina di un altro marchio assaltata, o un negozio Chanel in una scena
    normale, ma non un negozio Chanel assaltato;
  - **marchi reali ammessi**;
  - **persone vive o morte da meno di 50 anni: escluse**; figure plausibili ma non
    riconoscibili;
  - **personaggi storici** (morti da almeno 50 anni) ammessi, anche in eventi storici mai
    accaduti, perché riconoscere un falso storico richiede conoscenza ed è parte del gioco;
    esclusi atrocità e crimini attribuiti a loro, contenuti sessuali o degradanti, immagini
    celebrative di regimi o ideologie;
  - stile fotografico plausibile per l'epoca e il luogo, senza riferimenti a fotografi o archivi.
- È una chiamata a pagamento: stima, conferma esplicita, ricevuta nel budget, nessun
  reinvio di esiti incerti. I prompt restano nella bozza.
- L'owner rilegge, modifica, toglie o aggiunge prompt; può rigenerarli (nuova conferma).

### 6.3 Secondo passo: le immagini

- **Conferma generazione**: stima del costo totale, conferma esplicita, prenotazione sul
  budget. Il generatore riceve **solo il testo** di ogni prompt.
- Le immagini entrano nella coda di revisione come SLOP `pending`, con il prompt nella
  provenienza e i suoi tag come **proposta** da accettare (i tag restano manuali: nessun
  tag viene assegnato senza conferma dell'owner).
- Alla conferma la bozza viene cancellata; prompt, tema e tag usati restano nella
  provenienza di ogni immagine generata.
- Il controllo di somiglianza esistente segnala SLOP troppo vicine a una REAL.

### 6.4 Persone, marchi, marcatura e trasparenza

- **Persone reali**: le persone vive o morte da meno di 50 anni non compaiono in nessuna
  SLOP del sito. I personaggi storici seguono la sezione 6.2. I casi dubbi li decide
  l'owner in revisione.
- **Deepfake**: per l'AI Act (art. 50) quasi ogni SLOP fotorealistica che richiama luoghi,
  marchi, eventi o persone esistenti è un deepfake, anche senza personaggi famosi. La
  risposta è la trasparenza, non il divieto: il sito dichiara che molte immagini sono
  generate dall'IA, ogni round rivela l'origine e le immagini portano un marchio visibile.
- **Marchio visibile «RS»**: identico su **tutte** le immagini del gioco, REAL e SLOP,
  sovrapposto in pagina (i file REAL restano intatti, quindi anche le licenze ND restano
  utilizzabili). Un marchio solo su alcune immagini rivelerebbe la risposta. Non è una
  protezione tecnica (si rimuove, anche con l'IA): serve come attrito alla diffusione fuori
  contesto e come prova della diligenza del sito.
- **Metadati uniformi nel gioco**: oggi i file serviti conservano i metadati originali
  (EXIF delle fotocamere nelle REAL, Content Credentials nelle SLOP), che un giocatore può
  leggere per conoscere la risposta. I file serviti al gioco devono essere privi di
  metadati identificativi in entrambe le categorie; gli originali con i loro metadati
  restano nell'archivio privato.
- **Licenze**: nessuna licenza restrittiva sulle SLOP. Un'immagine generata interamente
  dall'IA in genere non è protetta da diritto d'autore e una licenza sarebbe difficilmente
  applicabile; si usano i termini d'uso del sito (divieto di diffusione fuori contesto),
  da far verificare a un legale.

## 7. Composizione del catalogo

- La pubblicazione non richiede più quantità uguali di REAL e SLOP: si pubblica ciò che
  è stato ammesso.
- **Copertura dei temi**: per ogni tag la dashboard mostra quante REAL e quante SLOP lo
  hanno (per esempio `riot-police` 12 REAL / 0 SLOP) e avvisa degli squilibri forti, perché
  un tema presente in una sola categoria rivela l'origine. Solo avviso, nessun blocco.
- La dashboard mostra la quota REAL/SLOP del catalogo pubblicato e un **avviso non
  bloccante** fuori dall'intervallo 40–60%.
- Il gioco mantiene una moneta 50/50 indipendente per round: le immagini della categoria
  minoritaria vengono quindi estratte più spesso.
- Vincolo esistente da tenere visibile: una partita non può avere più round della
  categoria meno numerosa (`worker/sampling.ts`, capacità = min(REAL, SLOP)). La dashboard
  avvisa anche quando il numero assoluto della categoria minoritaria si avvicina alla
  lunghezza di una partita.

## 8. Dati (migrazione additiva, da definire nel dettaglio)

- Tabella delle bozze: tipo (`real` o `slop`), titolo, contenuto JSON, revisione, date.
  Modificabile e cancellabile; nessun trigger di immutabilità.
- File temporanei delle bozze REAL in R2 `drafts/<id>/`, cancellati con la bozza.
- Ricevute delle chiamate a pagamento nel registro esistente del budget, collegate alla
  generazione confermata quando c'è.
- Nessuna tabella esistente viene ricostruita; nessun dato storico viene riscritto.
- La migrazione 0032 (scarto reversibile) non viene adottata.

## 9. Topic Discovery

Resta spento. Codice, tabelle e memoria semantica restano in sola lettura per un uso
futuro; non sono richiesti embedding per creare o chiudere un lotto.

## 10. Contratti sostituiti

| Regola precedente (14.x, specifica 1.5.1) | Nuova regola (1.6.0) |
|---|---|
| Lotto creato subito e link registrati come proposte immutabili | Bozza modificabile; lotto e proposte nascono solo alla conferma |
| Scarto dei link e rimozione dei lotti per correggere errori | Correzioni nella bozza; scarto e rimozione restano per i dati esistenti |
| SLOP generate dal lotto alla chiusura, quantità = REAL × (1 + margine) | Generazione separata, quantità decisa dall'owner |
| Pianificatore con pixel REAL, metadati Commons, titolo e note | Modello linguistico con solo tema e tag in blocco |
| Nessuna regola su persone, marchi e marcatura | Persone recenti escluse, personaggi storici e marchi ammessi con limiti, marchio «RS» su tutte le immagini, metadati uniformi nel gioco |
| Note del lotto come guida della generazione | Note solo descrittive del lotto; la guida è il tema della bozza SLOP |

Restano invariati: verifica documentale e licenze separate dal voto, voto sui pixel
correnti, tag manuali e blocco `untagged`, quarantena e originali, gate del budget,
nessuna chiamata a pagamento nei test o senza conferma, nessun reinvio di esiti incerti,
audit e immutabilità dopo la conferma.

## 11. Rischi

- **Diffusione fuori contesto**: falsi storici e scene con marchi reali possono circolare
  fuori dal gioco; mitigazione con marchio visibile, rivelazione nel round, avviso e termini
  d'uso, senza garanzia tecnica.
- **Rifiuti del generatore**: richieste su personaggi storici controversi possono essere
  respinte; conviene provare con poche immagini.
- **Imbroglio tramite metadati**: finché i file del gioco conservano EXIF o Content
  Credentials, l'origine si legge nel file (sezione 6.4).
- **Temi sbilanciati**: un tema solo REAL o solo SLOP rivela l'origine; la copertura per tag
  lo rende visibile.
- **Costi**: i prompt costano poco, le immagini molto; stima e conferma separate per i due passi.
- **Bozze dimenticate**: occupano spazio (soprattutto i file R2); la dashboard le elenca.

## 12. Verifiche

- Unitari: contenuto della bozza (validazione, limiti), istruzioni e payload del modello
  linguistico senza dati REAL, distribuzione per frequenza dei tag.
- Integrazione con D1/R2 locali e provider fittizi: bozza modificata da due schede (409),
  verifica senza scritture, conferma atomica con cancellazione della bozza e dei file R2,
  ripresa dell'acquisizione, eliminazione della bozza, prompt e immagini con budget
  esaurito, esito incerto non ritentato, payload del generatore solo testo.
- Browser desktop e mobile: bozza ritrovata dopo il ricaricamento, Esplora Commons verso la
  bozza, revisione dei prompt, conferme.

## 13. Fasi di consegna

1. Bozze REAL: tabella, verifica, conferma, ripresa dell'acquisizione; Esplora Commons e
   link verso la bozza. Nessuna chiamata a pagamento.
   In parallelo, piccola PR separata: file del gioco senza metadati identificativi e marchio
   «RS» sovrapposto a tutte le immagini.
2. Bozze SLOP e primo passo (prompt dal modello linguistico), con budget e conferma.
3. Secondo passo (immagini), tag proposti dalle SLOP, copertura dei temi.

Ogni fase in una PR separata, con CI e approvazione dell'owner; migrazioni remote e deploy
solo su autorizzazione esplicita.

## 14. Sviluppi futuri (non pianificati)

Registrati su richiesta dell'owner; nessuno è in lavorazione finché non viene richiesto.

- **Ricontrollo delle fonti Commons.** Una foto acquisita non dipende dal link: file (R2,
  con hash) e metadati del giorno dell'acquisizione restano nostri. Se in seguito il file
  viene rinominato, cancellato o cambia licenza su Commons, oggi nessuno se ne accorge.
  Proposta: un pulsante «Ricontrolla le fonti» che interroga gratuitamente l'API di Commons
  per tutte le foto acquisite e segnala quelle sparite (con il motivo, se disponibile, per
  esempio una cancellazione per copyright), spostate o con licenza o autore diversi.
  Solo segnalazione: il ritiro dal gioco resta una decisione esplicita dell'owner.
- **Alias tra tag equivalenti** (fase 2b): `fireman` → `firefighter`, senza proposte a pagamento.
- **Anteprime Cloudflare utilizzabili**: database D1 e bucket R2 separati per le anteprime
  delle PR, che oggi non hanno storage e non possono mostrare la dashboard.
- **Topic Discovery**: resta spento e rinviato (sezione 8).

