# Wizard SLOP — specifica 1.2.0

Stato: **proposta, da approvare dall'owner**. Creata: 2026-11-10T21:25:38Z. Aggiornata: 2026-11-10T21:40:10Z
(1.2.0: menù del modello per immagini, solo OpenAI; prompt in inglese; qualità a scelta;
precedente: `docs/wizard-slop.v1.1.0.md`).
Estende `docs/libreria-immagini.v1.7.0.md` (sezioni 5, 10, 11 e 12) e `docs/categorie-tag.v1.1.0.md` (sezione 7).
Sostituisce la sezione «Generazione SLOP» oggi segnaposto della dashboard. Nessun codice prima dell'approvazione.

## 1. Decisioni dell'owner (2026-11-10)

1. Si generano fino a **10 immagini** per volta attorno a un tema.
2. La prima pagina mostra lo **spread** di ogni tag: numero di immagini REAL con il tag meno numero di immagini SLOP
   con il tag, contando insieme approvate e pubblicate («l'interesse è sul bilanciamento dei temi del dataset»).
3. I tag scritti nella casella sono il **tema**: **obbligatori in tutti i prompt**.
4. Gli altri tag di ogni prompt vengono **estratti dalle REAL**, con un **peso che favorisce lo spread positivo**;
   l'owner vede e **modifica gli slot** prima della chiamata a pagamento.
5. **Partenza a freddo:** si caricano abbastanza REAL prima di generare la prima SLOP; nessun ripiego con modelli.
6. I **tag finali** di una SLOP sono quelli dell'analisi dell'immagine generata, come per le REAL; gli slot restano come
   provenienza.
7. Restano i due stati `approvata` e `pubblicata`: le pubblicate sono quelle usate nelle partite, e pubblicare a parte
   permette di aggiornare il sito senza interrompere le partite.
8. Riscrivere un prompt e rigenerare un'immagine sono **liberi, con finestra di conferma**, essendo a pagamento.
9. Generatore: **un menù** per scegliere il modello per immagini; **per ora solo modelli OpenAI**, a partire da
   `gpt-image-2`.
10. **Prompt in inglese.**

## 2. Soglie

- **Sezione:** il wizard si apre con almeno **50 REAL** approvate o pubblicate; sotto soglia la sezione mostra
  «REAL approvate o pubblicate: 23 su 50».
- **Tema:** un tema si può usare se almeno **10 REAL** approvate o pubblicate contengono **tutti** i suoi tag; sotto
  soglia la casella mostra «`carnival`: 4 REAL su 10» e il pulsante resta disattivato.
- Con 3 foto l'estrazione ricomporrebbe quasi le stesse scene; con 10 ogni categoria ha in genere 2–4 candidati.
  I due numeri sono stime da verificare sui primi temi reali: costanti nel codice, facili da cambiare.

## 3. Pagina 1: tema

- **Grafico dello spread:** barre orizzontali divergenti, a destra i tag con più REAL (mancano SLOP), a sinistra quelli
  con più SLOP; colorate per categoria e ordinate per spread.
  - filtro per categoria con le etichette della legenda;
  - vista compatta con i primi *n* tag (scelta di *n*), vista ingrandita con tutti i tag, scorrimento e ricerca;
  - al passaggio del puntatore: tag, categoria, conteggi REAL e SLOP;
  - clic su una barra: il tag entra nella casella del tema.
- **Casella del tema:** uno o più tag del vocabolario, con suggerimenti; accanto il numero di REAL che li contengono
  tutti e lo stato rispetto alla soglia.
- **Numero di immagini:** da 1 a 10.
- **«Prepara gli slot»:** gratuito, è un calcolo sul database.

## 4. Pagina 2: slot

Uno slot per immagine: il tema più al massimo un tag per categoria.

**Estrazione**, per ogni slot:

1. Le foto di riferimento sono le REAL approvate o pubblicate con tutti i tag del tema.
2. Le categorie si percorrono in ordine: Tempo, Formato, Luogo, Ambiente, Evento, Persone, Oggetti e strutture; si
   saltano quelle già coperte dal tema (un decennio nel tema fissa il Tempo).
3. Per ogni categoria si pesca un tag tra quelli delle foto di riferimento, poi le foto di riferimento si restringono
   a quelle che contengono anche il tag scelto. Il restringimento si ferma quando resterebbero meno di 3 foto: da lì
   le categorie successive pescano dall'ultimo insieme valido. Il Tempo viene per primo, così il resto arriva da foto
   della stessa epoca.
4. **Peso** di un tag candidato: radice quadrata del numero di foto di riferimento che lo contengono, moltiplicata per
   il **fattore di spread** `max(0,25; 1 + s / S)`, dove `s` è lo spread del tag e `S` il massimo spread assoluto tra i
   candidati (1 se tutti hanno spread zero). Il tag con lo spread positivo più alto pesa il doppio, uno neutro una
   volta, quello con lo spread più negativo un quarto.
5. **Varietà:** un tag già uscito nella stessa categoria in uno slot precedente del gruppo pesa un terzo. Due slot non
   possono avere la stessa combinazione: in caso di doppione si ripesca, fino a 20 tentativi.
6. Una categoria senza candidati resta vuota: su quell'aspetto il modello che scrive il prompt è libero.

**Cosa garantisce:** ogni tag estratto compare in foto vere insieme al tema e ai tag scelti prima dello stop del
restringimento. I tag scelti dopo lo stop non sono verificati tra loro: per questo gli slot si rivedono.

**Interfaccia:** una riga per slot, una colonna per categoria, con le pillole colorate. Ogni cella si cambia
scegliendo un altro tag della stessa categoria dal vocabolario, o si svuota; «Ripesca» rifà uno slot o tutti. Il tema
non si modifica qui (si torna alla pagina 1).

**«Genera prompt»:** chiamata a pagamento, con la conferma della sezione 8.

## 5. Pagina 3: prompt

- I prompt sono **in inglese**; didascalie, tag e interfaccia restano come oggi.
- **Una sola chiamata** scrive tutti i prompt del gruppo. Istruzioni: base comune e testo «Prompt per le SLOP» del
  contesto dei modelli (sezione 12 della specifica vigente, con le regole di contenuto della sezione 11), più una riga
  fissa nel codice sul formato della risposta. Il modello riceve gli slot e l'istruzione di scrivere prompt diversi
  tra loro, ciascuno fedele al proprio slot.
- Risposta JSON: per ogni slot il prompt e l'elenco dei tag dello slot effettivamente usati.
- L'owner rilegge, modifica, toglie prompt; può riscriverne uno con una nuova chiamata, senza limite, ogni volta con
  la conferma del costo.
- **«Genera immagini»:** chiamate a pagamento, con la conferma della sezione 8.

## 6. Pagina 4: immagini e analisi

- **Menù del modello** e **menù della qualità** (bassa, media, alta), con accanto il costo stimato per immagine e per
  il gruppo, aggiornato a ogni scelta. Predefiniti: l'ultima scelta dell'owner, all'inizio `gpt-image-2` e qualità
  media.
- Il generatore di immagini riceve **solo il testo** del prompt. Formati verticale, orizzontale e quadrato a rotazione
  nel gruppo.
- Ogni immagine generata entra nella libreria come **SLOP `nuova`**, con prompt, modello e **slot** come provenienza;
  il browser dell'owner ne prepara la copia di gioco WebP, come per le REAL.
- Poi l'**analisi** di tag e didascalia, identica a quella delle REAL (una chiamata per immagine, con il prompt come
  contesto). I **tag finali sono quelli dell'analisi**.
