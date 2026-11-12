# Generazione automatica delle SLOP su proposta — specifica 2.0.1

Stato: **approvata dall'owner il 2026-11-12**, vigente; realizzata nell'app 1.15.0 con la migrazione 0045.
Creata: 2026-11-12T19:05:00Z. Aggiornata: 2026-11-12T22:00:00Z (2.0.1: approvazione e dettagli della realizzazione,
sezione 12; precedente: `docs/proposta-generazione-slop.v2.0.0.md`). Versioni storiche: 1.1.0, 1.0.0 e `docs/proposta-e-prefiltro-slop.v1.0.0.md`.
Estende `docs/wizard-slop.v1.4.1.md` (sezioni 4, 6, 7, 8 e 13) e `docs/statistiche-impostazioni.v1.0.1.md` (sezione 2).

## 1. Decisioni dell'owner (2026-11-12)

- Nessun timer e nessun prefiltro: le immagini facili non si scartano, le linee guida stanno nel contesto dei prompt.
- Quando lo spread di un tag supera la soglia, il sistema manda una **notifica** che chiede all'owner di approvare la generazione di
  `n_real − (n_slop_pubblicate + n_slop_approvate) − n_slop_nuove` SLOP per quel tag.
- Le SLOP generate formano un **batch autonomo** ed entrano nella coda delle nuove da approvare.
- Finché ogni foto del batch non è approvata o scartata, **nessuna nuova generazione automatica** parte, per nessun tag: ogni
  approvazione cambia lo spread di tutti i tag, quindi la rilevazione si rifà solo a batch concluso.
- Se le SLOP nuove di un tag coprono già lo spread, per quel tag non si propone niente: prima si decide su quelle generate.
- Confermati il 2026-11-12: il batch gira nel browser; notifica nella dashboard; nessuna revisione di slot e prompt prima delle immagini;
  al massimo 10 foto per batch; con più tag sopra soglia si propone quello con lo spread percentuale più alto; la soglia si calcola
  sulle sole SLOP approvate e pubblicate; servono almeno 10 REAL con il tag.

## 2. Conteggi e soglia

Per ogni tag:

- `n_real`: REAL approvate o pubblicate con il tag;
- `n_slop`: SLOP approvate o pubblicate con il tag;
- `n_nuove`: SLOP nuove con il tag, generate dallo studio o in automatico. Valgono i tag dell'analisi; se l'analisi manca, i tag del
  tema dello slot. Le immagini nel cestino non contano.

Grandezze derivate:

- `spread = n_real − n_slop` (lo spread dello studio);
- `spread_percent = 100 × spread / n_real`;
- `N = spread − n_nuove`, il numero di SLOP che mancano.

Con la soglia predefinita del **33%** la proposta scatta da 1,5 REAL per ogni SLOP: con 15 REAL e 10 SLOP lo spread vale 33%.

## 3. Rilevazione

Un tag è **candidato** se valgono tutte le condizioni:

1. le proposte automatiche sono attive (Impostazioni);
2. **nessun batch automatico è aperto** (sezione 5);
3. lo studio SLOP è aperto (soglia delle 50 REAL);
4. `n_real` ≥ soglia del tema dello studio (10): sotto questo numero il tag non può fare da tema e la percentuale oscilla troppo;
5. `spread_percent` ≥ soglia di proposta;
6. `N ≥ 1`: se le SLOP nuove coprono già lo spread (`n_nuove ≥ spread`) il tag non si propone;
7. il tag non è stato ignorato, oppure il suo `spread_percent` è cresciuto di almeno 10 punti da quando è stato ignorato.

Tra i candidati si propone **uno solo**: quello con `spread_percent` più alto e, a parità, con `N` più alto, poi in ordine alfabetico.

**Quando.** Lo spread cambia solo con le azioni dell'owner nella dashboard, quindi la rilevazione è una lettura gratuita del database,
senza processi in background: all'apertura della dashboard e dopo ogni azione che cambia stato o tag di un'immagine (approvare,
pubblicare, ritirare, modificare i tag, spostare nel cestino o recuperare, svuotare il cestino, caricare REAL).

## 4. Notifica

Un riquadro in cima alla dashboard, in ogni sezione, e un indicatore sulla sezione Generazione SLOP:

> **Proposta di generazione** per `architecture`: 24 REAL, 4 SLOP approvate o pubblicate, 2 SLOP nuove; spread 83%, ne mancano 18.
> Generare un batch di **10 SLOP**? Per ogni immagine: generazione, tag e didascalia; in più una chiamata per i prompt.
> **Genera 10 SLOP**, **Ignora**

