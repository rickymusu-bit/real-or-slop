# Varietà semantica dei brief — v1.0.0

Snapshot: 29c2025c72f9a80589d78cfeb26f0ce3fb815aa39bf992fb65c1bb073363dafc. Seed: 45. Encoder: Xenova/all-MiniLM-L6-v2.

Catalogo: 100 brief inglesi. Distanza coseno: mediana 0.6543, P90 0.7811. kNN medi (k=1/5/10): 0.3259 / 0.3968 / 0.4376.

PCA: stato computed, dimensione effettiva 28.2918. Cluster DBSCAN: 4; rumore: 84. La sensibilità completa è nel JSON. Nessun cluster è obbligatorio.

Corpus: 48 probe; review: implementation_reviewed_owner_pending. Sulle sole esplorazioni indipendenti: mediana distanza dal brief più vicino 0.4666, P90 0.5523. I controlli derivati dal seed sono separati. Le lacune sono relative a questo corpus, non all'universo delle immagini.

## Vicinanze da esaminare

| Brief A | Brief B | Distanza |
| --- | --- | --- |
| brief-0083 | brief-0084 | 0.1944 |
| brief-0001 | brief-0006 | 0.2179 |
| brief-0001 | brief-0004 | 0.2374 |
| brief-0083 | brief-0086 | 0.2393 |
| brief-0052 | brief-0091 | 0.2456 |
| brief-0006 | brief-0051 | 0.2484 |
| brief-0002 | brief-0005 | 0.2589 |
| brief-0009 | brief-0079 | 0.2612 |

## Lacune relative al corpus indipendente

| Probe | Descrizione | Brief più vicino | Distanza |
| --- | --- | --- | --- |
| reference-0006 | A microscope view of mineral crystals, showing the relationship between grains across the specimen. | brief-0094 | 0.5976 |
| reference-0016 | Adult wheelchair athletes playing basketball, with the court and the surrounding sports hall visible. | brief-0071 | 0.5713 |
| reference-0022 | An airport baggage handling system with conveyors, luggage and the surrounding service area visible. | brief-0051 | 0.5643 |
| reference-0009 | A steel foundry during a metal pour, with protective equipment and the surrounding industrial space visible. | brief-0077 | 0.5591 |
| reference-0035 | A glassblower shaping molten glass, with the furnace, tools and surrounding workshop visible. | brief-0010 | 0.5455 |
| reference-0020 | A salt harvesting operation with evaporation ponds, channels and the surrounding flat terrain visible. | brief-0036 | 0.5244 |
| reference-0033 | A wastewater treatment facility with settling tanks, walkways and the surrounding site visible. | brief-0066 | 0.5224 |
| reference-0010 | A textile loom operating in a factory, with the thread paths and surrounding equipment visible. | brief-0080 | 0.5212 |

## Stato e origine

| Gruppo | N | Mediana kNN(1) interna | Mediana distanza corpus |
| --- | --- | --- | --- |
| draft | 100 | 0.3259 | 0.4233 |
| approved | 0 | non calcolato | non calcolato |
| retired | 0 | non calcolato | non calcolato |
| used | 0 | non calcolato | non calcolato |
| unused | 0 | non calcolato | non calcolato |
| usage_unknown | 100 | 0.3259 | 0.4233 |
| REAL_approved | 0 | non calcolato | non calcolato |
| SLOP_approved | 0 | non calcolato | non calcolato |
| neither_origin_approved | 0 | non calcolato | non calcolato |
| REAL_approval_unknown | 100 | 0.3259 | 0.4233 |
| SLOP_approval_unknown | 100 | 0.3259 | 0.4233 |

I gruppi REAL e SLOP possono sovrapporsi. Dati assenti significano sconosciuto; non significano nessuna approvazione.

## Confronti e limiti

Baseline: TF-IDF nello spazio lessicale fissato dal catalogo; copertura di sottoinsiemi casuali e selezione per tag con identico budget. Accordo terne annotate: primario 0.8750, TF-IDF 0.8750. Sovrapposizione media top-5 fra encoder: 0.4400.

Lunghezza, fraseologia ripetuta, medium e categorie del seed sono confondenti misurati nel JSON. Annotazioni dell'implementazione: non sono review umana indipendente. Le distanze non certificano qualità, autenticità, diritti o valore formativo. La PCA 2D non conserva tutte le distanze e non dimostra vuoti oggettivi. N piccolo e sensibilità dei cluster richiedono cautela. Nessun risultato approva, rifiuta o modifica brief e immagini.
