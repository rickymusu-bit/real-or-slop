# Benchmark preliminare REAL — issue #18

Versione 1.0.0 · 2026-11-01 · riferimento repository `0ed95706eb42202665b445ed7d41e2dd3627d4f3`

## Metodo e perimetro

Otto fotografie 01–08 fornite dall'utente sono state osservate direttamente nella conversazione, senza consultare titoli, schede, identità o informazioni archivistiche. I nomi sono assegnati per corrispondenza visiva alle descrizioni numerate fornite dall'utente; le immagini sono apparse in ordine inverso. Non si pubblicano le immagini. La loro autenticità e i diritti non sono stati verificati: REAL è la classe dichiarata per il campione, non una conclusione di questo test.

La valutazione NON è indipendente o in cieco: le risposte di Gemini sono state fornite nello stesso messaggio delle fotografie ed erano visibili prima del giudizio. Possono aver influenzato descrizioni e punteggi. Non sono disponibili etichette umane di riferimento, tempi di risposta, valutatori indipendenti o misure di ripetibilità. Il campione di otto immagini, scelto in precedenza, non rappresenta l'intera distribuzione degli archivi. Il confronto non misura quale modello sia migliore né la capacità effettiva di ingannare i giocatori.

Quattro voti interi 0–5: dubbio = potenziale di far dubitare un giocatore; sorpresa = insolito visibile; plausibilità = coerenza percepita della scena (non probabilità di autenticità); leggibilità = visibilità del dettaglio nell'immagine disponibile, stimata per uno schermo piccolo senza prova diretta su dispositivo. Punteggio 0–100 calcolato in Python come `8*dubbio + 5*sorpresa + 3*plausibilita + 4*leggibilita`. I pesi sono richiesti per questo esperimento, non calibrati empiricamente.

La decisione è qualitativa, non una soglia automatica: «proporre» indica una candidata da sottoporre a ulteriori controlli umani, «forse» una candidata con interesse ma limiti visivi, «scartare» scarso interesse per questo specifico benchmark. Un'immagine ordinaria non è automaticamente esclusa dal catalogo generale: il protocollo richiede varietà ed esempi ordinari in entrambe le classi. La valutazione non approva o pubblica alcunché.

## Graduatoria e confronto

I totali Gemini sono ricalcolati con la stessa formula dai voti da lui dichiarati, non corretti sulla base dei nostri giudizi. Differenza = Codex meno Gemini ricalcolato. I pari merito sono indicati tali; l'ordine entro il pari merito è per ID.

| Pos. | Foto | Dubbio | Sorpresa | Plausibilità | Leggibilità | Codex | Gemini dichiarato | Gemini ricalcolato | Differenza | Proposta |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 04.jpg | 5 | 5 | 3 | 4 | 90 | 60 | 69 | +21 | proporre |
| 2 | 06.jpg | 4 | 5 | 4 | 4 | 85 | 70 | 72 | +13 | proporre |
| 3 ex aequo | 01.jpg | 4 | 4 | 4 | 3 | 76 | 51 | 64 | +12 | proporre |
| 3 ex aequo | 05.jpg | 4 | 4 | 4 | 3 | 76 | 53 | 67 | +9 | proporre |
| 5 | 03.jpg | 4 | 4 | 3 | 2 | 69 | 67 | 72 | −3 | forse |
| 6 | 02.jpg | 2 | 3 | 4 | 2 | 51 | 61 | 67 | −16 | forse |
| 7 | 07.jpg | 1 | 1 | 5 | 4 | 44 | 55 | 67 | −23 | scartare |
| 8 | 08.jpg | 0 | 0 | 5 | 5 | 35 | 51 | 62 | −27 | scartare |