- Il batch contiene `min(N, 10)` immagini. Le restanti emergono alla rilevazione dopo la chiusura del batch, se il tag resta sopra soglia.
- **Genera** è la conferma esplicita di tutte le chiamate a pagamento del batch: prompt, immagini e analisi. Nessun importo. Prima di
  partire il server ricontrolla le condizioni della sezione 3: se nel frattempo sono cambiate, il batch non parte e la notifica si
  aggiorna.
- **Ignora** registra tag e `spread_percent` del momento; la rilevazione passa al candidato successivo.
- Chiudere il riquadro senza scegliere lo nasconde fino alla prossima apertura della dashboard.

## 5. Batch automatico

**Preparazione**, nel server e senza intervento dell'owner:

- tema: il solo tag proposto;
- slot: estratti con l'algoritmo dello studio (sezione 4 di `docs/wizard-slop.v1.4.1.md`), con peso dello spread, varietà e niente
  combinazioni doppie;
- prompt: una chiamata al modello di testo con il contesto «Prompt per le SLOP», come nello studio.

**Generazione e analisi**, guidate dal browser: le copie di gioco 4:5 si creano nel browser e l'analisi parte dopo la copia, come oggi.
Il batch avanza quindi solo con la dashboard aperta. Il riquadro mostra l'avanzamento («6 di 10 generate»); se la scheda si chiude,
alla riapertura il batch riprende dal punto in cui era, senza ripetere le chiamate già fatte. Modello e qualità sono quelli delle
Impostazioni.

**Esiti**, come nello studio: un rifiuto del generatore (4xx) non è addebitato e lascia lo slot senza immagine; un esito incerto (5xx,
timeout) è registrato e mai ripetuto; un problema dell'account OpenAI ferma il batch. Nessuno di questi casi viene ripetuto in
automatico. **Interrompi** ferma le chiamate rimaste; le immagini già generate restano nel batch.

**Stati del batch**: `running` (generazione in corso), `review` (generazione finita o interrotta, immagini da decidere), `closed`.
Il batch è **aperto** finché è `running` o `review`. Diventa `closed` quando la generazione è finita o interrotta e ogni immagine del
batch è approvata, pubblicata o nel cestino. Un'immagine recuperata dal cestino dopo la chiusura non riapre il batch: conta tra le
SLOP nuove del suo tag.

## 6. Revisione

- Le immagini del batch sono SLOP nuove come le altre: si decidono nella sezione Database, che ha un filtro «Batch automatico in corso»
  raggiungibile dal riquadro, o dalla pagina di revisione dello studio.
- Per ogni immagine: copia con marchio «RS», didascalia, tag per categoria, **prompt** e confronto con lo slot («Previsti ma non
  rilevati»). Il prompt va mostrato perché nessuno lo ha riletto prima della generazione.
- Azioni di sempre: Approva, Pubblica, Cestino, Rigenera. Una rigenerazione è a pagamento con la sua conferma, appartiene al batch e
  va decisa anch'essa.
- Lo studio manuale resta disponibile anche con un batch automatico aperto. Le sue SLOP nuove contano in `n_nuove`.

## 7. Linee guida

Le regole della sezione 11.1 di `docs/libreria-immagini.v1.8.0.md` arrivano al modello che scrive i prompt, non al generatore, che
riceve solo il testo del prompt. Nel batch automatico l'owner non rilegge né slot né prompt: le regole si reggono sul contesto «Prompt
per le SLOP», sulle regole d'uso del generatore e sulla revisione di ogni immagine, dove si intercetta anche ciò che il generatore
aggiunge di suo (un volto simile a una persona reale, le scritte di un manifesto).

## 8. Impostazioni

Nel gruppo «Studio SLOP»:

- **Proposte automatiche:** attive o spente (predefinito: attive). Spegnerle non interrompe un batch già avviato.
- **Soglia di proposta:** percentuale di spread, predefinita 33%, da 1% a 100%.

Il massimo di 10 immagini per batch resta nel codice, uguale a quello dello studio.

## 9. Dati e API

Migrazione additiva `0045_slop_auto_batches.v1.0.0.sql`:

- in `slop_batches`: `origin` (`studio` o `auto`, predefinito `studio`), `auto_tag`, `auto_status` (`running`, `review`, `closed`),
  `auto_size`, `auto_snapshot` (JSON con `n_real`, `n_slop`, `n_nuove`, `spread_percent` al momento della conferma), `auto_attempted`
  (slot già inviati al generatore);
- indice parziale che impedisce più di un batch automatico aperto;
- tabella `slop_proposal_ignored` (tag, `spread_percent` al momento, data);
- in `app_settings`: `slop_auto_enabled` (1) e `slop_auto_threshold_percent` (33).

API dell'admin:

