# Metadati editoriali privati

Versione del contratto: **1.0.0** — 25 ottobre 2026. Versione applicazione: **0.5.0**.

Implementa soltanto la fase metadati del piano operativo. Riferimenti normativi:
[selezione REAL](protocollo-selezione-real-v1.0.0.md),
[generazione SLOP](protocollo-generazione-slop-v1.0.0.md),
[fonti REAL](fonti-immagini-real-v1.0.0.md).
Campionamento stratificato, studio di generazione, tema e preload restano fasi successive.

## Schema e compatibilità

`0004_image_curation.sql` aggiunge `image_curation`, con chiave primaria e riferimento
a `images.id`, e `image_curation_events`. Non riscrive immagini, fonti, licenze,
categorie, decisioni precedenti, statistiche o sessioni. Nessun backfill automatico.
Una scheda assente è `null`; i campi non classificati sono SQL `NULL`. Anche le
nuove importazioni possono essere revisionate con il contratto precedente.
La migrazione va applicata prima di eseguire il nuovo backend; la compatibilità
con dati senza scheda non significa che si possa omettere la migrazione.

| Gruppo | Campi | Significato |
| --- | --- | --- |
| Contesto rappresentato | `subject_kind`, `country_or_region`, `period_bucket`, `represented_country`, `represented_place`, `represented_period` | Classificazione di ciò che appare: per AI non attesta l'esistenza della scena |
| Caratteristiche visive | `image_medium`, `composition`, `visual_style` | Medium, composizione e stile comparabili tra REAL e AI |
| Fatti documentati | `verified_place`, `verified_date`, `fact_evidence` | Solo fatti controllati dal revisore con riferimento preciso; data anche approssimata/intervallo |
| Giudizi editoriali | `familiarity`, `perceived_plausibility`, `quality_bucket`, `authenticity_confidence` | Valutazioni qualitative, non misurazioni né certificazioni automatiche |
| Ragionamento e note | `surprise_reason`, `cognitive_mechanism`, `reveal_learning_point`, `reviewer_notes` | Indizio, meccanismo cognitivo, proposta didattica e note private |
| Audit | `revision`, `reviewer`, `updated_at` | Gestiti esclusivamente dal server |

I vocabolari e i limiti esatti sono in `shared/curation.ts`; vincoli SQL e API
controllano gli stessi valori. Le regioni sono macroaree, con paese e luogo più
precisi in campi separati. Epoche non determinabili restano non classificate.
I meccanismi comprendono quelli del protocollo SLOP e meccanismi applicabili alle
REAL; non deducono la classe dell'immagine. Non equiparare sorpresa e difficoltà.
Ogni campo di testo ha limite esplicito (200–4000 caratteri).

`REAL`/`AI` e le difficoltà `facile`/`medio`/`difficile` rimangono invariati.
Esperto si annota soltanto in `reviewer_notes`, come profilo sperimentale.

## API amministrativa

Pagina, elenco, schede e cronologia richiedono la stessa autenticazione Basic o
Bearer esistente. Token mancante/configurazione insufficiente: 503; credenziali
errate: 401; mutazione con Origin diverso: 403. Nessun token nel frontend.

- `GET /api/admin/images?status=in-review`: contratto precedente più `curation`
  (`null` oppure record completo). Disponibile anche per approvate e rifiutate.
- `GET /api/admin/images/:id/curation`: `{curation, events}`. Restituisce gli
  ultimi 100 eventi, in ordine decrescente di revisione; tutti gli eventi restano
  conservati nel database. Immagine inesistente: 404.
- `PUT /api/admin/images/:id/curation`: sostituisce la scheda e registra l'evento
  nella stessa transazione D1. Richiede revisione attesa e motivazione:

```json
{
  "revision": 0,
  "reason": "Prima classificazione dopo il controllo delle fonti",
  "facts_confirmed": true,
  "curation": {
    "subject_kind": "trasporti",
    "country_or_region": "europa",
    "period_bucket": "1900_1945",
    "image_medium": "foto_bn",
    "composition": "scena_ampia",
    "familiarity": "bassa",
    "perceived_plausibility": "sorprendente",
    "cognitive_mechanism": "aspettative_tecnologiche",
    "verified_date": "1930 circa",
    "fact_evidence": "Riferimento archivistico preciso da verificare per il singolo file",
    "reviewer_notes": "Esempio di contratto: non è un asset approvato"
  }
}
```

