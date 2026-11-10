# Libreria immagini, tag, didascalie e consulente SLOP — specifica 1.7.0

Stato: **approvata dall'owner il 2026-11-09**, vigente. Creata: 2026-11-09T15:30:00Z.
Aggiornata: 2026-11-10T16:16:00Z (1.7.0: categorie dei tag, `docs/categorie-tag.v1.1.0.md`, sezione 3;
precedente: `docs/libreria-immagini.v1.6.0.md`).
Base: main `ca44dbe` (app 0.33.0, schema 0032). La PR rickymusu-bit/real-or-slop#99 è stata chiusa senza merge.
Sostituisce, una volta approvata: lotti e bozze di `docs/lotti-editoriali.v1.6.2.md` (sezioni 2–5 e 7)
e le regole sui tag della sezione 14.0.0 di `AGENTS.md`. Restano valide: `docs/copie-di-gioco.v2.0.0.md`,
`docs/spazio-file.v1.2.0.md` (citato qui fin dalla prima versione, ma assente dal repository: nel repository c'è solo
`docs/spazio-file.v1.0.0.md`, storico). Le regole su persone, personaggi storici, marchi, regimi, nudità, marchio «RS», metadati
e salvataggio, prima nelle sezioni 6.2–6.4 di `docs/lotti-editoriali.v1.6.2.md`, sono ora nella sezione 11:
quel documento è interamente storico.

## 1. Decisioni dell'owner (2026-11-09)

1. «Le operazioni di inserimento, modifica e cancellazione delle immagini devono essere più facili e
   rapide possibili. Il modello è quello di un file system di un PC.»
2. «Non esistono più i lotti.» Ogni REAL è indipendente; titolo, descrizione e pixel producono i tag.
   Tag in inglese per i nomi comuni, nella lingua originale per i nomi propri, sempre senza accenti,
   segni diacritici o spazi.
3. Un consulente confronta la distribuzione dei tag nelle REAL e nelle SLOP e suggerisce che cosa generare;
   scegliendo un tag vengono suggeriti tag correlati (es. `riot` → `violence`, `fire`, `police`).
4. Ogni foto, REAL o SLOP, arriva al giocatore con una didascalia: «le immagini su internet vengono sempre
   con un testo che può essere informativo oppure disinformativo». Per le REAL deriva da titolo e
   descrizione, per le SLOP dal prompt e dal contenuto dell'immagine.
5. Costi di tag e didascalie accettati. I tag serviranno più avanti per le embedding di Topic Discovery.
6. La generazione sostituisce tag e didascalia delle immagini scelte, una sola volta per immagine; l'owner
   può sempre modificarli e ripristinare i testi generati (decisione del 2026-11-09, sezione 10).
7. La didascalia ha un limite morbido di 160 caratteri e un tetto tecnico di 256 (decisione del 2026-11-10, sezione 4).
   Per le SLOP la didascalia è plausibile ma descrive una scena inventata: è il senso di «disinformativo».
8. I tag scritti a mano con forma errata vengono convertiti e salvati senza avviso (decisione del 2026-11-10, sezione 3).
9. Regole di contenuto per le SLOP: niente immagini che celebrano regimi o ideologie, niente nudità umana tranne
   nelle opere d'arte; tolta la regola sul non ricopiare le combinazioni REAL (decisioni del 2026-11-10, sezione 11).
10. Il contesto fisso del modello linguistico si modifica dalle Impostazioni della dashboard, con versioni
    (decisione del 2026-11-10, sezione 12).
11. I tag hanno una categoria, una sola per tag; le parole ambigue si risolvono con parole specifiche e, come ultima
    risorsa, con il suffisso della categoria (decisioni del 2026-11-10, `docs/categorie-tag.v1.1.0.md`).

## 2. Libreria

Una sola raccolta piatta di immagini, REAL e SLOP, al posto di lotti, proposte e coda separata.

