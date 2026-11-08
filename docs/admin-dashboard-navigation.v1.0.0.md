# Dashboard amministrativa — navigazione v1.0.0

Aggiornato: 2026-11-08T11:06:49.710Z. Versione app prevista 0.22.0.
Branch di lavoro `codex/admin-navigation-v0.22.0`. Nessun merge/deploy implicito.

## Obiettivo

Ridurre una pagina `/admin` lunga in sei sezioni chiaramente navigabili,
preservando tutte le operazioni editoriali e amministrative esistenti.
La Panoramica recupera in sola lettura stato delle partite, conteggi pubblicati,
immagini in attesa e numero di argomenti tramite le API private del Worker.
Nessun valore viene inventato in caso di errore o di connessione assente.

## Sezioni

1. Panoramica: stato del lavoro, collegamenti rapidi e flusso editoriale.
2. Argomenti: registrazione e proposta descrizioni, revisione delle bozze,
   memoria semantica, embedding e suggerimenti Topic Discovery.
3. Produzione immagini: scelta dell'argomento, caricamenti e link, proposte,
   strumenti REAL, prompt SLOP, audit di preferenza/formato e budget operativo.
4. Revisione: selezione e voto pixel-only, rifiuti, ripristini, storia e
   ammissione documentale dei file già approvati.
5. Pubblicazione: gli stessi controlli di pubblicazione bilanciata dei cicli,
   con verifica esplicita dell'inventario, senza ammissioni implicite.
6. Impostazioni: controllo persistente Demo/Produzione e budget AI condiviso.

La schermata avanzata storica `/admin?advanced=1`, le somiglianze e il
laboratorio editoriale v2 restano raggiungibili con link dedicati.

## Conservazione dell'interazione

`src/admin-dashboard.v1.0.0.ts` ricolloca i quattro moduli già inizializzati
all'interno di un layout navigabile. Non clona nodi HTML e non reimposta form,
listener, selezioni o dati digitati. I sottoinsiemi vengono mostrati/nascosti
usando `hidden`; il layout forza `[hidden]` per coesistere con gli stili
preesistenti. I controlli originali di pubblicazione rimangono figli della
sezione di revisione, affinché funzioni la delega eventi e il controllo dei dati.

`?view=...` salva in URL la sezione selezionata senza creare richieste POST.
Su mobile il menu orizzontale scorre senza forzare la larghezza della pagina.
Per ragioni di sicurezza, un errore di API lascia il dato come sconosciuto,
non lo sostituisce con un numero di comodo.

## Verifica e rilascio

Eseguire `npm run lint`, `npm test`, `npm run build`,
`npm run db:migrate` e `ROS_TEST_BROWSER=1 npm run test:editorial` su
emulatori/fixture, senza chiamate AI reali. Lo scenario browser deve attraversare
le sei viste, creare e approvare un argomento, caricare fotografie, votare e
pubblicare un ciclo simulato, gestire budget e tornare sui campi senza perdita.
Verificare visibilità e assenza di overflow a 1440px e 390px.
Nessuna nuova migrazione remota, nessun cambio a Cloudflare e nessuna modifica
al catalogo di produzione derivano dalla sola PR.
