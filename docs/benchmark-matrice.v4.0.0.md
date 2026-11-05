---
version: 4.0.0
created_at: 2026-11-05T20:15:00Z
status: synthetic-offline-not-owner-validation
---

# Benchmark della matrice v4.0.0

Esecuzione locale con seed 53 su 144 celle e rendimenti noti costruiti per fixture.
Nessuna ricerca, fotografia, generazione remota, costo reale o giudizio del proprietario.

| Strategia | Tentativi | Budget sintetico | Approvazioni simulate | Costo per approvazione |
| --- | ---: | ---: | ---: | ---: |
| Uniforme | 1000 | 20 | 540 | 0.03704 |
| Adattiva | 1000 | 20 | 564 | 0.03546 |

Il miglioramento riguarda questo scenario controllato, non prova resa fotografica,
qualità editoriale o valore formativo. Il prior Beta(2,2) resta provvisorio. Il
report JSON conserva celle, margini e casi con 0/1/10/100 giudizi; i test aggiungono
ricerca vuota, rifiuti massivi, correzioni fuori obiettivo e revoche. Nessuna cella
ha probabilità zero. Tentativi, verifica documentale e giudizi umani restano distinti.

## Costo del replay locale

Tre esecuzioni per dimensione sul Node indicato nel JSON. Il delta heap è rumoroso,
non una misura di picco, di latenza HTTP Cloudflare o di prestazioni browser.

| Candidate | Eventi | Mediana locale, ms |
| ---: | ---: | ---: |
| 100 | 300 | 53.42 |
| 500 | 1500 | 54.49 |
| 1500 | 4500 | 65.08 |
| 5000 | 15000 | 79.99 |

La tabella admin ha sempre 144 celle. Il replay HTTP usa una proiezione dei soli
campi necessari ai conteggi, senza note o query, ed è limitato a 20.000 eventi;
oltre tale soglia si usa l’export paginato e il CLI offline.

## Controllo delle didascalie

48 bozze di stile, due contesti per emozione e per origine, in italiano. Lunghezza
e specificità sono bilanciate per costruzione. Accuratezza del classificatore
lessicale con fold per emozione: **50%**; controllo positivo con indizi artificiali:
**100%**. Il controllo verifica il misuratore; il campione costruito non dimostra
assenza di leakage su nuove fotografie e generazioni. Gli esempi non sono stati
approvati dal proprietario né verificati contro immagini reali.

Ripetizione: `npm run benchmark:matrix`. Test dei gate, del replay e dei round in
`npm test`, `npm run test:integration` e `npm run test:gallery`. Le variazioni dei
tempi misurati sono normali; seed, scenari e conteggi sintetici sono riproducibili.
