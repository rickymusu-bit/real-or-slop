# Generazione delle SLOP: gemelle, studio e batch automatici — specifica 4.0.0

Stato: approvata dall'owner il 2026-11-15, **da implementare** (issue rickymusu-bit/real-or-slop#136); in produzione c'è la 3.0.0
(app 1.26.0: prompt scritto dai tag e dalla descrizione di Commons, una chiamata per tutti i prompt del batch, REAL campione separata).
Aggiornata: 2026-11-15T09:00:00Z. La 4.0.0 fa scrivere il prompt da una descrizione della REAL fatta guardandola, cambia un solo
elemento del fatto, usa una chiamata per foto a ogni passo e toglie la REAL campione. Le versioni precedenti restano nella cronologia
git. Regole sui contenuti: specifica `contenuti-e-trasparenza`. Tag, analisi e contesto dei modelli: specifica `libreria-immagini`.
Copie di gioco e trattamento: specifica `copie-di-gioco`.

## 1. Decisioni dell'owner

- Partenza a freddo: si caricano abbastanza REAL prima di generare; nessun ripiego con modelli (2026-11-10).
- I tag finali di una SLOP sono quelli dell'analisi, come per le REAL (2026-11-10).
- Riscrivere un prompt e rigenerare un'immagine sono liberi, con conferma, perché a pagamento; fino a 10 immagini per volta; prompt in
  inglese (2026-11-10).
- Batch automatici su proposta: nessun timer né prefiltro; un solo batch aperto alla volta; il batch gira nel browser; la proposta
  nasce quando 100 × (REAL − SLOP) / REAL raggiunge la soglia (2026-11-12; soglia a 10% in produzione dal 2026-11-14).
- **SLOP gemelle** (2026-11-14): ogni SLOP nasce da una sola REAL; ogni REAL ha al massimo una gemella; una SLOP e la sua REAL non
  compaiono nella stessa partita (specifica `gioco-a-livelli`).
- **Un solo elemento cambiato** (2026-11-15): «per creare un fatto inventato basta cambiare un solo elemento di una foto REAL: una
  protesta in una via di Parigi diventa una protesta in una piazza di Marsiglia, mantenendo la plausibilità dell'evento e usando la
  REAL come riferimento stilistico». Dopo il lotto del 2026-11-15, in cui il modello di testo, senza vedere la foto, aveva inventato
  cartelli tipografici con slogan sbagliati per la Marcha del Silencio e riempito Parigi di cliché.
- **Prompt precisi e dettagliati** (2026-11-15): «a livello di composizione e soggetto dobbiamo essere estremamente precisi e
  dettagliati». I dettagli vengono da ciò che si vede nella REAL, non dall'invenzione del modello.
- **La pipeline** (2026-11-15): foto REAL → descrizione della REAL → prompt della SLOP → foto SLOP → tag della SLOP. Ogni freccia è una
  chiamata a un modello; si ripete per ogni foto del lotto; ogni modello riceve i dati di una sola foto.
- **Modelli predefiniti** (2026-11-15): `gpt-6.1-sol` per il testo, `gpt-image-2.5-flare` in qualità `high` per le immagini.
- **Scelta delle REAL** (2026-11-15): è una scelta editoriale non caricare REAL che un generatore non sa disegnare bene. Una volta
  scelta bene la REAL, la causa di una SLOP insufficiente sta nel prompt o nel generatore: nessun comando per cestinare la REAL dalla
  revisione della gemella. I criteri di scelta sono da definire (sezione 9).

## 2. Gemelle

- **Gemella** di una REAL: una SLOP generata da quella REAL (`generation_source`). Conta finché è nuova, approvata o pubblicata; nel
  cestino libera la sua REAL, ripristinata la riprende. Le SLOP generate prima della 1.26.0 non sono gemelle di nessuno.
- **REAL in attesa:** approvate o pubblicate, senza gemella. Sono ciò che studio e batch possono generare.
- Lo studio si apre con almeno 50 REAL approvate o pubblicate (Impostazioni). Al massimo 10 immagini per batch (nel codice).
- Nessuna REAL campione: le misure del trattamento sono quelle della REAL di origine (specifica `copie-di-gioco`, sezione 4).

## 3. La pipeline, foto per foto

Per ogni REAL del batch, in quest'ordine. Ogni chiamata riguarda una sola foto, si conferma, si registra in `paid_calls` e, se l'esito
è incerto, non si ripete mai da sola.

