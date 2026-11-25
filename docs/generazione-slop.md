# Generazione SLOP — specifica 16.0.0

Aggiornata: 2026-11-25T15:24:14Z. Stato: protocollo adottato dall'owner e sperimentato sulle REAL della galleria Nintendo;
integrazione nel wizard da realizzare. Questa modifica salva il protocollo e non modifica il codice del generatore.

## 1. Obiettivo e stato dell'implementazione

Decisioni dell'owner del 2026-11-24 e 2026-11-25: generare fotografie che sembrino appartenere alla galleria delle REAL,
partendo dalle loro descrizioni testuali in inglese. La varietà comprende elementi nuovi ma plausibili e combinazioni ordinarie.
Evitare copie riconoscibili delle REAL e tratti ricorrenti che distinguano il dataset SLOP, per esempio usura sempre accentuata,
edizioni speciali troppo frequenti o composizioni commerciali sistematiche.

Il wizard in produzione resta quello della 1.57.0: selezione delle REAL e delle idee, preparazione dei prompt e ciclo automatico
di generazione/valutazione in Workflow. Le rotte `auto/*` e `worker/slop-runner.ts` non implementano ancora questo protocollo.
Descrizioni e indici sono nei rami 1.58.0 e 1.59.0. La precedente specifica 15.0.0 si consulta nella cronologia Git.
Questo documento è la specifica di riferimento del nuovo protocollo. Non introduce API, migrazioni o comandi UI già disponibili;
l'integrazione richiederà una successiva modifica del codice e delle specifiche delle aree coinvolte.

## 2. Descrizioni, assi e regole della galleria

Il modello descrive l'originale REAL **intero**, prima di ritaglio e trattamento, su otto assi:
`subject_type`, `subject_appearance`, `people`, `environment`, `viewpoint`, `light`, `technique`, `rendering`.
La descrizione è privata, in inglese, distinta da quella Commons. Si prepara al caricamento o successivamente in gruppo;
una REAL senza descrizione è segnalata sulla miniatura (specifica `libreria-immagini`).

Descrivere una singola scena fotografica: soggetti, superfici visibili, posa e sostegni, fotocamera, ambiente, luci, ombre,
fuoco, medium e resa. Le parti nascoste del prodotto non diventano oggetti da mostrare. Distinguere osservazioni, inferenze
e dettagli non determinabili. Trascrivere le scritte leggibili nella lingua originale: conservarle nell'analisi non significa
che debbano essere riprodotte nella SLOP.

Le regole della galleria accompagnano il generatore di testo: modelli compatibili, vincoli fisici e generi fotografici presenti.
Per Nintendo: `docs/regole-galleria-console-nintendo.md`. Sono costruite sulle REAL, rivedibili dall'owner, non dedotte dal solo
titolo. Non impongono marcatori visivi comuni a ogni SLOP. Gli indici di soggetto (marca, famiglia, modello) e ambiente recuperano
le descrizioni pertinenti senza inviare tutta la galleria a ogni generazione. Le statistiche usano le annotazioni disponibili.

## 3. Parametri controllabili

Gli assi restano la struttura della descrizione finale. I parametri definiscono cosa variare separatamente, rispettando le
dipendenze fisiche e storiche. La tabella specializza il protocollo per Nintendo; altre gallerie richiedono parametri pertinenti.

| Parametro | Significato | Asse principale |
|---|---|---|
| `model` | Famiglia e modello della console | `subject_type` |
| `colour` | Colore della scocca e dei componenti | `subject_appearance` |
| `material_finish` | Materiale, opacità, trasparenza e finitura | `subject_appearance` |
| `edition_decoration` | Edizione, personalizzazione, grafiche e adesivi | `subject_appearance` |
| `wear` | Abrasione, graffi da uso, superfici lucidate dal contatto | `subject_appearance` |
| `damage` | Fratture, scheggiature, deformazioni e parti mancanti | `subject_appearance` |
| `ageing` | Ingiallimento, scolorimento, ossidazione e deterioramento nel tempo | `subject_appearance` |
| `cleanliness` | Polvere, impronte, sporco e residui rimovibili | `subject_appearance` |
| `operating_state` | Accesa/spenta; configurazione aperta/chiusa quando applicabile | `subject_appearance` |
| `screen_content` | Gioco/applicazione, schermata, testi, valori e disposizione visibili | `subject_appearance` |
| `pose` | Posizione e orientamento del soggetto rispetto al piano e al sostegno | `viewpoint`, con vincoli di `environment` |
| `viewpoint` | Posizione e angolo della fotocamera rispetto al soggetto | `viewpoint` |
| `composition` | Distanza, dimensione nel fotogramma, decentramento e taglio | `viewpoint` |

