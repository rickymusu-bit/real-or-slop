---
version: 1.0.0
created_at: 2026-11-06T13:42:06Z
status: proposta
supersedes: null
source_issues: [57, 56]
---

# Piano di integrazione e refactoring minimo

È una proposta fondata sull'[audit](audit-architettura.v1.0.0.md), non
un'autorizzazione a modificare, chiudere, rebasare o integrare PR remote.
Le head sotto sono quelle verificate nell'audit: ricontrollarle prima di agire.
Il main corrente e le sue fonti sono identificati da [MASTER](../MASTER.md).

## Sequenza sicura

| Lavoro | Azione proposta | Condizione e verifica |
| --- | --- | --- |
| #57, prima PR su main | Consegnare audit, AGENTS/MASTER e snapshot, indice, checklist e questo piano; nessuna feature | Revisione di fonti, conflitti e ordine. Non usare `Closes #57`: Fase C e #56 restano successive |
| #51 (`16e9efd`, base main) | Mantenere catalogo inglese, mapping immutabile e indice locale; revisione autonoma | Dopo aggiornamento main, rebase soltanto se necessario e autorizzato al lavoro sulla PR. Nessun encoder obbligatorio nel retrieval #56; rieseguire suite e sei test Python versionati espliciti |
| #52 (`822b315`, base #51) | Mantenere metriche/report indipendenti; attendere #51 | Dopo integrazione approvata #51, proporre rebase/retarget su main; verificare delta senza duplicare commit. Indice e clustering restano diagnostici |
| #55 (`0577284`, base #52) | Sospendere l'estensione della discovery e l'adozione integrale fino alle decisioni #56; conservare tutto il lavoro | Dopo #51/#52, aggiornare base soltanto con revisione. Nessun merge automatico della catena. Separare review di contratti, UI/pubblicazione e discovery |
| #55, contratti riusabili | Mantenere tassonomia/ID, freeze, ricevute, eventi/replay, audit, distinzione review/pubblicazione | Rivedere compatibilità con intensità/intenzione e classificazione effettiva; non estendere in-place schema/eventi 4.0.0 |
| #55, policy indipendenti | Separare in PR revisionabili caption/timer, whole-frame, licenza SLOP e ricette se si decide di adottarle prima di #56 | Non sono cherry-pick automaticamente autonomi: caption tocca game/room/review/0018, licenza tocca generazione/pubblicazione. Dichiarare dipendenze e rieseguire integrazioni dedicate |
| #55, catalogo precompilato/scheduler | Conservare come baseline e archivio; superare solo il percorso di nuovi run scelto per #56 | Nessuna cancellazione dei cataloghi 4.0–4.3, niente intensità inventate su eventi/freeze vecchi. Nessun apprendimento da errori di retrieval come rifiuti umani |
| #54 (`a80a556`, base main) | Mantenere indipendente, fuori dalla catena editoriale | Swipe non richiesto da #56; eventuali conflitti README/CHANGELOG e `src/play.ts` con caption si risolvono separatamente. Non riattivare PvP |
| #56 | Specificare nuovo contratto, poi fixture/adapter e orchestrazione in piccole PR | Base effettivamente integrata da ricontrollare; nessuna assunzione che #55 sia in main. Benchmark e attivazione successivi e separati |

Se #51/#52 non sono integrate, #56 non deve importarle implicitamente: può
progettare adapter indipendenti su main, con un'interfaccia di collegamento al
freeze v4 proposta. Se una dipendenza è necessaria al codice consegnato,
dichiarare la base dedicata e mantenere il delta revisionabile. Nessuna modifica
remota delle PR esistenti è compiuta dalla #57.

## Decisioni da fissare nella specifica #56

1. **Schema nuovo:** intenzione tema/emozione/intensità con versione e combinazioni
   non significative; neutralità non riceve automaticamente tre intensità. ID
   legacy a due assi rimangono validi nel loro schema; intensità assente è unknown,
   non medium. Multi-emozione/valenza/intensità osservate sono campi distinti.
2. **A/B distinti:** A produce strategie inglesi concrete per intenzione; B riceve
   una strategia e un profilo provider versionato. Conservare modello concreto,
   istruzioni, input/output, revisioni, timestamp, hash e seed se supportato;
   `GPT-6.1` nella issue non autorizza un fallback implicito o una chiamata pagata.
