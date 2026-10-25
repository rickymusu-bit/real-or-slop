# Campionamento indipendente e stratificato — v2.0.0

25 ottobre 2026. Applicazione **0.7.0**. Correzione della PR #10.
Questa specifica sostituisce il requisito 50/50 per partita della v1.0.0 e le
relative indicazioni del protocollo REAL v1.0.0. Le regole editoriali su diritti,
autenticità, difficoltà e revisione umana restano valide.

## Tre proprietà distinte

- **Indipendenza delle risposte:** ogni posizione usa una nuova moneta equa.
  `P(X_i=REAL | X_1,…,X_(i-1), catalogo, N)=1/2`. Nessun conteggio precedente
  cambia questa probabilità e nessuna serie consecutiva viene interrotta.
- **Bilanciamento probabilistico globale:** su molte partite la frequenza REAL
  converge al 50%. In una partita di N round il numero REAL segue Binomiale(N,1/2),
  con media N/2 e varianza N/4. Un conteggio esattamente N/2 in ogni partita
  violerebbe questa proprietà, anche se l'ordine fosse mescolato.
- **Comparabilità editoriale:** nel lungo periodo le due classi devono condividere
  distribuzioni di categoria/sottocategoria, medium, tipologia, composizione,
  periodo, regione e plausibilità percepita. Queste caratteristiche non devono
  diventare scorciatoie sistematiche quando lo stock consente confronti validi.

Per 12 domande, 9 REAL hanno probabilità `220/4096`, 10 REAL `66/4096` e tutte
REAL `1/4096`; anche tutte AI hanno probabilità `1/4096`. Gli squilibri casuali
non sono errori da correggere. Il vecchio algoritmo a quote è mantenuto soltanto
come **controllo negativo nei test**, non nel codice di produzione.

## Preflight: garantire prima di estrarre

`filteredCatalog()` conserva i filtri esistenti: approvazione, ambiente demo/reale,
difficoltà e categorie OR. Il catalogo viene deduplicato prima delle monete:
ID, chiave storage, SHA-256 non pending e dHash di 64 bit con distanza ≤5.
Le componenti con etichette contrastanti sono escluse. Una rappresentante
canonica per famiglia impedisce doppioni senza estrarre o cambiare etichette.
Hash assenti/invalidi non dimostrano uguaglianza.

Siano R e A le immagini distinte eleggibili nelle due classi. Il numero garantito è:

`N = min(numero richiesto, R, A)`

Questa scelta dipende soltanto dal catalogo, prima della sequenza. Servono almeno
N immagini di **ciascuna** classe per supportare anche N risultati tutti uguali.
Non basta che R+A raggiunga il numero richiesto. Se N è zero, le API di creazione
restituiscono 409 senza creare una partita; se N è ridotto, lo comunicano prima
della partita. Nessun esaurimento viene compensato con l'altra classe.

Allenamento e PvP usano il numero richiesto; A tempo richiede fino a 50 round e
applica lo stesso preflight. La demo di 24 immagini (12 per classe) può quindi
garantire al massimo **12 nuove domande indipendenti**, non 24.

## Pesi comuni, strati e ampliamento

Per ogni livello si partiziona il solo catalogo eleggibile in gruppi editoriali:

1. Profilo completo: insieme ordinato di categorie/sottocategorie e tutti i tag.
2. Categoria/sottocategoria più medium.
3. Categoria/sottocategoria.
4. Intero catalogo già filtrato.

Un gruppo g offre `c_g = min(R_g,A_g)` posizioni garantite. Si sceglie il primo
livello con somma delle capacità almeno N. Questo ampliamento avviene **prima**
delle monete e non allarga mai i filtri del giocatore o lo stato di approvazione.
Un avviso segnala il ricorso a strati meno specifici.

