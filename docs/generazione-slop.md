# Generazione delle SLOP: gemelle, studio e batch automatici — specifica 3.0.0

Stato: approvata dall'owner il 2026-11-14, implementata nell'app 1.26.0 con la migrazione 0049 (in revisione). Aggiornata:
2026-11-14T21:30:00Z. La 3.0.0 sostituisce gruppi e slot con le **SLOP gemelle**: ogni SLOP nasce da una sola REAL (tag e
descrizione) e prende l'aspetto da un'altra REAL. Le versioni precedenti (2.0.1: gruppi di genere e decennio con slot di tag) restano
nella cronologia git. Regole sui contenuti: specifica `contenuti-e-trasparenza`. Tag e categorie: specifica `libreria-immagini`.
Trattamento delle SLOP: specifica `copie-di-gioco`, sezione 4.

## 1. Decisioni dell'owner

- Partenza a freddo: si caricano abbastanza REAL prima di generare; nessun ripiego con modelli (2026-11-10).
- I tag finali di una SLOP sono quelli dell'analisi, come per le REAL (2026-11-10).
- Riscrivere un prompt e rigenerare un'immagine sono liberi, con conferma, perché a pagamento; fino a 10 immagini per volta; prompt in
  inglese (2026-11-10).
- Batch automatici su proposta: nessun timer né prefiltro; un solo batch aperto alla volta; prompt senza revisione; il batch gira nel
  browser; la proposta nasce quando 100 × (REAL − SLOP) / REAL raggiunge la soglia (2026-11-12).
- Le SLOP generate mostrano i loro tag di partenza (2026-11-14).
- Prompt da 600 a 1000 caratteri (2026-11-14).
- Trattamento delle SLOP: «chi fa disinformazione modifica le foto generate per renderle più plausibili»; il trattamento copia le
  REAL, non le supera (2026-11-14).
- **SLOP gemelle** (2026-11-14, dopo il primo lotto per gruppi). Gli slot riducevano le foto a tag e li ricombinavano: un insieme di
  tag presi da foto diverse non descrive nessuna scena esistita (uno swami a una protesta in Alabama, un sit-in a un festival), e il
  lotto aveva 5 SLOP a colori su 10 contro 2 REAL su 11. Proposta dell'owner: «userei una REAL per estrarre un prompt e un'altra REAL
  per il trattamento». Ogni REAL ha quindi al massimo una SLOP gemella, scritta dai suoi tag e dalla sua descrizione; l'aspetto viene
  da un'altra REAL con lo stesso Colore, Supporto e decennio. I tag delle SLOP ricalcano così quelli delle REAL, in ogni categoria.
- Una SLOP e la REAL da cui è nata non compaiono nella stessa partita (2026-11-14; specifica `gioco-a-livelli`).

## 2. Gemelle

- **Gemella** di una REAL: una SLOP generata da quella REAL (`generation_source`). Conta finché è nuova, approvata o pubblicata; nel
  cestino libera la sua REAL, ripristinata la riprende. Le SLOP generate prima della 1.26.0 non sono gemelle di nessuno.
- **REAL in attesa:** approvate o pubblicate, senza gemella. Sono ciò che studio e batch possono generare.
- **REAL campione** di una gemella: un'altra REAL approvata o pubblicata, misurata, con lo stesso Colore, Supporto e decennio della
  REAL di origine, scelta a caso evitando finché si può le campioni già prese nel batch; se nessun'altra REAL ha quell'aspetto, la REAL
  di origine stessa; se nessuna è misurata, nessuna (copia senza trattamento). Fornisce solo le misure al trattamento (specifica
  `copie-di-gioco`, sezione 4): non entra nei prompt. Una foto sola e non la media di più foto, perché la media stringerebbe la
  varietà e mescolerebbe misure che nessuna REAL ha insieme. Diversa dalla REAL di origine perché la gemella non ne ripeta
  risoluzione e tono.
- Lo studio si apre con almeno 50 REAL approvate o pubblicate (Impostazioni). Al massimo 10 immagini per batch (nel codice).
- Gruppi e soglia del gruppo della 2.0 non servono più a generare: i gruppi restano come filtro del Database e nelle Statistiche.

