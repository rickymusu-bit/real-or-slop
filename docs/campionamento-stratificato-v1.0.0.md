# Campionamento stratificato — v1.0.0

> **SUPERATO dalla [v2.0.0](campionamento-stratificato-v2.0.0.md).** Le quote
> REAL/AI per partita descritte qui sono logicamente errate e sono state rimosse.
> Questo file conserva la storia della prima implementazione; non è il contratto corrente.

25 ottobre 2026. Applicazione **0.6.0**, fase 2 del piano operativo.
Prerequisito: metadati della PR #9 integrati in `main` (`4219f7a`).
Normativa: [protocollo di selezione REAL](protocollo-selezione-real-v1.0.0.md).

## Contratto e architettura

`filteredCatalog()` mantiene i filtri per ambiente (`demo`), stato `approved`,
difficoltà e categorie richieste. Aggiunge le categorie effettive e soltanto i
tag editoriali necessari: tipologia, medium, composizione, periodo, regione e plausibilità percepita.
Non legge note del revisore, meccanismi cognitivi, fatti verificati o indizi.
Le categorie multiple restano un filtro OR, come prima.

`curatedSample()` in `worker/sampling.ts` è importato da `worker/game.ts` e
riutilizzato da `worker/room.ts`. Allenamento usa il numero richiesto; A tempo
mantiene il limite attuale di 50 immagini; PvP persiste una sola selezione comune.
`balanced()` è conservato per i confronti riproducibili, senza essere utilizzato
per creare nuove partite. Le sessioni e le stanze già create mantengono le loro
assegnazioni; nessun ricampionamento su refresh o riconnessione.

Nessuna migrazione, cambio di punteggio, timer, difficoltà o regola di risposta.
Le scadenze restano quelle attuali: la separazione preparazione/avvio è fase 5.

## Esclusione dei duplicati

Il selettore accetta solo record `approved` e classi REAL/AI. Costruisce famiglie
di duplicati tramite ID, chiave storage, SHA-256 disponibile (escluso `pending`)
e dHash di 64 bit, con distanza di Hamming **≤5**, coerente con la pipeline.
Gli hash percettivi devono essere esadecimali di 16 caratteri; valori mancanti o
invalidi non dimostrano uguaglianza e non raggruppano immagini indipendenti.

Per conservare il `phash` già calcolato dalla pipeline Python, l'upload privato
`PUT /api/admin/assets/:id` accetta l'header facoltativo `X-Perceptual-Hash`
(16 caratteri esadecimali, normalizzati in minuscolo). Il revisore deve fornire
il dHash del file effettivamente caricato, non del suo derivato o di un'altra
immagine. Il Worker verifica la forma e calcola SHA-256 dai byte; non decodifica
il raster per ricalcolare dHash. Un nuovo upload senza header azzera il vecchio
dHash, evitando impronte obsolete. Autenticazione, quarantena e approvazione
umana restano obbligatorie; l'header non approva mai un asset.

Per il confronto percettivo, sei intervalli disgiunti di bit restringono le
coppie candidate: entro cinque bit di differenza almeno un intervallo coincide.
La distanza completa verifica poi ogni candidata. Le componenti connesse sono
conservative: anche una catena di somiglianze produce una sola famiglia.
Una famiglia con etichette REAL/AI contrastanti viene esclusa completamente,
senza cambiare alcuna etichetta. Per le altre si estrae una sola rappresentante.

Il dHash è un controllo di somiglianza, non di autenticità. Possibili falsi
positivi riducono il catalogo e vengono segnalati; immagini simili senza hash o
non riconoscibili da dHash richiedono ancora controllo editoriale delle serie.
Nessuna deduzione di duplicazione viene fatta dalla sola epoca o categoria.

## Quote e strati

1. Si determina il numero disponibile dopo le esclusioni, fino al limite richiesto.
2. Si assegnano quote REAL/AI con differenza massima 1 quando le disponibilità lo
   permettono. Per numeri dispari, la classe con l'immagine aggiuntiva è casuale.
   Se una classe non basta, si completa con l'altra e si segnala il limite,
   preservando il precedente comportamento di fallback.
3. Una selezione casuale entro ciascuna quota viene migliorata sugli otto strati:
   categorie, combinazione categoria/medium, tipologia, medium, composizione,
   periodo, regione e plausibilità percepita. Quest'ultima evita di favorire
   sistematicamente REAL sorprendenti e AI ordinarie quando il catalogo permette
   distribuzioni comparabili. Il contributo di un'immagine con più categorie è frazionario
   (`1/numero categorie`), senza sceglierne arbitrariamente soltanto una.
4. Le distribuzioni desiderate sono la parte comune delle frequenze normalizzate
   REAL/AI nel catalogo eleggibile. Se non c'è sovrapposizione per una dimensione,
   si usa la distribuzione media e si misura il limite residuo.
5. Per ogni strato si minimizza la distanza quadratica tra le frequenze delle
   due classi e si aggiunge un termine verso la distribuzione desiderata, così
   da evitare di concentrare tutto il campione in un solo gruppo condiviso.
   Categorie, categoria/medium e medium hanno peso 2; gli altri strati peso 1.
6. Tre passaggi di scambi all'interno della stessa classe migliorano questo
   obiettivo. Per ogni immagine selezionata si esaminano al massimo 128 alternative
   casuali. Ogni scambio deve diminuire strettamente l'obiettivo: le quote e
   l'unicità restano invarianti. Il lavoro di ricerca è limitato; non è una
   promessa di ottimo globale o di indipendenza statistica di ogni combinazione.
