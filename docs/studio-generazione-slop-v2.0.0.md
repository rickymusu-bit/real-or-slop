> Aggiornamento 2026-11-02T16:30:46Z: esecuzione del workflow tramite
> [Batch OpenAI v1.0.0](pipeline-batch-openai-v1.0.0.md), con recupero D1/R2 e
> monitoraggio tecnico separato. Rubrica, libertà generativa, preferenze e revisione
> umana a due pulsanti restano invariate.

> Aggiornamento 2026-11-02T15:58:55+01:00: la revisione quotidiana usa [immagine, Approva/Rifiuta e preferenze apprese v1.0.0](revisione-visiva-preferenze-v1.0.0.md). Le schede vengono preparate prima della presentazione; i moduli precedenti restano soltanto nella gestione avanzata.

---
version: 2.0.0
created_at: 2026-11-01T22:00:00Z
supersedes: studio-generazione-slop-v1.0.0.md
---

# Studio SLOP e revisione

Da `/admin/slop` rimane disponibile l'editor manuale di concept, prompt effettivo,
fatti documentati e provenienza. Il template 2.0.0 esprime un brief aperto, senza
profili di difficoltà o obbligo di anacronismo. Il prompt e la spiegazione possono
essere corretti prima dell'importazione; la provenienza del file importato resta
congelata. L'audit e il controllo di revisione esistenti sono conservati.

La sezione “Pipeline editoriale REAL / SLOP”, presente anche in `/admin`, carica
i dossier automatici: fotografia originale privata, link della fonte, classifica
e valutazione, immagini generate collegate, descrizione, brief, prompt, modelli,
parametri, tentativi e motivi di scarto. I dossier sono consultabili anche quando
una generazione è fallita e non esiste una candidata da revisionare. Gli originali
non vengono allegati al generatore. La pipeline API viene avviata dall'esecutore
privato, non dal browser: nessuna chiave OpenAI nel frontend.

1. Caricare dossier e diagnostica; verificare sorgente, diritti e trasformazione.
2. Aprire la coda “In revisione”, osservare l'immagine finale e correggere categorie,
   metadati di curatela e spiegazione del reveal quando necessario.
3. Confermare diritti e autenticità/invenzione e approvare, oppure rifiutare.
   La nota è sempre facoltativa. L'audit conserva una nota vuota se non scritta.
4. Le immagini approvate possono attendere senza file della classe opposta.
   Nessuna soglia numerica né singola approvazione pubblica l'immagine.
5. Quando il gruppo è pronto, confermare l'apposita casella e scegliere “Pubblica
   gruppi bilanciati approvati”. È una scrittura nell'ambiente corrente: controllare
   sempre URL e ambiente. Il minimo fra le due classi viene pubblicato atomicamente;
   le eccedenze restano in attesa. Non viene eseguito alcun deploy.
6. Controllare la diagnostica di distribuzione per evitare scorciatoie sistematiche
   di categoria, epoca, tipo di soggetto, qualità o ambiente. Le peculiarità estetiche
   del generatore non devono essere cancellate per rendere artificialmente identici
   i due gruppi.

Le route storiche dello Studio sono conservate. I nuovi percorsi privati, tutti
sotto `/api/admin/editorial`, sono:

| Percorso | Metodo | Uso |
|---|---|---|
| `/state` | GET | Registro completo, inventario, coda e diagnostica |
| `/dossiers` | GET | Ultimi 100 riferimenti e 300 tentativi con stato |
| `/references` | POST | Registrazione atomica della classifica e dei ruoli |
| `/references/:id/original` | PUT / GET | Originale privato con hash verificato |
| `/references/:id/preview` | PUT / GET | Derivato privato della sorgente |
| `/reviews` | POST | Valutazione REAL collegata alla fotografia corrispondente |
| `/attempts` | POST | Dossier immutabile; retry identico idempotente |
| `/budget` | POST | Prenotazione non riutilizzabile prima delle chiamate pagate |
| `/controls` | GET / PUT | Limite persistente della coda (`queue_limit`, 1–1000) |
| `/publish` | POST | Pubblicazione esplicita, bilanciata e concorrente (`confirm=true`) |

Non inviare dossier, prompt o sorgenti nei payload di gioco. Le modalità,
l'autenticazione, le URL opache e i manifest di precaricamento restano quelli
esistenti. Procedura API, migrazioni, diritti e recupero sono normati nella
[pipeline editoriale 1.0.0](pipeline-editoriale-real-slop-v1.0.0.md).

La raccolta, l'analisi e la generazione si avviano dal workflow GitHub
**Automatic private review queue**, non dal pulsante dei dossier. Per una prima
prova scegliere due riferimenti e lasciare il cron disattivato. Le candidate
accettate vengono importate nella coda; i file scartati restano nell'artifact
privato del run, mentre il dossier registra esito e motivazione.
