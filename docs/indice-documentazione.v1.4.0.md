---
version: 1.4.0
created_at: 2026-11-06T19:23:00Z
status: vigente
supersedes: indice-documentazione.v1.3.2.md
---

# Indice di autorità e conservazione

Stato riferito a main `67ecf49` e alle head rilevate nell'
[audit](audit-architettura.v1.0.0.md). [MASTER](../MASTER.md) sceglie le fonti
correnti; questo indice ne cataloga lo stato senza alterare gli originali.
Un front matter vecchio `not-deployed` o un resoconto di rilascio non certifica
il runtime attuale. Le versioni parziali `v1`, `v2` e i nomi con data già esistenti
sono conservati; i nuovi documenti usano SemVer senza date nel nome.

- **Vigente:** contratto o procedura attuale nel solo ambito indicato; nessun
  comando remoto diventa autorizzato perché documentato.
- **Proposta:** issue/branch non integrato o decisione ancora da revisionare.
- **Storica:** regola sostituita per nuovi cicli; codice compatibile può esistere.
- **Archivio:** evidenza, snapshot o risultato immutabile, non prescrizione.

## File in main

I link sono relativi a `docs/`; per i file misti lo stato è specificato per ambito.

| Fonte / versione | Stato e ambito | Sostituzione o relazione |
| --- | --- | --- |
| [AGENTS](../AGENTS.md), [MASTER](../MASTER.md), AGENTS 2.1.0 / MASTER 2.1.3 | Vigente: istruzioni e navigazione | Ingressi fissi; snapshot correnti [AGENTS 2.1.0](AGENTS.v2.1.0.md), [MASTER 2.1.3](MASTER.v2.1.3.md); 1.0.0 in archivio |
| [Audit](audit-architettura.v1.0.0.md), 1.0.0 | Vigente: fotografia tecnica, non adozione di feature | Aggiornamenti richiedono nuova versione; osservazioni legate agli SHA |
| [Piano integrazione](piano-integrazione-editoriale.v1.0.0.md), 1.0.0 | Proposta | Ordine e contratti per le PR successive #57/#56 |
| [Checklist issue](checklist-issue-codex.v1.0.0.md), 1.0.0; questo indice | Vigente: lavoro futuro e catalogazione | Nessuna sostituzione di contratti applicativi |
| [Protocollo editoriale](protocollo-editoriale.md), versione interna 3.0.0 | Vigente: metodo dei nuovi cicli | Sostituisce metodo v1/v2, non lo schema dati 2.0.0 |
| [Criteri editoriali](criteri-editoriali.md), senza SemVer | Vigente: contesto e opere in main | Modifiche #55 non ancora adottate in main |
| [Crop Terra](cropping-assistito-v2.md), nome v2, senza SemVer completo | Vigente: presentazione 1024×1024 e revisione del crop | Supera centro come default; dati del pilota nel testo sono archivio |
| [Scoperta multicanale](scoperta-multicanale-v2.1.0.md), 2.1.0 | Vigente: collector di supporto; risultati live sono archivio | Query comuni oggi, adattamento provider #56 proposto |
| [Licenze](licenze-immagini.md), senza SemVer | Vigente: identità e obblighi | `shared/licenses.json` comune Python/TS; non prova autenticità |
| [Fonti REAL](fonti-immagini-real-v1.0.0.md), 1.0.0 | Vigente: riferimenti a fonti/diritti compatibili | Non adottare vecchie prescrizioni di difficoltà contro gioco e metodo v3 |
| [Inbox](coda-revisione-unica.md), senza SemVer | Vigente: review individuale | Non sostituisce gate documentali o pubblicazione |
| [Archivio generazioni](archivio-privato-generazioni-v1.0.0.md), 1.0.0 | Vigente: archiviazione privata e migrazione 0012 | Lo stato storico di rilascio nel front matter non è readiness corrente |
| [Somiglianze](controllo-somiglianze-v1.md), nome v1 | Vigente: nuovo contratto hash/DINOv2 per origine | Non sovrascrive dHash storici; soglie non sono certezza di duplicazione |
| [Tempi/protezione](gioco-tempi-protezione-v1.0.0.md), 1.0.0 | Vigente: timer per immagine e PvP sospeso | Supera countdown complessivo e disponibilità PvP nelle specifiche anteriori |
| [Precaricamento](precaricamento-immagini-v1.0.0.md), 1.0.0 | Vigente: ready/decode/cache; storica la durata totale e il PvP pubblico | Tempi/protezione prevale per modalità/deadline attuali |
| [Sampling v2](campionamento-stratificato-v2.0.0.md), 2.0.0 | Vigente solo monete indipendenti/capacità/strati compatibili; storica difficoltà | 0007/0008 e metodo v3 superano parti editoriali |
| [Digital Gallery](digital-gallery-v1.0.0.md), 1.0.0 | Vigente: design e font | Non implica che tutti i flussi storici siano ancora disponibili |
| [Metadati](metadati-editoriali-v1.0.0.md), 1.0.0 | Vigente: scheda privata compatibile; storica difficoltà/pubblicazione individuale | Migrazioni 0007/0008 e protocollo corrente prevalgono |
| [Cloudflare](cloudflare.md), senza SemVer | Vigente: procedure/config; diagnosi iniziale `a5a04d0` storica | Usare `wrangler.jsonc` effettivo, non dedurre che main contenga ancora solo README |
| [Importazione R2](importazione-diretta-r2.md), senza SemVer | Vigente: quarantena/upload esplicito | Non approva né pubblica; niente uso di credenziali non autorizzato |
| [Specifica generale](specification-v1.1.0.md), 1.1.0 | Storica, parti compatibili solo come contesto | Gioco, sampling e metodo editoriale correnti prevalgono |
| [Istruzioni tema/preload](istruzioni-codex-tema-precaricamento-v1.0.0.md), 1.0.0 | Storica: prompt di implementazione completato | AGENTS sostituisce istruzioni operative generali; Gallery/preload sono i contratti |
| [Sampling v1](campionamento-stratificato-v1.0.0.md), 1.0.0 | Storica: quote per partita superate | Sampling v2 e test statistici |
| [Selezione REAL](protocollo-selezione-real-v1.0.0.md), 1.0.0 | Storica: livelli/quote editoriali | Metodo v3 e sampling v2; diritti compatibili restano necessari |
| [Generazione SLOP](protocollo-generazione-slop-v1.0.0.md), 1.0.0 | Storica: template/difficoltà | Prompt originale e freeze v3 |
| [Studio v1](studio-generazione-slop-v1.0.0.md), 1.0.0 | Storica: studio/manuale e template precedenti | Inbox e metodo v3; codice manuale compatibile non è il default |
| [Studio v2](studio-generazione-slop-v2.0.0.md), 2.0.0 | Storica: sorgente fotografica e graduatoria v1 | Inbox/archivio correnti, nessuna derivazione REAL→SLOP nei nuovi cicli |
| [Pipeline v1](pipeline-editoriale-real-slop-v1.0.0.md), 1.0.0 | Storica: ranking e reinterpretazione | Metodo v3; API/ledger legacy restano per compatibilità |
| [Pipeline v2](pipeline-editoriale-real-slop-v2.0.0.md), 2.0.0 | Storica: metodo a popolazioni separate/Batch | Metodo v3; JSON/validatori dati 2.0.0 restano attuali |
| [Batch](pipeline-batch-openai-v1.0.0.md), 1.0.0 | Storica per nuovi cicli; riferimento vigente per recupero legacy | Non usare Batch come trasporto implicito v3 |
| [Affidabilità trasporto](affidabilita-trasporto-editoriale-v2.0.0.md), 2.0.0 | Vigente nel solo recupero/lease/prenotazioni legacy | V3 usa direct; non reimportare rubriche o workflow storici |
| [Coda automatica](coda-automatica.md), versione operativa interna 3.0.0 | Storica: orchestrazione v1/Batch, ancora presente nel workflow | Il rinvio iniziale a v2 come protocollo corrente è obsoleto: prevale v3. I gate del workflow restano da rispettare |
| [Review/preferenze](revisione-visiva-preferenze-v1.0.0.md), 1.0.0 | Storica per ranking/preferenze applicate ai nuovi cicli | Review umana resta, ma v3 non importa preferenze v1 |
| [Benchmark v2](benchmark-editoriale-v2.0.0.md), 2.0.0 | Storica: disegno dello studio; strumenti fixture ancora presenti | Non è requisito di generare 120/200 immagini per ciclo v3 |
| [Benchmark diretto](benchmark-diretto-v2.1.0.md), 2.1.0 | Storica: studio da 200 | Cicli v3 5/10, massimo 25/50; nessuna autorizzazione a nuova spesa |
| [Pilota v2](benchmark-editoriale-v2-pilota-2026-11-03.md) | Archivio: risultati del pilota | Nessun rinnovo dell'autorizzazione pagata originaria |
| [Benchmark 200](benchmark-200-risultati-2026-11-04.md), [metriche JSON](benchmark-200-metriche-2026-11-04.json) | Archivio: risultati e misure | Conservare senza inferire efficacia educativa o approvazioni |
| [Pilota brief](pilota-brief-condivisi-2026-11-04.md) | Archivio: evidenze v3 e giudizi | Non è fonte di prompt da derivare dai pixel REAL |
| [Verifiche](verification.md), senza SemVer | Archivio: prove/rilasci e limiti per fase | Baseline #57 nell'audit; nessuna attestazione del runtime remoto attuale |
| [Preview esempio](preview.example.jsonc) | Proposta: configurazione con segnaposto | Non copiare ID/risorse non verificate nella config attiva |

