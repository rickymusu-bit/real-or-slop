# Categorie dei tag — specifica 1.1.0

Stato: **proposta, da approvare dall'owner**. Creata: 2026-11-10T15:34:11Z. Aggiornata: 2026-11-10T16:13:10Z
(1.1.0: categoria Formato e divieto limitato ai tag sull'origine; precedente: `docs/categorie-tag.v1.0.0.md`).
Estende `docs/libreria-immagini.v1.6.0.md` (sezioni 3, 5, 10 e 12). Nessun codice scritto prima dell'approvazione.

## 1. Decisioni dell'owner (2026-11-10)

1. I tag si dividono in categorie, per estrarre in modo mirato i tag da cui nascono le SLOP.
2. **Una sola categoria per tag.**
3. Le parole ambigue si risolvono scegliendo **parole specifiche**; il suffisso di categoria (`fire-event`,
   `fire-object`) resta come **ultima risorsa** (opzione 1 della discussione del 2026-11-10).
4. Formato e mezzo dell'immagine sono tag legittimi. È vietato solo il tag che descrive l'**origine**: «cgi e
   illustration non implicano che sia generata con l'ai». Le REAL possono essere anche immagini non fotografiche
   autentiche, come la scansione di un manifesto o di un dipinto.

## 2. Categorie

Lista fissa nel codice: l'estrazione per la generazione dipende da questa.

| Id | Nome | Che cosa contiene | Esempi |
|---|---|---|---|
| `time` | Tempo | il decennio della scena | `1940s`, `1970s`, `2020s` |
| `place` | Luogo | nomi propri di luoghi: città, regioni, paesi, luoghi celebri | `paris`, `venezia`, `france`, `place-de-la-republique` |
| `setting` | Ambiente | tipi di luogo, ora del giorno, meteo, stagione | `street`, `beach`, `night`, `rain`, `winter` |
| `event` | Evento | ciò che accade: eventi e azioni | `riot`, `election`, `party`, `parade`, `protest` |
| `people` | Persone | ruoli, mestieri, gruppi di persone | `firefighter`, `politician`, `crowd`, `children` |
| `object` | Oggetti e strutture | oggetti, veicoli, edifici, infrastrutture, animali | `bridge`, `train`, `car`, `barricade`, `dog` |
| `format` | Formato | mezzo e aspetto dell'immagine | `black-and-white`, `sepia`, `color-film`, `polaroid`, `phone-camera`, `poster`, `painting`, `illustration` |
| `other` | Altro | ciò che non rientra nelle altre | |

Regole per categoria:

- **Tempo:** solo decenni, nel formato `NNN0s` (`1890s`, `1970s`, `2020s`); **al massimo un tag di tempo per
  immagine**. Un tag in questo formato appartiene sempre a Tempo, e Tempo accetta solo tag in questo formato. L'anno
  preciso, quando è noto, va nella didascalia, non nei tag. Se l'epoca non è ricavabile, nessun tag di tempo.
- **Luogo:** solo nomi propri, nella lingua originale traslitterata (regola già vigente). Più tag di luogo sono
  ammessi (`paris` e `france`).
- **Persone:** ruoli e gruppi, mai nomi di persone. I personaggi storici con nome restano esclusi dai tag come oggi.
- **Formato:** mezzo e aspetto dell'immagine; al massimo un tag per immagine. Sono ammessi anche `illustration`,
  `cgi`, `render`, `digital-art`: indicano una tecnica, non l'IA.
- Valgono tutte le regole di forma e di lingua dei tag (`libreria-immagini.v1.6.0.md`, sezione 3). È vietato **solo**
  il tag che descrive l'origine, cioè se l'immagine è generata dall'IA o autentica (`ai`, `generated`, `real`, `fake`,
  `midjourney`…): la lista del server in `shared/tags.v2.0.0.ts` resta quella attuale. Le istruzioni al modello
  dicevano finora «mai tag sul modo in cui l'immagine è stata realizzata»: è una formulazione più larga della regola,
  da correggere (sezione 5).

## 3. Parole ambigue

- **Regola, per l'owner e per il modello:** scegliere la parola inglese con un solo significato. Per l'evento
  `house-fire` o `wildfire`, per l'oggetto `flames`, `bonfire`, `campfire`; per la gru da cantiere
  `construction-crane`, lasciando `crane` all'uccello; per la mazza `baseball-bat`, lasciando `bat` all'animale.
- **Suffisso, ultima risorsa:** solo se non esiste una parola naturale e i due significati servono entrambi, si
  aggiunge l'id della categoria come suffisso: `fire-event`, `fire-object`. Il suffisso lo decide l'owner, nel
  vocabolario delle Impostazioni; il modello non crea tag con suffisso, ma usa quelli già presenti nel vocabolario.
- Il nome del tag resta **unico** in tutto il vocabolario, come oggi: niente due `fire` in categorie diverse.

## 4. Dati

- Migrazione additiva `0038`: colonna `category` in `tags`, obbligatoria, con gli otto valori ammessi; i tag
  esistenti diventano `other` (in produzione oggi non ce ne sono).
