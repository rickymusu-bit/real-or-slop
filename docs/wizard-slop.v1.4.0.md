# Wizard SLOP — specifica 1.4.0

Stato: **approvata dall'owner il 2026-11-10**, vigente; parte gratuita (sezioni 2–4, 12) realizzata nell'app 1.8.0. Creata: 2026-11-10T21:25:38Z. Aggiornata: 2026-11-10T22:11:48Z
(1.4.0: niente prezzi né costi, solo i selettori dei modelli; niente budget; precedente: `docs/wizard-slop.v1.3.0.md`).
Estende `docs/libreria-immagini.v1.8.0.md` (sezioni 5, 10, 11 e 12) e `docs/categorie-tag.v1.1.0.md` (sezione 7).
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
9. **Modelli scelti nelle Impostazioni**, non nello studio SLOP: un menù per il modello di testo e uno per il modello
   di immagini, con **tutti i modelli OpenAI** della pagina ufficiale; per ora solo OpenAI.
11. **Niente prezzi né calcolo dei costi**, e quindi niente budget in dollari: «togli i prezzi e il calcolo del costo,
    tieni solo i selettori dei modelli». Ogni chiamata a pagamento resta confermata e registrata; il limite di spesa
    è quello del progetto OpenAI.
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
  la conferma della chiamata a pagamento.
- **«Genera immagini»:** chiamate a pagamento, con la conferma della sezione 8.

## 6. Pagina 4: immagini e analisi

- Il modello è quello scelto nelle Impostazioni (sezione 12), mostrato in sola lettura. Qui resta il **menù della
  qualità** (le qualità ammesse dal modello); predefinita l'ultima scelta, all'inizio `medium`.
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
  volta con la conferma della chiamata a pagamento.
- **Approvazione** come per le REAL: copia, almeno un tag; nessuna conferma di diritti per le SLOP. La **pubblicazione**
  resta un passo separato, dal wizard o dalla sezione Database.
- Le SLOP approvate entrano subito nello spread della pagina 1.

## 8. Conferme

- Tre tipi di chiamate a pagamento, ciascuna con **conferma esplicita** (senza importo), registrata in `paid_calls`
  con modello, token ed esito; esiti incerti mai ripetuti: **prompt** (una chiamata per gruppo), **immagini** (una per
  immagine), **analisi** (una per immagine, come oggi).
- La conferma della pagina 4 copre insieme immagini e analisi del gruppo: l'analisi è comunque necessaria per
  approvare. Le chiamate restano registrate una per una.
- Senza `OPENAI_API_KEY` le pagine a pagamento sono disattivate con il motivo. Il limite di spesa è quello del progetto
  OpenAI.

## 9. Dati

- Migrazione additiva: colonna `generation_slot` in `images` (JSON: tema e tag per categoria), solo per le SLOP del
  wizard.
- Tabella `slop_batches` per il lavoro in corso: tema, numero di immagini, slot, prompt, stato e date. Gli slot e i
  prompt pagati restano nel database anche se si chiude la scheda; un gruppo concluso o abbandonato si può cancellare.
- Il registro delle chiamate `paid_calls` (migrazione 0039, al posto di `spend` e `budget`) accetta i tipi `analysis`,
  `prompts` e `images`. Tabella `settings` per i due modelli.

## 10. Punti aperti

Nessuno: un solo modello di testo per analisi e prompt (decisione del 2026-11-10, «non complichiamoci troppo la vita»).
Più avanti: alternare più generatori, anche di altri fornitori, perché le SLOP non abbiano tutte la stessa «firma»
visiva.

## 11. Verifiche

- Test unitari dell'estrazione: soglie, ordine delle categorie, restringimento e stop, fattore di spread, varietà,
  nessuna combinazione doppia, tema sempre presente.
- Test d'integrazione con modelli finti (testo e immagini): conferme, budget, esiti incerti e rifiuti, analisi,
  confronto con lo slot, approvazione.
- Interfaccia nel browser su desktop e mobile: grafico (filtri, vista compatta e ingrandita, clic sulle barre), slot
  modificabili, prompt, revisione. Nessuna chiamata a pagamento reale.

## 12. Modelli nelle Impostazioni

Decisioni dell'owner del 2026-11-10: i menù dei modelli stanno nelle **Impostazioni**; lo studio SLOP non sceglie il
modello; per ora solo OpenAI; **nessun prezzo e nessun calcolo dei costi**.

- **Modello di testo** (tag e didascalie, prompt delle SLOP), predefinito `gpt-6.1-terra`: `gpt-6-astra`, `gpt-6.1-sol`,
  `gpt-6.1-terra`, `gpt-6-luna`, `gpt-6-sol`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.5-pro`,
  `gpt-5.4`, `gpt-5.4-pro`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.2`, `gpt-5.2-pro`, `gpt-5.1`, `gpt-5`, `gpt-5-mini`,
  `gpt-5-nano`, `gpt-5-pro`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o`, `gpt-4o-mini`, `o3-pro`, `o3`.
- **Modello di immagini**, predefinito `gpt-image-2`: `gpt-image-2.6-flare`, `gpt-image-2.6-sunburst`,
  `gpt-image-2.5-flare`, `gpt-image-2.5-sunburst` (qualità `low`, `medium`, `high`, `xhigh`, `max`); `gpt-image-2`,
  `gpt-image-1.5`, `gpt-image-1-mini`, `chatgpt-image-latest` (qualità `low`, `medium`, `high`). Per generare scene da
  testo la guida OpenAI indica Flare.
- Elenchi nel codice (`shared/models.v1.0.0.ts`), dagli identificativi della pagina ufficiale letta il 2026-11-10.
  Un modello è selezionabile se compare anche nell'elenco del progetto OpenAI (`GET /v1/models`, gratuito, in cache
  per un'ora); altrimenti compare con «(non disponibile nel progetto)» e non si può scegliere. Se l'elenco non si può
  leggere, si offrono tutti i modelli del codice con una nota.
- La scelta si salva nella tabella `settings` e vale subito per le chiamate successive; ogni chiamata registra il
  modello usato.
- L'analisi deve leggere immagini: se il modello di testo scelto non lo fa, OpenAI rifiuta la chiamata (4xx, nessun
  addebito) e il messaggio d'errore lo mostra; si sceglie un altro modello.
