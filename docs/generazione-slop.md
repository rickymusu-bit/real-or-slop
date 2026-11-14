# Generazione delle SLOP: studio e batch automatici — specifica 2.0.1

Stato: vigente, in produzione con l'app 1.25.0 e la migrazione 0048 (2026-11-14). Aggiornata: 2026-11-14T16:30:00Z.
La 2.0.1 chiama «REAL campione» la foto da cui il trattamento prende le misure, per non confonderla con le foto da cui nascono
slot ed esempi. La 2.0.0 sposta il bilanciamento dai singoli tag ai **gruppi** di REAL dello stesso genere e decennio, dà al modello di testo esempi
del gruppo, chiede prompt più lunghi e tratta le SLOP perché abbiano l'aspetto delle REAL del gruppo (decisioni dell'owner del
2026-11-14, sezione 1). La 1.0.0 era la versione consolidata di `wizard-slop.v1.4.1` e `proposta-generazione-slop.v2.0.1`; le versioni
precedenti restano nella cronologia git. Regole sui contenuti: specifica `contenuti-e-trasparenza`. Tag e categorie: specifica
`libreria-immagini`. Trattamento delle SLOP: specifica `copie-di-gioco`, sezione 4.

## 1. Decisioni dell'owner

- I tag del tema sono obbligatori in tutti i prompt; fino a 10 immagini per volta; prompt in inglese (2026-11-10).
- Partenza a freddo: si caricano abbastanza REAL prima di generare; nessun ripiego con modelli (2026-11-10).
- I tag finali di una SLOP sono quelli dell'analisi, come per le REAL; lo slot resta come provenienza (2026-11-10).
- Riscrivere un prompt e rigenerare un'immagine sono liberi, con conferma, perché a pagamento (2026-11-10).
- Batch automatici su proposta: nessun timer né prefiltro; un solo batch aperto alla volta; slot e prompt senza revisione; il batch gira
  nel browser (2026-11-12).
- Le SLOP generate mostrano i loro tag di partenza (2026-11-14).
- **Gruppi** (2026-11-14). Il primo batch automatico è nato sul tag `color`, che non dice nulla del soggetto, e ha mescolato tag di foto
  diverse (una banda militare in mezzo a un saccheggio). Uno slot nato da una sola REAL sarebbe coerente ma troppo simile alla sua fonte
  («se genero una SLOP dalla foto di King arrestato otterrò qualcosa di simile; con 100 foto segnaletiche d'epoca otterrei risultati
  migliori e più di una SLOP»). Il bilanciamento lavora quindi su gruppi di REAL dello stesso **genere e decennio**; il colore non fa
  parte del gruppo. Un gruppo genera solo con almeno **5** REAL, e al massimo tante SLOP quante sono le sue REAL.
- I gruppi sotto soglia indicano quante REAL mancano: il bilanciamento dice anche che cosa caricare (2026-11-14).
- **Prompt da 600 a 1000 caratteri** (2026-11-14): oggi il modello ne scrive in media 319, troppo pochi per descrivere supporto,
  persone e dettagli d'epoca.
- **Trattamento delle SLOP** (2026-11-14): «il post-processamento di una SLOP non è di per sé negativo, perché chi fa disinformazione
  modifica le foto generate per renderle più plausibili». Il trattamento copia la distribuzione delle REAL del gruppo, non la supera.

## 2. Gruppi

- **Gruppo:** coppia di un tag di Genere e uno di Tempo (`mugshot` + `1960s`). Un'immagine senza Genere o senza Tempo non appartiene a
  nessun gruppo (avviso nel Database). Per le SLOP valgono i tag dell'analisi.
- **Conteggi** per gruppo: `n_real` e `n_slop` tra le approvate e pubblicate; `n_nuove` tra le SLOP nuove, con il gruppo dell'analisi o,
  prima dell'analisi, quello da cui sono nate (`generation_group`); il cestino non conta. `spread = n_real − n_slop`,
  `spread_percent = 100 × spread / n_real`, `N = spread − n_nuove`.
- **Soglia del gruppo:** almeno 5 REAL approvate o pubblicate (Impostazioni, da 1 a 200). Sotto soglia il gruppo non genera e mostra
  «mancano *k* REAL».
- **Tetto:** un gruppo non riceve più SLOP di quante REAL ha; studio e batch propongono al massimo `N` immagini.
- Lo studio si apre con almeno 50 REAL approvate o pubblicate (Impostazioni, invariato).

## 3. Studio, pagina 1: gruppo e tema

- **Tabella dei gruppi:** genere, decennio, REAL, SLOP, nuove, spread, stato rispetto alla soglia (o REAL mancanti), ordinata per spread
  percentuale; filtro per genere e per decennio. Un clic sceglie il gruppo.
