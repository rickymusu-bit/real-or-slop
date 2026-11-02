> Aggiornamento 2026-11-02T18:51:11.607127Z: per le prove piccole si usa il metodo diretto;
> Batch resta per i caricamenti. [Policy e chiavi v1.0.0](prove-dirette-caricamenti-batch-v1.0.0.md).

---
version: 1.0.0
created_at: 2026-11-02T17:55:00Z
status: controlled-manual-pilot
---

# Prova manuale Batch autorizzata

Configurazione operativa temporanea nel ramo `ops/batch-pilot-2026-11-02`.
Non va unita per abilitare una raccolta automatica. Il workflow esiste già su main;
il dispatch seleziona questo ramo e la sua configurazione per la sola prova.
Il job accetta soltanto workflow_dispatch dal ramo indicato e repository privato;
non contiene cron e non modifica variabili, secret o permessi permanenti GitHub.

Il proprietario ha autorizzato merge #27, migrazione 0011, rilascio e prova da due
fotografie / massimo una SLOP, entro cinque USD stimati. Il primo preflight Actions
ha verificato i due secret esistenti disponibili, ma coda false, budget zero e
prezzi Batch/licenza generata assenti. L'integrazione non accede alle variabili
repository (403); l'esecuzione dedicata usa parametri espliciti e secret esistenti
soltanto per il normale lavoro della pipeline, senza esporne i valori.

Limiti immutati nel Worker: run/giorno/cumulativo 5 USD, massimo quattro analisi,
una generazione, un tentativo per sorgente. Prenotazioni conservative: 0.50 USD
per analisi/brief/valutazione, 2.00 USD per generazione, totale primo passaggio
4.00 USD. Sono stime, non un blocco della fattura OpenAI. Modelli configurati e
verificati nell'elenco progetto: gpt-6.1-terra e gpt-image-2, 1024x1024 medium.
Licenza dichiarata delle immagini generate CC BY 4.0; sorgenti con diritti distinti.

Il default execute_paid=false fa soltanto raccolta/piano o recupera risultati già
pagati. execute_paid=true autorizza la prossima fase nel limite server. Salvare
ros-<GITHUB_RUN_ID> e continuare con operation=resume sul medesimo identificativo;
nessun nuovo lotto per ottenere un retry o azzerare il budget. Un job concluso in
Actions non significa che OpenAI abbia completato la fase (finestra 24h).

Approvazione, rifiuto e pubblicazione restano decisioni del proprietario.
Catalogo, sorgenti private, preferenze e protocollo editoriale non cambiano.
Dopo l'invio controllato spegnere il gate Worker; le riprese successive del pilot
possono riabilitarlo per la sola fase autorizzata. Nessun cron viene attivato.

## Verifica accessi

operation=permissions controlla gli scope con letture e richieste intenzionalmente
incomplete (nessun batch valido, prompt o inferenza). Pubblica soltanto codice
HTTP e nomi degli scope, mai chiavi o messaggi upstream completi. Il controllo
Files può creare un file di prova di pochi byte soltanto se il permesso esiste;
non invia tale file a Batch. Il gate di spesa resta disattivato durante il check.
Non vengono caricati backup o file nascosti negli artifact. Il recupero del lotto
usa i checkpoint privati in D1/R2.

## Esito del primo invio

Rilascio 0.14.0 e migrazione 0011 completati; catalogo invariato. Actions
41495903979 ha raccolto due foto, una esclusa perché già nel catalogo. Il lotto
nuovo ha quindi una sola fotografia (nessun riempimento o secondo ordinamento).
L'upload Files è fallito prima di creare Batch: checkpoint ros-41495903979
sospeso, prenotazione conservativa 0.50 USD, nessuna inferenza o immagine generata.

La verifica non pagata Actions 41497428631 conferma mancanti api.files.read,
api.files.write, api.batch.read, api.batch.write, api.model.images.request.
Modificare i permessi della chiave dal progetto OpenAI corretto; se si crea una
nuova chiave, aggiornare il secret Actions esistente senza inserirla nel codice.
Non usare questa raccolta da una sola foto per promettere una generazione SLOP:
servirà un successivo lotto con almeno due riferimenti nuovi. Il limite cumulativo
non viene azzerato e resta 5 USD. Nessun cron o nuovo lotto automatico abilitato.

Il ramo include anche errore HTTP sicuro per l'upload e ricontrollo del gate server
prima di riprovare un job già prenotato; il replay non addebita due volte.