La selezione usa N posizioni editoriali condivise, con pesi comuni `c_g`, consumati
senza rimpiazzo. Il programma genera prima N monete indipendenti, poi estrae le
posizioni editoriali senza leggerne i risultati. Per ogni gruppo riserva abbastanza
immagini di entrambe le classi per riempire tutte le sue posizioni con qualunque
sequenza di monete. Da ciascuna posizione viene effettivamente assegnata **una sola
immagine della classe estratta**. Le immagini di riserva non usate restano private
e non entrano nella sessione o nel preload.

La capacità simmetrica di una riserva è una garanzia contro l'esaurimento, non
un numero di REAL/AI imposto alla partita. Una sequenza di dodici REAL produce
dodici REAL; le riserve AI rimangono inutilizzate. Non esiste un accoppiamento
fra singole immagini REAL/AI né uno shuffle finale che alteri le monete.

Nel profilo completo, i tag di ogni gruppo sono identici nelle due classi e
l'estrazione entro il gruppo è casuale. Nei gruppi ampliati si conserva il
precedente ottimizzatore editoriale per scegliere riserve comparabili sui tag
secondari. L'obiettivo confronta frequenze e pesi comuni alla parte sovrapposta
delle popolazioni: categoria, categoria/medium e medium hanno peso 2; gli altri
assi peso 1. Le categorie multiple contribuiscono frazionalmente alle metriche.
Tre passaggi, fino a 128 alternative per immagine, migliorano le riserve tramite
scambi all'interno della stessa classe. L'ottimizzatore non riceve i conteggi
REAL/AI effettivamente usciti e non cambia mai la sequenza delle monete.

Dato il catalogo e N, ogni sequenza di etichette ha probabilità `2^(-N)`: i pesi,
le riserve e gli ampliamenti non dipendono dai risultati delle monete. Per ogni
posizione ci sono immagini di entrambe le classi sufficienti a completare anche
il caso estremo. Non esistono rigetti/riestrazioni di sequenze “troppo sbilanciate”.

## Diagnostica, privacy e limiti

La diagnostica confronta le **riserve editoriali** prima di assegnare le immagini,
non lo squilibrio casuale della singola partita. Gli avvisi non devono rivelare
informazioni sulla sequenza nascosta. Un test confronta avvisi e diagnostica
con monete tutte REAL e alternate, mantenendo identica la casualità editoriale.

La variazione totale (0 distribuzioni uguali, 1 disgiunte) oltre 0,35 segnala una
comparabilità editoriale residua insufficiente. Dati non osservabili sono `null`.
Ampliamenti, duplicati, metadati/impronte mancanti e riduzione preventiva hanno
avvisi generici. Capacità interne, quantità residue per classe, hash, strati e
risposte non vengono esposti nelle API di gioco.

Il dHash facoltativo dell'upload privato resta supportato tramite
`X-Perceptual-Hash`; un upload sostitutivo senza nuova impronta azzera la vecchia.
Il revisore calcola il dHash offline sul file effettivamente caricato. Il Worker
ne valida la forma e calcola SHA-256 dai byte, ma non ricalcola dHash dal raster.

Se il catalogo non condivide profili sufficienti, l'ampliamento preserva sempre
l'indipendenza delle etichette, ma non può creare immagini o comparabilità
editoriale inesistenti. L'ottimizzazione sui tag secondari è limitata e non
certifica tutte le loro interazioni; questi casi richiedono curatela. Restano
possibili falsi positivi/negativi percettivi e limiti di metadati incompleti.

Le nuove regole si applicano soltanto alla creazione. Sessioni e stanze già
assegnate mantengono la sequenza persistita, anche se supera la nuova capacità.
Refresh, riconnessioni e richieste dei due giocatori PvP non lanciano nuove monete.
Timer, punteggi, ownership, anti-replay e reveal restano invariati. Nessun requisito
di uguaglianza dei conteggi REAL/AI è imposto alle partite nuove.

## Test riproducibili e benchmark