- Esiti: un rifiuto del generatore per le sue regole d'uso (errore 4xx) non è addebitato e lo slot resta da
  rigenerare; un esito incerto resta contato e non viene mai ripetuto in automatico.

## 7. Pagina 5: revisione

- Per ogni immagine: copia di gioco con marchio «RS», didascalia, tag per categoria e il **confronto con lo slot**:
  «Previsti ma non rilevati: `riot`, `tram`». Se manca un tag del tema, l'immagine ha mancato l'obiettivo: l'owner la
  scarta (cestino), la tiene correggendo i tag, oppure ne genera un'altra dallo stesso prompt, senza limite, ogni
  volta con la conferma del costo.
- **Approvazione** come per le REAL: copia, almeno un tag; nessuna conferma di diritti per le SLOP. La **pubblicazione**
  resta un passo separato, dal wizard o dalla sezione Database.
- Le SLOP approvate entrano subito nello spread della pagina 1.

## 8. Costi e conferme

- Tre tipi di chiamate a pagamento, tutte sul budget unico, con stima e conferma del costo massimo, riserva prima
  dell'invio, registro di spesa, esiti incerti mai ripetuti: **prompt** (una chiamata per gruppo), **immagini** (una
  per immagine), **analisi** (una per immagine, come oggi).