- `GET /api/admin/slop/auto`: batch aperto con il suo avanzamento, oppure la proposta corrente; gratuita;
- `POST /api/admin/slop/auto/start` con tag e numero: ricontrolla le condizioni, crea il batch, scrive gli slot e i prompt
  (chiamata a pagamento confermata dalla notifica);
- `POST /api/admin/slop/auto/ignore` con il tag;
- `POST /api/admin/slop/auto/stop`: interrompe le chiamate rimaste.

Generazione e analisi delle singole immagini usano le rotte dello studio; `paid_calls` registra ogni chiamata come oggi, con il
riferimento al batch attraverso l'immagine generata (`generation_batch`), non nella riga della chiamata.

## 10. Verifiche

- Test unitari: conteggi (SLOP nuove con tag dell'analisi o dello slot, cestino escluso), `spread_percent` (100% senza SLOP, 33%
  con 15 REAL e 10 SLOP, valori negativi), `N` con `n_nuove ≥ spread`, minimo di REAL, scelta del candidato e parità, ritorno dopo
  «Ignora», dimensione `min(N, 10)`.
- Test d'integrazione con modelli finti: nessuna proposta con un batch aperto; ricontrollo alla conferma; un solo batch aperto
  anche con due richieste simultanee; ripresa dopo la chiusura della scheda senza chiamate ripetute; esiti incerti e rifiuti;
  interruzione; chiusura del batch quando l'ultima immagine è decisa; recupero dal cestino dopo la chiusura; proposte spente.
- Interfaccia nel browser su desktop e mobile: riquadro della notifica, avanzamento, filtro del batch, prompt in revisione,
  Impostazioni. Nessuna chiamata a pagamento reale.

## 11. Limiti

- Il batch avanza solo con la dashboard aperta.
- Un'immagine scartata lascia scoperto il suo posto: se il tag resta sopra soglia, la rilevazione successiva lo ripropone. Se il
  generatore sbaglia sempre lo stesso tema, le proposte si ripetono finché l'owner non le ignora.
- La scelta di un solo candidato per volta favorisce i tag con lo spread percentuale più alto: un tag con molte REAL e uno squilibrio
  moderato può aspettare a lungo.

## 12. Realizzazione (app 1.15.0)

- **Codice:** calcolo della proposta in `shared/slop-auto.v1.0.0.ts` (puro, con test unitari), rotte e regole in
  `worker/slop-auto.v1.0.0.ts`, collegate da `worker/slop.v1.6.0.ts`; riquadro e conduzione del batch in `src/slop-auto.v1.0.0.ts`;
  dashboard `src/library.v1.15.0.ts`; Impostazioni `worker/app-settings.v1.1.0.ts`.
- **Nessuna chiamata ripetuta:** prima di inviare un'immagine il server registra lo slot in `auto_attempted`; una seconda richiesta per
  lo stesso slot, anche dopo un esito incerto, è rifiutata (409) senza chiamate. Le richieste che la rotta dello studio rifiuterebbe
  comunque (senza conferma, qualità non ammessa, prompt mancanti, chiave OpenAI assente) non consumano lo slot. I prompt di un batch
  automatico si scrivono una volta sola; slot e prompt non si modificano; lo studio non elenca i batch automatici.
- **Ripresa:** alla riapertura della dashboard un batch `running` riprende dagli slot non ancora inviati, poi completa copia e analisi
  delle immagini generate che ne sono prive (l'analisi solo se mai chiesta). Prompt rimasti `running` per oltre 10 minuti contano
  come esito incerto: il batch si ferma.
- **Rilevazione:** il riquadro rilegge la proposta dopo ogni richiesta riuscita della dashboard che modifica la libreria (tutte le
  richieste diverse da GET verso `/api/admin/library`, escluse quelle del batch stesso, copie e analisi), oltre che all'apertura.
- **Fine del batch:** `finish` quando ogni slot è stato inviato, `stop` per «Interrompi» o per un problema dell'account OpenAI; in
  entrambi i casi il batch passa a `review` e si chiude alla prima lettura in cui non ha più immagini nuove (subito, se non ne ha).
- **Revisione:** il filtro del Database usa `?batch=` sull'elenco della libreria; il prompt si legge nel dettaglio dell'immagine, come
  per ogni SLOP.
- **Verifiche:** `tests/slop-auto.v1.0.0.test.ts`, `tests/slop_auto.v1.0.0.integration.py`, `tests/slop_auto_browser.v1.0.0.integration.py`
  (desktop e mobile), `tests/stats.v1.1.0.integration.py` (nuove chiavi delle Impostazioni); `scripts/integration.py` 2.8.0 li esegue per
  ultimi, perché spostano nel cestino le immagini dei test precedenti.
