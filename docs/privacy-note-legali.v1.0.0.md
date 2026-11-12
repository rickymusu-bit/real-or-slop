# Privacy e note legali — specifica 1.0.0

Stato: decisioni dell'owner del 2026-11-12 (sezione 1); testo da approvare con la PR. Creata: 2026-11-12T19:00:00Z. Realizzata nell'app 1.14.0.
I testi del sito sono una bozza scritta a partire da ciò che il codice fa davvero, **da far verificare a un legale prima dell'apertura al
pubblico** (come già indicato in `docs/libreria-immagini.v1.8.0.md`, sezione 11.3).

## 1. Decisioni dell'owner (2026-11-12)

- Progetto **personale e non commerciale**; titolare del trattamento l'owner come persona fisica. Nome e indirizzo di contatto vanno
  inseriti in `shared/legal.v1.0.0.ts` (`CONTROLLER`, `CONTROLLER_READY`) prima del rilascio: finché mancano, le pagine lo dichiarano.
- Partite conservate **12 mesi**.
- Per entrare in classifica il giocatore dichiara di avere **almeno 14 anni o il permesso di un genitore** (art. 2-quinquies del Codice
  privacy per i servizi online ai minori di 14 anni).
- Il GDPR si applica anche a un progetto personale, perché il sito è pubblico: l'esenzione per le attività domestiche non copre i siti
  aperti a tutti.

## 2. Dati trattati (dal codice)

| Dato | Dove | Conservazione | Base giuridica |
|---|---|---|---|
| Cookie tecnico `ros_owner` (codice casuale; nel database solo la sua impronta SHA-256) | browser, D1 | cookie 1 anno | contratto (art. 6.1.b) |
| Partite: livello, foto, risposte, tempi, legati all'impronta del cookie | D1 | **12 mesi**, poi cancellate | contratto; legittimo interesse per statistiche anonime e abusi |
| Classifica: soprannome (pubblico), livello, punteggio, data, impronta del codice partita | D1 | fino alla richiesta di cancellazione | contratto, su scelta del giocatore |
| Impronta dell'indirizzo IP (limite di richieste) | D1 | circa 1 minuto | legittimo interesse (sicurezza) |
| Indirizzi IP e dati tecnici delle richieste | Cloudflare | secondo Cloudflare | legittimo interesse |

Nessun account, analytics, pubblicità o cookie di terze parti: per il solo cookie tecnico basta l'informativa, senza banner di consenso.
Nessun dato dei giocatori va a OpenAI. Cloudflare è responsabile del trattamento; trasferimenti verso gli USA con il Data Privacy Framework.

## 3. Pagine

- **Privacy e cookie** (`/privacy`): titolare e contatti, dati e finalità, base giuridica, fornitori, età, diritti (accesso, rettifica,
  cancellazione, limitazione, opposizione, reclamo al Garante); per la classifica il giocatore indica il **codice partita**, che identifica la
  sua voce. I dati delle partite sono legati solo al cookie: senza il cookie non si possono attribuire a una persona.
- **Termini d'uso** (`/termini`): scopo educativo; le SLOP sono immagini false con didascalie inventate; divieto di diffonderle fuori dal
  gioco come vere o di togliere il marchio; licenze delle REAL; regole del soprannome; nessuna garanzia; contatti.
- Pie' di pagina: «Come funziona», «Privacy e cookie», «Termini d'uso», «Fonti e crediti». La pagina «Come funziona» rimanda alle due pagine.
- Codice: `src/legal.v1.0.0.ts`, `src/legal.v1.0.0.css`, `shared/legal.v1.0.0.ts`, `src/main.ts`.

## 4. Conservazione: manutenzione giornaliera

- Cron Trigger di Cloudflare ogni giorno alle 03:17 UTC (`wrangler.jsonc`), `worker/maintenance.v1.0.0.ts`: cancella le partite iniziate
  da più di 12 mesi con round, risposte ed eventi (a cascata), i limiti di richieste scaduti e le copie ritirate che nessuna partita usa più.
- La classifica non dipende dalle partite e resta. Le statistiche delle foto e la scheda Statistiche coprono quindi al massimo 12 mesi.

## 5. Classifica e minori

- Modulo: casella obbligatoria «Ho almeno 14 anni, oppure un genitore mi ha dato il permesso» (rifiutata anche dal server senza
  `age_ok: true`) e avviso «non usare il tuo nome e cognome».
- Impostazioni → «Classifica»: oltre a «Nascondi», **«Cancella»** elimina per sempre una voce (anche dal risultato della verifica di un
  codice), per le richieste di cancellazione. API `DELETE /api/admin/leaderboard/:id`.

## 6. Licenze delle foto REAL

Le licenze CC BY e CC BY-SA chiedono di indicare le modifiche; la CC BY-SA chiede che l'opera modificata abbia la stessa licenza. La copia
di gioco è ritagliata in 4:5, ridotta e ricompressa: i crediti di fine partita aggiungono «Ritagliata in 4:5, ridotta e ricompressa per il
gioco; la versione modificata ha la stessa licenza dell'originale» e la pagina «Fonti e crediti» lo spiega. Le licenze ND restano escluse
(`docs/copie-di-gioco.v3.0.1.md`).

## 7. Verifiche

`tests/game.v2.1.0.integration.py` (dichiarazione d'età, cancellazione, modifiche nei crediti, manutenzione con il gestore pianificato del
Worker locale `--test-scheduled`), `tests/game_browser.v1.1.0.integration.py` (modulo, pagine, cancellazione), desktop e mobile.

## 8. Da fare prima del lancio

- Inserire nome e indirizzo del titolare e porre `CONTROLLER_READY` a `true`.
- Revisione legale dei testi di Privacy e Termini.
- Valutare se la verifica dell'età per dichiarazione basta per l'uso previsto (per esempio in classe).