- La conferma della pagina 4 copre insieme immagini e analisi del gruppo, con il totale massimo e il residuo del budget:
  l'analisi è comunque necessaria per approvare. Le chiamate restano registrate una per una.
- Il generatore di immagini si usa solo con un prezzo registrato nel codice, come per l'analisi; senza chiave o senza
  prezzo la pagina 4 è disattivata con il motivo.
- **Modelli per immagini:** un elenco nel codice dei modelli OpenAI con il loro prezzo (prima voce `gpt-image-2`).
  Il menù mostra un modello come selezionabile solo se ha un prezzo registrato **e** compare nell'elenco dei modelli
  del progetto OpenAI, letto con la chiamata gratuita `GET /v1/models` (in cache per un'ora). Un modello noto ma senza
  prezzo, per esempio GPT Image 2.5 finché il prezzo non è verificato, compare disattivato con il motivo; uno non
  disponibile nel progetto, disattivato con «non disponibile nel progetto OpenAI». Altri fornitori, come Google, sono
  esclusi per ora: richiederebbero un'altra chiave e un adattatore. Usa il segreto `OPENAI_API_KEY` già presente nel
  Worker di produzione. Ogni immagine registra il modello e la qualità usati, così il consulente potrà confrontarli.
  La variabile `OPENAI_IMAGE_MODEL` delle GitHub Actions apparteneva alla vecchia pipeline Python e il Worker non la
  legge: non serve più.
- **Prezzi** di partenza, verificati il 2026-11-04 per il benchmark (`docs/benchmark-diretto-v2.1.0.md`): 5 $ per
  milione di token di testo in ingresso, 30 $ per milione di token immagine in uscita; circa 0,053 $ per immagine
  1024×1024 in qualità media. Vanno ricontrollati sulla pagina dei prezzi di OpenAI prima di attivare il generatore.
  Il costo di ogni chiamata si calcola dai token dichiarati; prima dell'invio si riserva il massimo per dimensione e
  qualità.
- **Dimensioni e qualità:** formati 1024×1024, 1024×1536 e 1536×1024 a rotazione, da verificare tra quelli accettati
  da ciascun modello; prezzi indicativi per `gpt-image-2` da fonti secondarie, da verificare: quadrata circa 0,006 $
  (bassa), 0,053 $ (media), 0,211 $ (alta); verticale o orizzontale circa 0,005 $, 0,041 $, 0,165 $.

## 9. Dati

- Migrazione additiva: colonna `generation_slot` in `images` (JSON: tema e tag per categoria), solo per le SLOP del
  wizard.
- Tabella `slop_batches` per il lavoro in corso: tema, numero di immagini, slot, prompt, stato e date. Gli slot e i
  prompt pagati restano nel database anche se si chiude la scheda; un gruppo concluso o abbandonato si può cancellare.
- Il registro `spend` accetta un nuovo tipo `prompts` accanto ad `analysis` e `generation`: il vincolo sul tipo si
  aggiorna ricostruendo la tabella, che non ha chiavi esterne.

## 10. Punti aperti

Nessuno. Prima di attivare il generatore vanno verificati sulla pagina di OpenAI i prezzi dei modelli registrati.
Più avanti: alternare più generatori, anche di altri fornitori, perché le SLOP non abbiano tutte la stessa «firma»
visiva.

## 11. Verifiche

- Test unitari dell'estrazione: soglie, ordine delle categorie, restringimento e stop, fattore di spread, varietà,
  nessuna combinazione doppia, tema sempre presente.
- Test d'integrazione con modelli finti (testo e immagini): conferme, budget, esiti incerti e rifiuti, analisi,
  confronto con lo slot, approvazione.
- Interfaccia nel browser su desktop e mobile: grafico (filtri, vista compatta e ingrandita, clic sulle barre), slot
  modificabili, prompt, revisione. Nessuna chiamata a pagamento reale.
