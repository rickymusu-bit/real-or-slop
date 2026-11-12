# Proposta di generazione delle SLOP — specifica 1.0.0

Stato: **proposta, in attesa di approvazione dell'owner**. Nessun codice prima dell'approvazione.
Creata: 2026-11-12T19:24:48Z. Sostituisce `docs/proposta-e-prefiltro-slop.v1.0.0.md` (storico), da cui toglie il prefiltro e l'indice di
ingannabilità. Estende `docs/wizard-slop.v1.4.1.md` (sezioni 2, 3 e 8) e `docs/statistiche-impostazioni.v1.0.1.md` (sezione 2).

## 1. Decisioni dell'owner (2026-11-12)

- Nessuna generazione a tempo: il sistema **propone** una generazione quando lo spread di un tag supera una soglia, tenendo conto anche
  delle REAL approvate. L'owner decide se generare, quindi ogni chiamata a pagamento resta confermata come oggi.
- **Nessun prefiltro** e nessun indice di ingannabilità. Le immagini facili non si scartano: un prefiltro servirebbe solo a far
  rispettare le linee guida del sito, e le linee guida sono già nel contesto con cui si scrivono i prompt delle SLOP.

## 2. Proposta di generazione

**Spread netto** di un tag: REAL approvate o pubblicate con il tag, meno SLOP approvate o pubblicate con il tag (lo spread attuale dello
studio), meno **SLOP nuove** non ancora revisionate con il tag. Per una SLOP nuova valgono i tag dell'analisi; se l'analisi manca,
i tag del tema dello slot. Senza questa sottrazione lo stesso tag resterebbe sopra soglia, e quindi riproposto, finché l'owner non
revisiona le SLOP già generate. Le SLOP nel cestino non contano.

Un tag è **proposto** se valgono insieme:

1. spread netto ≥ **soglia di proposta** (Impostazioni, predefinita 10, da 1 a 200);
2. il tag, usato da solo come tema, supera la soglia del tema dello studio (REAL con il tag ≥ 10 nella configurazione attuale);
3. lo studio SLOP è aperto (soglia delle 50 REAL);
4. il tag non è stato ignorato, oppure il suo spread netto è cresciuto di almeno 5 da quando è stato ignorato.

**Dove compare.** Il calcolo è una lettura del database, gratuita, fatta all'apertura della dashboard e della sezione Generazione SLOP:
nessun processo in background. La sezione Generazione SLOP mostra un indicatore con il numero di proposte; la pagina 1 dello studio
le elenca sopra il grafico, al massimo 5, ordinate per spread netto:

> `architecture`: 14 REAL in più delle SLOP, 3 SLOP in attesa di revisione → **Prepara 10 SLOP**, **Ignora**

- **Prepara** apre la pagina 1 con il tag come tema e il numero di immagini pari allo spread netto, al massimo 10. L'owner può cambiare
  tema e numero; da lì il percorso è quello dello studio, con le stesse conferme.
- **Ignora** registra tag e spread netto del momento; la proposta ritorna solo se lo spread netto cresce di almeno 5.

## 3. Conferme

Nessuna modifica alla sezione 8 di `docs/wizard-slop.v1.4.1.md`: la proposta è gratuita e nessuna chiamata parte senza la conferma
dell'owner nello studio.

## 4. Dati

Migrazione additiva `0045_slop_proposals.v1.0.0.sql`: tabella `slop_proposal_ignored` (tag, spread netto al momento, data) e chiave
`slop_proposal_threshold` in `app_settings` (predefinita 10). API `GET /api/admin/slop/proposals` (gratuita) e
`POST /api/admin/slop/proposals/ignore`. Le Impostazioni aggiungono la soglia di proposta accanto alle soglie dello studio.

## 5. Linee guida senza prefiltro

Le regole della sezione 11.1 di `docs/libreria-immagini.v1.8.0.md` arrivano al modello che scrive i prompt, non al generatore di
immagini, che riceve solo il testo del prompt (sezione 6 di `docs/wizard-slop.v1.4.1.md`). Il rispetto delle regole si regge quindi
su tre passaggi già esistenti: il contesto «Prompt per le SLOP», la rilettura dei prompt da parte dell'owner (pagina 3) e la revisione
di ogni immagine prima dell'approvazione (pagina 5), dove i casi dubbi li decide l'owner, oltre alle regole d'uso del generatore.
Ciò che il generatore aggiunge di suo, come un volto simile a una persona reale o le scritte di un manifesto, si intercetta solo in
revisione.

## 6. Verifiche

- Test unitari: spread netto (SLOP nuove con tag dell'analisi o dello slot, cestino escluso), condizioni della proposta, ritorno dopo
  «Ignora», numero proposto, soglia.
- Test d'integrazione: proposte con dati di prova, «Ignora», soglia dalle Impostazioni, apertura dello studio con tema e numero
  precompilati. Nessuna chiamata a pagamento.
- Interfaccia nel browser su desktop e mobile: indicatore nella sezione, elenco delle proposte, Prepara e Ignora.