## Cataloghi, codice e proposte fuori main

`data/editorial/briefs.v1.json` è il catalogo corrente draft, non immagini
approvate; `shared/editorial-v2.json` è il contratto dati corrente. I file fixture
in `tests/` sono evidenze di test, non fonti di norme editoriali autonome.
README/CHANGELOG descrivono anche periodi storici: i link di ingresso a MASTER
e questo indice prevalgono come navigazione, senza eliminare la cronologia.

| Fonte esterna a main | Stato | Relazione proposta |
| --- | --- | --- |
| [PR #51](https://github.com/rickymusu-bit/real-or-slop/pull/51): catalogo inglese 1.1.0, indice/rapporti 1.0.0 | Proposta; rapporti sono archivio nel branch | Migrazione inglese conserva seed italiano/ID; nessuna adozione automatica |
| [PR #52](https://github.com/rickymusu-bit/real-or-slop/pull/52): varietà/rapporti 1.0.0 | Proposta; rapporti/CSV sono archivio nel branch | Estende #51, diagnostica indipendente |
| [#53](https://github.com/rickymusu-bit/real-or-slop/issues/53) / [PR #55](https://github.com/rickymusu-bit/real-or-slop/pull/55): protocollo 4.0–4.3, cataloghi/freeze/mapping | Proposta rispetto a main; snapshot precedenti sono archivio nel branch | 4.3 eredita 4.2→4.1→4.0; conserva v3, nessuna riscrittura della storia |
| [PR #54](https://github.com/rickymusu-bit/real-or-slop/pull/54): swipe 1.0.0 | Proposta indipendente | Nessuna autorità editoriale |
| [#56](https://github.com/rickymusu-bit/real-or-slop/issues/56) | Implementata nel branch dedicato basato su #58, non integrata/attivata | Nuovo percorso di discovery, contratti legacy preservati; pilota Commons live eseguito; dossier e studio fotografico pendenti |

I percorsi v4 e gli strumenti delle PR #51/#52 non si trovano in questo checkout:
leggerli con ref esplicita, come documentato nell'audit. Conservare originali,
cataloghi, freeze, licenze, giudizi e audit; non spostare file per rinominarli
retroattivamente secondo la nuova convenzione.

## Nuove fonti della #56

| Fonte | Stato | Ambito |
| --- | --- | --- |
| [Ricerca REAL 1.0.0](ricerca-real.v1.0.0.md) | Proposta implementata nella PR #56 | Contratti, CLI A/B, provider, migrazione e dismissione; nessuna attivazione |
| [Benchmark 1.0.0](benchmark-ricerca-real.v1.0.0.json) | Archivio fixture | Trasporti, immagini e giudizi sintetici, nessuna efficacia reale |
| [Verifica 1.0.0](verifica-ricerca-real.v1.0.0.md) | Archivio delle prove di questa consegna | Test e limiti osservati |

La 1.0.0 di questo indice rimane una fotografia della prima consegna #57.
Le istruzioni correnti 2.1.0 includono il nuovo percorso ma non rendono vigenti
in main le PR #51/#52/#55/#58 o la presente implementazione prima della revisione.

## Verifiche live successive

| Fonte | Stato | Ambito |
| --- | --- | --- |
| [Controllo Commons](benchmark-commons.v1.0.0.md) | Archivio di retrieval reale manuale | Aggiorna la diagnosi Commons: HTTP 200, query/bitmap controllati; nessun output GPT o giudizio umano |
| [Rapporto iniziale](benchmark-commons-control.v1.0.0.json), [rapporto bitmap](benchmark-commons-control.v1.1.0.json) | Archivio | Prima pagina, metadati e limiti; non resa editoriale approvata |
| [Accesso Openverse](openverse-accesso.v1.0.0.md) | Bloccato da challenge provider | Diagnosi ufficiale e bozza non pubblicata per scelta esplicita del proprietario |

I piani `data/editorial/commons-benchmark.v1.0.0.json` e
`data/editorial/commons-benchmark.v1.1.0.json` sono controlli manuali preregistrati,
non output da attribuire a GPT-6.1. I vecchi report 403/fixture rimangono conservati
come osservazioni del loro momento. Questa era l'attesa prima dell'autorizzazione successiva al pilota GPT, documentata
nel nuovo rapporto seguente; nessuna autorizzazione ereditata dai piloti storici.

## Completamento del ciclo

| Fonte | Stato | Ambito |
| --- | --- | --- |
| [Ciclo REAL](ciclo-discovery-real.v1.0.0.md) | Implementato nella PR #59, non attivato | Orchestrazione, feedback, dossier revisionati, galleria ed export privati; pilota da ricevute A/B |
| [Verifica ciclo](verifica-ciclo-real.v1.0.0.md) | Archivio delle prove locali | Gate, cache, SHA, ripresa e fixture; nessuna nuova misura di efficacia fotografica reale |

La versione 1.2.0 e gli snapshot AGENTS/MASTER precedenti restano conservati.

## Pilota GPT reale

| Fonte | Stato | Ambito |
| --- | --- | --- |
| [Pilota GPT Commons](benchmark-gpt-commons.v1.0.0.md), [JSON](benchmark-gpt-commons.v1.0.0.json) | Archivio di esecuzione autorizzata | Dodici risposte valide A/B più un tentativo invalido conservato; retrieval 11/19, documenti e review rinviati |
| [Registrazione Openverse](openverse-registrazione.v1.0.0.md) | Guida operativa | Registrazione da completare con email del proprietario, nessun secret nel documento |

## Tentativo di registrazione successivo

[Esito Openverse](openverse-registrazione-esito.v1.0.0.md): email scelta dal
proprietario, un POST di registrazione ufficiale, HTTP 403/challenge prima della
creazione del client. Nessun ID/secret ricevuto e nessuna segnalazione pubblicata.

## Verifica documentale e visiva successiva

[Esiti sulle candidate](verifica-documentale-real.v1.0.0.md),
[metriche 1.1.0](benchmark-gpt-commons.v1.1.0.json): archivio della verifica
assistita delle fonti, cinque profili visivi e dossier in attesa del proprietario.
La PR #58 è integrata; integrazione #59 autorizzata, consultare la PR per l'esito
corrente. Nessuna immagine ammessa/pubblicata senza scelta individuale e conferma
umana dei diritti. Versioni precedenti dell'indice e dei rapporti conservate.
