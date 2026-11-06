# Criteri editoriali del proprietario

Revisione **4.2.0**, aggiornata dal proprietario il 2026-11-06 dopo il pilota.
Queste regole valgono per selezione REAL, brief, prompt SLOP, didascalie e copie
finali. Le decisioni restano individuali e del proprietario.

## Contesto nell’immagine o nella didascalia

Il contesto può essere fornito dall’immagine, dalla didascalia o da entrambe.
Non è obbligatorio mostrare l’ambiente circostante. Un soggetto isolato o una
riproduzione di un’opera non si escludono automaticamente per questa ragione.
Restano validi singoli soggetti, ritratti, dettagli e scene ordinarie.

Le didascalie REAL riportano soltanto informazioni documentate o contenuto
visibile: non inventano luoghi, epoche, autori o eventi per dare contesto.
Le didascalie SLOP mantengono separato il contesto sintetico. Ogni didascalia
richiede un giudizio autonomo riferito ai pixel effettivamente mostrati.

## Opere d’arte

Quadri, dipinti, illustrazioni e altre opere possono occupare il fotogramma.
Cornice, parete, stanza, distanza di ripresa e ambiente esterno non sono
requisiti di ammissione. Il tipo `artwork` e lo stile non fotografico non
costituiscono da soli un motivo di rifiuto.

Per REAL occorrono comunque origine umana documentata, attribuzione e diritti
compatibili, distinguendo quando necessario l’autore dell’opera dall’autore
della fotografia. La didascalia non certifica autenticità o diritti.

## Formato e fotogramma intero

Le nuove SLOP variano anche il punto di vista e l’inclinazione della camera,
secondo il [piano compositivo v4.2](protocollo-editoriale.v4.2.0.md). Le due
dimensioni restano distinte: una prospettiva obliqua non richiede un orizzonte
inclinato. Il piano si congela prima della ricerca, indipendentemente dalle
foto REAL, e viene realizzato dal generatore nel prompt.

Il tema dell’oggetto e l’emozione prevista sono valutazioni distinte. Un
oggetto vecchio o insolito non dimostra da solo divertimento: il brief deve
esplicitare un motivo visivo plausibile e il risultato richiede verifica.

Le REAL conservano il fotogramma intero e le proporzioni originali. Non si
esegue un ritaglio quadrato obbligatorio né una chiamata di selezione del taglio.
Sono consentiti orientamento EXIF, riduzione proporzionale senza ingrandimento,
compressione e conversione di formato, con originale conservato.

Il prompt SLOP lascia al generatore la scelta delle proporzioni più adatte.
La richiesta API usa `size: auto`; il formato effettivamente restituito viene
conservato, con le stesse operazioni proporzionali usate per le REAL. Il prompt
da solo non può annullare un formato fisso imposto dal parametro API.

I vecchi freeze, ritagli, profili e giudizi restano conservati. Le nuove copie
intere hanno hash e revisioni propri: profili o approvazioni di un ritaglio non
si trasferiscono automaticamente. Il rifiuto storico della sedia `brief-004`
resta una decisione del proprietario, senza nuove approvazioni dedotte dalla
modifica generale della regola.

## Confronto per la revisione

Quando disponibili, le due immagini associate allo stesso brief si presentano affiancate: REAL a
sinistra, SLOP a destra. Anche su schermi piccoli la coppia deve essere visibile
insieme. Si forniscono inoltre immagini di confronto già unite e un PDF.
Le immagini originali non vengono modificate per costruire questi confronti.
Ogni immagine nel PDF e nei pannelli deve riportare tema, emozione e ID della
casella assegnata dal brief. La classificazione effettiva resta distinta e va
indicata come da confermare finché il proprietario non l’ha confermata.
Le cartelle REAL/ e SLOP/ rimangono separate nello ZIP per consultazione.

Le preview vanno caricate nella cartella Google Drive dedicata
[Real or Slop — test e benchmark protocollo editoriale](https://drive.google.com/drive/folders/1YC4kXqceWn0oDeZm_8MO9MPvtu96A3_o).
La consegna include i link Drive al PDF e allo ZIP della galleria: i soli link
ai file del workspace non sono una consegna sufficiente. Conservare i file
precedenti e i permessi della cartella; verificare il caricamento con lettura
dei metadati prima di comunicare i nuovi link.

Ogni immagine conserva una decisione propria: approva, rifiuta o da rivedere,
con nota facoltativa. Il rifiuto di una variante non comporta il rifiuto dell'altra.
Le scelte editoriali non pubblicano immagini e non certificano diritti o origine.

## Licenza delle SLOP

Per scelta del proprietario del 2026-11-06, le SLOP si pubblicano con
**CC BY 4.0**, con attribuzione predefinita **Real or Slop**, link alla
[licenza](https://creativecommons.org/licenses/by/4.0/) e indicazione delle
eventuali modifiche. È consentito il riuso anche commerciale e con adattamenti.
Un credito specifico può sostituire quello predefinito, ma non essere vuoto.
Le nuove generazioni registrano questa scelta prima degli invii. La pubblicazione
server esclude SLOP con licenza diversa o attribuzione mancante; le segnala nella
diagnostica privata. Le licenze delle REAL restano quelle delle fonti.

La decisione sulla licenza non approva o pubblica immagini e non riscrive
le ricevute storiche. I crediti del gioco mostrano autore e link alla licenza
dopo la risposta, senza introdurre indizi prima della scelta.

## Conservazione e ammissione individuale

Tutte le immagini già trovate o generate, compresi scarti e varianti, restano
conservate. Si attendono le selezioni esplicite del proprietario, senza dedurre
approvazioni da commenti generali o cancellare file per applicare nuovi criteri.
Ogni immagine approvata viene registrata individualmente nel database: non si
cerca e non si genera un corrispondente per completare la coppia. Una candidata
senza partner è selezionabile. L'archivio e la revisione privata già operano per
singola immagine; la pubblicazione mantiene le proprie verifiche documentali.
