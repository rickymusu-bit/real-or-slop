# Scoperta multicanale v2.1.0

Prova live del **2026-11-04**: quattro keyword indipendenti inviate alle sei fonti
predefinite, massimo 12 chiamate API, senza download o motori pagati. Eseguite
11 chiamate: **50 record nuovi, 40 Commons e 10 NASA**. Openverse e LoC HTTP 403,
Met HTTP 410, Smithsonian non configurato; gli errori non hanno bloccato le
altre fonti. Il comando ha restituito correttamente codice 2 e `status: partial`.
Nessuna inferenza, verifica di autenticità, approvazione o pubblicazione. Il report
e il registro effettivi sono in `artifacts/editorial-v2-discovery-live/`.

126 test Python passati nel checkout di questa PR; fra i casi dedicati: OAuth
in memoria senza fuga delle credenziali fra host, rinnovo del token scaduto,
403 distinto da zero risultati, conservazione delle risposte parziali, deduplica,
hit Brave separati dal manifest REAL, limiti e ripresa senza richieste duplicate.

Parte del nuovo protocollo editoriale #34, successiva alla base sperimentale #35.
La ricerca parte dalle stesse keyword generiche, combinatorie ed esplorative
indipendenti su più fonti. Non usa categorie, graduatorie, soglie di sorpresa o
fotografie per ideare SLOP. Nessuna modifica al catalogo o alla produzione.

## Fonti e autenticazione

Il piano predefinito usa **Openverse, Commons, Library of Congress, NASA, Met e
Smithsonian**: dodici keyword producono 72 interrogazioni pianificate. Tutte le
fonti ricevono le stesse keyword. La disponibilità e il costo non sono presunti;
errori e credenziali mancanti restano visibili nel registro.

Openverse supporta accesso anonimo, un token esistente oppure client credentials
OAuth già registrate. Il token è ottenuto dall'endpoint ufficiale e mantenuto
soltanto in memoria, con scadenza e riuso. Le credenziali Openverse non vengono
inviate ad altri host né salvate nei dossier. La configurazione incompleta non
ricade silenziosamente sull'anonimato. I filtri facoltativi `--openverse-sources`
permettono di interrogare fonti diverse da Wikimedia; `upstream_source` e
`upstream_provider` restano distinti dal motore Openverse nei metadati. Il limite
richiesto per pagina è al massimo 20 anche quando il piano ammette più risultati.
L'indicizzazione Openverse non certifica autenticità o licenza della fotografia.

Smithsonian usa la chiave del connettore esistente. Per gli altri archivi non
si inventano credenziali mancanti. [Configurazione opzionale](../pipeline/v2/discovery.env.example).
Nessun account, applicazione OAuth, segreto o risorsa viene creato dal collector.

**Brave Image Search** è un adattatore opzionale, selezionato con `--engines
brave ...`. Richiede chiave, consenso esplicito `--allow-paid-search`, budget
locale e prenotazione positiva per richiesta. I valori di prezzo devono provenire
dal piano effettivo del proprietario; non sono tariffe presunte nel codice.
Il collector non configura Google né presenta Brave come già verificato live.

## Scoperta e acquisizione separate

Gli hit generalisti di Brave vanno in `hits.json` con pagina fonte, immagine,
query, motore e posizione, in stato `source_verification_pending`. Non entrano
nel manifest REAL, non vengono scaricati e non ricevono una licenza presunta.
La verifica della fonte deve precedere l'acquisizione documentata.

Gli adattatori degli archivi conservano le prove grezze, autore e diritti nel
manifest tecnico di raccolta. Questo non è il manifest documentale v2 verificato:
rimangono da determinare natura fotografica, autenticità, diritti e interventi.
Senza `--download-hosts` non vengono scaricati file. Con host espliciti si riusa
l'acquisitore con validazione HTTPS/redirect, hash e deduplica. I risultati di
Met o altri archivi non diventano fotografie solo perché hanno diritti aperti.

## Errori, ripresa e limiti

Ogni query ha un intento durevole. Un errore disabilita quel provider per il run
e la raccolta prosegue sugli altri; nessuno scraping sostituisce l'API. I risultati
parziali precedenti all'errore sono conservati. Errori 401/403/429, endpoint 410,
risposte malformate e credenziali mancanti non diventano ricerche con zero risultati.
Il costo effettivo, gli elementi esaminati da una persona, l'approvazione e la
novità visiva restano `null` finché non misurati. `returned` conta i metadati
ricevuti; non è una revisione umana dei pixel.

Il massimo di chiamate API comprende OAuth e dettagli degli asset, è registrato
prima di ogni richiesta e sopravvive alla ripresa. Non comprende i download
opzionali delle immagini, che hanno i propri limiti di byte e host. Non ci sono
retry HTTP automatici. Le prenotazioni Brave sono registrate prima dell'invio;
un'interruzione non ne presume il rimborso. Il lock impedisce esecuzioni concorrenti
sulla stessa cartella. La ripresa salta query concluse, fallite o incerte: per
ritentare occorre uno studio nuovo con budget esplicito. Il ledger è locale e non
limita altri processi o workspace.

Una raccolta incompleta restituisce `status: partial` e codice di uscita **2**,
conservando manifest, hit e journal. Non è presentata come studio riuscito o
confronto fra motori a budget equivalente. Un nuovo piano o nuovi limiti richiedono
una cartella diversa, senza sovrascrivere i dati di uno studio precedente.

```sh
# Piano senza rete o lettura di credenziali:
python3 -m pipeline.v2.discovery --exploratory pipeline/v2/exploration.example.json
# Ricerca API esplicita, senza download, inferenze o servizi pagati:
python3 -m pipeline.v2.discovery --exploratory pipeline/v2/exploration.example.json \
  --count 4 --live --max-api-calls 12 \
  --user-agent 'RealOrSlop/0.15 (https://github.com/rickymusu-bit/real-or-slop)' \
  --out .pipeline/v2/source-probe
```

## Riferimenti verificati

- [Openverse API client e OAuth](https://docs.openverse.org/packages/js/api_client/index.html).
- [Openverse autenticazione e throttling](https://docs.openverse.org/api/reference/authentication_and_throttling.html).
- [Termini Openverse](https://docs.openverse.org/terms_of_service.html): scraping vietato, diritti da verificare sulla fonte.
- [Brave Image Search API](https://api-dashboard.search.brave.com/api-reference/images/image_search).

Mock e test locali verificano adattatori, isolamento dei segreti, circuiti di
errore, deduplica, budget e ripresa; non certificano accesso live o fatturazione
dei provider configurabili. Il rapporto della prova effettiva resta separato.