- **Tema** facoltativo: uno o più tag del vocabolario che tutte le foto di riferimento devono avere (`protest`, `police`). Le foto di
  riferimento sono le REAL del gruppo con tutti i tag del tema; devono essere almeno quante la soglia del gruppo.
- Numero di immagini da 1 a 10, preimpostato a `min(N, 10)`; oltre `N` un avviso non bloccante. «Prepara gli slot» è gratuito.
- Il grafico dello spread per tag resta nella scheda «Distribuzione» del Database (specifica `database-immagini`), come informazione.

## 4. Slot

Uno slot per immagine: gruppo, tema, al massimo un tag per categoria e una REAL campione per il trattamento
(`shared/slot-extraction.ts`).

1. Foto di riferimento: le REAL del gruppo con tutti i tag del tema.
2. Categorie in ordine: Colore, Supporto, Luogo, Ambiente, Evento, Persone, Oggetti e strutture (Genere e Tempo sono quelli del gruppo);
   si saltano quelle coperte dal tema.
3. Per ogni categoria si pesca un tag tra quelli delle foto di riferimento, che poi si restringono a quelle che lo contengono; il
   restringimento si ferma quando resterebbero meno di 3 foto. Dentro un gruppo omogeneo le combinazioni restano plausibili.
4. **Peso:** radice quadrata della frequenza tra le foto di riferimento per il fattore di spread del tag `max(0,25; 1 + s / S)`, come
   nella 1.0.0: lo spread per tag conta ancora dentro il gruppo.
5. **Varietà:** un tag già uscito nella stessa categoria pesa un terzo; due slot non hanno la stessa combinazione (fino a 20 tentativi).
6. **REAL campione del trattamento:** una REAL a caso tra le foto di riferimento con lo stesso Supporto e Colore dello slot (se
   nessuna, una qualsiasi del gruppo), diversa per ogni slot finché ce ne sono. Fornisce solo le misure e il Supporto al trattamento
   (specifica `copie-di-gioco`, sezione 4): non entra nei prompt né negli esempi, e il modello di testo non sa quale sia. Una sola foto
   e non la media di più foto, perché la media stringerebbe la varietà (SLOP tutte su valori intermedi) e mescolerebbe misure che
   nessuna REAL ha insieme.
7. Una categoria senza candidati resta vuota: il modello di testo è libero su quell'aspetto.

Nello studio l'owner vede gli slot (una riga per slot, una colonna per categoria), cambia o svuota ogni cella e ripesca uno slot o tutti.

## 5. Prompt

- Una chiamata a pagamento al modello di testo scrive tutti i prompt del gruppo: base comune e «Prompt per le SLOP» del contesto, più le
  righe fisse nel codice (inglese, schema JSON, lunghezza). Per ogni slot la risposta dà il prompt, i tag dello slot usati e il formato
  (specifica `copie-di-gioco`).
- **Esempi del gruppo** nell'input della chiamata: fino a 8 foto di riferimento scelte a caso, ciascuna con descrizione (al massimo 500
  caratteri) e tag. Una riga fissa nel codice dice che servono a capire genere, epoca, supporto e modo di fotografare; che nessun
  prompt deve riprendere la scena, l'inquadratura o le persone di un esempio; che i nomi di persone degli esempi non si usano mai.
- **Lunghezza:** una riga fissa nel codice chiede prompt da 600 a 1000 caratteri. Un prompt fuori misura non si scarta (sarebbe una
  chiamata pagata e persa): lo studio ne mostra la lunghezza. Tetto di risposta della chiamata: 16 000 token (prima 4000), perché dieci
  prompt lunghi più il ragionamento del modello non vengano troncati.
- **Testo proposto per «Prompt per le SLOP»** (contesto 1.7.0, una proposta finché l'owner non lo salva). Regole scritte in positivo,
  perché il modello di testo trascrive i divieti nei prompt e il generatore esegue male le negazioni:
  - supporto e tecnica descritti in concreto, secondo lo slot e gli esempi (stampa a retino ad alto contrasto, fotogramma di pellicola
    sbiadito, piccola stampa ingiallita), non con formule generiche come «film grain»;
  - scritte coerenti con la scena: un cartello guarda dove guarda chi lo tiene, chi è ripreso di spalle ne mostra il retro; poche
    scritte, brevi, fatte a mano quando lo sono; il luogo si riconosce dall'ambiente, non da insegne che lo dichiarano;
  - persone diverse per età, corporatura, abiti e gesti, con oggetti diversi in mani diverse; nessuna posa collettiva; composizione da
    fotografo dell'epoca, non centrata per forza;
  - abiti, veicoli, segnaletica e luci dell'epoca, con l'usura e il disordine della realtà;
  - poche figure in primo piano nelle scene affollate, perché lì il generatore sbaglia arti e mani;
  - i generi che implicano un reato o una colpa (`mugshot`, processi, arresti) solo con persone inventate, mai con personaggi storici
    (specifica `contenuti-e-trasparenza`).
- Nello studio l'owner rilegge e modifica i prompt (salvati all'uscita dal campo), ne cambia il formato senza costi, e può farne
  riscrivere uno con una nuova chiamata: il modello riceve gli altri prompt per restare diverso.

