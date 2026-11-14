# Generazione delle SLOP: studio e batch automatici — specifica 1.0.0

Stato: vigente. Aggiornata: 2026-11-14T12:00:00Z. Versione consolidata (riordino della documentazione dell'owner del 2026-11-14): riunisce
senza strati `wizard-slop.v1.4.1`, `proposta-generazione-slop.v2.0.1` e le parti sulle SLOP di `copie-di-gioco.v5.0.0`,
`didascalie-wizard.v1.0.0` e `anteprima-descrizione.v1.2.0`, che restano nella cronologia git. Regole sui contenuti:
specifica `contenuti-e-trasparenza`.

## 1. Decisioni dell'owner

- L'obiettivo è il bilanciamento dei temi: lo **spread** di un tag è il numero di REAL meno il numero di SLOP con quel tag, contando
  approvate e pubblicate (2026-11-10).
- I tag del **tema** sono obbligatori in tutti i prompt; gli altri tag di ogni prompt si estraggono dalle REAL con un peso che favorisce
  lo spread positivo; fino a 10 immagini per volta; prompt in inglese (2026-11-10).
- Partenza a freddo: si caricano abbastanza REAL prima di generare; nessun ripiego con modelli (2026-11-10).
- I tag finali di una SLOP sono quelli dell'analisi, come per le REAL; lo slot resta come provenienza (2026-11-10).
- Riscrivere un prompt e rigenerare un'immagine sono liberi, con conferma, perché a pagamento (2026-11-10).
- **Batch automatici su proposta:** nessun timer né prefiltro; quando lo spread di un tag supera la soglia una notifica chiede di
  approvare un batch; un solo batch aperto alla volta; slot e prompt senza revisione; il batch gira nel browser (2026-11-12).
- Le SLOP generate mostrano i loro tag di partenza (2026-11-14).

## 2. Soglie

- Lo **studio** si apre con almeno 50 REAL approvate o pubblicate; un **tema** si può usare se almeno 10 REAL approvate o pubblicate
  contengono tutti i suoi tag. Entrambe le soglie si cambiano nelle Impostazioni.
- Al massimo 10 immagini per gruppo o batch (nel codice).

## 3. Studio, pagina 1: tema

- **Grafico dello spread:** barre orizzontali divergenti (a destra i tag con più REAL, a sinistra quelli con più SLOP), colorate per
  categoria con il nome scritto accanto, ordinate per spread; filtro per categoria, vista compatta dei primi *n* tag o completa con
  ricerca; al passaggio del puntatore tag, categoria e conteggi; un clic aggiunge il tag al tema.
- **Tema:** uno o più tag del vocabolario, con il numero di REAL che li contengono tutti e lo stato rispetto alla soglia; numero di
  immagini da 1 a 10. «Prepara gli slot» è gratuito.

## 4. Slot

Uno slot per immagine: il tema più al massimo un tag per categoria (`shared/slot-extraction.v1.0.0.ts`).

1. Foto di riferimento: le REAL approvate o pubblicate con tutti i tag del tema.
2. Categorie in ordine: Tempo, Formato, Luogo, Ambiente, Evento, Persone, Oggetti e strutture; si saltano quelle coperte dal tema.
3. Per ogni categoria si pesca un tag tra quelli delle foto di riferimento, che poi si restringono a quelle che lo contengono; il
   restringimento si ferma quando resterebbero meno di 3 foto.
4. **Peso:** radice quadrata della frequenza tra le foto di riferimento per il fattore di spread `max(0,25; 1 + s / S)` (`s` spread del
   tag, `S` massimo spread assoluto tra i candidati): il tag più mancante pesa il doppio, quello più in eccesso un quarto.
5. **Varietà:** un tag già uscito nella stessa categoria pesa un terzo; due slot non hanno la stessa combinazione (fino a 20 tentativi).
6. Una categoria senza candidati resta vuota: il modello di testo è libero su quell'aspetto.

Nello studio l'owner vede gli slot (una riga per slot, una colonna per categoria), cambia o svuota ogni cella e ripesca uno slot o tutti.

## 5. Prompt

- Una chiamata a pagamento al modello di testo scrive tutti i prompt del gruppo: base comune e «Prompt per le SLOP» del contesto, più una
  riga fissa nel codice (inglese, schema JSON). Per ogni slot la risposta dà il prompt, i tag dello slot usati e il formato
  (specifica `copie-di-gioco`, sezione 4).
- Nello studio l'owner rilegge e modifica i prompt (salvati all'uscita dal campo), ne cambia il formato senza costi, e può farne
  riscrivere uno con una nuova chiamata: il modello riceve gli altri prompt per restare diverso.

