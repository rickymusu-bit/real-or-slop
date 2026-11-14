# Privacy e note legali — specifica 1.0.4

Stato: decisioni dell'owner del 2026-11-12 (sezione 1); vigente, in produzione con l'app 1.23.0 (termini senza didascalie). Creata: 2026-11-12T19:00:00Z.
Aggiornata: 2026-11-14T01:10:00Z (1.0.4: il legale ha approvato le due frasi cambiate nella 1.0.3, comunicazione dell'owner del 2026-11-14;
precedente: `docs/privacy-note-legali.v1.0.3.md`). 1.0.3, 2026-11-13T22:30:00Z: i termini d'uso non parlano più di didascalie, tolte dal gioco con la migrazione 0047,
`docs/didascalie-wizard.v1.0.0.md`; data dei termini 13 novembre 2026, quella della privacy resta il 12 novembre). Precedente:
`docs/privacy-note-legali.v1.0.2.md` (1.0.2: tolta la voce sull'uso in classe con alunni sotto i 14 anni; la 1.0.1 registrò la revisione legale).

**Approvate dal legale** (comunicazione dell'owner del 2026-11-14): due frasi dei termini d'uso. «Immagini SLOP»: tolto «con didascalie plausibili ma inventate».
«Uso delle immagini»: «Le immagini e le didascalie sono pensate…» diventa «Le immagini sono pensate…». Nient'altro cambia.
I testi del sito, scritti a partire da ciò che il codice fa davvero, sono stati **verificati da un legale**: l'owner lo ha comunicato il
2026-11-13, senza modifiche ai testi. La verifica copre anche i termini d'uso richiamati in `docs/libreria-immagini.v1.8.0.md`,
sezione 11.3 (divieto di diffusione fuori contesto).

## 1. Decisioni dell'owner (2026-11-12)

- Progetto **personale e non commerciale**; titolare del trattamento l'owner come persona fisica, Riccardo Musumarra, contatto
  rickymusu@proton.me (indicati dall'owner il 2026-11-12, in `shared/legal.v1.0.0.ts`).
- Partite conservate **12 mesi**.
- Per entrare in classifica il giocatore dichiara di avere **almeno 14 anni o il permesso di un genitore**; la casella compare solo lì,
  il gioco senza classifica non chiede nulla (conferma dell'owner del 2026-11-12). È una **cautela**, non un obbligo: la soglia dei 14 anni
  (art. 8 GDPR, art. 2-quinquies del Codice privacy) riguarda i trattamenti basati sul consenso, mentre qui la base è il servizio richiesto
  e il legittimo interesse. Protegge l'unico dato pubblico, il soprannome; non verifica l'età.
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
- **Termini d'uso** (`/termini`): scopo educativo; le SLOP sono immagini false; divieto di diffonderle fuori dal
  gioco come vere o di togliere il marchio; licenze delle REAL; regole del soprannome; nessuna garanzia; contatti.
- Pie' di pagina: «Come funziona», «Privacy e cookie», «Termini d'uso», «Fonti e crediti». La pagina «Come funziona» rimanda alle due pagine.
- Codice: `src/legal.v1.1.0.ts`, `src/legal.v1.0.0.css`, `shared/legal.v1.1.0.ts` (con `shared/legal.v1.0.0.ts`), `src/main.ts`.

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

Niente: la revisione legale dei testi di Privacy e Termini è fatta (comunicazione dell'owner del 2026-11-13) e la voce sull'uso in
classe con alunni sotto i 14 anni è stata tolta dall'owner lo stesso giorno.
