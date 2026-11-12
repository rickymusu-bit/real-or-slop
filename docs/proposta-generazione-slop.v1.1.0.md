# Proposta di generazione delle SLOP — specifica 1.1.0

Stato: **proposta, in attesa di approvazione dell'owner**. Nessun codice prima dell'approvazione.
Creata: 2026-11-12T19:05:00Z. Aggiornata: 2026-11-12T19:49:44Z (1.1.0: soglia in percentuale e numero di SLOP pari allo scarto;
precedente: `docs/proposta-generazione-slop.v1.0.0.md`). Sostituisce `docs/proposta-e-prefiltro-slop.v1.0.0.md` (storico), da cui toglie il prefiltro e l'indice di
ingannabilità. Estende `docs/wizard-slop.v1.4.1.md` (sezioni 2, 3 e 8) e `docs/statistiche-impostazioni.v1.0.1.md` (sezione 2).

## 1. Decisioni dell'owner (2026-11-12)

- Nessuna generazione a tempo: il sistema **propone** una generazione quando lo spread di un tag supera una soglia, tenendo conto anche
  delle REAL approvate. L'owner decide se generare, quindi ogni chiamata a pagamento resta confermata come oggi.
- **Nessun prefiltro** e nessun indice di ingannabilità. Le immagini facili non si scartano: un prefiltro servirebbe solo a far
  rispettare le linee guida del sito, e le linee guida sono già nel contesto con cui si scrivono i prompt delle SLOP.
- La soglia è una **percentuale di spread**: `spread_percent = 100 × (n_real − n_slop) / n_real`, predefinita **33%**, cioè 1,5 REAL
  per ogni SLOP con quel tag (con 15 REAL e 10 SLOP lo spread vale 33%; il 50% corrisponderebbe a 2 REAL per SLOP).
- Si propongono **n_real − n_slop** SLOP.

## 2. Proposta di generazione

**Conteggi** per ogni tag: `n_real` è il numero di REAL approvate o pubblicate con il tag; `n_slop` il numero di SLOP approvate o
pubblicate con il tag (come nello spread attuale dello studio) **più le SLOP nuove** non ancora revisionate. Per una SLOP nuova valgono
i tag dell'analisi; se l'analisi manca, i tag del tema dello slot. Senza le SLOP nuove lo stesso tag resterebbe sopra soglia, e quindi
riproposto, finché l'owner non le revisiona. Le SLOP nel cestino non contano.

**Spread percentuale:** `spread_percent = 100 × (n_real − n_slop) / n_real`. Vale 100% senza SLOP, 0% alla parità, ed è negativo
quando le SLOP superano le REAL.

Un tag è **proposto** se valgono insieme:

1. `spread_percent` ≥ **soglia di proposta** (Impostazioni, predefinita 33%, da 1% a 100%);
2. `n_real` ≥ soglia del tema dello studio (10 nella configurazione attuale): un tag con meno REAL non si può usare come tema, e con
   pochi numeri la percentuale oscilla troppo (2 REAL e nessuna SLOP valgono già 100%);
3. lo studio SLOP è aperto (soglia delle 50 REAL);
4. il tag non è stato ignorato, oppure il suo `spread_percent` è cresciuto di almeno 10 punti da quando è stato ignorato.

**Quante SLOP.** Lo scarto `n_real − n_slop`, cioè quante ne servono per arrivare alla parità. Lo studio genera al massimo 10 immagini
per gruppo, quindi uno scarto più grande si copre in più gruppi: «Prepara» propone le prime 10 e la proposta resta con il numero
aggiornato. Le SLOP appena generate contano subito come nuove, quindi lo scarto cala a ogni gruppo. Se la percentuale scende sotto la
soglia prima della parità, il resto non viene più proposto: per esempio con 30 REAL e 21 SLOP lo spread vale 30% e le 9 mancanti si
generano solo a mano dallo studio.

**Dove compare.** Il calcolo è una lettura del database, gratuita, fatta all'apertura della dashboard e della sezione Generazione SLOP:
nessun processo in background. La sezione Generazione SLOP mostra un indicatore con il numero di proposte; la pagina 1 dello studio
le elenca sopra il grafico, al massimo 5, ordinate per `spread_percent` e, a parità, per scarto:

> `architecture`: 24 REAL, 6 SLOP (2 in attesa di revisione), spread 75%, ne mancano 18 → **Prepara 10 SLOP**, **Ignora**

- **Prepara** apre la pagina 1 con il tag come tema e il numero di immagini pari allo scarto, al massimo 10. L'owner può cambiare
  tema e numero; da lì il percorso è quello dello studio, con le stesse conferme.
- **Ignora** registra tag e `spread_percent` del momento; la proposta ritorna solo se la percentuale cresce di almeno 10 punti.

## 3. Conferme

Nessuna modifica alla sezione 8 di `docs/wizard-slop.v1.4.1.md`: la proposta è gratuita e nessuna chiamata parte senza la conferma
dell'owner nello studio.

## 4. Dati

Migrazione additiva `0045_slop_proposals.v1.0.0.sql`: tabella `slop_proposal_ignored` (tag, `spread_percent` al momento, data) e
chiave `slop_proposal_threshold_percent` in `app_settings` (predefinita 33). API `GET /api/admin/slop/proposals` (gratuita) e
`POST /api/admin/slop/proposals/ignore`. Le Impostazioni aggiungono la soglia di proposta accanto alle soglie dello studio.

## 5. Linee guida senza prefiltro

Le regole della sezione 11.1 di `docs/libreria-immagini.v1.8.0.md` arrivano al modello che scrive i prompt, non al generatore di
immagini, che riceve solo il testo del prompt (sezione 6 di `docs/wizard-slop.v1.4.1.md`). Il rispetto delle regole si regge quindi
su tre passaggi già esistenti: il contesto «Prompt per le SLOP», la rilettura dei prompt da parte dell'owner (pagina 3) e la revisione
di ogni immagine prima dell'approvazione (pagina 5), dove i casi dubbi li decide l'owner, oltre alle regole d'uso del generatore.
Ciò che il generatore aggiunge di suo, come un volto simile a una persona reale o le scritte di un manifesto, si intercetta solo in
revisione.

## 6. Verifiche

- Test unitari: conteggi (SLOP nuove con tag dell'analisi o dello slot, cestino escluso), `spread_percent` (100% senza SLOP, 33%
  con 15 REAL e 10 SLOP, valori negativi), condizioni della proposta e minimo di REAL, ritorno dopo «Ignora», scarto e gruppi da 10.
- Test d'integrazione: proposte con dati di prova, «Ignora», soglia dalle Impostazioni, apertura dello studio con tema e numero
  precompilati. Nessuna chiamata a pagamento.
- Interfaccia nel browser su desktop e mobile: indicatore nella sezione, elenco delle proposte, Prepara e Ignora.
