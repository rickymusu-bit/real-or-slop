---
version: 1.0.0
created_at: 2026-11-03T11:56:28.644973+01:00
status: completed-local-awaiting-production-release
---

# Confronto editoriale diretto su 20 fotografie

Il proprietario ha autorizzato il merge della PR #30 e una nuova prova con API
dirette su 20 fotografie, superando il precedente limite cumulativo di 5 USD.
La prova verifica la severità del classificatore con la rubrica corrente:
nessun abbassamento della soglia, nessun incremento artificiale dei punteggi.

La prova viene eseguita nel workspace privato isolato: API OpenAI dirette,
file locali, nessuna scrittura D1/R2 remota, nessun deploy o modifica delle
variabili di produzione. Nessun workflow GitHub viene avviato. La verifica
automatica ha rifiutato il percorso con migrazione/deploy di produzione perché
la richiesta iniziale li vietava esplicitamente; il confronto locale permette
di verificare il classificatore senza quelle operazioni. Il rilascio online
dell'archivio e la visione nello Studio richiedono una successiva autorizzazione.

La raccolta legge identificativi e impronte dallo stato remoto per deduplicare
prima di raggiungere 20 fotografie; nessuna valutazione pagata viene inviata
finché il lotto non contiene 20 fotografie ammissibili. La prima ricerca ne ha
fornite 12: ulteriori query documentate ampliano i soggetti, con un massimo di
quattro fotografie per categoria e rimozione delle serie dello stesso soggetto.
Classifica unica, prime 10 assegnate a REAL e ultime 10 a sorgenti SLOP.
La pipeline ordinaria mantiene il supporto ai lotti incompleti.

Configurazione fissata per questa esecuzione:

| Parametro | Valore |
| --- | --- |
| Analisi e valutazione | gpt-6.1-terra, verificato nell'elenco modelli del progetto |
| Generazione | gpt-image-2, solo testo, 1024×1024, medium |
| Soglia comune | 65/100 |
| Tentativi per sorgente | 1, nessuna rigenerazione pagata |
| Limite valutazioni/brief | 40 (20 fotografie, 10 brief, 10 immagini finali) |
| Limite generazioni | 10 |
| Prenotazione per valutazione/brief | 0.50 USD |
| Prenotazione per generazione | 2.00 USD |
| Tetto locale di questa singola prova | 40 USD |
| Ledger di produzione | Invariato a 4.50 USD, gate pagamenti chiuso |
| Licenza dichiarata delle generazioni | CC BY 4.0, previa revisione dei diritti |

Le prenotazioni locali sono stime conservative, non una fattura. Lo storico del
ledger di produzione rimane intatto. La soglia si applica alla media dei sei assi già in uso;
le singole valutazioni e le motivazioni restano nel registro privato.

La preparazione ha completato esportazione D1, ripristino locale verificato,
controllo di preservazione di tutte le righe esistenti con 0012 e backup di 14
file R2 referenziati. Nessuna migrazione remota è stata applicata. Il catalogo
pubblico resta invariato. Per questa prova `execute` della libreria editoriale
usa il client OpenAI diretto e il budget locale, senza istanziare `Remote`.

La chiave OpenAI è letta dall'environment server del workspace e non viene
scritta nei dossier o nei log. Il gate server rimane chiuso. Originali,
derivati, prompt, punteggi, motivazioni e metadati di uso restituiti dalle API
restano nei file privati del workspace; il report visivo è locale. Nessuna
pubblicazione di artifact GitHub o modifica di secret.

Le immagini generate, anche sotto soglia, restano nell'archivio locale del
confronto. Le immagini sopra soglia sono indicate come idonee alla revisione,
senza inserirle nella coda online. Nessuna approvazione o pubblicazione
automatica. L'esito va confrontato separatamente
per REAL e SLOP, mantenendo la classifica delle fotografie e i sei assi originali.

## Esito della prova

Verificato: 2026-11-03T12:23:21.798706+01:00.

Venti fotografie classificate, dieci generazioni, 40 chiamate visive/brief e
10 chiamate immagini. Nessun errore o rigenerazione. Soglia invariata 65:
0/10 REAL idonee (media 50.27, massimo 64.5) e 1/10 SLOP idonea (media 55.92,
intervallo 47.83–66.5). Le prime due REAL hanno 64.5 e 64.

Le prime dieci REAL hanno plausibilità media 92.8 e leggibilità 87.6, ma dubbio
11.3 e sorpresa 26.6. Le SLOP hanno plausibilità 82.7, leggibilità 86.1, dubbio
30.7 e sorpresa 29.4. I brief tendono spesso ad attività ordinarie come visite
e dimostrazioni. Per calibrare serve quindi guardare immagini, rubriche e brief,
senza dedurre da questo singolo campione una soglia ottimale.

Prenotazioni locali 40 USD; consumo stimato dai token 0.728503 USD, usando le
tariffe Standard documentate il 2026-11-02: non una fattura. File privati:
`.pipeline/direct-20-2026-11-03/isolated/report.html`, `scores.csv`, report ZIP e
archivio completo con originali, hash e dossier. Nessuna chiave nei file.

Il registro sorgenti del test rimane locale in `local-reference-registry.json`.
Prima di riabilitare la pipeline online, importare il lotto e le impronte nel
registro persistente per escludere sempre le dieci sorgenti SLOP dal catalogo
REAL. L'importazione dei file già prodotti non richiede nuove generazioni.

Il check di main dopo il merge è fermo alla guardia di approvazione di 0012.
Nessuna modifica remota eseguita: schema 0011, gate false, ledger 4.50 USD,
catalogo 12 REAL + 12 SLOP e deployment precedente invariati. Le 91 verifiche
Python del ramo operativo passano; i controlli completi della PR #30 erano verdi
prima del merge.
