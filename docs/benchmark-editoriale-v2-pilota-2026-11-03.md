# Pilota rapido Real or Slop — 2026-11-03

Completati **10 output SLOP originali, 10 candidate fotografiche e 20 profili visivi** mediante chiamate sincrone. Tutte le immagini sono in quarantena, zero approvazioni o pubblicazioni. Gate pagato locale richiuso al termine.

Costo stimato dai token API sincroni: **0,530162 USD**, comprendendo cache write; non è una fattura verificata. Prenotazioni conservative complessive: 1,68 USD su un limite di 2 USD, inclusi i tentativi iniziali Batch rifiutati o con annullamento richiesto. Nessun rimborso presunto dei tentativi falliti. Prezzi di riferimento: https://developers.openai.com/api/docs/pricing .

## Prime osservazioni

- Nessun duplicato esatto o quasi duplicato rilevato nel campione.
- Tutte le 20 immagini sono state considerate fotografiche e fruibili dal valutatore cieco. È una valutazione VLM da revisionare, non una certificazione dell'origine.
- Le annotazioni coprono composizioni con soggetti nel contesto, più soggetti e una SLOP senza soggetto dominante. Sono presenti immagini ordinarie in entrambe le classi.
- **Scorciatoia di formato:** quattro SLOP sono quadrate, nessuna candidata REAL lo è. In questo campione il formato può svelare l'origine. Le copie sono tutte WebP, con lato massimo 1024, ma questo non elimina le differenze di rapporto d'aspetto. Va risolto prima dell'impiego nel catalogo.
- Dieci REAL provengono da dieci autori di Commons: non costituiscono una verifica su più fonti indipendenti. Ricerca automatica Commons, Openverse e LoC: HTTP 403; Met: HTTP 410. Sono state consultate pagine pubbliche e acquisiti originali con licenze documentate. Nessun confronto dei motori a parità di budget è misurato.
- Due file sono stati esclusi per superamento del limite di 12 MB. Nessuno scarto per insufficiente stranezza o punteggio editoriale.

## Stato della revisione

10 candidate REAL attendono conferma di autenticità e degli interventi; le licenze della fonte sono registrate. Per la fotografia di persone restano da verificare anche gli ulteriori diritti applicabili. Le 10 SLOP hanno prompt, parametri, modello e request ID originali archiviati; nessuna licenza di pubblicazione è stata attribuita automaticamente.

Questo campione di 20 elementi verifica il funzionamento e individua difetti operativi. Non sostituisce lo studio da 100–200 candidate o la prova con utenti su immagini mai viste. Nessun livello di difficoltà assegnato.

## File

- `index.html`: galleria locale con origini e dossier inizialmente nascosti in schede apribili.
- `pilot-review.zip`: galleria, copie per revisione e dossier, apribile offline dopo estrazione.
- `report.json`: diagnostica riproducibile v2.
- `cost-and-method.json`: ricevute sintetiche, metodo e stima dei costi.
- `candidates.json`: dossier e profili del campione.

Originali e ricevute API complete rimangono nell'archivio privato locale e nella quarantena R2 emulata. Nessuna produzione o risorsa Cloudflare remota modificata.
