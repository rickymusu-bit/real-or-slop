# Benchmark diretto v2.1.0

Il [pilota successivo con cinque brief condivisi](pilota-brief-condivisi-2026-11-04.md)
prova il nuovo ciclo richiesto dal proprietario: ricerca REAL e generazione SLOP
partono dallo stesso brief congelato, senza fornire la REAL al generatore.
Sono dieci immagini con revisione singola su Drive; lo studio storico da 200
descritto sotto resta immutato e non diventa la dimensione del ciclo corrente.

Il proprietario ha richiesto il 2026-11-04 un campione di **200 candidate**, 100
REAL da fonti documentate e 100 SLOP indipendenti, usando sempre API dirette.
L'esecuzione non usa Files/Batch, risposte background, cambi di modello o retry
automatici. I risultati arrivano progressivamente con concorrenza limitata.

## Stima e tetto dello studio

La stima viene dai consumi effettivi del pilota, con i prezzi standard verificati
il 2026-11-04: Terra 1 USD/M token input e 5 USD/M output; cache read 0,05 e cache
write 30 minuti 1,25 USD/M. GPT Image 2 usa 5 USD/M token testo input e 30 USD/M
token immagine output. Non sono usate tariffe Batch o Flex.

| Operazione | Numero | Stima USD |
| --- | ---: | ---: |
| SLOP GPT Image 2, 1024×1024, qualità medium | 100 | 5,30 |
| Profili Terra dei pixel finali | 200 | 0,70 |
| Scelta del ritaglio per le REAL non quadrate | fino a 100 | 0,38 |
| Ideazione indipendente e query libere | 6 chiamate previste | piccolo margine |

Totale atteso **6–8 USD**, non fattura verificata. Il tetto di prenotazione
conservativo per questo studio è **15 USD**: 0,20 riservati alla preparazione e
14,80 al ledger del Worker isolato. Prenotazioni worker per chiamata: 0,075 per
generazione e 0,02 per analisi/crop. Il massimo pianificato è 13,50 USD nel Worker
prima di eventuali prove iniziali; le prenotazioni non sono il costo fatturato.
La preparazione scrive l'intento prima dell'invio e non ripete richieste incerte.

La raccolta usa fonti disponibili senza motori pagati. La revisione umana e i
motori di ricerca a pagamento sono esclusi dalla stima. Origine e diritti non
vengono certificati dal costo o dal profilo del modello.

