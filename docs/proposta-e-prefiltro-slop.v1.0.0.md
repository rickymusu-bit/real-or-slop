# Proposta di generazione e prefiltro delle SLOP — specifica 1.0.0

Stato: **proposta, in attesa di approvazione dell'owner**. Nessun codice prima dell'approvazione.
Creata: 2026-11-12T18:32:55Z. Estende `docs/wizard-slop.v1.4.1.md` (sezioni 2, 3, 6, 7 e 8) e
`docs/statistiche-impostazioni.v1.0.1.md` (sezione 2).

## 1. Decisioni dell'owner (2026-11-12)

- Nessuna generazione a tempo: il sistema **propone** una generazione quando lo spread di un tag supera una soglia, tenendo conto anche
  delle REAL approvate. L'owner decide se generare, quindi ogni chiamata a pagamento resta confermata come oggi.
- Ogni SLOP generata riceve un **indice di ingannabilità**: il modello stima la probabilità che l'immagine sia generata e, prima del
  numero, indica gli elementi sospetti, così da ragionare invece di dare solo un numero.
- Le SLOP troppo ovvie si scartano.
- Nessun test di calibrazione preliminare: le SLOP passano comunque dall'approvazione dell'owner.

## 2. Proposta di generazione

**Spread netto** di un tag: REAL approvate o pubblicate con il tag, meno SLOP approvate o pubblicate con il tag (lo spread attuale dello
studio), meno **SLOP nuove** non ancora revisionate con il tag. Per una SLOP nuova valgono i tag dell'analisi; se l'analisi manca,
i tag del tema dello slot. Senza questa sottrazione lo stesso tag resterebbe sopra soglia, e quindi riproposto, finché l'owner non
revisiona le SLOP già generate. Le SLOP nel cestino non contano.

Un tag è **proposto** se valgono insieme:

1. spread netto ≥ **soglia di proposta** (Impostazioni, predefinita 10, da 1 a 200);
2. il tag, usato da solo come tema, supera la soglia del tema dello studio (REAL con il tag ≥ 10 nella configurazione attuale);
3. lo studio SLOP è aperto (soglia delle 50 REAL);
4. il tag non è stato ignorato, oppure il suo spread netto è cresciuto di almeno 5 da quando è stato ignorato.

**Dove compare.** Il calcolo è una lettura del database, gratuita, fatta all'apertura della dashboard e della sezione Generazione SLOP:
nessun processo in background. La sezione Generazione SLOP mostra un indicatore con il numero di proposte; la pagina 1 dello studio
le elenca sopra il grafico, al massimo 5, ordinate per spread netto:

> `architecture`: 14 REAL in più delle SLOP, 3 SLOP in attesa di revisione → **Prepara 10 SLOP**, **Ignora**

- **Prepara** apre la pagina 1 con il tag come tema e il numero di immagini pari allo spread netto, al massimo 10. L'owner può cambiare
  tema e numero; da lì il percorso è quello dello studio, con le stesse conferme.
- **Ignora** registra tag e spread netto del momento; la proposta ritorna solo se lo spread netto cresce di almeno 5.

## 3. Prefiltro: indice di ingannabilità

**Quando.** Dopo la copia di gioco e l'analisi di tag e didascalia, per ogni SLOP generata dallo studio o rigenerata dalla sezione
Database. È una chiamata a pagamento separata dall'analisi, con lo stesso modello di testo (deve leggere immagini).

**Perché separata.** L'analisi riceve il prompt come contesto e non deve sapere che esistono immagini generate (sezione 12 di
`docs/libreria-immagini.v1.8.0.md`). Unire le due richieste farebbe entrare il giudizio sull'origine nella didascalia e nei tag.

**Cosa riceve il modello.** Solo la copia di gioco, senza marchio «RS», e il testo «Valutazione delle immagini». Niente prompt, tag,
didascalia o origine, e niente base comune.

**Testo «Valutazione delle immagini».** È una quarta parte del contesto dei modelli, modificabile dalle Impostazioni con versioni e
ripristino come le altre, fino a 4000 caratteri. Prima versione proposta:

> Valuta se questa fotografia è stata scattata da una persona o generata da un modello. Osserva l'immagine nei dettagli: mani e anatomia,
> scritte e insegne, geometria e prospettiva, luce e ombre, riflessi, texture, coerenza dei dettagli sullo sfondo, coerenza storica di
> abiti, oggetti e veicoli, grana e rumore. Elenca prima gli elementi che fanno pensare a un'immagine generata, poi quelli che fanno
> pensare a una fotografia autentica, citando per ciascuno la parte dell'immagine a cui ti riferisci. Solo alla fine stima la
> probabilità che l'immagine sia generata. Se non trovi elementi in una delle due liste, lasciala vuota: non inventarli.

L'elenco degli indizi a favore dell'autenticità serve a evitare che il compito diventi una caccia all'errore: se chiede solo elementi
sospetti, il modello li trova anche in una foto vera.

**Risposta**, schema JSON nel codice, con i campi in quest'ordine perché il modello li scrive in sequenza:

- `suspicious`: fino a 5 voci `{ "where": …, "why": … }`, in italiano;
- `authentic`: fino a 5 voci con la stessa forma;
- `p_generated`: numero da 0 a 1, arrotondato a due decimali.

**Indice di ingannabilità** = 1 − `p_generated`. È un ordinamento, non una probabilità calibrata: un indice di 0,30 dice che l'immagine
è più sospetta di una con 0,60, non che inganna tre giocatori su dieci.

**Scarto.** Se l'indice è sotto la **soglia di scarto** (Impostazioni, predefinita 0,20, cioè `p_generated` ≥ 0,80; da 0,05 a 0,95,
oppure «spento»), la SLOP va nel cestino con il motivo «prefiltro», l'indice e gli elementi sospetti. Si recupera con un clic, come ogni
immagine nel cestino. L'approvazione dell'owner controlla solo le immagini che il prefiltro lascia passare; quelle che scarta si vedono
solo nel cestino. Per questo la pagina di revisione mostra «3 scartate dal prefiltro» con un collegamento al cestino filtrato. Il valore
predefinito è una stima e va rivisto dopo i primi gruppi.

**Revisione.** Per ogni SLOP: indice ed elementi delle due liste sotto la didascalia; ordinamento facoltativo per indice. La sezione
Database mostra l'indice nella scheda di ogni SLOP e lo usa come filtro («indice sotto…»).

**Copia cambiata.** L'indice riguarda la copia su cui è stato calcolato. Se l'owner cambia l'inquadratura, l'indice resta visibile
come «calcolato sulla copia precedente» e si ricalcola solo su richiesta, a pagamento e con conferma.

**Esiti.** Un esito incerto (5xx, timeout) è registrato e mai ripetuto in automatico: la SLOP resta nuova senza indice, con l'avviso,
e non viene scartata. Un rifiuto (4xx) non è addebitato e si può ripetere su richiesta.

## 4. Conferme e registro

- La conferma della pagina 4 dello studio copre per ogni immagine generazione, analisi e valutazione, e lo dice: «Per ogni immagine:
  generazione, tag e didascalia, valutazione». Lo stesso vale per la rigenerazione dalla sezione Database.
- `paid_calls` accetta il nuovo tipo `authenticity` (modello, token, esito). La scheda Statistiche lo conta con gli altri tipi.
- La proposta di generazione è gratuita: nessuna chiamata parte senza la conferma dell'owner.

## 5. Dati

Migrazione additiva `0045_slop_proposals_prefilter.v1.0.0.sql`:

- in `images`: `authenticity_score` (indice, 0–1), `authenticity_json` (le due liste e `p_generated`), `authenticity_model`,
  `authenticity_context` (versione del testo usata), `authenticity_copy` (chiave della copia valutata), `authenticity_at`,
  `trash_reason` (`prefilter` oppure nullo);
- tabella `slop_proposal_ignored` (tag, spread netto al momento, data);
- `model_contexts` accetta la parte `authenticity`;
- `app_settings`: `slop_proposal_threshold` (10) e `slop_prefilter_threshold` (0,20, `off` per spegnerlo).

API: `GET /api/admin/slop/proposals` (gratuita), `POST /api/admin/slop/proposals/ignore`, `POST /api/admin/library/authenticity`
(ricalcolo su richiesta, a pagamento).

## 6. Fuori da questa specifica

- Nessun test di calibrazione preliminare né valutazione delle REAL (decisione dell'owner del 2026-11-12).
- Confronto tra l'indice del modello e il tasso di riconoscimento nel gioco: possibile più avanti con i dati della sezione Database.
  È l'unico modo di sapere se l'indice predice l'inganno dei giocatori.

## 7. Limiti

- La probabilità dichiarata dal modello non è calibrata e può variare se la stessa immagine viene valutata due volte. La soglia di
  scarto è quindi arbitraria finché non la si confronta con le decisioni dell'owner o con i dati del gioco.
- Il modello non sbaglia come le persone. Un prefiltro severo spinge le SLOP verso ciò che inganna il modello, non per forza i
  giocatori. La soglia predefinita scarta solo i casi in cui il modello è molto sicuro.
- Ogni SLOP scartata è una generazione pagata e persa, salvo recupero dal cestino.

## 8. Verifiche

- Test unitari: spread netto (SLOP nuove con tag dell'analisi o dello slot, cestino escluso), condizioni della proposta, ritorno dopo
  «Ignora», numero proposto, soglie.
- Test d'integrazione con modelli finti: conferma unica per generazione, analisi e valutazione; ordine e schema della risposta;
  scarto sopra soglia e recupero; soglia spenta; esito incerto senza scarto e senza ripetizione; rifiuto 4xx; registro `paid_calls`;
  il modello di valutazione non riceve prompt, tag, didascalia né origine.
- Interfaccia nel browser su desktop e mobile: proposte con Prepara e Ignora, indice ed elementi in revisione e nel Database,
  collegamento alle scartate. Nessuna chiamata a pagamento reale.