Il contenuto dello schermo è distinto da acceso/spento. Un menu può cambiare mantenendo la console accesa. Gioco, schermata e
dati di salvataggio devono essere plausibili per modello ed epoca. A schermo spento o nascosto, `screen_content` è non applicabile:
estrarlo non accende la console e non cambia implicitamente l'inquadratura. Se non estratto, il contenuto può restare quello
descritto; dati identificativi copiati sono comunque un rischio di eccessiva somiglianza da segnalare alla revisione.
Non imporre che ogni schermo cambi sempre, creando un'altra regolarità sistematica.

Le annotazioni devono essere atomiche: il colore non include accessori, la composizione non sostituisce lo sfondo, la posa non
importa il piano d'appoggio del donatore. Usura, danno, invecchiamento e pulizia hanno valori separati, compresa assenza e non
determinabile. Un valore ignoto non prova l'assenza di un fenomeno. Persone, accessori e numero dei soggetti non diventano nuove
variazioni attive in questo test. I nomi dei nuovi campi sono un contratto di progettazione, non uno schema DB implementato.

## 4. Estrazione e bilanciamento

Estrarre **zero o più parametri**, ciascuno con probabilità configurabile per galleria. Distinguere la probabilità di modificarlo
dalla distribuzione del nuovo valore: include valori ordinari, assenza del tratto e valori uguali al punto di partenza.
Modificare non significa intensificare: una console danneggiata può diventare integra, una personalizzata può diventare standard.
Non forzare almeno una modifica vistosa.

Probabilità e valori devono riflettere la composizione delle REAL della galleria, considerando visibilità, dati ignoti e
compatibilità con il soggetto. Il generatore di testo può proporre valori plausibili non presenti nelle REAL (un altro colore,
tema o danno), senza sovrarappresentare le novità. Il protocollo non si limita a permutare elementi esistenti.

Controllare distribuzioni individuali, combinazioni rilevanti e ricorrenze nelle SLOP: campionare i valori indipendentemente non
conserva tutte le correlazioni delle REAL. Evitare duplicati riconoscibili lasciando che gli elementi comuni nelle REAL siano
comuni anche nelle SLOP; non imporre unicità a ogni immagine. Scartare o adattare un valore incompatibile dichiarandone il motivo,
senza introdurre modifiche nascoste degli altri parametri. Calibrazione, soglie di somiglianza e misura delle distribuzioni
SLOP restano da implementare e validare. Questi controlli non autorizzano cicli automatici di correzione delle immagini.

## 5. Scena finale e generazione

1. Scegliere le REAL descritte e recuperare annotazioni, statistiche e regole pertinenti della galleria.
2. Registrare per il batch probabilità, estrazioni, valori e revisioni delle descrizioni e delle regole usate.
3. Il generatore di testo riceve descrizione di partenza, parametri selezionati, valori e vincoli. Produce una scena completa
   in inglese su tutti gli assi e, separatamente, i cambiamenti effettivi e gli adattamenti di compatibilità.
4. Conservare **ambiente e configurazione fisica della luce**, medium e resa fotografica. Ombre, riflessi e superfici visibili
   si adattano a nuova geometria, materiali e fotocamera. Un cambio di composizione non autorizza uno sfondo nuovo. I parametri
   non estratti conservano il valore iniziale salvo le dipendenze necessarie dichiarate.
5. L'owner può rivedere scena e prompt prima della conferma a pagamento. Generare con `POST /v1/images/generations` passando
   **solo la descrizione testuale finale**, senza la REAL, maschere o collage. Descrivere positivamente la scena di arrivo,
   senza rimandi alla foto originale.
6. Conservare la candidata intera per valutazione e decisione dell'owner. Preparare la copia di gioco dopo l'accettazione.

Modelli usati negli esperimenti: GPT-6.2 Sol (`gpt-6.2-sol`) e GPT Image 2.6 Sunburst (`gpt-image-2.6-sunburst`). I modelli restano
configurabili. Questa decisione non sceglie un modello valutatore specifico; deve poter esaminare immagini intere e vincoli.

## 6. Valutazione e correzioni con conferma

Il modello valutatore riceve la **SLOP intera**, scena/prompt di arrivo, parametri e regole pertinenti. Esamina credibilità
fotografica, geometria e dettagli, coerenza della scena e aderenza ai parametri. Può segnalare ricorrenze nel contesto fornito,
ma non dedurre la distribuzione dell'intero dataset da una sola immagine.