Fonte prezzi: [OpenAI API pricing](https://developers.openai.com/api/docs/pricing).
Le ricevute del pilota sono conservate privatamente negli artifact precedenti.

## Flusso e ripresa

`pipeline.v2.study` prepara idee SLOP indipendenti prima della raccolta REAL e
query esplorative separate, congelando hash e istruzioni. Il catalogo delle
fonti viene interrogato con le stesse keyword; la disponibilità non è presunta.
Gli originali vengono acquisiti dagli host esplicitamente consentiti e deduplicati
per hash. Nel benchmark congelato del 2026-11-04 sono stati esclusi file oltre 12 MB/30 megapixel, formati
non supportati, licenze senza derivati e originali con lato corto inferiore a
1024: nessun upscaling. Sono esclusioni tecniche, non soglie di sorpresa.

Aggiornamento successivo richiesto dal proprietario: nei prossimi studi il lato
corto inferiore a 1024 non causa esclusione automatica. Terra riceve dimensioni
native e fattore di scala e valuta ritaglio, leggibilità e dubbi. Il codice applica
il ridimensionamento Lanczos già previsto, anche in ingrandimento; non si usa
ricostruzione generativa. La variante conserva dimensioni native, coordinate e
`upscaled`; il profilo descrive sempre la copia finale. Il report confronta per
origine frequenza e intensità dell'ingrandimento, oltre a nitidezza e rumore:
il formato comune non garantisce uguale definizione percepita. I vecchi profili
senza metadati del ritaglio restano non misurati. Questa modifica non cambia
retroattivamente campione, istruzioni o risultati del benchmark congelato.

Le gallerie di test si consegnano su Drive privato, con cartelle `REAL/` e
`SLOP/` separate negli ZIP. La separazione deriva dai dossier di provenienza;
non è una classificazione del modello e non implica approvazione delle REAL.
NASA viene risolta tramite l'asset API ufficiale, conservando il risultato e
normalizzando HTTP a HTTPS soltanto per il dominio ufficiale delle immagini.
Se la prima pagina non basta dopo gli scarti tecnici, è consentita una seconda
pagina delle stesse 24 query congelate, registrata come supplemento esplicito.
Non si cambiano termini in base ai punteggi o alle immagini generate; al massimo
due pagine e 240 chiamate complessive di ricerca/dettagli. La resa di questo
reintegro non viene presentata come confronto fra motori a budget equivalente.

`pipeline.v2.direct` esegue separatamente i due flussi. Per ogni candidata:

1. Generazione solo da testo per SLOP, oppure acquisizione del file REAL.
2. Terra sceglie fra quadrati di area massima; le immagini già quadrate saltano
   la chiamata. Il codice applica il taglio e conserva hash/coordinate/decisione.
3. Il profilo vede esclusivamente la copia finale 1024×1024. Il suo hash deve
   coincidere con `profile_image_sha256` nel dossier; vecchi profili non vengono
   trasferiti sui nuovi pixel.
4. Originale, variante, profilo, prove e ricevute finiscono nell'archivio privato.
   Ogni candidata rimane in quarantena, compresi dubbi e astensioni del crop.

I run non simulati richiedono gate esplicito e ledger server. Ogni chiamata ha
prenotazione idempotente e intento durevole prima della richiesta. Le risposte
vengono salvate prima dell'interpretazione. La ripresa può recuperare una ricevuta
completa già presente; una richiesta dall'esito incerto non viene ripetuta. Anche
le altre risposte in corso sono conservate quando un errore sospende la fase.
Un run concluso può riesportare le stesse candidate senza nuove inferenze.

```sh
# Pianificazione senza rete:
python3 -m pipeline.v2.direct PIANO-SLOP.json --origin AI --run-id studio-slop
# Esecuzione diretta con configurazione e ledger dell'ambiente privato:
python3 -m pipeline.v2.direct PIANO-SLOP.json --origin AI --run-id studio-slop \
  --base http://127.0.0.1:8794 --concurrency 4 --execute
# Ripresa senza reinvio di richieste incerte:
python3 -m pipeline.v2.direct --origin AI --run-id studio-slop \
  --base http://127.0.0.1:8794 --concurrency 4 --resume --execute
```

## Interpretazione

Il benchmark descrive funzionamento, copertura, distribuzioni, duplicati, errori,
tempi e costi. Le REAL restano candidate con autenticità non verificata e natura
fotografica da confermare; i diritti SLOP restano pendenti. Una matrice di errori
dei giocatori e l'efficacia formativa richiedono revisioni e prove umane separate.
Nessuna immagine viene pubblicata o resa giocabile da questo studio. Gate e risorse
di produzione restano invariati; i dati si trovano nel Worker/D1/R2 locale isolato.

Verifica iniziale: 138 test Python passati, compresi associazione fra hash della
variante e profilo, nessun endpoint Batch, gate/ledger obbligatori, ripresa senza
nuove inferenze e congelamento indipendente delle idee. Una prova reale iniziale
con una candidata ha completato crop, profilo e archiviazione nel Worker locale,
con due chiamate Responses dirette e zero pubblicazioni. Le 200 candidate hanno completato lo studio: vedere [risultati del benchmark](benchmark-200-risultati-2026-11-04.md). La successiva correzione conserva privatamente corpo e request ID degli errori HTTP, senza reinvio; 139 test Python passati.
