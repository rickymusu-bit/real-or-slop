# Coda unica di revisione

La pagina `/admin` raccoglie le immagini da rivedere, comprese quelle scartate
nei precedenti cicli dal proprietario o dai filtri automatici, e i file dei test
recenti. Non richiede di aprire gallerie Drive, cartelle di lavoro o uno studio
separato. REAL e SLOP si filtrano nella stessa pagina, con miniature e paginazione
senza il vecchio limite complessivo di cento immagini. Quando esiste un brief
comune il confronto rimane affiancato, anche su mobile.

`editorial_review_inbox` registra l'identità del file e la nuova decisione del
proprietario. Le precedenti decisioni restano negli archivi originali; includere
uno scarto nella coda non lo approva e non cancella il rifiuto precedente. Una
nuova scelta approva o rifiuta la singola immagine nel database privato. Il
corrispondente non è obbligatorio. Le verifiche documentali e la pubblicazione
restano separate; non si attribuiscono diritti dalla semplice selezione visiva.

Le nuove decisioni sono legate allo SHA-256 del file e a una revisione. La scrittura
atomica impedisce doppi voti concorrenti; lo storico è append-only. Si possono
consultare approvate/rifiutate e rimetterle da rivedere senza perdere giudizi.
Ogni lettura, anteprima e scrittura passa per l'autenticazione amministrativa.

All'apertura si includono gli archivi del vecchio Studio e le candidate v2 già
presenti, senza applicare soglie di punteggio, vecchie preferenze o vincoli di
coppia. Le immagini già approvate nei vecchi archivi non vengono automaticamente
riaperte. Le copie identiche dello stesso file/origine compaiono una volta sola;
originali e varianti rimangono conservati. I tentativi senza pixel non sono immagini.

## File dei test ancora locali

`scripts/sync-review-inbox.py` verifica un manifest privato di file esistenti,
conserva gli hash, copia i pixel in chiavi content-addressed di QUARANTINE e
inserisce record `pending`. Nessuna ricerca, generazione, inferenza, modifica dei
pixel o promozione nelle partite. L'esecuzione predefinita è una preview:

```sh
python3 scripts/sync-review-inbox.py .pipeline/review-consolidation/import-plan.json
# Dopo la verifica del manifest e del rilascio della coda:
python3 scripts/sync-review-inbox.py .pipeline/review-consolidation/import-plan.json --apply
```

Il manifest contiene `version: 1.0.0` e `images`, con `id`, `origin` (`REAL`/`AI`),
`sha256`, `file`, `metadata`, `pair_key` facoltativamente nullo, `created_at` e,
se disponibile, `original_file`. Non permette di assegnare approvazioni.
`--files-only --apply` prepara i file prima del rilascio dello schema senza
inserire record. Le ricevute private consentono la ripresa degli upload; il
vincolo origine/hash evita duplicati e le importazioni successive non azzerano
le decisioni. Il manifest e le ricevute restano fuori da Git.

## Eliminare una rifiutata

Nel filtro **Rifiutate**, la singola immagine offre **Elimina definitivamente**.
La conferma elimina fisicamente il suo record da `editorial_review_inbox`.
Non è disponibile per immagini approvate o ancora da valutare. Stato, revisione
ed hash sono verificati dal server nella stessa transazione della cancellazione.
Una decisione concorrente che approva o rimette in revisione l'immagine blocca
la cancellazione della vecchia versione.

Dossier, file privati e giudizi precedenti restano conservati come richiesto dal
proprietario. Non è una cancellazione di tutti i backup o delle prove storiche.
Un registro minimo di ID, origine, hash e data di eliminazione impedisce che la
sincronizzazione delle fonti o un'importazione successiva ripropongano quel file.
La migrazione 0015 conserva tutti i giudizi ed elimina il loro vincolo alla
presenza permanente della scheda immagine; nessuna immagine viene cancellata
applicando la migrazione o distribuendo il pulsante.

La vecchia sezione dello Studio è rimossa dall'interfaccia. I vecchi collegamenti
`/admin/slop` riportano alla coda unica; dossier e giudizi non vengono svuotati.

## Formato delle immagini approvate

Lo standard è 1024×1024 RGB WebP q85. La verifica legge i file effettivi, non solo
i campi del dossier. Una normalizzazione tecnica esplicitamente richiesta dal
proprietario si registra separatamente in `editorial_review_presentations`:
non riscrive scheda, provenienza o voto sull'inquadratura originale e non inventa
una nuova approvazione umana. La qualità approvata della sorgente rimane tale;
la trasformazione autorizzata ha coordinate, hash, ricevuta Terra e profilo
calcolato sui nuovi pixel. I casi in cui il ritaglio perde contesto o richiede
un giudizio umano non si applicano automaticamente.

La vista `editorial_review_effective_images` fornisce file, hash e profilo della
presentazione effettiva alla coda. L'API registra le successive revisioni
sull'hash realmente visualizzato e respinge una pagina rimasta sull'immagine
precedente. Anche la cancellazione di una presentazione impedisce il ritorno
sia del vecchio fotogramma sia della copia standard. Originali e giudizi restano
immutati e disponibili per audit.

`scripts/apply-review-presentations.py MANIFEST` verifica localmente formato,
RGB, hash e profilo. `--apply` copia i file privati e registra le presentazioni
solo se la sorgente è ancora approvata alla revisione catturata. Serve prima il
rilascio della migrazione 0016; la preparazione delle copie non aggiorna da sola
il sito. Le presentazioni già identiche vengono riconosciute senza sovrascriverle.

## Eliminare tutte le rifiutate

Nel filtro **Rifiutate** il pulsante **Elimina tutte** comprende tutte le pagine,
rispettando il filtro di origine: REAL, SLOP oppure entrambe. Prima di cancellare,
una finestra mostra il numero effettivo e chiede conferma. Approvate e immagini
da valutare restano escluse; originali e giudizi storici rimangono conservati.

La conferma è legata alla selezione completa di ID, hash visualizzati e revisioni,
non al solo conteggio o alle cinquanta immagini della pagina. Se una voce della
selezione cambia, l'operazione non elimina nulla e richiede una conferma aggiornata.
Le due scritture eseguono controllo, registrazione ed eliminazione in una sola
transazione. Ogni richiesta ha un identificativo univoco aggiunto all'impronta
amministrativa nel registro delle eliminazioni. Le copie eliminate non possono
ricomparire dalle vecchie fonti o come presentazioni standard.

La distribuzione del pulsante non esegue la cancellazione. Non servono nuove
migrazioni: si usano i vincoli e il registro già attivi per le eliminazioni singole.