Restituisce difetti e incertezze, con eventuali proposte di correzione: problema visibile, zona, istruzione locale, beneficio
atteso e rischio di alterare dettagli corretti. Spiega perché l'intervento potrebbe valere una chiamata. La proposta non avvia
correzione, rigenerazione o nuova valutazione.

**Ogni intervento richiede conferma dell'owner prima della chiamata a pagamento**, anche se restano chiamate nel massimo del batch.
L'owner può scegliere, modificare o ignorare le proposte, accettare la candidata o scartarla. La conferma mostra immagine, difetto,
intervento e massimo di chiamate. La conferma della generazione non autorizza le correzioni. Le valutazioni a pagamento devono
essere comprese nel massimo esplicitamente autorizzato per la fase.

La correzione approvata usa `POST /v1/images/edits` con **l'intera SLOP**, prompt locale e maschera della zona. Non passare solo
il ritaglio: il contesto completo serve per proporzioni, prospettiva e luce. La maschera è una guida e non garantisce pixel
esterni identici. Conservare e confrontare prima/dopo, mostrando anche le modifiche fuori zona. Un eventuale compositing locale
è una scelta separata e dichiarata, non una proprietà dell'API.

**Nessun ciclo automatico di valutazione/correzione e nessuna rigenerazione automatica.** Dopo l'intervento l'owner confronta
il risultato; altre correzioni o valutazioni richiedono una nuova decisione e, se a pagamento, conferma esplicita.
Una proposta del valutatore può essere inutile o peggiorare la candidata: la sua raccomandazione non autorizza la spesa.

## 7. Chiamate, dati e revisione finale

Prima di ogni fase a pagamento, confermare il massimo di chiamate includendo le valutazioni previste. Registrare modello,
richiesta, stato ed esito in `paid_calls`, senza importi. Acquisire la richiesta una volta sola; esiti incerti mai ripetuti
in automatico. La proposta del valutatore e la decisione dell'owner restano distinte.

Le descrizioni e i parametri sono privati; la scena intermedia SLOP serve al prompt e non diventa didascalia pubblica. Nei risultati
restano prompt e modello SLOP, crediti e fonte REAL. Restano validi regole sui contenuti, appartenenza alla galleria, ricetta comune
WebP 4:5 e passaggi separati di approvazione/pubblicazione. Le REAL restano giocabili. I riferimenti per la lavorazione non
introducono un registro permanente REAL–SLOP; si eliminano al termine del processo secondo le regole della libreria.

## 8. Evidenze e limiti dei test

Il 2026-11-25: quattro originali della galleria Nintendo (GBA bianco, GBC verde, SP Tribal, Game Boy bruciato). Una chiamata Sol
ha descritto le quattro REAL e annotato le 23 foto della galleria; una seconda ha preparato le scene; quattro generazioni
Sunburst hanno usato solo il testo; una correzione ha usato immagine intera e maschera. Totale 7 chiamate su 8 autorizzate.
Nessuna chiamata a un valutatore: la revisione è stata visiva. Le proposte di un modello valutatore sono una decisione successiva
dell'owner, non una funzione dimostrata da quel test.

- Contesto fotografico riconoscibile; riuscite la rimozione della decorazione Tribal e la trasformazione del Game Boy bruciato
  in GBC integro. Sol ha scartato alcune incompatibilità di posa e sfondo.
- Graffi accentuati anche con descrizioni di usura lieve: controllare questa possibile ricorrenza del generatore.
- Menu GBC riprodotto perché Sol ne aveva trascritto testo e valori: da qui `screen_content`, aggiunto dopo il test e non ancora
  sperimentato come parametro estratto.
- La correzione ha eliminato il riflesso sfaccettato della croce ma l'ha arrotondata troppo, perdendo il dettaglio centrale.
  Esito parziale, non accettato come riparazione fedele. L'immagine intera non garantisce una correzione corretta.
- Probabilità provvisoria di selezione del 30% per parametro, valori campionati dalle REAL compatibili con condizioni ordinarie
  e assenze. Non è la calibrazione finale né una dimostrazione del bilanciamento del dataset.

Artefatti locali: `artifacts/test-galleria-parametri-2026-11-25/`, ignorati da Git: catalogo/crediti, descrizioni, estrazioni,
prompt, immagini, confronti, registro locale `paid_calls` e riepilogo. Il registro non è quello di produzione. Le evidenze
essenziali sono salvate qui perché gli artefatti non sono inclusi nella PR.

Restano da implementare calibrazione delle probabilità, annotazioni atomiche, controlli delle combinazioni e della somiglianza,
contratto strutturato del valutatore e UI delle conferme. I test software usano modelli simulati; nuovi esperimenti a pagamento
richiedono la conferma esplicita dell'owner.