`revision: 0` crea la prima scheda; usare poi la revisione restituita dal server.
Campi omessi, stringhe vuote e `null` **cancellano** il valore precedente: è una
sostituzione PUT, non una patch. Tipi errati, campi sconosciuti, vocabolari
inventati, testo eccessivo o motivazione vuota danno 400. `verified_place` o
`verified_date` richiedono `fact_evidence` non vuota e `facts_confirmed: true`,
anche quando si risalva un fatto già presente. Il server può verificare il
contratto e la conferma, non la verità della fonte: resta un compito umano.

Revisioni obsolete o salvataggi concorrenti della stessa revisione danno 409:
un solo aggiornamento riesce, anche se nessuna scheda esisteva prima. Nessuna
sovrascrittura silenziosa. Ricaricare e confrontare con la cronologia prima di
reinviare. Altri metodi non sono supportati (405).

Ogni evento contiene motivazione, snapshot completi `before_json`/`after_json`,
revisione, data UTC e identificatore del revisore. Trigger SQL vietano modifica
e cancellazione degli eventi. Il revisore è il fingerprint del token admin già
usato dalla moderazione: identifica la credenziale condivisa, non una persona
distinta; non è stato introdotto un sistema di account. Token integrali mai
memorizzati negli eventi.

## Flusso del revisore

1. Importare e caricare tramite il flusso esistente; la candidata resta privata.
2. Aprire “Scheda editoriale privata”, compilare classificazioni e separare i
   fatti documentati dal contesto raffigurato e dalle valutazioni soggettive.
3. Inserire una motivazione e salvare. Il modulo richiede di salvare eventuali
   modifiche prima di approvare/rifiutare; il salvataggio da solo non approva.
4. Usare la decisione umana esistente con conferme di diritti/autenticità,
   licenza compatibile e file caricato. L'audit della decisione rimane separato.
5. Modificare successivamente le annotazioni anche su immagini già approvate o
   rifiutate, con nuova revisione e motivazione. Lo stato, la classe, la
   difficoltà, le categorie e i dati di provenienza non cambiano salvando la scheda.

`reveal_learning_point` è una proposta privata: non sostituisce automaticamente
`images.explanation` né il feedback delle partite. La pipeline Python esistente
continua a conservare i metadati dei provider nella sua coda privata; non converte
date/luoghi provenienti da un provider in fatti verificati. Nessun nuovo
connettore, download live, generazione o import massivo è abilitato.

## Riservatezza e verifiche

Le API di gioco e PvP non leggono la nuova tabella. I loro payload espliciti e
gli identificatori opachi restano invariati: nessuna scheda, indizio, prova,
classificazione o nota editoriale è aggiunta prima della risposta. La cronologia
rimane amministrativa anche dopo il reveal.

Verifiche locali richieste:

```sh
npm ci
npm run lint
npm test
npm run build
npm run test:integration
ROS_TEST_PROFILE= npm run test:integration
```

La suite verifica migrazione su dati preesistenti senza alterazioni, vincoli SQL,
vocabolari coerenti con API, audit immutabile, autorizzazioni, fatti/conferme,
salvataggi concorrenti iniziali e successivi, gate di approvazione e una partita
demo di 24 round con metadati presenti e assenti. Il runner applica migrazioni e
seed esclusivamente a D1 locale, usa R2 emulato e testa due client PvP reali.
Il secondo profilo verifica la demo senza binding R2.

Nessuna migrazione remota, risorsa cloud, modifica alla dashboard o distribuzione
è prevista da questa fase. La revisione visuale del modulo su dispositivi fisici
e l'eventuale gestione di revisori con account individuali restano limitazioni.

## Changelog

- **1.0.0 — 2026-10-25:** contratto privato, vocabolari controllati, separazione
  fatti/giudizi, audit transazionale e compatibilità con il catalogo precedente.
