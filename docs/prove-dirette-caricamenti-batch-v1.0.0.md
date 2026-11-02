---
version: 1.0.0
created_at: 2026-11-02T18:51:11.607127Z
status: configured-not-activated
---

# Prove dirette e caricamenti Batch

Le prove piccole usano le API OpenAI dirette, senza Files o Batch. Batch resta
lo strumento per alimentare la coda editoriale con caricamenti più grandi e
convenienti, nei limiti già configurati. Nessun aumento automatico di quote,
cron o pubblicazione: ogni candidata richiede revisione umana e il catalogo
giocabile continua a essere pubblicato a gruppi 50/50.

Questa decisione sostituisce l'uso di Batch per il pilot descritto in
[prova Batch 1.0.0](prova-batch-controllata-v1.0.0.md). La specifica
[pipeline Batch 1.0.0](pipeline-batch-openai-v1.0.0.md) resta valida per i
caricamenti. Non esiste fallback automatico da Batch a diretto dopo un errore.

## Chiavi e permessi per la prova diretta

| Chiave / token | Dove | Modifica necessaria |
|---|---|---|
| `OPENAI_API_KEY` | Secret GitHub Actions | Abilitare richiesta di generazione immagini (`api.model.images.request`). Conservare Responses e lettura modelli, già disponibili. |
| `OPENAI_API_KEY` | Environment privato Codex | Aggiornare soltanto se si crea una chiave diversa e si vuole usare quell'esecutore. Non viene sincronizzata automaticamente da GitHub. |
| `REAL_OR_SLOP_ADMIN_TOKEN` | Secret GitHub Actions | Nessuna: autenticazione nel Worker già verificata. Deve continuare a corrispondere al secret Worker `ADMIN_TOKEN`. |
| `ADMIN_TOKEN` | Secret Worker | Nessuna: non rigenerarlo né copiarlo nel frontend. |
| `CLOUDFLARE_API_TOKEN` | Environment di rilascio | Nessuna: non occorrono permessi aggiuntivi per questa prova. |

[Gestione chiavi OpenAI](https://platform.openai.com/api-keys). Se la chiave è
Restricted, abilitare le richieste Images/generazione immagini. Non è necessario
impostare All. La verifica precedente ha già confermato Responses e i modelli
`gpt-6.1-terra` / `gpt-image-2`; non è stata eseguita inferenza con il probe.

Cambiare i permessi della stessa chiave non cambia il suo valore: non serve
ricopiarla nei secret. Solo se si crea una nuova chiave, aggiornare il secret
`OPENAI_API_KEY` in GitHub Settings → Secrets and variables → Actions; se usato,
aggiornare separatamente l'environment Codex. Mai chiavi in chat, repository,
frontend, log o artifact. Nessun nuovo token amministrativo è richiesto.

Per i futuri caricamenti Batch abilitare inoltre Files Read/Write
(`api.files.read`, `api.files.write`) e Batch Read/Write (`api.batch.read`,
`api.batch.write`). Possono essere sulla stessa chiave o su una chiave dedicata
all'esecutore Batch. Questi quattro permessi non servono alla prova diretta.

## Esecuzione diretta preparata

Il ramo operativo della PR #29 prepara un workflow esclusivamente manuale:
operation=start raccoglie al massimo due fotografie nuove; execute_paid=false
fa soltanto raccolta e piano; true usa `pipeline.editorial --execute`.
operation=permissions controlla solo Responses e Images con richieste incomplete,
che non possono produrre inferenza. Non invoca Files, upload o Batch.

La raccolta autenticata legge inventario, riferimenti e claim privati prima
di raggiungere il limite: un'immagine già presente non consuma un posto del
piccolo lotto. Sono conservati deduplica percettiva, originali, licenze, fonti,
preferenze con esplorazione e diversità. Per il test completo REAL/SLOP, se non
si trovano due riferimenti nuovi, il workflow si ferma prima delle chiamate
pagate; nessun riempimento o modifica dei punteggi.

Viene riusato il motore sincrono esistente: due valutazioni visuali, una classifica,
prima metà REAL e seconda metà sorgenti SLOP; descrizione → brief → generazione
solo testuale → valutazione cieca. Massimo quattro analisi e una generazione,
un solo tentativo. Le immagini sotto soglia non entrano nella coda pronta.

Prima di una chiamata pagata, l'operatore deve configurare nel Worker le stime
**dirette** `EDITORIAL_EVALUATION_USD` e `EDITORIAL_GENERATION_USD`, oltre ai
limiti run/giorno/cumulativo, e abilitare temporaneamente il gate di spesa.
Le variabili `EDITORIAL_BATCH_*` riguardano altri prezzi e non sono usate qui.
I parametri operativi preparati prenotano conservativamente 0.50 USD per
analisi/brief/valutazione e 2 USD per generazione, quattro USD teorici per prova.
Verificare i prezzi effettivi prima dell'avvio; non sono prezzi commerciali
né un blocco della fattura del provider. Nessun importo o gate è attivato qui.

Resta il tetto cumulativo stimato **5 USD complessivi**, compresa la precedente
prenotazione conservativa di 0.50 USD. Non azzerare il ledger o cambiare run/data
per aggirare un limite. Il pilot Batch interrotto viene annullato senza inviare
alcuna richiesta al provider, dato che non esiste un provider job. La prenotazione
resta conservata. Nessun batch della vecchia prova viene ripreso per generare.

Il test diretto dura il tempo delle chiamate sincrone, senza la finestra Batch
di 24 ore; errori e quota possono comunque interromperlo. Nessuna promessa di
completamento immediato o quota obbligatoria. Le candidate preparate sono
visibili in `/admin` con Approva/Rifiuta; dossier in `/admin/slop` e gestione
avanzata. Il risultato numerico non approva né pubblica nulla.

Gli originali e la provenienza importati restano privati in R2/D1. Gli artifact
del workflow contengono soltanto un riepilogo numerico con campi ammessi: non
vengono caricati cartelle nascoste, backup o segreti. Non viene automatizzata
una nuova esecuzione dopo un fallimento. Eventuali recuperi richiedono il
workspace privato originale e il normale percorso sincrono `--resume`.