## 3. Studio

Quattro passi: REAL, Prompt, Immagini, Revisione.

1. **REAL.** Conteggi (REAL, con gemella approvata o pubblicata, in attesa) e la griglia delle REAL in attesa, dalla più vecchia, con
   miniatura e titolo; la pressione prolungata apre l'anteprima con i tag. L'owner ne sceglie da 1 a 10, o «Scegli le prime 10». La
   scelta sopravvive a un ricaricamento.
2. **Prompt.** «Genera prompt» crea il batch (gratis: per ogni REAL i tag di quel momento e la REAL campione) e chiede i prompt con
   una chiamata a pagamento. Per ogni immagine: titolo e tag della REAL, prompt modificabile (salvato all'uscita dal campo) con la sua
   lunghezza, formato modificabile senza costi, «Riscrivi» (una nuova chiamata: il modello riceve gli altri prompt per restare diverso).
3. **Immagini.** Una conferma copre immagini e analisi del batch.
4. **Revisione** (sezione 6).

## 4. Prompt

- Una chiamata a pagamento al modello di testo scrive tutti i prompt del batch: base comune e «Prompt per le SLOP» del contesto, più
  le righe fisse nel codice. Per ogni voce la risposta dà il prompt, i tag usati e il formato (specifica `copie-di-gioco`).
- **Che cosa riceve il modello per ogni voce:** i tag della REAL divisi per categoria, la sua descrizione (al massimo 500 caratteri)
  e, come contesto, le descrizioni (al massimo 300 caratteri) di fino a 3 altre REAL dello stesso decennio che condividono l'evento o
  il luogo. Mai il titolo, mai l'immagine, mai la REAL campione.
- **Righe fisse nel codice:** inglese; da 600 a 1000 caratteri (un prompt fuori misura non si scarta: lo studio ne mostra la
  lunghezza); che cos'è una gemella: un'altra fotografia che potrebbe stare accanto alla REAL nello stesso archivio, stesso evento o
  tipo di scena, luogo, decennio, genere, colore e supporto, ma momento, punto di vista e persone diversi; mai la fotografia della voce,
  mai i nomi di persone delle descrizioni. Tetto di risposta: 16 000 token.
- **Testo proposto per «Prompt per le SLOP»** (contesto 1.8.0, una proposta finché l'owner non lo salva). Rispetto alla 1.7.0, dopo il
  lotto del 2026-11-14:
  - nessuno schema fisso: ogni prompt di quel lotto metteva «una donna… mentre un uomo…» in primo piano e chiudeva con obiettivo e
    distanza; ora distanza, punto di vista, luce e formato cambiano, e il genere si rispetta (una scena di folla mostra la folla);
  - la resa dell'immagine e mai la fotografia come oggetto: cinque stampe su cinque avevano margini bianchi, angoli consumati e graffi,
    perché il testo parlava di «carta ingiallita»;
  - le scritte non nominano la città, lo Stato o l'evento («ARLINGTON DRUGS», «ALABAMA STATE CAPITOL»), e non si ripetono da un
    cartello all'altro;
  - restano: regole in positivo, persone varie con i volti visibili, cartelli rivolti dove guarda chi li tiene, usura dell'epoca,
    generi che implicano un reato solo con persone inventate.

## 5. Immagini, trattamento e analisi

- Il generatore (modello e qualità delle Impostazioni, mostrati in sola lettura) riceve solo il testo del prompt e la dimensione del
  formato. L'immagine entra come SLOP nuova, «Gemella di *titolo della REAL*», con prompt, modello, batch, REAL di origine, tag di
  partenza, REAL campione e qualità; il browser applica il trattamento e prepara la copia di gioco; poi parte l'analisi (specifica
  `libreria-immagini`, sezione 5), con il prompt come contesto, salvo Genere, Colore e Supporto che si giudicano solo dall'immagine.
  Le chiamate restano registrate una per una; un problema dell'account OpenAI ferma la serie.
- Esiti: un rifiuto del generatore per le sue regole d'uso (4xx) non è addebitato e l'immagine resta da generare; un esito incerto è
  registrato e mai ripetuto.

## 6. Revisione

- Per ogni immagine: copia trattata con il marchio «RS», tag dell'analisi per categoria, «Previsti ma non rilevati», Analizza, Approva,
  Pubblica, Cestino, Rigenera (una nuova immagine per la stessa REAL; la precedente resta, da cestinare), comandi del trattamento nel
  dettaglio del Database (specifica `copie-di-gioco`, sezione 4). La pressione prolungata apre l'anteprima con prompt, tag di partenza
  e tag dell'analisi.
- **Previsti ma non rilevati:** dei tag della REAL di origine si confrontano decennio, genere, colore, supporto, evento e luogo;
  persone, oggetti e ambiente possono cambiare, perché la gemella è un'altra scena. Se mancano decennio, genere, colore o supporto la
  riga è evidenziata: la gemella ha mancato l'obiettivo (una «diapositiva» che l'analisi vede come foto digitale).