## 6. Immagini e analisi

- Il generatore (modello e qualità delle Impostazioni, mostrati in sola lettura) riceve solo il testo del prompt e la dimensione del
  formato. L'immagine entra come SLOP nuova con prompt, modello, gruppo, slot e qualità; il browser prepara la copia di gioco; poi parte
  l'analisi (specifica `libreria-immagini`, sezione 5), con il prompt come contesto. Una sola conferma copre immagini e analisi
  del gruppo; le chiamate restano registrate una per una; un problema dell'account OpenAI ferma la serie.
- Esiti: un rifiuto del generatore per le sue regole d'uso (4xx) non è addebitato e lo slot resta da rigenerare; un esito incerto è
  registrato e mai ripetuto.

## 7. Revisione

- Per ogni immagine: copia con il marchio «RS», tag dell'analisi per categoria, «Previsti ma non rilevati» (i tag dello slot che
  l'analisi non ha visto, evidenziato se manca un tag del tema), Analizza, Approva, Pubblica, Cestino, Rigenera (una nuova immagine per lo
  stesso slot; la precedente resta). La pressione prolungata sull'immagine apre l'anteprima con prompt, tag di partenza e tag
  dell'analisi.
- **Tag di partenza:** il tema e i tag dello slot da cui è stato scritto il prompt. Si vedono nel dettaglio del Database (il tema è
  segnato «tema») e nelle anteprime; sono di sola lettura.
- Approvare una SLOP richiede copia e almeno un tag, senza conferma dei diritti; la pubblicazione è un passo separato. Le SLOP approvate
  entrano subito nello spread.

## 8. Batch automatici su proposta

**Conteggi**, per tag: `n_real` e `n_slop` tra le approvate e pubblicate; `n_nuove` tra le SLOP nuove, con i tag dell'analisi o, prima
dell'analisi, quelli del tema dello slot; il cestino non conta. `spread = n_real − n_slop`, `spread_percent = 100 × spread / n_real`,
`N = spread − n_nuove`.

**Candidati:** proposte attive nelle Impostazioni, nessun batch aperto, studio aperto, `n_real` almeno pari alla soglia del tema,
`spread_percent` almeno pari alla soglia di proposta (33% predefinito, cioè da 1,5 REAL per SLOP), `N ≥ 1`, tag non ignorato oppure
cresciuto di almeno 10 punti da quando è stato ignorato. Si propone **un solo** tag: `spread_percent` più alto, poi `N` più alto, poi
ordine alfabetico. La rilevazione è una lettura gratuita, all'apertura della dashboard e dopo ogni azione che cambia la libreria.

**Notifica** in cima a ogni sezione: tag, conteggi, spread e «Genera *k* SLOP» con `k = min(N, 10)`, «Ignora», «Chiudi» (nasconde fino
alla prossima apertura). **Genera** conferma tutte le chiamate del batch (prompt, immagini, analisi); il server ricontrolla le condizioni
e, se sono cambiate, non parte.

**Svolgimento:** il server estrae gli slot con l'algoritmo dello studio; il browser chiede i prompt (una volta), poi per ogni slot
l'immagine, la copia e l'analisi. Ogni slot è registrato prima dell'invio, quindi un batch ripreso dopo la chiusura della scheda non
ripete mai una chiamata; prompt rimasti in scrittura oltre 10 minuti contano come esito incerto e fermano il batch. Slot e prompt non si
modificano. «Interrompi» ferma le chiamate rimaste.

**Stati:** `running`, `review` (generazione finita o interrotta), `closed` quando ogni immagine è approvata, pubblicata o nel cestino.
Finché un batch è aperto non nascono altre proposte. «Rivedi nel Database» apre il filtro del batch; lo studio manuale resta usabile.

## 9. Limiti

- Il batch avanza solo con la dashboard aperta.
- Se il generatore sbaglia sempre lo stesso tema, la proposta si ripete finché l'owner non la ignora.
- Un solo candidato per volta favorisce i tag con lo spread percentuale più alto.
- Più avanti: alternare generatori diversi, perché le SLOP non abbiano tutte la stessa «firma» visiva.