## 6. Immagini, trattamento e analisi

- Il generatore (modello e qualità delle Impostazioni, mostrati in sola lettura) riceve solo il testo del prompt e la dimensione del
  formato. L'immagine entra come SLOP nuova con prompt, modello, gruppo, slot e qualità; il browser applica il **trattamento** con la
  REAL campione dello slot e prepara la copia di gioco (specifica `copie-di-gioco`, sezione 4); poi parte l'analisi (specifica
  `libreria-immagini`, sezione 5), con il prompt come contesto, salvo Genere, Colore e Supporto che si giudicano solo dall'immagine.
  Una sola conferma copre immagini e analisi del gruppo; le chiamate restano registrate una per una; un problema dell'account OpenAI
  ferma la serie.
- Esiti: un rifiuto del generatore per le sue regole d'uso (4xx) non è addebitato e lo slot resta da rigenerare; un esito incerto è
  registrato e mai ripetuto.

## 7. Revisione

- Per ogni immagine: copia trattata con il marchio «RS», tag dell'analisi per categoria, «Previsti ma non rilevati» (i tag dello slot
  che l'analisi non ha visto; evidenziato se manca un tag del tema o se Genere, Supporto o Colore dell'analisi non sono quelli dello
  slot), Analizza, Approva, Pubblica, Cestino, Rigenera (una nuova immagine per lo stesso slot; la precedente resta), comandi del
  trattamento (specifica `copie-di-gioco`, sezione 4). La pressione prolungata sull'immagine apre l'anteprima con prompt, tag di
  partenza e tag dell'analisi.
- **Tag di partenza:** gruppo, tema e tag dello slot da cui è stato scritto il prompt. Si vedono nel dettaglio del Database e nelle
  anteprime; sono di sola lettura.
- Approvare una SLOP richiede copia e almeno un tag, senza conferma dei diritti; la pubblicazione è un passo separato. Le SLOP approvate
  entrano subito nei conteggi.

## 8. Batch automatici su proposta

**Candidati:** proposte attive nelle Impostazioni, nessun batch aperto, studio aperto, gruppo con `n_real` almeno pari alla soglia,
`spread_percent` almeno pari alla soglia di proposta (33% predefinito), `N ≥ 1`, gruppo non ignorato oppure cresciuto di almeno 10 punti
da quando è stato ignorato. Si propone **un solo** gruppo: `spread_percent` più alto, poi `N` più alto, poi ordine alfabetico. Tempo,
Colore e Supporto non generano mai proposte da soli: entrano come tag degli slot. La rilevazione è una lettura gratuita, all'apertura
della dashboard e dopo ogni azione che cambia la libreria.

**Notifica** in cima a ogni sezione: gruppo, conteggi, spread e «Genera *k* SLOP» con `k = min(N, 10)`, «Ignora», «Chiudi» (nasconde fino
alla prossima apertura). **Genera** conferma tutte le chiamate del batch (prompt, immagini, analisi); il server ricontrolla le condizioni
e, se sono cambiate, non parte. Batch senza tema.

**Svolgimento:** il server estrae gli slot con l'algoritmo dello studio; il browser chiede i prompt (una volta), poi per ogni slot
l'immagine, il trattamento, la copia e l'analisi. Ogni slot è registrato prima dell'invio, quindi un batch ripreso dopo la chiusura della
scheda non ripete mai una chiamata; prompt rimasti in scrittura oltre 10 minuti contano come esito incerto e fermano il batch. Slot e
prompt non si modificano. «Interrompi» ferma le chiamate rimaste.

**Stati:** `running`, `review` (generazione finita o interrotta), `closed` quando ogni immagine è approvata, pubblicata o nel cestino.
Finché un batch è aperto non nascono altre proposte. «Rivedi nel Database» apre il filtro del batch; lo studio manuale resta usabile.

**Ignorati:** le proposte ignorate per tag (`slop_proposal_ignored`) decadono con la migrazione 0048; si ignorano gruppi.

## 9. Limiti

- Il batch avanza solo con la dashboard aperta.
- Con un catalogo piccolo pochi gruppi superano la soglia: finché non si caricano altre REAL dei generi mancanti, le proposte saranno
  rare. È voluto: la tabella dei gruppi dice che cosa caricare.
- Gli esempi del gruppo possono contenere nomi di persone reali: la riga fissa li esclude, la revisione dell'owner resta il controllo
  finale.
- Se il generatore sbaglia sempre lo stesso gruppo, la proposta si ripete finché l'owner non la ignora.
- Più avanti: alternare generatori diversi, perché le SLOP non abbiano tutte la stessa «firma» visiva.