- **Tag di partenza:** i tag della REAL di origine al momento del batch, di sola lettura, nel dettaglio del Database (con «Apri la
  REAL di origine») e nelle anteprime.
- Approvare una SLOP richiede copia e almeno un tag, senza conferma dei diritti; la pubblicazione è un passo separato.

## 7. Batch automatici su proposta

**Conteggi:** `n_real` REAL approvate o pubblicate; `n_slop` quelle con una gemella approvata o pubblicata; `mancanti` le REAL in
attesa; `n_nuove` le REAL con una gemella nuova. `spread = n_real − n_slop`, `spread_percent = 100 × spread / n_real`.

**Proposta:** proposte attive nelle Impostazioni, nessun batch aperto, studio aperto, `spread_percent` almeno pari alla soglia (33%
predefinito: 1,5 REAL per gemella), almeno una REAL in attesa, proposta non ignorata oppure cresciuta di almeno 10 punti da quando è
stata ignorata. La rilevazione è una lettura gratuita, all'apertura della dashboard e dopo ogni azione che cambia la libreria.

**Notifica** in cima a ogni sezione: conteggi, spread e «Genera *k* SLOP» con `k = min(mancanti, 10)`, «Ignora», «Chiudi» (nasconde
fino alla prossima apertura). **Genera** conferma tutte le chiamate del batch (prompt, immagini, analisi); il server ricontrolla la
proposta e, se è cambiata, non parte.

**Svolgimento:** il server sceglie a caso `k` REAL in attesa e le loro campioni; il browser chiede i prompt (una volta), poi per ogni
immagine la generazione, il trattamento, la copia e l'analisi. Ogni immagine è registrata prima dell'invio, quindi un batch ripreso
dopo la chiusura della scheda non ripete mai una chiamata; prompt rimasti in scrittura oltre 10 minuti contano come esito incerto e
fermano il batch. I prompt non si modificano. «Interrompi» ferma le chiamate rimaste.

**Stati:** `running`, `review` (generazione finita o interrotta), `closed` quando ogni immagine è approvata, pubblicata o nel cestino.
Finché un batch è aperto non nascono altre proposte. «Rivedi nel Database» apre il filtro del batch; lo studio manuale resta usabile.

## 8. Limiti

- Il catalogo delle SLOP rispecchia quello delle REAL: nessun tema che le REAL non abbiano. È voluto.
- Una gemella può somigliare alla sua REAL: il generatore non la vede e il prompt chiede un'altra scena, ma evento, luogo e genere
  sono gli stessi. Per questo le due non compaiono nella stessa partita; la revisione dell'owner resta il controllo finale.
- Le descrizioni di Commons possono contenere nomi di persone reali: la riga fissa li esclude, la revisione li intercetta.
- Con la soglia al 33% e un catalogo già pareggiato, poche REAL nuove non fanno nascere una proposta: lo studio manuale le copre, o si
  abbassa la soglia nelle Impostazioni.
- Il batch avanza solo con la dashboard aperta.
- Più avanti: alternare generatori diversi, perché le SLOP non abbiano tutte la stessa «firma» visiva.