- La categoria appartiene al tag, non all'immagine: cambiarla vale per tutte le immagini che lo usano.
- Gli alias non hanno categoria: ereditano quella del tag a cui rimandano.
- Un tag nuovo nasce con la categoria con cui viene creato (dal modello o dall'owner).

## 5. Assegnazione da parte del modello

- Stessa chiamata di oggi, nessun costo in più. Lo schema JSON della risposta diventa un oggetto con una lista per
  categoria (`time`, `place`, `setting`, `event`, `people`, `object`, `format`, `other`) più la didascalia. Totale
  da 5 a 15 tag; `time` e `format` al massimo uno ciascuno.
- Il vocabolario inviato al modello è raggruppato per categoria, così il modello vede quali tag esistono già e dove.
- **Conflitti:** se il modello propone in una categoria un tag che esiste già in un'altra, il server usa il tag
  esistente con la sua categoria e lo segnala nell'esito («`fire` proposto come evento, nel vocabolario è un
  oggetto»): l'owner decide se correggere o creare un suffisso. Un secondo tag di tempo o di formato viene scartato.
- Il testo «Tag e didascalie» del contesto dei modelli va aggiornato con le categorie e la regola delle parole
  specifiche; nella base comune, «Mai tag sul modo in cui un'immagine è stata realizzata o sulla sua autenticità»
  diventa «Mai tag sull'origine dell'immagine o sulla sua autenticità». Il contesto è dell'owner: il codice propone il nuovo testo, che diventa una nuova versione solo
  quando l'owner lo salva dalle Impostazioni (sezione 12 della specifica vigente).

## 6. Interfaccia

- **Wizard e dettaglio della sezione Database:** pillole dei tag colorate e raggruppate per categoria. Il campo per
  aggiungere un tag ha accanto la scelta della categoria; se il tag esiste già, la categoria è quella del vocabolario
  e il selettore la mostra. Se l'owner sceglie una categoria diversa da quella di un tag esistente, il sistema lo
  avvisa e propone: cambiare la categoria del tag (per tutte le immagini) oppure usare una parola diversa.
- **Vocabolario nelle Impostazioni:** elenco raggruppato per categoria, con il numero di immagini; cambio di
  categoria con conferma («vale per tutte le N immagini»); creazione di un tag con suffisso.
- **Unisci A in B:** resta la categoria di B, che è il tag che sopravvive. Se le categorie differiscono, la conferma
  lo dice.
- Avviso non bloccante se un'immagine REAL non ha un tag di tempo: è il dato più utile per la generazione.

## 7. Uso nel consulente e nella generazione (fase 3)

- **Consulente:** confronto REAL/SLOP per categoria (per esempio «SLOP troppo concentrate sugli anni 2020», «poche
  scene notturne»), oltre a quello per singolo tag.
- **Estrazione condizionata** per ciascuna delle immagini da generare (al massimo 10):
  1. si parte dal tag tematico scelto dall'owner;
  2. si scelgono le categorie in ordine: Tempo, Formato, Luogo, Ambiente, Evento, Persone, Oggetti;
  3. per ogni categoria si pesca tra i tag che compaiono nelle REAL insieme al tag tematico e a quelli già scelti,
     con la soglia vigente di almeno 3 immagini distinte; il peso è la frequenza condizionata attenuata (per esempio
     la radice quadrata), così anche i tag meno frequenti hanno spazio e non si ricade sempre nella scena tipica;
  4. se una categoria non ha candidati resta vuota e il modello che scrive i prompt è libero su quell'aspetto;
  5. le immagini dello stesso gruppo evitano di ripetere la stessa combinazione.
- L'owner vede gli «slot» estratti e può cambiarli prima di far scrivere i prompt.
- Una sola chiamata scrive tutti i prompt del gruppo, con l'istruzione che siano diversi tra loro e rispettino
  ciascuno il proprio slot e le regole di contenuto (sezione 11 della specifica vigente).

## 8. Punti aperti (da decidere prima della fase 3, non di questa specifica)

- **Partenza a freddo:** con poche REAL i tag correlati non bastano. Proposta: tag correlati suggeriti dal modello
  (una chiamata economica), da sostituire con quelli reali quando la libreria cresce. Alternative: embedding sul
  vocabolario, oppure generazione disattivata sotto una soglia di REAL.
- **Emozione:** asse facoltativo, da valutare dopo aver misurato il tono delle REAL.

## 9. Realizzazione e verifiche

- Migrazione `0038` additiva; nuove versioni di `shared/tags`, analisi, libreria (worker e front-end) e wizard;
  le versioni precedenti restano.
- Test: validazione del formato di Tempo e del limite di uno per immagine; schema della risposta per categorie e
  gestione dei conflitti con il modello finto; cambio di categoria e «Unisci»; interfaccia nel browser su desktop e
  mobile. Nessuna chiamata a pagamento reale.
- Il contesto «Tag e didascalie» aggiornato viene proposto nella PR e salvato dall'owner.
