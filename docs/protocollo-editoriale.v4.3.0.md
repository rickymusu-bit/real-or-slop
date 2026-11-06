# Protocollo editoriale v4.3.0

Revisione del 2026-11-06. Eredita la [v4.2.0](protocollo-editoriale.v4.2.0.md),
incluse didascalie contestuali, fotogrammi interi, formato automatico e licenza
SLOP CC BY 4.0 con attribuzione. Applicazione 0.19.0, ancora in PR.

## Prompt fotografici con scelte di ripresa

Il solo soggetto e un'indicazione di angolazione lasciano al modello numerose
scelte di resa. La nuova policy `shared/editorial-photography.v1.0.0.json`
aggiunge una ricetta fotografica coerente al prompt, con questi elementi:

- classe di fotocamera e formato del sensore;
- focale equivalente sul formato 35 mm, distinta dalla focale fisica;
- diaframma, tempo di esposizione e intervallo Auto ISO;
- distanza di ripresa, piano di messa a fuoco e profondità di campo;
- luce disponibile motivata dalla scena, bilanciamento e ombre;
- resa JPEG o conversione neutra, contrasto, dettaglio e trattamento del rumore.

| Profilo | Dispositivo | Focale equivalente | Diaframma | Tempo | Auto ISO |
| --- | --- | --- | --- | --- | --- |
| `phone_main_available_light` | Smartphone, sensore tipo 1/1.7 pollici | 26 mm | f/1.8 | 1/100 s | 50–1600 |
| `phone_ultrawide_context` | Smartphone ultrawide, tipo 1/2.5 pollici | 16 mm | f/2.2 | 1/125 s | 50–1600 |
| `compact_ccd_jpeg` | Compatta di fine anni 2000, CCD tipo 1/2.3 pollici | 35 mm | f/3.5 | 1/125 s | 100–800 |
| `apsc_kit_zoom` | Reflex APS-C, zoom kit | 28 mm | f/5.6 | 1/125 s | 100–3200 |
| `full_frame_normal_lens` | Fotocamera full frame, ottica normale | 50 mm | f/5.6 | 1/160 s | 100–3200 |
| `m43_everyday_standard` | Mirrorless Micro Quattro Terzi, zoom standard | 40 mm | f/4 | 1/125 s | 200–3200 |

Le distanze sono preferenze compatibili con il soggetto, non un motivo per
spostare oggetti o tagliare arbitrariamente la scena. Il prompt richiede di
conservare attività, oggetti, meteo e periodo già specificati; l'illuminazione
deriva da cielo, finestre o lampade presenti. L'ISO può adattarsi entro il range;
tempo e diaframma sono target da modificare solo se necessari per esposizione
plausibile o movimento. Il sensore guida anche la profondità di campo: f/1.8 su
uno smartphone non implica la stessa sfocatura di f/1.8 su full frame.

La resa varia tra profili. Rumore, sfocatura, difetti e compressione non diventano
obbligatori in tutte le SLOP. Non si impone un aspetto pubblicitario, una luce
cinematografica, HDR eccessivo o uno sfondo sfocato uniforme. Nomi di fotocamere,
marchi e parametri non devono comparire come scritte nell'immagine.

## Selezione, freeze e compatibilità

Un mazzo dei sei profili viene mescolato con seed e un generatore casuale separato
da quello compositivo. Si esauriscono i sei profili prima di ripeterli; le opere
dipinte non consumano un profilo fotografico. La scelta usa solo seed e numero
dei brief, prima di qualunque ricerca REAL. Non legge foto, EXIF, fonte, titolo,
profili visivi o approvazioni dei partner REAL. Non è una stima della frequenza
delle fotocamere nel corpus reale.

Ogni brief fotografico conserva la ricetta completa e l'hash della policy.
`photography-plan.v1.0.0.json` registra i target e la direttiva testuale;
il freeze del ciclo comprende il suo hash. Il Worker verifica che la ricetta
sia uno dei profili versionati e che il prompt termini con le istruzioni
corrispondenti. La ricevuta continua a dover combaciare con il prompt congelato.
Il limite del prompt privato passa da 2000 a 6000 caratteri, con rifiuto anziché
troncamento. I limiti di didascalie e descrizioni restano quelli precedenti.

Il catalogo `briefs.v4.3.0.json` conserva le 144 celle: i 280 brief fotografici
passano alla revisione 4 con un prompt diretto e senza l'istruzione di scegliere
liberamente la composizione. Le otto opere conservano il prompt e la revisione
precedenti, senza dispositivo o esposizione fotografica. Il ramo REAL mantiene
descrizioni e query; nessuna modifica ai diritti o alle regole di ammissibilità.
Cataloghi 4.0–4.2 e cicli già congelati non ricevono retroattivamente le ricette.

## Verifica e limiti

L'[esempio completo](esempio-prompt-fotografico.v4.3.0.md) è tratto da un piano
offline con seed 53. Non richiede né rappresenta una nuova immagine generata.
I test controllano varietà e ripetibilità delle ricette, integrità del piano,
identità del prompt Python/Worker e del payload API, esclusione delle opere e
compatibilità dei cicli precedenti.

I numeri guidano un generatore di immagini: non producono una misura ottica,
un EXIF autentico o una simulazione fisica certificata. Più dettaglio non prova
che le SLOP siano meno riconoscibili. Il risultato richiede un nuovo campione
e valutazioni su immagini effettive, controllando anche che i profili non
introducano nuovi indizi di classe. Il pilota e i suoi PDF restano quelli già
generati; nessuna nuova inferenza, spesa o pubblicazione è inclusa qui.