**Scheda di un'immagine:** anteprima (copia di gioco), origine REAL/SLOP, titolo, descrizione (≤1000
caratteri), tag, didascalia, stato, fonte. Per le REAL la fonte è la pagina Commons, l'autore e la
licenza, oppure «caricata dall'owner»; per le SLOP sono il prompt e il modello.

**Stati:** `nuova` (appena entrata, analisi in corso o da rivedere) → `approvata` (copia, tag e
didascalia approvati; per le REAL anche diritti e licenza) → `pubblicata`; più `cestino`.

**Operazioni, come in un file system:**
- caricare più file insieme (trascinamento o selezione), dal dispositivo o da Commons (esploratore o
  incolla link): ogni file entra subito nella libreria, senza proposte intermedie;
- modificare titolo, descrizione, tag e didascalia direttamente nella scheda, con salvataggio immediato;
- selezione multipla per eliminare, aggiungere o togliere tag, approvare;
- eliminare = spostare nel **cestino**, ripristinabile, senza dialogo di conferma; «Svuota cestino» o
  «Elimina definitivamente» cancellano **ogni** riga dell'immagine (tag, voti, round di gioco) e i suoi
  file, senza registro né istantanee: la foto si può ricaricare;
- vista a griglia con filtri per origine, stato e tag, ricerca per titolo.

Una pubblicata non si cestina direttamente: prima si ritira dal gioco (passaggio esplicito).

**Dati esistenti:** azzerati (sezione 9).

## 3. Tag

- Formato: minuscoli, solo `a-z`, cifre e trattino tra le parole, massimo 40 caratteri. Nomi comuni in
  inglese (`riot`, `police-car`); nomi propri nella lingua originale traslitterata in ASCII
  (`place-de-la-republique`, `munchen`, `sao-paulo`). Restano vietati i tag che rivelano l'origine e il
  segnaposto `untagged`.
- **Tag scritti dall'owner** (decisione del 2026-11-10): se l'unico errore è la forma (maiuscole, accenti, spazi,
  punteggiatura), il tag viene convertito e salvato direttamente, senza avvisi (decisione del 2026-11-10: «non c'è
  bisogno di un avviso quando viene convertito direttamente»), come già accade per i tag del modello. Un tag che rivela l'origine o che non ha una forma valida viene rifiutato con il motivo. Il server
  resta rigido: accetta solo tag già conformi. Regole in `shared/tag-input.v1.0.0.ts`. Un tag entra nel vocabolario
  quando viene salvato su un'immagine e ne esce con l'ultima immagine che lo usa (sezione 10).
