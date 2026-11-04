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
