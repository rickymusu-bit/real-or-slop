> Aggiornamento 2026-11-01T22:00:00Z — documento storico. La
> [pipeline editoriale v1.0.0](pipeline-editoriale-real-slop-v1.0.0.md) supera
> difficoltà preassegnata, relativi filtri/template e pubblicazione per singola
> approvazione. Restano le regole compatibili su diritti, fonti, audit e, per il
> campionamento v2, monete Bernoulli indipendenti. La cronologia seguente è conservata.

# Real or Slop — Protocollo di generazione immagini SLOP

**Versione:** 1.0.0  
**Data:** 25 ottobre 2026  
**Stato:** proposta operativa approvata come linea editoriale; non modifica il database o il generatore  
**Ambito:** immagini sintetiche generate per il gioco *Real or Slop* (`AI` nel database, **SLOP** nell'interfaccia).

## 1. Principio editoriale vincolante

> **Anche una domanda FACILE deve far pensare.** Non creare scene gratuitamente assurde o palesemente impossibili al primo sguardo. L'immagine deve essere inizialmente credibile, e l'indizio che la smentisce deve richiedere almeno un atto di osservazione, di confronto logico o di conoscenza.

**Esempio di riferimento:** fotografia d'epoca di Albert Einstein che usa una calcolatrice scientifica tascabile **HP-35**. Una persona di scienza che usa uno strumento di calcolo sembra normale. Ma Einstein morì nel **1955**; la HP-35 venne commercializzata nel **1972**. Il dettaglio è un **anacronismo verificabile** e non una stravaganza visiva.

Fonti per il revisore: https://www.nobelprize.org/prizes/physics/1921/einstein/facts/ e https://airandspace.si.edu/collection-objects/calculator-pocket-electronic-hp-35/nasm_A19850582000 .

**Esempi da scartare:** Einstein con smartphone contemporaneo; monumenti che volano; un romano antico con LED RGB molto evidenti; personaggi storici che fanno selfie; oggetti impossibili la cui stranezza costituisce tutta la domanda. La stessa scena può però funzionare se l'anacronismo è storicamente credibile e richiede un controllo mentale.

L'obiettivo NON è insegnare che le immagini sintetiche abbiano sempre difetti visivi; il giocatore deve imparare che **realismo estetico, plausibilità narrativa e autenticità documentaria sono tre proprietà diverse**.

## 2. Le sei dimensioni indipendenti

Annotare la progettazione in una scheda privata per ogni asset:

1. **Qualità tecnico-visiva** — anatomia, geometria, prospettiva, luci, riflessi, materiali, lettering, grana, continuità; da difetti moderati a resa fotografica rigorosa. Non confondere bassa qualità con prova conclusiva di AI.
2. **Plausibilità storica/materiale** — fatti, date di vita, periodi di produzione, tecnologie, abbigliamento, vincoli fisici e ingegneristici; distinguere storicamente impossibile, improbabile e plausibile.
3. **Visibilità dell'indizio** — dopo quanti secondi di osservazione un dettaglio importante è percepibile e quale ragionamento serve per interpretarlo.
4. **Familiarità culturale** — notorietà del soggetto/oggetto/luogo, senza assumere conoscenze identiche in ogni paese e fascia d'età.
5. **Plausibilità narrativa/documentaria** — la scena potrebbe essere un evento ordinario non registrato? ha un contesto coerente? non inventare falsi riferimenti bibliografici o archivi come se fossero prove reali.
6. **Processo cognitivo sollecitato** — inferenza temporale, confronto fra oggetti, assunzioni sulle tecnologie, falsa familiarità, effetto autorità, aspettative su epoca/paese; non usare stereotipi denigratori o disinformazione dannosa.

**Regola non negoziabile:** la difficoltà progettata non equivale a difficoltà misurata. Ogni livello dovrà essere rivisto con una prova su giocatori e risultati empirici.

## 3. Matrice delle difficoltà

| Livello editoriale | Composizione dell'immagine | Come si ragiona | Difetti tecnici | Fattore cognitivo |
|---|---|---|---|---|
| **Facile** `facile` | Scena ordinaria, inizialmente plausibile, con **un indizio decisivo** | Notare un anacronismo riconoscibile, un'irregolarità fisica o un dettaglio impossibile dopo riflessione | Ammessi errori minori; niente deformazioni grottesche o stile AI ostentato come unico segnale | Inferenza breve, cultura generale o osservazione attenta |
| **Medio** `medio` | Contesto verosimile e 1–2 incongruenze sottili | Collegare più informazioni (date, modelli, uso di dispositivi, architettura) | Rari, non risolutivi da soli | Associazioni e memoria contestuale |
| **Difficile** `difficile` | Scena realistica di evento, prototipo o opera mai esistiti, in contesto autentico | Valutare storicità/plausibilità, evitare conclusioni frettolose | Nessun difetto visivo intenzionale; nessuna estetica «AI glossy» | Effetto familiarità, realismo fotografico, competenze specifiche |
| **Esperto** **proposto** `esperto` | Finzione strettamente compatibile con epoca, ambiente, cultura materiale e medium fotografico | Riconoscere il limite delle proprie conoscenze e formulare ipotesi; eventuali indizi investigabili molto sottili | Nessun difetto intenzionale; autenticità visiva elevata | Credibilità narrativa, falsa memoria, aspettative storiche |

**Importante:** lo schema D1 attuale ammette solo `facile`, `medio`, `difficile` e il frontend filtra queste difficoltà. Non usare `esperto` nel DB finché non saranno approvate e testate una migrazione SQL e le modifiche ad API, amministrazione, statistiche e UI. Nel frattempo è un *profilo editoriale interno* o una sottoclasse da conservare nelle note private.

### Problema epistemico da evitare

Una fotografia sintetica impeccabile di un evento minore mai accaduto **non può essere smascherata con certezza solo osservandola**. Se non esiste un indizio accessibile al giocatore, la risposta REAL/AI diventa un tiro a indovinare, non una prova d'abilità. Per `difficile` e `esperto` progettare una ragione investigabile, un confronto contestuale con le altre immagini o un feedback istruttivo; non presentare una falsa possibilità di deduzione infallibile. Il punteggio vicino al 50% su due risposte può indicare semplice casualità, non automaticamente eccellente difficoltà.

## 4. Tipi di incongruenza consentiti

| Codice | Meccanismo | Esempio / condizioni |
|---|---|---|
| `chronology_device` | Oggetto introdotto dopo il periodo mostrato | Strumento del 1972 in una foto ambientata nel 1940–1950; il modello deve essere realmente identificabile. |
| `chronology_person` | Incompatibilità fra vita del personaggio e data di un prodotto/evento | Einstein / HP-35; controllare entrambi i termini. |
| `engineering_anachronism` | Tecnologia, materiale, soluzione costruttiva introdotti successivamente | Veicolo o ponte con componente storicamente incompatibile ma non fantascientifico. |
| `architecture_context` | Edificio reale collocato in epoca/stadio di costruzione non corretto | Richiedere testimonianze storiche affidabili; non confondere restauri con falsificazioni. |
| `fictional_artifact` | Oggetto/prototipo credibile ma mai prodotto | Locomotiva, automobile, apparecchio di laboratorio plausibili: controllare di non spacciare il prodotto per realmente noto. |
| `fictional_event` | Evento minore inventato ma realistico | Esposizione tecnologica, dimostrazione scientifica o inaugurazione fittizia non riferita a fatti sensibili. |
| `fictional_work` | Opera d'arte/locandina di film/manifesto inventati | Non copiare marchi o un'opera protetta come se fosse una licenza libera; rendere inventato anche il titolo se necessario. |
| `visual_inconsistency` | Difetto tecnico moderato e contestualizzato | Un riflesso incoerente individuabile osservando attentamente; non mani con molte dita volutamente grottesche. |
| `false_familiarity` | La scena ricorda un archivio o un genere ben noto | Finta foto di rivista di divulgazione, ma senza falsi crediti archivistici o nomi istituzionali. |

I dati di classificazione, i meccanismi e gli indizi vanno **solo nel catalogo privato e nel reveal successivo alla risposta**; non nel file pubblico, nella URL o nel testo alternativo pre-risposta.

## 5. Scheda editoriale prima della generazione

Ogni richiesta deve contenere:
- `concept_id`, `category`, `subcategory`, `region`, `year_or_period`, `image_kind`.
- `intended_difficulty`, `mechanism`, `fictional_claim`, `documented_reference_facts` con URL verificabili per cronologie decisive.
- `scene_description`, `period_accurate_details`, `single_clue_or_hypothesis`, `photo_process` quando pertinente.
- `allowed_artifacts`, `prohibited_cliches`, `sensitive_subject_check`, `copyright_check`.
- `ai_model`, `ai_prompt`, `generation_date`, `generation_owner`, `iteration`, `asset_sha256`, `evaluation_notes` e `reveal_explanation`.
- `editorial_status`: candidate → in-review → approved/rejected, con revisore umano e motivazione.
- La `difficulty` definitiva resta inizialmente editoriale, poi viene rivista con statistiche sufficienti; archiviare versione precedente e nuova valutazione.

**Nota sui fatti:** prima di una generazione basata su anacronismi il revisore deve verificare date e identità con fonti autorevoli; il generatore di immagini non deve inventare prova storica. Se l'elemento anacronistico non è visivamente identificabile, rigenerare o scartare.

## 6. Template di generazione

Usare i prompt seguenti come **modelli da personalizzare**, non come istruzioni per inserire testi/crediti dentro l'immagine.

### A — FACILE: anacronismo credibile

```text
Genera una singola immagine per un gioco educativo "Real or Slop".
Soggetto: [persona/contesto reale verificato].
Epoca rappresentata: [anno o intervallo].
Scena: [azione abituale nel contesto del soggetto].
Unico elemento anacronistico: [oggetto, modello o invenzione attestata successivamente].
L'oggetto deve essere visibile e identificabile, ma inserito con naturalezza;
il resto della scena deve rispettare i dettagli materiali e fotografici dell'epoca.
Immagine credibile a prima vista, senza elementi comici, fantasy, fantascienza
ostentata, selfie, telefoni moderni vistosi o altre impossibilità eclatanti.
Non creare errori anatomici grossolani. Stile fotografico [processo autentico].
Niente watermark, cornici o didascalie inventate che fingano provenienza da
archivi reali. Nessuna etichetta "AI" / "REAL" sovrapposta al gioco.
```

**Scheda-esempio:** Einstein che lavora a una scrivania e usa una HP-35, stile fotografia di metà Novecento; la data della HP-35 è l'indizio documentato. **Non inventare una foto d'archivio originale di questa scena.**

### B — MEDIO: incongruenza di periodo o tecnica

```text
Crea un'immagine fotorealistica per un quiz di autenticità.
Ambientazione: [luogo/decennio]. Oggetto o situazione principale: [descrizione].
La scena deve essere storicamente e materialmente coerente eccetto [un dettaglio
sottile ma verificabile: modello di treno, insegna, infrastruttura, materiale].
Indizio non centrale, comunque osservabile alla risoluzione di gioco.
Conserva texture, illuminazione, profondità e imperfezioni fotografiche plausibili.
Non creare artefatti evidenti, anacronismi assurdi o stilizzazioni che rivelino
automaticamente la generazione artificiale. Nessun falso timbro archivistico.
```

### C — DIFFICILE: evento plausibile inesistente

```text
Produci una fotografia apparentemente ordinaria di [esposizione tecnica/
prototipo industriale/manifestazione culturale innocua] nell'anno [anno],
in [contesto locale]. L'evento o l'oggetto è dichiaratamente INVENTATO
nell'archivio privato del gioco, non presentato come fatto autentico.
Assicura coerenza di tecnologia, edifici, abiti, grafica, mezzi e processo
fotografico dell'epoca. Niente elementi spettacolari: normalità documentaria.
L'immagine deve essere realistica senza look cinematografico artificiale,
senza errori tecnici intenzionali e senza simboli o crediti di istituzioni reali.
Nel dossier interno, specifica ciò che è inventato e quali indizi o verifiche
sono accessibili a un giocatore, senza aggiungerli come testo sulla fotografia.
```

### D — ESPERTO: credibilità documentaria controllata (solo profilo editoriale)

```text
Crea un'immagine fotografica estremamente verosimile di [oggetto/opera/
momento ordinario di evento fittizio e innocuo], [luogo] [periodo].
Vincoli storici confermati: [lista di dettagli documentati]. Fotografia:
[ottica, pellicola, illuminazione, usura compatibili con processo reale].
L'invenzione deve riguardare il soggetto o l'evento, non errori visivi.
Evitare immagini stereotipate, glitch, artefatti e anacronismi non progettati;
nessun falso marchio, testata, archivio o certificazione e nessuna implicazione
diffamatoria. Nel registro PRIVATO descrivere perché la scena non è autentica,
quali prove attendibili potrebbero distinguerla e cosa impara il giocatore.
Se non esiste alcuna possibilità ragionevole di deduzione, contrassegnare
il concept come non idoneo alla valutazione di abilità, da rivedere.
```

## 7. Controllo editoriale e sicurezza

1. **Fact-check del concept**: date degli oggetti e dei personaggi, contesto, esistenza dell'evento, identità del modello inventato. Niente anacronismi basati su ricordi non verificati.
2. **Fidelity check**: le immagini AI e REAL devono usare risoluzione, compressione e trattamento coerenti; non inserire nel set artificiale sempre la stessa grana o gli stessi difetti.
3. **Tutela delle persone**: evitare false prove di crimini, eventi politici contemporanei, emergenze, tragedie, salute, attività compromettenti; limitare l'uso di persone reali a scene neutre e chiaramente ludiche dopo il reveal.
4. **Diritti**: non riutilizzare automaticamente foto di terzi come sorgente di modifica senza verificare licenze e autorizzazioni; controllare marchi, poster, personaggi e diritti all'immagine. Non cancellare crediti obbligatori.
5. **Identificazione interna**: nella quarantena privata salvare generatore, parametri, prompt integrale e controllo umano; non far trapelare la classificazione nel nome pubblico della risorsa.
6. **Rivelazione**: dopo la risposta mostrare che è un'immagine generata, qual è il falso elemento e le fonti di verifica, con tono istruttivo non umiliante.
7. **Stima della difficoltà**: effettuare test con gruppi eterogenei. Registrare percentuale di riconoscimento, tempi e, se possibile, sicurezza della risposta; correggere difficoltà calibrate **senza** dedurre una regola universale dalle sole percentuali e senza confondere 50% con difficoltà «ideale».

## 8. Consegnabile successivo per Codex

Non implementare un nuovo generatore senza richiesta specifica. Quando autorizzato:
- riusare import moderato e campi esistenti `ai_model`, `ai_prompt`, `owner_declaration`, `generation_date`;
- proporre eventuali metadati aggiuntivi in tabella privata/JSON versionata, non aggiungere colonne indiscriminatamente;
- **non introdurre** `esperto` nella enum SQL fino a decisione sulla quarta difficoltà e migrazione completa;
- testare validazione, tracciabilità, assenza di spoiler e compatibilità con `REAL`;
- predisporre PR in bozza senza merge né deploy; non modificare dati o immagini in produzione.

## Changelog

- **1.0.0 (25 ottobre 2026):** prima formalizzazione dei quattro profili e delle dimensioni cognitive. Correzione approvata: rimosse dal livello facile le scene assurde, sostituite da anacronismi ragionabili (Einstein / calcolatrice HP-35) e piccole incongruenze verificabili. Profilo Esperto non ancora implementato nel DB.