3. **Freeze:** creare intenzione e piano SLOP autonomo prima del primo retrieval
   REAL. Il dettaglio iniziale proposto è un envelope con due input separati:
   `search_intent` e `slop_plan`, entrambi hashati prima della biforcazione.
   B e la ricerca possono proseguire sul solo ramo REAL. Nessun feedback REAL
   modifica un prompt SLOP già congelato; una nuova ideazione richiede nuova revisione.
4. **Scheduler:** l'esplorazione con resa/novità non impone copertura uniforme delle
   432 combinazioni. Il vincolo sui margini di #53 va esplicitamente superato nel
   nuovo scheduler, non disattivato nei replay v4. Nessuna quota per partita.
5. **Ammissibilità:** #56 parla di fotografie; la #55 ammette anche opere documentate.
   Specificare scope del nuovo collector fotografico senza ritirare o riclassificare
   opere archiviate. Whole-frame, caption e licenza restano decisioni separate.
6. **Feedback:** distinguere zero hit, HTTP/rate limit, risultati parziali, diritti
   insufficienti, origine incerta, duplicati e giudizio umano. Pending/unknown
   non diventano zero o rifiuto; l'intenzione resta immutabile anche se la foto
   viene classificata altrove. Anno precedente per cronaca è strategia, non veto.

## Confini candidati e piano di file

Nomi nuovi indicativi, da confermare nella specifica SemVer successiva. Non sono
file implementati in main. Il beneficio richiesto è isolare output GPT da HTTP e
riusare journal/storage senza estendere la funzione monolitica `collect`.

| Passaggio | Input → output proposto | File proprietari da riusare/aggiungere | Dipendenze vietate / compatibilità |
| --- | --- | --- | --- |
| Selezione intenzione | Tassonomia/replay/seed → `SearchIntent` versionato | Riuso tassonomia #55 se adottata; nuovo `shared/real-discovery.v1.0.0.json` e validatori `pipeline/v2/real_contract.py`, `shared/real-discovery.v1.0.0.ts` | Non mutare `editorial-v2.json` o ID 4.0.0; nessun esito inventato |
| Strategie A | `SearchIntent` + istruzioni → `StrategyRevision[]` | Nuovo `pipeline/v2/search_strategy.py`, riuso API diretta e ledger esistenti | Non leggere immagini o dossier REAL per ideare SLOP; cache lega revisione/modello/hash |
| Adattamento B | Strategia + `ProviderProfile` → `AdaptedQueryRevision[]` | Nuovo `pipeline/v2/provider_query.py`; profili SemVer Commons/Openverse | Output linguistico non può essere un URL/parametro HTTP arbitrario; rifiutare campi sconosciuti |
| Validazione deterministica | Query strutturata + capability verificate → richiesta tipizzata | Riuso `search_sources.py`, `providers.py`; adapter sottili Commons/Openverse | Codice sceglie host/endpoint/parametri; categoria/ID richiede risoluzione verificata o fallback testuale esplicito |
| Retrieval | Richiesta validata + limiti/journal → `RetrievalOutcome` | Riuso `SearchClient`, `discovery.collect` tramite nuovo runner/entrypoint versionato | Stati `completed_zero`, `completed`, `partial`, `rate_limited`, `error`, `uncertain`; nessun retry implicito su resume |
| Dossier documentale | Hit + fonte originaria + evidenze → ammissibile/privato con motivi | Riuso `run.ingest`, `licenses.py`, `importer.py`, `protocol.provenance` | Openverse è un indice; `license_url` normalizzato non prova autenticità o diritti completi |
| Shortlist e profilo cieco | Candidate documentabili + byte finali → 3–5 se disponibili e profili osservati | Riuso direct/`vision_payload`, schema profilo da estendere separatamente se necessario | Nessun titolo, autore, URL, origine, intended emotion o licenza nel payload VLM; nessuna soglia obbligatoria match cella |
| Revisione/storage | Candidata + evidenze/profilo separati → decisione esplicita auditata | Riuso Worker v2, inbox, hash, CAS/lease, D1/R2; collegamento eventi #55 se adottato | Nessun publish dalla nuova discovery, nessuna modifica a game/sampling o a giudizi storici |