```sh
npm run lint
npm test
npm run build
npm run test:integration
ROS_TEST_PROFILE= npm run test:integration
npm run benchmark:sampling
```

Produzione: Web Crypto. Test: Mulberry32 iniettabile, seed per partita 1…M.
Il benchmark completo è riproducibile in `artifacts/sampling-benchmark.json` con
`node --import tsx scripts/benchmark-sampling.mjs > artifacts/sampling-benchmark.json`.
I test usano sei errori standard binomiali più una tolleranza discreta; non
richiedono percentuali esattamente uguali a 50. La distribuzione dei totali viene
confrontata con Binomiale(12,1/2), non con una quota di sei REAL.

Risultati su **10.000 partite, 120.000 domande**:

| Misura | Vecchie quote (controllo negativo) | Correzione |
| --- | ---: | ---: |
| Frequenza REAL globale | 50,0000% | 49,9292% |
| Varianza numero REAL per partita (teorica: 3) | 0 | 3,02123 |
| REAL dopo RRRR | 23,43% (2.424 casi) | 50,29% (4.882 casi) |
| REAL dopo RRRRRR | 0% (54 casi) | 50,67% (900 casi) |
| REAL dopo RRRA | 38,02% (4.860 casi) | 50,79% (5.029 casi) |
| REAL dopo ARRA | 49,26% (6.141 casi) | 48,51% (4.976 casi) |

Lo scarto dopo ARRA è una normale fluttuazione (circa 2,1 errori standard), non
una compensazione. La correzione supera tutti i controlli dopo storie ripetute e
miste. Sono osservate 544 partite con 9 REAL, 161 con 10 REAL, una tutta REAL e
due tutte AI. I test deterministici verificano inoltre tutte le 256 sequenze di
otto round e i casi estremi di dodici round, senza dipendere da eventi rari.

Su **2.048 partite per catalogo**, le distanze sono aggregate su tutte le immagini,
mai mediate come se ogni singola partita dovesse avere distribuzioni uguali:

| Catalogo / misura | Vecchie quote | Correzione |
| --- | ---: | ---: |
| Comparabile, categoria/medium | 0,01595 | 0,01930 |
| Distribuzioni opposte 90/10, categoria/medium | 0,80127 | 0,00561 |
| Sessioni con duplicati esatti | 481/2.048 | 0/2.048 |
| Strati disgiunti, distanza | 1,0 | 1,0, limite segnalato |

Nel catalogo già comparabile entrambi gli scarti aggregati sono piccoli e soggetti
al rumore statistico. Con le quote, però, l'indipendenza fallisce comunque. Per
la correzione, tutti gli assi osservabili del catalogo comparabile hanno distanza
inferiore a 0,02. Metadati assenti restano `null`. Con sole tre immagini REAL e
venti AI, il preflight riduce a tre round; 5.000 partite di test mantengono monete
eque e nessun duplicato, inclusi esiti tutti REAL o tutti AI.

Il controllo negativo riproduce il vecchio `balanced()` non stratificato, con
quote e completamento dalla classe restante. Il confronto editoriale con questo
controllo non attribuisce difetti al matching editoriale della 0.6.0: tale
ottimizzatore viene conservato sulle riserve, separandolo dalle etichette emesse.

L'integrazione locale verifica assegnazioni D1 effettive, riduzione preventiva,
409 per cataloghi a classe unica, filtri, vecchie sessioni non ricampionate,
media/sequence comuni nel PvP, riconnessioni, scadenze e assenza di spoiler,
sia con R2 emulato sia senza R2. Nessun servizio cloud aggiuntivo, merge,
deploy o migrazione remota è richiesto da questa correzione.

## Changelog

- **2.0.0 — 2026-10-25:** rimosse le quote per partita; monete indipendenti,
  capacità preventiva, pesi editoriali comuni, simulazioni condizionali e
  benchmark aggregato. Sostituisce esplicitamente la v1.0.0.
