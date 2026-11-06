---
version: 1.0.0
created_at: 2026-11-06T19:20:00Z
status: five-candidates-ready-for-individual-owner-review
source_issue: 56
---

# Verifica documentale e visiva del pilota REAL

Il proprietario ha autorizzato a proseguire dopo il pilota GPT: verifica delle
fonti/licenze, profili visivi e preparazione della review individuale, integrazione
del codice. Le approvazioni delle singole immagini non sono ancora state date.

## Decisioni e impatto prima del completamento

- La PR #58, audit documentale, è integrata in main al commit `a896b42` dopo
  controlli GitHub riusciti. La #59 è stata portata su main come base.
- Le fonti delle 29 candidate sono riesaminate tramite API Commons: revisioni
  complete, EXIF, dichiarazione d'autore, licenze e storia dei file. Gli errori
  di parametri nelle prime due richieste gratuite sono conservati; le richieste
  corrette non modificano i ricevuti del benchmark iniziale.
- Cinque fotografie hanno documentazione sufficiente per un profilo assistito.
  Una licenza CC BY 2.0 esplicita nella pagina non era presente nel campo API:
  la scelta è documentata, senza cambiare metadati o conteggi storici.
- L'attestazione indica Codex come revisore documentale assistito, non impersona
  il proprietario. Conferma umana dei diritti e approvazione editoriale restano
  pendenti prima dell'ammissione/pubblicazione.
- I profili usano solo pixel finali e rubrica, con massimo cinque chiamate nuove,
  ricevute e ledger locale esistenti; tetto cumulativo di prenotazione 1 USD.
- Una fotografia JPEG da smartphone è identificata da Pillow come MPO perché
  include un'immagine ausiliaria. Il lettore condiviso deve accettare questo
  contenitore JPEG, conservare tutti i byte e descrivere la selezione del frame
  principale nella presentazione. Non cambiare anteprime storiche; continuare a
  rifiutare GIF/altri formati e rispettare i limiti di byte/pixel. Test: originale
  MPO con due frame preservato, anteprima della foto principale, nessun crop.
- I cinque profili reali dichiarano spontaneamente punteggi sulla scala 0–1,
  mentre lo schema consente valori 0–100. Le ricevute restano intatte; non si
  reinterpretano silenziosamente i numeri e non si applicano soglie di ammissione.
  Le istruzioni per i profili futuri ora indicano esplicitamente punti 0–100 e
  valenza -1–1. Nessuna nuova inferenza è avviata soltanto per cambiare scala.

## Esiti sulle 29 candidate

| Classificazione | Numero | Trattamento |
| --- | ---: | --- |
| Documentazione assistita e profilo completati | 5 | In attesa del proprietario |
| Diritti o autore/origine da chiarire | 12 | Private, nessuna nuova licenza assegnata |
| Scansioni, disegni o documenti | 6 | Fuori dalla shortlist fotografica |
| Opere isolate o micrografie senza contesto richiesto | 4 | Fuori dalla shortlist per criterio editoriale |
| Ulteriore prova d'origine necessaria | 1 | Data EXIF antica ma disponibilità osservata solo dal 2026 |
| Originale oltre i limiti tecnici | 1 | 23.829.875 byte e 30.105.600 pixel; conservati riferimenti e motivazione |

I cinque originali selezionati sono scaricati e confrontati con lo SHA-1
dell'API; lo SHA-256 accompagna originale e copia finale. Nessun ritaglio,
restauro o modifica semantica. Il contenitore MPO conserva entrambi i frame
nell'originale; la copia per la valutazione usa il principale e lo dichiara.
La normalizzazione dei link CC0 HTTP→HTTPS conserva la stessa identità, senza
riscrivere le ricevute delle ricerche.

Le cinque risposte GPT sui soli pixel risultano fotografiche e utilizzabili.
Non sono approvazioni umane né dimostrazioni dell'origine. La galleria privata
e i dossier mostrano le cinque copie numerate, autori, licenze esatte, prove e
incertezze; le decisioni esportate includono SHA, revisione e nome del revisore.
Mappa privata di instradamento alle tre cartelle d'origine conservata nel run.
Nessuna scelta del proprietario è stata inventata o registrata come già data.

Il benchmark iniziale rimane 11/19 file per braccio. La verifica successiva è
parziale e separata: tre dossier del braccio generale e due dell'adattato.
Non attribuire le differenze a efficacia statistica: il campione è piccolo e le
altre candidate non sono tutte definite non licenziabili, alcune restano pendenti.

## Budget e prove

Cinque nuove inferenze visive, nessun reinvio della prima già salvata durante
le riprese. Ledger D1 locale: 18 prenotazioni complessive, 0,73 USD entro il
tetto cumulativo di 1 USD. Sono inclusi il primo tentativo di planning invalido,
le dodici risposte A/B valide e i cinque profili. La stima del costo dai token
è circa 0,0352 USD; l'addebito effettivo non è attestato. Rapporto aggiornato:
[benchmark-gpt-commons.v1.1.0.json](benchmark-gpt-commons.v1.1.0.json).

`npm test`: 18 file Node e 210 test Python passati; 38 test REAL mirati passati
dopo l'ultima modifica della rubrica. Integrazione locale `ROS_TEST_V2=1` passata,
con dossier immutabili, D1/R2 privati, restore e budget atomici. Il nuovo test MPO
conferma originali e frame conservati, copia primaria e rifiuto dei GIF.

Openverse resta bloccato dalla challenge già documentata. Non sono stati
avviati altri tentativi di registrazione o messaggi pubblici. Nessuna immagine
del pilota è stata importata o pubblicata nel gioco; approvazione e conferma
dei diritti delle singole immagini restano il passaggio del proprietario.
