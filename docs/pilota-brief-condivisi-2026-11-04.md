# Pilota con cinque brief condivisi — 2026-11-04

Il proprietario ha chiesto di partire da una descrizione autonoma e usarla sia
per la ricerca REAL sia per la generazione SLOP. Il piano e i prompt sono stati
congelati prima della ricerca: nessuna fotografia REAL, didascalia, titolo o
profilo è entrato nella generazione SLOP. Le due varianti condividono il concetto,
non sono popolazioni statisticamente indipendenti.

Il pilota ha completato **5 brief e 10 immagini finali**, cinque REAL candidate
e cinque SLOP, tutte 1024×1024. Il costo stimato dalle ricevute riuscite è
**0,318687 USD**, preparazione inclusa, con tetto di prenotazione 2 USD. Sono
state eseguite 5 chiamate Images e 14 Responses dirette (ideazione, crop,
profili), senza Files/Batch, fallback o retry automatici. Nessun errore API.
Prenotazioni Worker 0,635 USD, preparazione 0,02 USD; non sono costi fatturati.
Il gate di spesa locale è chiuso e tutte le dieci candidate sono archiviate
nel D1/R2 sperimentale isolato, senza approvazioni o pubblicazioni automatiche.

## Brief del campione

- Un ritratto fotografico di una sola persona adulta.
- Una fotografia di un ponte come opera di ingegneria civile.
- Una fotografia di un albero in un ambiente naturale, senza persone.
- Una fotografia di una sedia come oggetto d'arredo.
- Un dipinto o un'illustrazione non fotografica che raffigura una barca.

La ricerca web per keyword è stata seguita dalla verifica dei metadati ufficiali
e da una selezione visiva dell'operatore. Sono state scelte quattro immagini
Commons con soggetto e composizione leggibili e un dipinto Open Access del Met.
È una prova editoriale assistita, **non un motore automatizzato che garantisce
la migliore corrispondenza fra tutti i risultati**. Le fonti non certificano da
sole autenticità e diritti. I brief sono volutamente ampi: conta l'intento
visivo condiviso, non la copia dei dettagli della REAL.

La variante pittorica è inclusa per esplicita richiesta del proprietario:
`photographic` rimane una descrizione del linguaggio visivo e non viene usato
per eliminare automaticamente un'opera da questa galleria di prova. Due
ritagli REAL sono segnalati dal modello per revisione; il fotogramma intero
è disponibile nel dossier visivo. Non sono stati inventati punteggi di
corrispondenza, miglioramenti misurati o risultati dei giocatori.

## Revisione del proprietario

Lo ZIP privato su Drive contiene cartelle REAL/ e SLOP/ con cinque immagini
ciascuna e una vista comune per brief. I comandi Approva immagine, Rifiuta
immagine e Nota facoltativa salvano le scelte nel browser. Esporta le mie scelte
produce un JSON legato agli hash delle immagini finali. Queste scelte editoriali
sono separate dalla certificazione documentale e non attivano la pubblicazione.
Non è stato eseguito addestramento sui pesi o apprendimento automatico dalle
scelte: occorre prima raccogliere le decisioni effettive del proprietario.

`pipeline.v2.briefs` congela brief e piano SLOP, mantiene incompleti gli
abbinamenti mancanti e limita il piano a 25 brief / 50 immagini. Il pilota
corrente usa solo cinque brief e API dirette. `pipeline.v2.brief_review` valida
coorte, identità delle immagini e scelte, senza trasformarle in approvazioni
server o modifiche dei diritti. Gli originali e le ricevute restano privati.

Verifica: **143 test Python passati**; galleria verificata in Chromium a 1440 e
390 pixel, dieci immagini, filtri REAL/SLOP, persistenza delle note e delle
scelte dopo ricaricamento, esportazione JSON valida e nessun errore JavaScript.
Gli hash dei file immagine e i link locali dello ZIP sono verificati. Le scelte
simulate per il test del browser sono state rimosse e non sono decisioni umane.

## Regola sul contesto e confronto affiancato

I [criteri editoriali](criteri-editoriali.md) richiedono sfondo e contesto
visibile per ogni soggetto, per REAL e SLOP. Il proprietario ha rifiutato la
sedia REAL del brief-004 perché isolata su fondo nero. La decisione viene
conservata con hash dell'immagine e nota e precaricata nella galleria; il file
resta soltanto come esempio rifiutato da sostituire, senza inventare uno sfondo.

La revisione presenta le coppie in cinque PNG con pixel finali incollati senza
ridimensionamento, e in un PDF. La vista HTML conserva REAL a sinistra e SLOP a
destra anche su mobile, con i comandi di ciascuna immagine sotto la coppia.
Le cartelle REAL/ e SLOP/ restano nello ZIP; i link Drive esistenti sono preservati.
Queste modifiche non eseguono nuove inferenze, acquisizioni o pubblicazioni.

Verifica successiva della vista affiancata: **144 test Python passati**; cinque
pannelli con pixel invariati, PDF di cinque pagine, confronto a due colonne
a 1440 e 390 pixel e caricamento del rifiuto effettivo del proprietario.

Il proprietario ha poi precisato che per le opere d'arte serve un contesto
esterno all'opera: quadro intero, cornice quando presente e ambiente circostante,
ripresi da una certa distanza. Il contenuto rappresentato nel dipinto non basta.
La coppia pittorica brief-005 è pertanto da rivedere e riproporre secondo il
nuovo criterio. Questa annotazione non è un'approvazione né un rifiuto esplicito
delle due immagini da parte del proprietario; entrambe restano da valutare.