7. Uno shuffle finale mescola insieme le due classi. Nessuna alternanza forzata
   e nessun accoppiamento 1:1 tra immagini REAL e AI.

Valori mancanti sono un gruppo separato: non diventano fatti inventati. Quando
nessun valore di una dimensione è osservabile, la diagnostica è `null`, non uno
zero che faccia credere a un bilanciamento dimostrato. Con metadati parziali,
l'ottimizzazione usa le dimensioni disponibili e segnala la copertura incompleta.
Nessun grado di plausibilità determina l'etichetta; la difficoltà assegnata dal
revisore resta un filtro invariato e non viene ricalcolata.

## Fallback e riservatezza

I messaggi generici coprono numero ridotto, impossibilità del rapporto 50/50,
duplicati o classificazioni contrastanti, metadati/impronte incompleti e distanza
residua elevata. Non contengono ID, valori degli strati o distribuzioni per classe.
Se non resta nessuna immagine, si conserva l'errore 409 con suggerimento di
cambiare filtri. Non si recuperano immagini di un'altra difficoltà, ambiente,
categoria o stato editoriale per completare il catalogo.

La distanza diagnostica è la variazione totale tra frequenze REAL/AI (0 uguali,
1 disgiunte). Una dimensione osservabile sopra **0,35** genera un avviso di
distribuzioni non comparabili. Questa soglia operativa non certifica equità,
calibrazione della difficoltà o assenza di ogni correlazione non misurata.
Cataloghi piccoli possono richiedere un intervento editoriale, anche con quote
perfette. Lo stesso avviso viene condiviso da entrambi i giocatori PvP.

`diagnostics` resta un risultato interno, usato dai test e dal benchmark. Solo
`images` viene persistito lato server; HTTP espone ID opachi e avvisi. Nessuna
etichetta, hash, tag o distribuzione è aggiunta ai payload pre-risposta. I reveal
e la gestione di ownership, anti-replay, deadline e punteggi restano invariati.
Nel gioco singolo gli avvisi seguono il contratto esistente alla creazione;
nel PvP sono conservati nello stato della stanza.

## Confronto riproducibile con balanced()

```sh
npm run benchmark:sampling
```

Il comando usa cataloghi sintetici, 20 round e seed LCG **1–64** per entrambi i
metodi. La produzione usa Web Crypto. Dati e fixture demo rimangono invariati.
Risultato JSON locale: `artifacts/sampling-benchmark.json`, generabile anche con
`node --import tsx scripts/benchmark-sampling.mjs > artifacts/sampling-benchmark.json`.

Catalogo sintetico con più categorie e dimensioni indipendenti, variazione
totale media (minore è meglio):

| Dimensione | balanced() | curatedSample() |
| --- | ---: | ---: |
| Categoria | 0,3352 | 0,0234 |
| Categoria/medium | 0,5813 | 0,0703 |
| Tipologia | 0,2359 | 0,0000 |
| Medium | 0,2406 | 0,0000 |
| Composizione | 0,2172 | 0,0156 |
| Periodo | 0,2234 | 0,0000 |
| Regione | 0,2516 | 0,0125 |
| Plausibilità percepita | 0,1656 | 0,0000 |

- Catalogo con distribuzioni opposte 90/10: distanza media **0,8 → 0,0** su tutte
  le dimensioni, con due gruppi ancora rappresentati e quote esatte.
- Catalogo con duplicati esatti: sessioni contenenti duplicati **34/64 → 0/64**.
- Strati completamente disgiunti: distanza **1,0 → 1,0**; il nuovo selettore
  segnala il limite in 64/64 sessioni, senza dichiarare un miglioramento impossibile.
- Metadati assenti: gli assi non osservabili restano `null`; le categorie note
  vengono utilizzate e il limite viene segnalato in 64/64 sessioni.
- Nel catalogo comparabile i tag categoria distinti medi passano da **11,5625 a
  11,0625**: una piccola riduzione di copertura mentre si allineano le distribuzioni
  delle classi. La diversità assoluta non viene massimizzata sacrificando il
  bilanciamento. Un campione su 64 conserva una distanza residua oltre soglia
  in almeno una dimensione e mostra l'avviso.

Sono verifiche su cataloghi sintetici, non una calibrazione di fotografie reali
o una garanzia sulla popolazione dei giocatori.

## Verifiche

`npm run lint`, `npm test`, `npm run build` e `npm run test:integration`.
Ripetere quest'ultimo con `ROS_TEST_PROFILE=` per la demo senza R2.

I test coprono tag separati e congiunti, quote da 1 a 50 round, strati disgiunti,
assenza di metadati, dati non approvati, famiglie duplicate, conflitti di classe,
immutabilità dell'input, seed riproducibili e ordine non alternato. I controlli
HTTP/D1 locali aggiungono fixture isolate, verificano le assegnazioni persistite
e poi le rimuovono: filtri di difficoltà/categoria/ambiente/stato, deduplica,
medium comparabili e protezione dagli spoiler in Allenamento, A tempo e PvP.
Due client reali verificano ancora riconnessione e scadenza condivisa nel PvP.

Nessun deploy, migrazione remota, nuovo servizio o import di fotografie richiesto.
Costo CPU e qualità dei campioni sul futuro catalogo reale vanno osservati
nell'ambiente di destinazione: le verifiche locali non certificano quote cloud.

## Changelog

- **1.0.0 — 2026-10-25:** campionamento condiviso, confronto riproducibile,
  deduplica conservativa, diagnostica privata e fallback espliciti.