Gemini attribuisce dubbio 3 a tutte le immagini: qui tale voto non discrimina i casi ordinari dagli insoliti. Per 08 la differenza di nitidezza dei passeggeri, piccoli nella scena, non costituisce un motivo convincente di dubbio; 07 presenta una livrea colorata ma resta una locomotiva in un contesto ordinario. Per 05, la dimensione apparente della macchina è più significativa della presunta incoerenza dei cavi, che non è dimostrata. Per 06, il motivo forte è l'insieme della voragine in fiamme e della scala apparente, non l'ipotesi che il fuoco sia un effetto particellare. Per 02, Gemini enfatizza la saturazione ma la formazione occupa una piccola parte dello scatto: conta la specifica inquadratura, non la versione ravvicinata eventualmente immaginata. Per 03, la vegetazione copre parte del soggetto e la leggibilità ne risente. Per 04 le appendici e l'aspetto complessivo sono fortemente insoliti; il richiamo a un rendering è un'impressione, non una prova. Per 01 il motivo principale è la struttura a forma di disco con oblò; i sostegni sottili non dimostrano alcun difetto.

**Controllo aritmetico:** tutti gli otto totali dichiarati da Gemini sono incompatibili con la formula applicata ai propri quattro voti. Per esempio, 01 vale 8·3 + 5·3 + 3·3 + 4·4 = 64, non 51; 06 vale 72, non 70. Il confronto usa pertanto i totali ricalcolati. Gli ID Gemini erano tutti il segnaposto `{ID}`: la corrispondenza proviene dalle etichette esterne 01–08, non dal campo JSON.

## Limiti e miglioramenti proposti prima dell'integrazione

1. **Separare osservazione e ipotesi:** chiedere un dettaglio visibile localizzabile e spiegare perché può creare dubbio; consentire esplicitamente «nessun dettaglio interessante». Non richiedere difetti da IA, simmetrie o incoerenze. Impedire che un'ipotesi diventi un fatto accertato.
2. **Definire ancore 0–5 e motivazioni:** calibrare ogni dimensione su esempi condivisi, inclusi controlli negativi ordinari e casi con un soggetto insolito troppo piccolo o coperto. Definire l'uso di «proporre/forse/scartare» con valutatori umani, evitando soglie inventate.
3. **Valutare leggibilità e interesse distintamente:** presentare la foto nelle effettive dimensioni di gioco e su smartphone; un soggetto notevole non compensa automaticamente un dettaglio invisibile. Conservare ogni sottopunteggio e un eventuale flag per il dettaglio non leggibile.
4. **Calcolare e validare i numeri con codice:** vincolare lo schema, validare tipo e intervallo, calcolare il totale lato programma e respingere JSON malformati, ID segnaposto o motivazioni mancanti. Il JSON conserva sia il totale dichiarato sia quello ricalcolato di Gemini.
5. **Fare un test in cieco e ripetibile:** congelare le immagini mediante hash, nascondere metadati, risultati e ordine delle altre valutazioni; ripetere con ordine casuale e più sessioni, modelli e valutatori umani indipendenti. Identificare modello, versione, impostazioni e condizioni di visualizzazione. Qui le descrizioni Gemini erano già visibili e la versione esatta del modello Codex non è attestata nel materiale.
6. **Validare contro il comportamento umano:** costruire un campione più ampio e diversificato, con foto ordinarie e straordinarie e un riferimento editoriale indipendente. Misurare accordo, falsi positivi e negativi, ordinamento e risposte reali dei giocatori; calibrare pesi e soglie su dati separati da quelli usati per sceglierli. Una valutazione di gradimento non equivale alla probabilità empirica di errore REAL/SLOP.
7. **Gestire varietà a livello di lotto:** controllare duplicati e diversità, e mantenere distribuzioni comparabili REAL/AI. L'ordinamento per singola foto non garantisce un catalogo equilibrato; evitare la scorciatoia «bizzarro = REAL».
8. **Mantenere i controlli indipendenti:** provenienza, autenticità, manipolazioni, licenze e diritti richiedono verifica separata e approvazione umana con audit. Nessuna osservazione visiva qui certifica questi aspetti. Il test non cambia la pipeline.

La formula premia plausibilità e leggibilità anche quando dubbio e sorpresa sono zero: 08 ottiene 35/100. Un totale elevato non basta da solo a giustificare una proposta. Prima di introdurre un eventuale requisito minimo di interesse, verificarlo su esempi umani e sul ruolo delle immagini ordinarie nel catalogo complessivo.
