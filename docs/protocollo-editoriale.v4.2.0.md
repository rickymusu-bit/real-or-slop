# Protocollo editoriale v4.2.0

Revisione del 2026-11-06. Eredita dalla [v4.1.0](protocollo-editoriale.v4.1.0.md)
fotogrammi interi, formato automatico, contesto tramite didascalia e licenza
SLOP CC BY 4.0 con attribuzione. Introduce una scelta compositiva indipendente
prima della ricerca REAL, senza cambiare tassonomia o scoring del gioco.

## Correzione della cella divertimento / prodotti e consumi

Il vecchio aspirapolvere del pilota era stato cercato attraverso un brief
generico su un oggetto domestico usato accanto al suo ripostiglio. Quel brief
aveva già l’intenzione `amusement:products_consumption`, senza definire un
motivo osservabile di umorismo. L’immagine non è quindi una corrispondenza
emotiva confermata: il sistema ha conservato l’intenzione della ricerca.

La revisione 3 del catalogo riscrive i due draft di questa cella: un piccolo
scherzo visivo formato da contenitori domestici e l’uso giocoso di un oggetto
come accessorio improvvisato di un costume. Il motivo è ora nella descrizione
e nel prompt; resta una proposta editoriale da verificare, non una prova che
il proprietario o i giocatori proveranno divertimento.

L’aspirapolvere, i prompt precedenti e i freeze del pilota restano conservati.
Non si trasformano questo rilievo in un rifiuto dell’immagine o in una diversa
classificazione umana. Le altre bozze del catalogo restano da rivedere:
questa correzione non ne certifica la coerenza emotiva.

## Punto di vista e inclinazione

La policy `shared/editorial-composition.v1.0.0.json` distingue due fattori:

- punto di vista: frontale, obliquo all’altezza del soggetto, rialzato o ribassato;
- roll della camera: in piano oppure lieve inclinazione di circa sei gradi,
  in senso orario o antiorario.

Quattro dei sei profili mantengono la camera in piano. Una vista obliqua può
quindi avere un orizzonte diritto. Il piano usa un mazzo di sei profili
mescolato con seed, ripetuto solo dopo aver esaurito il mazzo: nel piano di
cinque brief si richiedono punti di vista diversi e almeno una lieve inclinazione,
senza imporre che tutte le SLOP siano storte. Non sono quote delle celle
emotive né una stima della distribuzione delle fotografie REAL.

La selezione dipende soltanto da count, seed e policy. Non legge fotografie,
angoli, titoli o metadati REAL, né la risposta emotiva. Istruzioni, profilo e
hash della policy sono congelati prima della ricerca. La direttiva entra nel
prompt text-only effettivamente inviato; non si ruota un output dopo averlo
generato. Per le opere piatte la direttiva non impone una cornice o stanza.

Il catalogo corrente è `briefs.v4.2.0.json`, con 288 draft alla revisione 3.
Il freeze comprende `composition-plan.v1.0.0.json` e il campo privato
`brief.composition`. Il Worker valida profilo, punto di vista e roll, mentre
la ricevuta AI continua a dover corrispondere al prompt congelato. Cataloghi
e cicli 4.0/4.1 rimangono leggibili, senza applicare loro nuove direttive.

Questi sono **target compositivi**, non angoli misurati nei pixel. Il profilo
visivo resta indipendente e la revisione del risultato rimane necessaria.
Nessuna nuova chiamata API serve per scegliere il profilo: è una variazione
del prompt della normale generazione. Le immagini del pilota precedente
non sono rigenerate da questa modifica.
