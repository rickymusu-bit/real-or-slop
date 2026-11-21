# Privacy e note legali — specifica 1.4.0

Stato: vigente; ramo 1.51.0 da rilasciare. Aggiornata: 2026-11-21T09:00:00Z.
1.2.0: su richiesta dell'owner del 2026-11-14 i Termini d'uso (aggiornati il 14 novembre 2026) dicono che le SLOP sono generate «senza
parti di fotografie vere, e spesso ridotte, sfocate, sgranate o sbiadite come lo sono le immagini che circolano», al posto di «generate
integralmente», per il trattamento delle SLOP (specifica `copie-di-gioco`, sezione 4); «Fonti e crediti» lo dice allo stesso modo.
La frase è stata verificata da un legale (comunicazione dell'owner del 2026-11-14). 1.1.1: con l'app 1.24.0 la pagina «Fonti e crediti»
non dice più «ritagliata nel formato 4:5» e avverte che la descrizione delle REAL può essere stata corretta (sezione 6). 1.1.0: versione
consolidata (riordino della documentazione dell'owner del 2026-11-14) della 1.0.4; le precedenti sono nella cronologia git. I testi di
Privacy e Termini non cambiano.

**Verifica legale.** I testi delle pagine Privacy e Termini, scritti a partire da ciò che il codice fa, sono stati verificati da un legale
(comunicazione dell'owner del 2026-11-13); le due frasi dei termini cambiate con la tolta delle didascalie sono state approvate il
2026-11-14, la frase sul trattamento delle SLOP lo stesso giorno. Ogni modifica a quei testi va fatta verificare di nuovo.

**Decisioni dell'owner del 2026-11-15, da implementare** (issue rickymusu-bit/real-or-slop#136). Fino al rilascio il resto di questa specifica
descrive il comportamento in produzione (app 1.26.0); chi implementa aggiorna le sezioni e toglie questo riquadro.

- **Fonti e crediti, Come funziona, crediti di fine partita:** la copia di gioco è adattata al formato verticale 4:5. Sono testi
  descrittivi, fuori da Privacy e Termini.

## 1. Decisioni dell'owner (2026-11-12)

- Progetto **personale e non commerciale**; titolare del trattamento l'owner come persona fisica, con i contatti in `shared/legal.ts`.
- Partite conservate **12 mesi**.
- Per entrare in classifica il giocatore dichiara di avere **almeno 14 anni o il permesso di un genitore**; il gioco senza classifica non
  chiede nulla. È una cautela, non un obbligo: la soglia dei 14 anni (art. 8 GDPR, art. 2-quinquies del Codice privacy) riguarda i
  trattamenti basati sul consenso, mentre qui la base è il servizio richiesto e il legittimo interesse.
- Il GDPR si applica anche a un progetto personale, perché il sito è pubblico.

## 2. Dati trattati

| Dato | Dove | Conservazione | Base giuridica |
|---|---|---|---|
| Cookie tecnico `ros_owner` (codice casuale; nel database solo l'impronta SHA-256) | browser, D1 | cookie 1 anno | contratto (art. 6.1.b) |
| Partite: livello, foto, risposte, tempi, legati all'impronta del cookie | D1 | 12 mesi, poi cancellate | contratto; legittimo interesse per statistiche anonime e abusi |
| Classifica: soprannome (pubblico), livello, punteggio, data, impronta del codice partita | D1 | fino alla richiesta di cancellazione | contratto, su scelta del giocatore |
| Impronta dell'indirizzo IP (limite di richieste) | D1 | circa 1 minuto | legittimo interesse (sicurezza) |
| Indirizzi IP e dati tecnici delle richieste | Cloudflare | secondo Cloudflare | legittimo interesse |

Nessun account, analytics, pubblicità o cookie di terze parti: basta l'informativa, senza banner di consenso. Nessun dato dei giocatori va
a OpenAI. Cloudflare è responsabile del trattamento; trasferimenti verso gli USA con il Data Privacy Framework.

## 3. Pagine

- **Privacy e cookie** (`/privacy`): titolare e contatti, dati e finalità, base giuridica, fornitori, età, diritti (accesso, rettifica,
  cancellazione, limitazione, opposizione, reclamo al Garante); per la classifica il giocatore indica il codice partita.
- **Termini d'uso** (`/termini`): scopo educativo; le SLOP sono immagini false, generate senza parti di fotografie vere e spesso
  ridotte, sfocate, sgranate o sbiadite; divieto di diffonderle fuori dal gioco come vere o di
  togliere il marchio; licenze delle REAL; regole del soprannome; nessuna garanzia; contatti.
- **Fonti e crediti** (`/crediti`) e **Come funziona**; collegamenti nel piè di pagina.

## 4. Conservazione

Manutenzione giornaliera (Cron Trigger alle 03:17 UTC): cancella le partite iniziate da più di 12 mesi con round, risposte ed eventi, i
limiti di richieste scaduti e le copie ritirate che nessuna partita usa più. La classifica non dipende dalle partite e resta.

## 5. Classifica e minori

Casella obbligatoria sull'età (rifiutata anche dal server senza `age_ok: true`) e avviso a non usare nome e cognome. Nelle Impostazioni
«Cancella» elimina per sempre una voce (`DELETE /api/admin/leaderboard/:id`).

## 6. Licenze delle foto REAL

Le licenze CC BY e CC BY-SA chiedono di indicare le modifiche; la CC BY-SA chiede la stessa licenza per l'opera modificata. La copia di
gioco è adattata al formato 4:5 e ricompressa. I crediti di fine partita indicano le modifiche e la licenza dell’originale. La pagina
«Fonti e crediti» spiega le due modalità di adattamento, ritaglio e bande nere. Le
licenze ND sono escluse. Dal 2026-11-20 i risultati non mostrano una descrizione editoriale delle REAL: restano titolo, autore,
licenza con link, link alla fonte e indicazione delle modifiche. «Fonti e crediti» non parla più della descrizione e dice che per le
SLOP sono indicati prompt e modello. Privacy e Termini non cambiano; la frase verificata sul trattamento delle SLOP resta invariata.