Il ramo SLOP termina nel generatore con il solo prompt originale congelato.
Non accetta `RetrievalOutcome`, shortlist, titoli, metadati o profili REAL.
Origine/licenza e profilo visivo restano oggetti separati anche nello storage.

I profili provider vanno verificati sulle API ufficiali effettive prima del live:
in main Commons compone `action=query`, `generator=search`, namespace 6,
`imageinfo`; Openverse compone `q`, `page_size` e opzionalmente `source`.
Questo è ciò che fa il codice, **non** una certificazione di tutte le capacità
API correnti. Nessun elenco di filtri inventato da GPT. Registrare versione/fonti
del profilo e fixture HTTP; benchmark live solo con autorizzazione pertinente.

## PR successive e gate di verifica

| Consegna successiva | Delta minimo motivato | Protezione richiesta prima di estendere |
| --- | --- | --- |
| 2: contratti e fixture #57 Fase C | Envelope nuovi separati dai contratti legacy, profili provider e casi condivisi Python/TS; nessuna nuova inferenza | Stessi esempi validi/invalidi in Python/TS; nessuna approvazione implicita; baseline completa invariata |
| 3: adapter e refactoring mirato | Isolare compilazione richiesta e risultato provider dal journal in `collect`; condividere normalizzazione Openverse solo se utile ai due chiamanti | Test HTTP con opener fittizio, zero hit vs errore, 429/Retry-After, parziali, call limit e checkpoint interrotto; preservare piano legacy |
| 4: #56 A/B e orchestrazione | Strategie, adattamento/cache e shortlist con API finte; nuovo runner usa i confini precedenti | Tutti i casi sotto, fake ledger e resume senza nuovi invii; niente feature del gioco |
| 5: benchmark/adozione | Specifica approvata, confronto pari budget e giudizi umani; attivazione distinta | Resa di REAL documentabili/interessanti, costi e bias, non solo numero hit. Nessun risultato fixture prova efficacia reale |

Fixture mancanti da aggiungere nelle PR 2–4, non in questa consegna documentale:

- Stessa strategia `wild animals rescued during natural disasters` → Commons
  `animal rescue flood`, Openverse `wildlife rescue`; nessuna uguaglianza forzata.
- Output GPT malformato, chiavi/filtri inventati, categoria o Wikidata ID inesistente,
  endpoint arbitrario e profilo provider incompatibile: nessuna richiesta emessa.
- Zero risultati, 403, timeout, 429, 5xx dopo risultati parziali, interruzione prima
  dell'ack e ripresa: dati conservati, costi distinti, nessun nuovo invio implicito.
- Licenza ambigua/origine non verificata/landing originale irraggiungibile:
  candidata privata; nessun titolo o intended emotion nel profilo cieco.
- Riferimenti REAL aggiunti al piano SLOP, prompt modificato dopo il freeze,
  risultato di retrieval passato al generatore: rifiuto prima dell'API; confronto
  hash e payload generazione identici fra freeze e ricevuta.
- Neutralità/non significativo, multi-emozione, fuori intenzione valido,
  deduplica per origine, shortlist con meno di tre candidate senza filler,
  review pending e assenza del partner: nessun rifiuto o approvazione inventato.
- Replay/migrazione preservano tutti gli eventi 4.0.0 e checkpoint v2/v3/v4;
  nessuna intensità inferita retroattivamente, scoring e probabilità gioco invariati.

Non serve ora un modulo universale di pipeline, un nuovo framework, riscrivere
frontend/crop/Batch o uniformare dHash. Qualsiasi estrazione ulteriore deve citare
il chiamante reale, il beneficio e la fixture che ne protegge il confine.

## Compatibilità, migrazione e rollback proposti

I run storici sono selezionati per versione/trasporto e restano sul proprio
esecutore. Il nuovo runner non riprende un vecchio journal con query/limiti diversi.
Cache e revisioni append-only includono hash di strategia, profilo, istruzioni e
parametri validati. Nessun cambio di schema obbligatorio per consegnare l'audit;
eventuali nuove tabelle/colonne saranno additive e provate con fixture locali.

Rollback futuro: fermare nuovi run del nuovo percorso, mantenere lettura di
checkpoint/ledger ed evidenze, tornare al runner precedente per nuovi cicli
esplicitamente compatibili. Non cancellare dati e non riaprire gate pagati per
completare un rollback. Provare in locale prima di proporre azioni remote.
