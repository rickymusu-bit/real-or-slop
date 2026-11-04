# Benchmark editoriale diretto — 200 candidate

Stato: completato; 200/200 profili finali. Report aggiornato il 2026-11-04T09:13:07.410363+00:00.

## Esito e limiti

Il flusso tecnico produce immagini standard, ritagli tracciati, profili sui pixel finali e dossier privati. Il campione non dimostra ancora che il protocollo produca un gioco equilibrato o migliori il riconoscimento umano. Le REAL sono candidate da fonti documentate: nessuna autenticità è stata certificata e nessuna immagine è stata approvata o pubblicata.

Origini: {'REAL': 100, 'AI': 100}. Fonti REAL: {'commons': 58, 'nasa': 42}. Un solo generatore SLOP, GPT Image 2; Terra per idee, query, ritagli e profili.

Il modello segnala 2 immagini non fotografiche e 1 inutilizzabili. Segnala inoltre 40 scelte di ritaglio per revisione e si astiene in 8 casi: viene applicato il quadrato centrale, esplicitamente marcato. Sono annotazioni del modello, non verdetti umani.

Nel controllo visivo preliminare delle REAL sono presenti una grafica della missione Apollo e una pagina di giornale; queste due immagini sono anche segnalate come non fotografiche dal profilo. Una terza candidata è molto sfocata. Il campione le conserva per non nascondere gli scarti e misurare la resa della raccolta. La provenienza NASA/Commons non garantisce da sola natura fotografica, autenticità o diritti. Loghi, testi e soggetti legati alle fonti possono diventare scorciatoie per i giocatori.

La differenza principale riguarda la composizione: Terra assegna multiple_subjects a 70 SLOP e 17 REAL (TV 0,53); la densità alta compare in 71 SLOP e 34 REAL (TV 0,37). Le SLOP risultano anche più spesso molto nitide (90 contro 59). I due flussi indipendenti non hanno ancora una copertura comparabile: queste differenze possono offrire scorciatoie, senza dimostrarlo da sole. Le istruzioni di ideazione richiamano più soggetti e scene dense; la prossima iterazione dovrebbe rimuovere questa spinta e verificare un nuovo campione indipendente. Nessuna quota o derivazione da foto REAL viene introdotta per pareggiare il campione attuale.

## Metodo e riproducibilità

Generazione, ritagli e profili: 28.1 minuti, inclusa la sospensione esplicita per HTTP 400. Preparazione e raccolta precedono questo intervallo; dal primo invio di preparazione al completamento sono trascorsi circa 47 minuti. Gate locale di spesa a fine esecuzione: false. La candidata REAL di calibrazione è fuori dal campione da 200: D1 archivia 201 dossier totali, 200 dello studio e 1 di prova.

- 100 idee SLOP e 8 query esplorative generate separatamente via Responses e congelate prima della raccolta REAL. Nessuna foto, titolo o descrizione REAL entra nei prompt SLOP.
- Richieste sincrone esclusivamente a Responses e Images generations; zero Files/Batch, background, fallback di modello o reinvii automatici.
- Concorrenza 4 per ciascun flusso principale; la sostituzione isolata usa concorrenza 1. Le richieste possono quindi sovrapporsi fra flussi.
- Generazioni native 1024×1024, qualità medium. REAL senza upscaling, lato corto originale almeno 1024, massimo 12 MB/30 MP. Tutte le copie finali RGB/WebP 1024×1024 senza EXIF.
- Ritagli fra quadrati di area massima: originali preservati, coordinate e decisione archiviate. Il profilo usa solo la copia finale, con SHA-256 identico al dossier.
- Le stesse keyword sono inviate al catalogo delle fonti. Seconda pagina esplicita dopo esclusioni tecniche e deduplica; nessuna ricerca a pagamento e nessun adattamento ai risultati SLOP.
- Un tentativo SLOP riceve HTTP 400, senza immagine. La prenotazione resta nel ledger, nessun reinvio. Una nuova idea indipendente viene congelata e generata in un run separato. Sono 101 tentativi Images per 100 immagini ricevute. Il corpo del primo errore, request ID e addebito non erano registrati dal runner congelato e non vengono inventati.
- Openverse e Library of Congress restituiscono HTTP 403, Met HTTP 410, Smithsonian richiede una chiave non configurata. Sono limiti di questo ambiente e di questa esecuzione, non giudizi definitivi sulle API. Le ricerche non misurate restano nel ledger e non diventano falsi risultati zero.
- Nessun confronto fra motori a budget equivalente, nessuna metrica inventata sui giocatori. Il codice già avviato resta alla versione registrata in summary.json; la successiva correzione della PR conserva gli errori HTTP privati e passa 139 test.

## Distribuzioni e duplicati

| Attributo del profilo | Distanza TV REAL/SLOP |
| --- | ---: |
| composition | 0.530 |
| framing | 0.170 |
| density | 0.370 |
| occlusion | 0.380 |
| color | 0.220 |
| lighting | 0.200 |
| contrast | 0.340 |
| saturation | 0.280 |
| sharpness | 0.310 |
| noise | 0.120 |
| depth_of_field | 0.210 |

TV varia da 0 (distribuzioni uguali) a 1 (separate). È una diagnosi descrittiva su annotazioni Terra, con due fonti REAL e un solo generatore; non misura da sola bias, difficoltà o generalizzazione. Nessuna soglia viene usata per scartare immagini o costruire coppie REAL/SLOP.

Duplicati esatti fra le candidate finali: 0. Coppie con hash percettivo simile da verificare: 0.

## Costi

Stima dalle ricevute riuscite: **6.548328 USD**, includendo preparazione, prova iniziale e sostituzione. Non è una fattura verificata; l'eventuale costo del singolo HTTP 400 resta sconosciuto. Fascia iniziale 6–8 USD, tetto di prenotazione complessivo 15 USD.

| Ambito | Risposte riuscite con consumo | Stima USD |
| --- | ---: | ---: |
| benchmark | 393 | 6.483732 |
| preparation | 7 | 0.056597 |
| calibration | 2 | 0.007999 |

Tariffe standard: Terra 1 USD/M input, 5 USD/M output, cache read 0,05 e cache write 1,25. Images 5 USD/M testo input e 30 USD/M immagine output. Nessuna tariffa Batch/Flex. Dati e somme per richiesta in cost-and-method.json. [Prezzi ufficiali](https://developers.openai.com/api/docs/pricing).

## Revisione successiva

Controllare autenticità, diritti e natura fotografica; confrontare i 40 ritagli segnalati con il fotogramma intero; esaminare i segnali dovuti alle fonti. Poi valutare il gioco con persone e un campione separato di nuove fonti e generatori. I valori di sorpresa, plausibilità e ordinarietà restano descrizioni del modello, senza essere presentati come difficoltà misurata.

Le [metriche aggregate e la versione congelata](benchmark-200-metriche-2026-11-04.json) sono nel repository. Galleria offline, immagini, dossier, ricevute grezze e originali integrali sono conservati privatamente nello studio locale; i dati visivi e le ricevute non vengono aggiunti al repository.
