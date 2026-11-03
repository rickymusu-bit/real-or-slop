---
version: 1.0.0
created_at: 2026-11-03T17:44:53.737857+01:00
application: 0.15.0
status: implemented-awaiting-review
supersedes: null
---

# Soglia corrente e riesame editoriale

Il proprietario ha richiesto una soglia comune di **50/100** dopo aver visionato
il lotto diretto del 2026-11-03. I punteggi originali non vengono aumentati o
ricalcolati tramite il modello: il confronto riutilizza i sei assi già registrati.
La soglia è una policy editoriale, distinta dalla futura difficoltà empirica.

## Raccolta e selezione REAL effettivamente implementate

Il flusso automatico interroga Wikimedia Commons. I connettori per altri archivi
esistono, ma non fanno parte della raccolta automatica corrente. Le cinque query
di base riguardano ponti storici, locomotive storiche, architettura insolita,
fotografia naturalistica insolita e automobili storiche. L'ordine ruota con il
giorno; l'offset cambia a passi di 30. Due pagine di 30 risultati per cinque
query consentono di esaminare fino a 300 risultati, prima dei filtri.

Quando sono disponibili osservazioni dalle revisioni preparate, il selettore
può pescare anche tra mercati, navi storiche, laboratori, sculture in piazza e
villaggi; le preferenze sono morbide e mantengono il 25% di esplorazione. I rifiuti
manuali di vecchie importazioni senza scheda preparata restano audit, non vengono
convertiti in dati di apprendimento inventati.

I risultati delle query e delle pagine sono intercalati. Il limite è quattro
fotografie per query e venti riferimenti complessivi. Sono verificate fonte,
attribuzione, licenza e originali; la raccolta automatica ammette CC0, Public
Domain Mark, CC BY 4.0 e CC BY-SA 4.0, escludendo ND. Download e formato devono
superare i controlli tecnici; SHA-256, identificativi provider/source e dHash
impediscono duplicati e quasi duplicati. La selezione editoriale deduplica anche
contro registro remoto, inventario e prenotazioni. La raccolta standard può
fermare il lotto sotto venti: non riempie con foto fuori dai criteri. La prova
manuale del 2026-11-03 ha ampliato le query e rimosso serie visivamente ripetitive
prima di congelare i venti riferimenti; non è una seconda classifica del modello.

Terra valuta i pixel di ogni fotografia, senza usare titolo e metadati come
surrogato dell'immagine. I sei assi, tutti 0–100, sono dubbio sull'autenticità
percepita, sorpresa, plausibilità, interesse ludico, leggibilità e motivo concreto
di interesse. Il punteggio è la loro media aritmetica, con motivazione specifica.
Le immagini incompatibili con la natura fotografica vengono escluse.

Una sola classifica, in ordine decrescente di punteggio con identificativo stabile
come spareggio: con venti fotografie, posizioni 1–10 candidate REAL e 11–20
sorgenti SLOP. Con meno immagini la prima metà arrotondata per eccesso è REAL.
La soglia filtra soltanto l'idoneità alla revisione: non modifica ruoli o ordine
e non trasforma una sorgente SLOP in una REAL. Le fotografie sotto soglia restano
fuori dalla coda. Tutte sono consultabili privatamente nello Studio.

## Policy persistente e storico

0013 aggiunge `editorial_controls.editorial_threshold` con valore iniziale 50,
un audit immutabile dei cambiamenti e la vista `editorial_attempt_images`.
L'API privata `GET/PUT /api/admin/editorial/controls` accetta una soglia numerica
finita da 0 a 100; `queue_limit` resta indipendente e configurabile. Un cambio
soglia invalida atomicamente le schede di revisione non ancora decise. Il token
di preparazione include la soglia corrente e la scrittura verifica che questa
non sia cambiata durante la preparazione dei file.

Non vengono modificati `reference_photos`, `editorial_attempts`, punteggi, prompt,
modelli o timestamp storici. Per una generazione prima scartata, la nuova candidata
si associa al tentativo originale tramite provider `openai-editorial`, source ID
uguale all'ID del tentativo, hash del file, modello e prompt esatti. La vista
espone il collegamento corrente mantenendo `original_image_id`: nessun tentativo
fittizio, duplicazione di generazioni o aggiramento dei trigger di immutabilità.

Le nuove pipeline leggono la soglia corrente dal server. `EDITORIAL_THRESHOLD=50`
resta il valore predefinito per piani e simulazioni locali; la policy D1 è la fonte
autorevole dei nuovi run. I run Batch già congelati e le riprese dirette con
ranking conservano la propria soglia storica; il riesame è un'operazione distinta.

## Riesame senza generazione

Registrare il bookmark di ripristino nativo D1 Time Travel e verificare le
migrazioni applicate; la verifica locale usa fixture, senza esportare le righe
del database remoto. Dopo applicazione separatamente autorizzata di 0013,
rilasciare il backend
aggiornato mantenendo `ENABLE_EDITORIAL_PAID=false`. Nessun seed remoto.

```sh
# Solo lettura di stato e dossier; nessuna scrittura o chiamata OpenAI.
python -m pipeline.reconsider --batch-id direct-20-2026-11-03-isolated

# Con secret admin e licenza delle generazioni già configurati nell'esecutore privato.
python -m pipeline.reconsider --batch-id direct-20-2026-11-03-isolated --execute
```

Il comando rilegge i file nell'archivio R2 autenticato, controlla gli hash e usa
l'importer esistente, idempotente. Prepara soltanto riferimenti REAL e generazioni
che superano la soglia, sono fotografici e hanno un motivo concreto. Restano
obbligatori provenienza, originali, diritti dichiarati e revisione umana. Sono
preservati tutti i rifiuti e le approvazioni già espressi: non tornano in coda i
cinque treni rimossi. Un errore interrompe il riesame senza retry pagati; ripetere
l'operazione riprende l'importazione senza duplicare file o candidate.

Nel lotto corrente: tre REAL (64.5, 64 e 50.17) e nove SLOP risultano idonee a 50.
La SLOP da 47.83 resta fuori dalla coda. Tutte le trenta immagini restano nello
Studio. Le candidate devono ancora essere approvate: nessuna pubblicazione
avviene cambiando soglia o riesaminando un lotto. Il catalogo resta 50/50 e il
campionamento delle singole risposte resta Bernoulli indipendente.
