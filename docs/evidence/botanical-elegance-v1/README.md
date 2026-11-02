# Verifica Botanical Elegance — 2 novembre 2026

Verifica locale del contenuto consegnato nella PR #21. Il commit esatto e i
risultati CI/preview del relativo head sono registrati nella checklist della PR,
aggiornata dopo il push. Gli hash del codice verificato sono in
[`source-sha256.json`](source-sha256.json). Nessun master approvato è stato modificato.

## Ambiente e comandi

Node 24.19.0 (major prevista da `.nvmrc`), Python 3.12.14 e Chromium
154.0.8037.57. Nessun `AGENTS.md` trovato nel repository o negli antenati del
checkout. Checkout iniziale pulito, branch recuperato dall'head `c16b2a5`.
`main` remoto risultava successivamente avanzato a `3299c90`; i cambiamenti
editoriali di quel branch non sono stati copiati o modificati da questa PR.

Dipendenze: `npm ci --cache /tmp/ros-npm-cache` e installazione di
`pipeline/requirements.txt` in un virtualenv temporaneo. Cache npm e
`XDG_CONFIG_HOME` sotto `/tmp` per le restrizioni del workspace. I comandi
Wrangler/browser sono stati eseguiti con rete e socket locali abilitati.

Controlli terminati con exit code 0:

- [`npm run lint`](lint.log).
- [`npm test`](test.log): 48 test Node e 33 test Python.
- [`npm run build`](build.log).
- [`npm run test:gallery`](gallery.log): Worker, D1/R2/DO locali, Chromium via CDP.
- [`npm run deploy:check`](deploy-check.log).
- [`npm run dry-run`](dry-run.log), dopo rimozione di `dist/`: la build Wrangler
  ricrea gli asset da output pulito, senza deploy remoto.
- [`npm run test:integration`](integration.log).
- [`ROS_TEST_PROFILE= npm run test:integration`](integration-no-r2.log).

Un primo tentativo senza socket locali abilitati è fallito con `listen EPERM`;
è stato ripetuto correttamente. Non è un risultato positivo. I log riportati
qui sono delle esecuzioni riuscite; gli altri tentativi restano in `artifacts/`.

## Master e verifica visuale

[`binaries.json`](binaries.json) riporta gli SHA-256 calcolati direttamente dai
byte e coincidenti con tutti e tre gli originali forniti. Pillow ha verificato
struttura e decodifica completa: hero 1672×941 RGB; logo e mascotte 1254×1254
RGBA, con alfa nell'intervallo 0–255.

Screenshot del viewport e della pagina completa, salvati dopo decode delle
immagini e ispezionati visivamente:

| Viewport | Screenshot | Pagina completa |
| --- | --- | --- |
| 1440×1000 | [desktop](home-1440.png) | [desktop completo](home-full-1440.png) |
| 768×1024 | [tablet](home-768.png) | [tablet completo](home-full-768.png) |
| 390×844 | [mobile](home-390.png) | [mobile completo](home-full-390.png) |
| 360×640 | [mobile piccolo](home-360.png) | [mobile piccolo completo](home-full-360.png) |

Brand effettivamente attivo, fallback geometrico assente; logo, hero e mascotte
decodificati e richieste locali riuscite. Testo leggibile e senza sovrapposizioni,
trasparenze corrette, nessun overflow orizzontale. Il crop precedente a 768 px
tagliava l'ala destra: ora fino a 960 px la foto 16:9 segue il testo in un blocco
separato. Occhi e ali restano visibili nei quattro formati verificati.

La suite verifica inoltre navigazione, nomi nell'albero accessibile, skip link,
focus SPA, zoom dell'immagine da tastiera e ripristino del focus, partite
allenamento/a tempo/PvP e movimento ridotto. Il controllo aggiunto imposta
**lo zoom effettivo di Chromium al 200%** nel profilo temporaneo tramite
`chrome.settingsPrivate`, poi lo ripristina: viewport CSS misurato 720×456,
`devicePixelRatio=2`, senza overflow. [Screenshot zoom](home-zoom-200.png) e
[focus visibile](home-keyboard-focus.png). Non è una certificazione WCAG o un
test con tutti i browser e gli screen reader.

[`brand-measurements.json`](brand-measurements.json) conserva misure, immagini
caricate, riferimenti favicon e risposte HTTP degli asset. La homepage non ha
registrato risposte HTTP di errore o errori console; la suite non ha registrato
eccezioni JavaScript né richieste HTTP esterne delle pagine dell'app.

## Favicon

Il riferimento precedente scaricava il logo master 1254×1254. I nuovi PNG
trasparenti 16×16 (927 byte) e 32×32 (2739 byte) sono derivati separati,
ottenuti dal rendering Canvas 2D del master in Chromium, senza ritocchi né
modifiche degli originali. I link HTML dichiarano `type` e `sizes`.

Riferimenti, HTTP 200, MIME PNG e dimensioni sono stati verificati nel browser.
[Confronto su sfondo scuro/chiaro](favicon-browser.png), con dimensioni reali
e ingrandimento 8× senza interpolazione, ispezionato dopo l'integrazione.
A 16 px si riconoscono silhouette e colori verde/rosa, mentre i dettagli del
volto si perdono; a 32 px la coppia è più leggibile. Non è un logo ridisegnato.

## Blocchi preview e merge

Per `c16b2a563544b9ef8bad153215b0b1855061bf84` sono stati recuperati metadati e
log completi del build Cloudflare `4c256160-e566-4289-8ed7-debe4c7a5fd2`:
[`cloudflare-c16b2a5.log`](cloudflare-c16b2a5.log).

La build Vite passa; `npx wrangler preview` fallisce sulla API delle preview con
`Authentication error [10000]`, poi su `/accounts` con
`Invalid access token [9109]`. Questo identifica un problema di autenticazione
del token usato dalla build Cloudflare. Non prova quale permesso manchi né
certifica l'accesso alle risorse. Le credenziali di lettura log di questa sessione
sono separate dal token del trigger; non sono state trasferite o sostituite.

Separatamente, `node scripts/check-preview.mjs` **fallisce**, come previsto,
con `Binding test d1_databases mancanti: preview bloccata`. Il blocco `previews`
non dichiara DB/bucket di test verificati e distinti dalla produzione. Il trigger
Cloudflare usa direttamente `npx wrangler preview`, senza questa guardia.
Risolvere l'autenticazione non dimostra quindi un isolamento sicuro delle preview.
Non sono stati creati risorse o modificati binding, segreti o trigger Cloudflare.

GitHub non ha restituito review o discussioni inline. L'ispezione di branch
protection è stata negata con HTTP 403 `Resource not accessible by integration`;
l'endpoint delle regole ha risposto HTTP 403 con richiesta di piano Pro o repository
pubblico. Non si dichiara pertanto verificata l'assenza di requisiti aggiuntivi.

La PR resta draft e aperta finché preview e requisiti di merge non sono verificati.
Nessun merge o deploy remoto eseguito. Un eventuale merge futuro e la pubblicazione
del sito sono due esiti distinti e richiedono verifiche separate.