- **Categorie** (decisione dell'owner del 2026-11-10): ogni tag appartiene a una sola categoria tra Tempo, Formato,
  Luogo, Ambiente, Evento, Persone, Oggetti e strutture, Altro. Tempo accetta solo decenni (`1970s`); al massimo un
  tag di Tempo e uno di Formato per immagine. È vietato solo il tag che descrive l'origine: formato e mezzo
  (`black-and-white`, `poster`, `illustration`) sono ammessi. Regole complete in `docs/categorie-tag.v1.1.0.md`,
  che fa parte di questa specifica.
- Nessun tag esistente da convertire: il database riparte vuoto (sezione 9).
- **Analisi automatica:** quando un'immagine entra nella libreria, un modello con visione riceve la copia
  di gioco, il titolo e la descrizione (REAL) o il prompt (SLOP) e restituisce in un'unica chiamata da
  5 a 15 tag e una didascalia. I tag del modello sostituiscono quelli dell'immagine (sezione 10), che resta
  `nuova`: l'owner li rivede, ne aggiunge o ne toglie e poi approva. Nessuna colonna di provenienza
  (decisione dell'owner, 1.2.0): dopo la revisione un tag è un tag.
- Chiamata a pagamento: stima prima dell'invio (anche per un caricamento multiplo: «12 immagini, circa
  X $»), riserva sul budget unico, registro di spesa, nessun reinvio di esiti incerti; nei test solo
  provider fittizi. Dettagli nella sezione 10.

## 4. Didascalie

- Il giocatore vede la didascalia **insieme all'immagine durante il round**, come il testo che
  accompagna una foto online. Dopo la risposta vede origine, titolo, fonte e spiegazione.
- **Stesso procedimento per REAL e SLOP**, altrimenti lo stile diventa un indizio: stesso modello,
  stesse istruzioni, stesso formato. Il modello riceve il contesto (titolo e descrizione, oppure prompt)
  senza l'indicazione REAL/SLOP.
- **Formato:** italiano, una o due frasi, **160 caratteri come limite morbido**, nello stile di un post o di una
  didascalia di notizia: luogo e data o epoca quando plausibili, poi che cosa accade. Niente autori,
  agenzie, licenze, URL, nomi di archivi; niente parole come «foto», «immagine generata», «AI».
  Le didascalie delle SLOP rispettano le stesse regole dei prompt sulle persone reali.
- **Lunghezza** (decisione dell'owner del 2026-11-10: «Togli il taglio netto a 160 caratteri, proponi un soft limit»,
  tetto «256 caratteri»). Il modello mira a 120–150 caratteri e mai oltre 160. Oltre 160 la didascalia si conserva
  intera, con un avviso nell'editor e nel riepilogo; l'approvazione non viene bloccata. Il tetto tecnico è 256, nel
  server e nello schema (migrazione `0036_caption_soft_limit.v1.0.0.sql`). Solo una didascalia del modello oltre 256
  viene accorciata, alla fine dell'ultima frase o parola intera e mai a metà parola, con un avviso nel wizard. Regole
  in `shared/caption.v1.0.0.ts`.
- La didascalia fa parte di ciò che il giocatore vede: si approva insieme alla copia di gioco.
- **Rischio:** una didascalia plausibile su una SLOP è un'informazione falsa. Mitigazioni: compare solo
  dentro il gioco, accanto al marchio «RS», e la verità viene rivelata dopo ogni risposta; i file
  serviti non contengono la didascalia.

## 5. Consulente SLOP e tag correlati

Calcoli deterministici sul database, senza modelli e senza costi.

- **Distribuzione:** per ogni tag, la quota di immagini REAL approvate o pubblicate che lo portano e la
  stessa quota tra le SLOP (comprese quelle in attesa, che contano come capacità). Il consulente elenca i
  tag più sottorappresentati tra le SLOP rispetto alle REAL, con i numeri, e quelli sovrarappresentati.
- **Tag correlati:** scelto un tag A, si propongono i tag B che compaiono più spesso insieme ad A nelle
  REAL, ordinati per probabilità condizionata P(B|A), solo se la coppia compare in **almeno 3 immagini
  distinte**. Con pochi dati non emerge la combinazione di una singola foto; con molti dati la soglia
  non pesa.
- **Generazione (fase 3, da ridefinire).** Il metodo con cui si scelgono i tag da cui nascono le SLOP è da
  definire (decisione dell'owner del 2026-11-10): non vale più la regola «non ricopiare la combinazione delle foto
  REAL» del vecchio sistema a lotti. Restano fermi: un modello linguistico scrive i prompt rispettando la sezione 11,
  l'owner li rivede, il generatore riceve solo testo, ogni chiamata è a pagamento con conferma e registro di spesa.
  Le SLOP generate entrano nella libreria e passano dall'analisi della sezione 3.

## 6. Pubblicazione

L'owner pubblica le immagini approvate. Avviso non bloccante se REAL e SLOP pubblicate escono dal
rapporto 40–60% o se la capacità delle partite è insufficiente. Restano copia approvata, file senza
metadati e marchio «RS».

## 7. Fasi

1. **Libreria:** interfaccia a file system, caricamento multiplo, Commons diretto, modifica in linea,
   cestino, descrizione; lotti nascosti. Nessuna chiamata a pagamento. Migrazione additiva.
2. **Analisi:** tag e didascalia dal modello con visione, conversione ASCII dei tag, didascalia nel gioco.
3. **Consulente SLOP:** distribuzione, tag correlati, generazione dalla libreria.
4. **In futuro:** embedding testuali dei tag per Topic Discovery.

Ogni fase in una PR con anteprima, CI e approvazione; migrazioni remote e deploy solo su autorizzazione.

## 8. Scelte di dettaglio

- Modello per l'analisi (fase 2): `gpt-6.1-terra`, configurato dall'owner su OpenAI; `gpt-image-2` per la
  generazione (fase 3). Un solo budget per tutte le chiamate a pagamento, fissato dall'owner (sezione 10).
- Cestino senza svuotamento automatico. Didascalie in italiano.

## 9. Database in ordine (decisione dell'owner del 2026-11-09)

«Voglio un database in ordine, senza archivi storici inutili. Se delle immagini sono state eliminate
dal cestino, ogni loro record va cancellato dal database.» Risposte successive: codice delle vecchie
pipeline eliminato insieme alle tabelle; **tutto azzerato**, catalogo demo, partite, giocatori e
ricevute comprese; **nessuna esportazione** prima della cancellazione; «non si torna indietro».

- La migrazione `0033_clean_slate.v1.0.0.sql` elimina tutte le tabelle, viste e trigger esistenti e
  crea lo schema nuovo. Le migrazioni 0001–0032 escono dal repository (restano nella storia git e nella
  tabella `d1_migrations` di produzione). È una migrazione distruttiva per decisione esplicita
  dell'owner; da applicare in produzione solo con la sua autorizzazione al rilascio.
- Escono anche il codice delle pipeline storiche (Worker, dashboard, pipeline Python, script e test),
  Topic Discovery, profili, memoria semantica, similarità, studio SLOP, cicli editoriali, lotti, proposte,
  modalità demo e catalogo demo. Restano: gioco singolo e PvP, preparazione delle immagini, copie di gioco,
  file senza metadati, marchio «RS», esploratore Commons.
- Niente registro delle eliminazioni: ogni immagine entra solo per azione dell'owner, quindi nessun
  reimport automatico va bloccato.
- Le chiamate a pagamento (fasi 2 e 3) avranno un registro di spesa nuovo, che non conserva le immagini.

**Schema (fase 1):**
- `images`: origine REAL/SLOP, stato `new`/`approved`/`published`/`trash` (con stato di provenienza),
  titolo, descrizione, didascalia, spiegazione mostrata dopo la risposta, fonte, autore, licenza,
  prompt e modello (SLOP), originale (chiave R2, hash unico, formato, dimensioni), copia di gioco (chiave,
  hash, dimensioni, peso), diritti verificati, revisione ottimistica, date.
- `tags` e `image_tags` (cancellazione a cascata con l'immagine).
- Gioco: `game_sessions`, `game_rounds` (cascata sull'immagine), `answers`, `media_events`, `players`,
  `challenges`, `challenge_players`, `challenge_answers`, `rate_limits`.

**File R2:** originale e copia in quarantena (`library/<id>/`); alla pubblicazione la copia viene copiata
nel bucket del gioco e rimossa al ritiro; l'eliminazione definitiva cancella tutti i file dell'immagine.

## 10. Fase 2: alias, vocabolario, analisi e budget (1.4.0)

**Vocabolario.** La tabella `tags` contiene solo tag in uso: un trigger cancella il tag insieme alla sua
ultima immagine, e con lui i suoi alias. Il vocabolario mostrato all'owner e al modello è quindi sempre
quello reale, senza voci morte.

**Alias** (`tag_aliases`): un'etichetta alternativa che rimanda sempre a un tag e non si attacca mai a
un'immagine. Un'etichetta è tag o alias, mai entrambi (trigger). Ogni tag scritto dall'owner, aggiunto in
blocco o proposto dal modello passa per gli alias prima di essere salvato.
- «Unisci A in B»: le immagini di A passano a B, gli alias di A passano a B, A diventa alias di B.
  Non cambia lo stato delle immagini: è una correzione di vocabolario, non di contenuto.
- «Nuovo alias»: solo per etichette che non sono già tag (per un tag esistente si usa «Unisci»).
- Gli alias serviranno anche alle embedding di Topic Discovery, come sinonimi dichiarati.

**Analisi** (`worker/analysis.v1.6.0.ts`), su richiesta dell'owner dopo il caricamento, dalla scheda o
in blocco:
- solo immagini `nuove` con copia di gioco: il modello vede esattamente il file che vedrà il giocatore;
- input: copia di gioco, titolo, descrizione, prompt (SLOP) e i 300 tag più usati come vocabolario da
  preferire; mai l'origine REAL/SLOP, e istruzioni identiche per tutte;
- output JSON con schema rigido: 5–15 tag e una didascalia. I tag vengono resi conformi (forma ASCII,
  parole sull'origine scartate), risolti per alias e **sostituiscono** i tag presenti; la didascalia generata **sostituisce** quella
  presente. Tag e didascalia generati sono conservati a parte (`generated_tags`, `generated_caption`):
  l'owner modifica liberamente i campi e può sempre ripristinare i testi generati, senza costi;
- **una sola generazione per immagine**: dopo un esito riuscito il server rifiuta ogni nuova analisi
  prima di riservare o inviare. Un esito incerto o non riuscito non ha prodotto testi e si può riprovare
  solo su richiesta esplicita, con avviso per l'incerto;
- una sola analisi alla volta per immagine; un segno «in corso» più vecchio di 10 minuti (Worker
  interrotto) non blocca più, ma la sua riserva resta contata.

**Budget** (decisione dell'owner del 2026-11-09: «Mettiamone uno solo, totale per tutte le chiamate api,
di 5 USD di default ma modificabile e rinnovabile»).
- Un solo tetto in dollari per tutte le chiamate a pagamento: analisi ora, generazione delle SLOP in fase 3.
  Vale 5 $ alla creazione dello schema; l'owner lo cambia dalla dashboard (tra 0 e 1000 $).
- «Rinnova» apre un nuovo periodo: da quel momento il conteggio riparte da zero, con lo stesso tetto o uno
  nuovo. Il registro conserva tutte le chiamate dei periodi precedenti.
- Nessun costo per chiamata da configurare. Il costo di una chiamata si calcola dai token dichiarati da
  OpenAI e dal prezzo di listino del modello, scritto nel codice (`gpt-6.1-terra`: 1 $ per milione di token
  in ingresso, 5 $ in uscita; letti il 2026-11-09 da fonti secondarie, da verificare sulla pagina dei prezzi
  di OpenAI). Un modello senza prezzo registrato non si può usare.
- Prima dell'invio si riserva sul budget il **costo massimo** della chiamata: 8000 token in ingresso e 2000
  in uscita, il limite imposto alla risposta, ragionamento compreso; per `gpt-6.1-terra` 0,018 $. L'owner
  conferma quel massimo (per un gruppo, il totale) e la richiesta deve riportarlo esattamente. Riserva e
  segno «in corso» sono una sola scrittura atomica: se il residuo non copre il massimo, nessuna chiamata parte.
- Esiti: risposta valida o illeggibile → `completed`, al costo dei token; errore 4xx → `failed`, costo zero;
  errore 5xx, timeout o rete → `uncertain`: resta contato il massimo, e la chiamata non viene **mai ripetuta
  automaticamente**.
- Configurazione: segreto `OPENAI_API_KEY` (senza, l'analisi è spenta); `ANALYSIS_MODEL` facoltativa,
  predefinita `gpt-6.1-terra`.

**Limite di spesa di OpenAI.** Il budget del sito è una stima calcolata sui prezzi di listino; quello che
OpenAI applica davvero è il limite impostato su platform.openai.com. Se si esaurisce prima il limite o il
credito di OpenAI, le richieste vengono rifiutate con errore 429 senza addebito: l'analisi risulta non
riuscita, con un messaggio che rimanda a platform.openai.com, il budget del sito non cambia e un'analisi in
blocco si ferma. Lo stesso per una chiave rifiutata (401/403) o per troppe richieste (429).

**Registro di spesa** (`spend`): tipo, modello, importo riservato, stato, token, date. Nessun legame con
le immagini, che quando vengono eliminate non lasciano tracce; il denaro speso resta registrato.

**Schema:** migrazione additiva `0034_tag_aliases_analysis.v1.1.0.sql` (alias, trigger, colonne
`analysis_status`, `analysis_error`, `analyzed_at` in `images`, tabelle `spend` e `budget`). Sostituisce la
versione 1.0.0 della stessa migrazione, mai applicata in remoto. Migrazione additiva
`0035_generated_texts.v1.0.0.sql`: colonne `generated_caption` e `generated_tags` (JSON) in `images`, nulle
finché l'immagine non è stata generata. Le immagini analizzate prima della 0035 non hanno testi da ripristinare.
Migrazione `0036_caption_soft_limit.v1.0.0.sql`: ricostruisce `images` con la didascalia fino a 256 caratteri,
conservando le righe collegate (tag, alias, round, risposte, sfide) che la cancellazione della vecchia tabella
eliminerebbe a cascata.

**Test:** il modello è sostituito da un server locale finto (`tests/fake_openai.py`); i test
d'integrazione coprono conferma, budget modificato e rinnovato, costo dai token, esiti incerti non ripetuti,
limite di OpenAI raggiunto, alias, unione, testi sostituiti, generazione unica, ripristino
e rimozione dei tag orfani, anche nel browser su desktop e mobile.

## 11. Regole di contenuto e trasparenza (1.5.0)

Riunisce le regole ancora valide delle sezioni 6.2–6.4 di `docs/lotti-editoriali.v1.6.2.md`, aggiornate con le
decisioni dell'owner del 2026-11-10. Valgono per ogni modello che produce contenuti del sito: chi scrive i prompt
delle SLOP, il generatore di immagini, chi scrive tag e didascalie. Il contesto fisso dei modelli le riprende.

**11.1 Che cosa può comparire in una SLOP**
- **Persone vive o morte da meno di 50 anni:** escluse. Solo figure plausibili ma non riconoscibili.
- **Personaggi storici** (morti da almeno 50 anni): ammessi, anche in eventi mai accaduti, perché riconoscere un
  falso storico richiede conoscenza ed è parte del gioco. Esclusi atrocità e crimini attribuiti a loro e ogni scena
  degradante.
- **Marchi reali:** ammessi.
- **Regimi e ideologie** (decisione del 2026-11-10): documentare sì, celebrare no. Ammesse scene storiche in cui
  manifesti, bandiere, simboli o propaganda compaiono come parte del contesto (una strada di Mosca nel 1965 con i
  manifesti alle pareti). Esclusa ogni immagine costruita per esaltare un regime, un leader o un'ideologia, compresi
  manifesti di propaganda generati ex novo: per esempio un nuovo manifesto di arruolamento nelle SS. Una volta fuori
  dal gioco sarebbe indistinguibile da propaganda autentica; in Italia valgono le norme sull'apologia del fascismo,
  in altri paesi il divieto dei simboli nazisti. Le riproduzioni di manifesti storici autentici sono immagini REAL
  e le valuta l'owner in revisione.
- **Nudità** (decisione del 2026-11-10): vietata ogni nudità umana, tranne nelle opere d'arte (statue, dipinti,
  affreschi) che compaiono nella scena. Mai contenuti sessuali; mai nudità che riguardi minori, nemmeno nelle opere.
- **Stile:** fotografico e plausibile per l'epoca e il luogo, senza riferimenti a fotografi, agenzie o archivi.
- Il generatore di immagini applica anche le proprie regole d'uso e può rifiutare richieste ammesse qui. I casi dubbi
  li decide l'owner in revisione.

**11.2 Didascalie e persone.** Il modello non inventa nomi di persone: usa solo quelli del contesto. Per le REAL il
contesto è il titolo e la descrizione di Commons, che possono nominare persone vive: è ammesso, perché la foto è
autentica. Per le SLOP il contesto è il prompt, che già rispetta 11.1: la didascalia eredita quelle regole. La
didascalia di una SLOP è plausibile ma descrive una scena inventata (sezione 4).

**11.3 Trasparenza e protezioni**
- **Deepfake:** per l'AI Act (art. 50) quasi ogni SLOP fotorealistica che richiama luoghi, marchi, eventi o persone
  esistenti è un deepfake, anche senza personaggi famosi. La risposta è la trasparenza: il sito dichiara che molte
  immagini sono generate dall'IA, ogni round rivela l'origine e le immagini portano un marchio visibile.
- **Marchio «RS»:** identico su tutte le immagini del gioco, REAL e SLOP, sovrapposto in pagina e non inciso nei file
  (le REAL restano intatte, anche con licenze ND). In basso a destra dentro l'immagine, lato circa il 5% del lato
  corto con un minimo leggibile su telefono, lettere bianche al 60–70% di opacità con contorno scuro sottile, uguale
  nel round e nella risposta. Un marchio solo su alcune immagini rivelerebbe la risposta. Non è una protezione
  tecnica: serve come attrito alla diffusione fuori contesto e come prova della diligenza del sito.
- **Salvataggio scoraggiato:** nel gioco sono bloccati tasto destro, trascinamento e pressione prolungata sulle
  immagini. Non è un blocco assoluto.
- **Metadati:** il gioco serve solo le copie WebP senza metadati (`docs/copie-di-gioco.v2.0.0.md`), uguali per REAL
  e SLOP; gli originali con i loro metadati restano nella quarantena privata.
- **Licenze:** nessuna licenza restrittiva sulle SLOP, che in genere non sono protette da diritto d'autore; valgono i
  termini d'uso del sito (divieto di diffusione fuori contesto), da far verificare a un legale.

## 12. Contesto dei modelli (1.6.0)

Decisione dell'owner del 2026-11-10: il contesto fisso del modello linguistico si modifica dalle **Impostazioni**
della dashboard. Testi della prima versione approvati dall'owner lo stesso giorno.

- **Tre parti**, ognuna fino a 4000 caratteri:
  - **Base comune**, inviata in ogni chiamata: lingua, fatti, regole dei tag. Non parla di immagini generate, perché
    il modello che scrive tag e didascalie non deve sapere che esistono (sezione 11);
  - **Tag e didascalie**, inviata con la base a ogni generazione;
  - **Prompt per le SLOP**, con le regole di contenuto della sezione 11.1; sarà usata nella fase 3 e oggi non viene
    inviata a nessun modello.
- **Versioni.** Ogni salvataggio di un testo diverso crea una nuova versione datata; la versione attuale è l'ultima.
  Le precedenti restano e si possono rileggere e ripristinare: il ripristino crea una nuova versione con lo stesso
  testo, quindi lo storico non si riscrive mai. Le prime versioni vengono scritte dal Worker al primo uso.
- **Tracciabilità.** Ogni generazione registra le versioni di base e compito usate (`analysis_base_context`,
  `analysis_task_context` in `images`); le Impostazioni mostrano per ogni versione quante immagini l'hanno usata.
- **Cosa resta nel codice**, qualunque cosa dicano i testi: la riga finale sul formato JSON e lo schema della
  risposta, i limiti della didascalia (sezione 4), la conversione dei tag e lo scarto delle parole sull'origine.
  Una modifica ai testi non può rompere il sistema.
- **Costo.** Base e compito aggiungono circa 400 token per chiamata nella prima versione; il massimo riservato per
  chiamata (8000 token in ingresso) resta valido con testi fino a 4000 caratteri ciascuno.
- **Schema:** migrazione additiva `0037_model_contexts.v1.0.0.sql` (tabella `model_contexts`, due colonne in
  `images`). Codice: `worker/model-context.v1.1.0.ts`, che propone anche i testi aggiornati per le categorie (da salvare
  dall'owner con «Carica nel campo»), rotte `/api/admin/library/contexts` e `/contexts/restore`.
