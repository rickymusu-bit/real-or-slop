# Real or Slop

Gioco per distinguere immagini autentiche documentate da immagini create con IA dal proprietario. La demo usa esclusivamente illustrazioni geometriche originali con **etichette simulate**: non è un archivio verificato.

Node 24 (`.nvmrc`), Python 3.12 per pipeline e test schema. TypeScript, Vite, Worker Static Assets/API, D1 locale; adapter R2 pronto, nessuna risorsa remota richiesta.

```sh
npm ci
npm run db:migrate
npm run db:seed
npm run dev
# http://localhost:8787
npm run lint
npm test
npm run build
npx wrangler deploy --dry-run --outdir .wrangler/dry-run
```

```text
Browser → Vite dist/ → Worker router → D1 (catalogo, audit, sessioni)
                                   → storage adapter (demo / R2)
Python offline → quarantena privata → revisione autenticata → catalogo approvato
```

La build esegue TypeScript e Vite e produce `dist/`; l'entry Worker è `worker/index.ts`. `/api/*` attraversa sempre il Worker e non restituisce il fallback SPA. Le risposte non sono incluse negli asset frontend. `/admin` e `/api/admin/*` verificano un token server-side: disabilitati se non configurato. Nessun segreto frontend.

## Cloudflare Workers Builds (non attivato)

| Impostazione | Valore |
|---|---|
| Repository | `rickymusu-bit/real-or-slop` |
| Branch produzione | `main` |
| Directory | radice del repository |
| Node | 24 |
| Build | `npm run build` |
| Deploy produzione | `npx wrangler deploy` **solo dopo approvazione esplicita del rilascio** |
| Preview branch/PR | `npx wrangler preview` |

Wrangler 4.152.0 fissato nel lockfile (minimo richiesto dalle specifiche: 4.135.0). Non usare deploy per ottenere preview. La configurazione attiva non contiene ID o bucket inventati: D1 senza ID è esclusivamente locale. Prima della preview assegnare risorse di TEST verificate al blocco `previews`; verificare schema effettivo Wrangler. Account, autorizzazioni e quote devono essere configurati dal proprietario. Non è stato collegato Workers Builds, né abilitato alcun trigger. La prima connessione può pubblicare: richiede approvazione prima dell'avvio.

Piano Workers Free; nessun upgrade o billing autorizzato. D1, R2 Standard e build hanno quote separate. Superare le franchigie R2 può costare; non attivare automaticamente. Dominio personalizzato facoltativo, DNS e acquisti separati.

## Dati e privacy

Niente dati identificativi obbligatori. Sessioni anonime, nickname facoltativo; nessun analytics o cookie pubblicitario. Fonte/licenza/spiegazione soltanto dopo la risposta. Crediti delle immagini pubbliche devono rispettare attribuzioni e share-alike. Le immagini IA del catalogo futuro sono create per un gioco di fantasia. Informativa nell'app. Prima di un lancio pubblico definire titolare, contatti e tempi di conservazione effettivi.

Specifiche versionate in `docs/specification-v1.1.0.md`. Versione app distinta: vedere `CHANGELOG.md`. Nessun merge/auto-merge, push a main o deploy produzione eseguito.

## Pipeline e revisione (fase 2)

Python 3.12 offline/CI, mai backend Python nel Worker:

```sh
python3 -m pipeline.run --provider commons --config pipeline/search.example.json --fixture pipeline/fixtures.json
# Solo dopo configurazione di contatto, termini, rete e destinazione:
# python3 -m pipeline.run --provider met --config pipeline/search.example.json --live
# --download è opzionale: richiede --live e download_hosts esplicitamente autorizzati.
```

Connettori separati: Commons, Openverse, Met, Library of Congress (query HABS/HAER/HALS), Smithsonian (SMITHSONIAN_API_KEY) e NASA. Ogni provider ha termini, limiti e schemi propri: validare esempi reali prima di abilitare un job. Fixture e mock non certificano l’accesso live. Massimo 50 risultati, quattro query controllate, timeout 20s, retry/backoff e User-Agent con contatto. Limiti chiamate Met/LoC maggiori perché richiedono dettagli per asset. Nessun motore generalista o scraping. Pianificazione inattiva, workflow manuale disabilitato salvo ENABLE_IMAGE_PIPELINE=true; artifact privati scadono dopo 7 giorni. Configurare destinazione di revisione e quote prima di aggiungere cron.

Quarantena `.pipeline/` privata e ignorata da Git. Deduplica fonte/URL prima del download, SHA-256 dopo download, dHash percettivo solo come suggerimento. Non rimuovere crediti: gli originali restano integri, ottimizzazione derivati da fare solo dopo revisione degli obblighi. Nessuna etichetta REAL approvata automaticamente. Met richiede isPublicDomain sul singolo asset; NASA e istituzioni pubbliche non implicano diritti liberi. CC0/PD verificato, CC BY/SA richiedono prove e obblighi corretti; ambigui restano in revisione.

Admin: configurare un token casuale >=32 caratteri in `.dev.vars` (mai committarlo): `ADMIN_TOKEN=...`. Aprire `/admin`; autenticazione HTTP Basic (utente `admin`, password token), sempre HTTPS fuori localhost. API supporta anche Bearer. Import JSON con: type, title, description, author, source_url, source_id, provider, license_name, license_url, evidence, explanation, categories (ID), difficulty; per AI anche ai_model, ai_prompt, owner_declaration=true. I contenuti e gli eventi inventati devono essere verificati dall’editore prima dell’approvazione. Il file JPEG/PNG/WebP va caricato separatamente; SVG non accettati. Il menu privato consente filtri, prove, licenza, modifica categorie/difficoltà e audit della decisione. Protezione server-side su pagina, API e upload.

I bucket `*-local` nella configurazione sono nomi di emulatori, non risorse remote esistenti. L’approvazione copia soltanto dallo storage quarantena allo storage approvato dell’ambiente corrente; non avvia deploy/import produzione. Le fixture demo e il catalogo verificato sono separati dal campo `demo`.