1. **Descrizione della REAL** (modello di testo, con l'immagine). Riceve la copia di gioco della REAL e nient'altro: né titolo, né
   tag, né origine. Scrive in inglese una descrizione esauriente di ciò che si vede (sezione 4). Si salva con la REAL
   (`visual_description`, con modello e data): si paga una volta sola per REAL, l'owner la legge e la corregge, e ogni rigenerazione la
   riusa. Se la REAL cambia copia di gioco, la descrizione resta finché l'owner non la fa riscrivere.
2. **Prompt della SLOP** (modello di testo, senza immagine). Riceve la descrizione, i tag della REAL per categoria e la sua
   descrizione di Commons. Cambia un solo elemento del fatto e scrive il prompt (sezione 5). Restituisce il prompt, l'elemento cambiato
   (quale, da che cosa a che cosa) e i tag usati.
3. **Foto SLOP** (modello di immagini). Riceve solo il testo del prompt e la dimensione del formato comune più vicino alle proporzioni
   dell'originale della REAL (specifica `copie-di-gioco`, sezione 2). L'immagine entra come SLOP nuova, «Gemella di *titolo della
   REAL*», con prompt, modello, qualità, batch, REAL di origine, tag di partenza ed elemento cambiato.
4. **Trattamento e copia di gioco** (browser, nessun modello): ritaglio 4:5 centrato, trattamento verso le misure della REAL di
   origine, copia WebP. L'owner può cambiare l'inquadratura nella revisione.
5. **Tag della SLOP** (modello di testo, con l'immagine): l'analisi di ogni immagine (specifica `libreria-immagini`, sezione 5), con il
   prompt come contesto, salvo Genere, Colore e Supporto giudicati solo dall'immagine.

Un batch di 10 foto fa al massimo 40 chiamate: 10 descrizioni (meno quelle già scritte), 10 prompt, 10 immagini, 10 analisi. La
conferma del batch dice il numero esatto.

## 4. Descrizione della REAL

- **Istruzioni:** la base comune del contesto, una nuova parte del contesto «Descrizione delle REAL» modificabile dalle Impostazioni,
  e le righe fisse nel codice (inglese, sezioni, lunghezza). Non parlano mai di immagini generate: chi descrive non sa a che cosa
  serve la descrizione.
- **Sezioni**, in quest'ordine, ciascuna obbligatoria:
  1. *Subject and action*: che cosa accade, chi fa che cosa.
  2. *People*: quante, dove stanno nell'inquadratura, età apparente, corporatura, abiti, pose, direzione dello sguardo; mai nomi, mai
     giudizi sull'identità.
  3. *Lettering*: ogni scritta visibile trascritta esattamente, nella sua lingua, con dove si trova e come è fatta (a mano, stampata,
     dipinta, incisa, dimensione, colore); se non ci sono scritte, lo dice.
  4. *Setting*: lo sfondo elemento per elemento, da sinistra a destra e dal primo piano al fondo: edifici, veicoli, vegetazione,
     arredi, oggetti.
  5. *Light*: ora apparente, direzione e qualità della luce, ombre, sorgenti artificiali.
  6. *Camera*: punto di vista e altezza, distanza, angolo di campo apparente, profondità di campo, mosso, inquadratura (che cosa è
     tagliato dai bordi).
  7. *Rendering*: colore o bianco e nero, grana o rumore, nitidezza, contrasto, dominante, alte luci e ombre, difetti visibili.
- **Lunghezza:** da 1500 a 3000 caratteri. Solo ciò che si vede: nessuna interpretazione dell'evento, nessuna informazione presa da
  fuori dall'immagine.
- Nello studio e nel dettaglio del Database di una REAL l'owner legge e modifica la descrizione (gratis) e può farla riscrivere (a
  pagamento, con conferma).

## 5. Prompt

- **Istruzioni:** base comune, «Prompt per le SLOP» del contesto e righe fisse nel codice.
- **Il compito:** riscrivere la fotografia descritta cambiando **un solo elemento del fatto**, scelto dal modello tra quelli che in
  quella foto sono plausibili e visibili:
  - il luogo (un'altra città, un'altra piazza, un altro edificio dello stesso tipo);
  - la stagione, il tempo atmosferico o l'ora del giorno;
  - un oggetto o un veicolo chiave;
  - l'esito o il momento dell'azione.
  Tutto il resto segue la descrizione: genere, epoca, supporto, colore, punto di vista, luce, numero e disposizione delle figure.
- **Le persone sono sempre inventate**, qualunque sia l'elemento cambiato: stessi ruoli, età e abiti del tipo descritto, volti nuovi.
  Mai nomi; i generi che implicano un reato o una colpa solo con persone inventate (specifica `contenuti-e-trasparenza`).
- **Scritte:** il prompt dice per ogni scritta visibile il testo esatto e come è fatta, riprendendolo dalla descrizione e adattandolo
  all'elemento cambiato (se cambia la città, cambiano le insegne). Dove la descrizione non ha scritte, il prompt dice che non ce ne sono.
  Il generatore, lasciato libero, scrive il nome del luogo sui muri («PARIS 2026», «MARTIN PLACE»).
- **Niente aggettivi d'effetto:** la resa si descrive come è stata ottenuta (distanza, mosso, rumore, messa a fuoco), non con
  «drammatico», «nitidissimo», «cinematografico», che il generatore traduce in una resa da illustrazione.
- **Forma del prompt:** in inglese, da 1500 a 2500 caratteri, nelle stesse sezioni della descrizione. Un prompt fuori misura non si
  scarta: lo studio ne mostra la lunghezza.
- **Risposta:** `prompt`; `change` con `element` (uno tra `place`, `time`, `object`, `action`), `from` e `to` in poche parole;
  `used_tags`. Il modello non sceglie il formato.
- **Elemento cambiato:** si salva con la SLOP e si vede accanto ai tag di partenza nello studio, nel dettaglio del Database e nelle
  anteprime («Elemento inventato: luogo, da Parigi a Marsiglia»). Mostrarlo anche nella lista di fine partita è una proposta ancora da
  confermare (sezione 9).
- **Testi proposti del contesto** (contesto 1.9.0, proposte finché l'owner non le salva): la nuova parte «Descrizione delle REAL» e un
  nuovo «Prompt per le SLOP» scritto per questo compito. Le regole sui contenuti restano quelle della 1.8.0.

## 6. Studio

Quattro passi: REAL, Descrizioni e prompt, Immagini, Revisione.

1. **REAL.** Conteggi e griglia delle REAL in attesa, dalla più vecchia; l'owner ne sceglie da 1 a 10.
2. **Descrizioni e prompt.** Per ogni REAL, una dopo l'altra: la descrizione (scritta ora se manca, modificabile, «Riscrivi la
   descrizione»), poi il prompt con la sua lunghezza e l'elemento cambiato (modificabili, «Riscrivi il prompt»). Una conferma all'inizio
   copre le chiamate del passo e ne dice il numero.
3. **Immagini.** Una conferma copre immagini e analisi.
4. **Revisione.** Per ogni immagine: copia trattata con il marchio «RS», tag dell'analisi, «Previsti ma non rilevati», elemento
   cambiato, Inquadratura, «Senza trattamento» o «Con trattamento», Analizza, Approva, Pubblica, Cestino, Rigenera (una nuova immagine
   dallo stesso prompt; la precedente resta, da cestinare). La pressione prolungata apre l'anteprima con prompt, tag di partenza,
   elemento cambiato e tag dell'analisi.

**Previsti ma non rilevati:** dei tag della REAL si confrontano decennio, genere, colore, supporto ed evento, più il luogo se non è
l'elemento cambiato. Se mancano decennio, genere, colore o supporto la riga è evidenziata.

Approvare una SLOP richiede copia 4:5 e almeno un tag, senza conferma dei diritti; la pubblicazione è un passo separato.

## 7. Batch automatici su proposta

**Conteggi e proposta:** come nella 3.0.0. `n_real` REAL approvate o pubblicate; `n_slop` quelle con una gemella approvata o
pubblicata; `mancanti` le REAL in attesa; proposta quando `100 × (n_real − n_slop) / n_real` raggiunge la soglia, c'è almeno una REAL in
attesa, nessun batch è aperto, lo studio è aperto e la proposta non è stata ignorata (torna dopo 10 punti in più).

**Notifica:** conteggi e «Genera *k* SLOP» con `k = min(mancanti, 10)`, «Ignora», «Chiudi». **Genera** conferma tutte le chiamate del
batch, con il loro numero; il server ricontrolla la proposta e, se è cambiata, non parte.

**Svolgimento:** il server sceglie a caso `k` REAL in attesa; il browser, per ogni REAL, esegue i passi della sezione 3 uno dopo
l'altro. Ogni passo di ogni foto è registrato prima dell'invio, quindi un batch ripreso dopo la chiusura della scheda non ripete mai
una chiamata; un esito incerto ferma quella foto, non il batch; un problema dell'account OpenAI ferma il batch. Descrizioni e prompt non
si modificano durante il batch. «Interrompi» ferma le chiamate rimaste.

**Stati:** `running`, `review`, `closed` quando ogni immagine è approvata, pubblicata o nel cestino. Finché un batch è aperto non
nascono altre proposte. «Rivedi nel Database» apre il filtro del batch; lo studio manuale resta usabile.

## 8. Limiti

- Una gemella somiglia molto alla sua REAL, anche nella composizione: è voluto. Le due non compaiono nella stessa partita; chi conosce
  una fotografia famosa ne riconosce la variante.
- Se cambia il luogo, il tag di Luogo della SLOP non coincide con quello della REAL: il bilanciamento per tag resta esatto per il
  resto, non su quell'elemento.
- La descrizione nasce dalla copia di gioco 4:5 della REAL: ciò che il ritaglio toglie non viene descritto, e il generatore lo
  completa da sé ai lati.
- Il batch avanza solo con la dashboard aperta.
- Più avanti: alternare generatori diversi, perché le SLOP non abbiano tutte la stessa «firma» visiva.

## 9. Da decidere

- **Criteri di scelta delle REAL:** quali foto un generatore sa disegnare bene (soggetto centrale, poche figure, poche scritte, niente
  luoghi o volti che tutti riconoscono…). L'owner li definisce con una lista esauriente prima che entrino nella specifica
  `dashboard-admin-wizard-real`. Fino ad allora la scelta resta al giudizio dell'owner nel wizard.
- **Elemento cambiato nella lista di fine partita:** mostrare al giocatore, accanto al prompt, qual era il fatto inventato.
