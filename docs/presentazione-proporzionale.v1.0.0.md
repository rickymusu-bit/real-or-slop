# Copie proporzionali per la revisione — versione 1.0.0

Aggiornato: 2026-11-07T14:57:29.151Z. Follow-up issue #64, PR non integrata.

## Decisione editoriale

Ogni fotografia mantiene il proprio rapporto d'aspetto. **La pipeline v2 di revisione usa ora per default `--method preserve`**, con limite massimo del lato più lungo a 2048 pixel, senza upscaling, ritagli quadrati, generazione di pixel o perdita intenzionale di parti della scena. Si tratta di una copia di visualizzazione; l'originale già archiviato resta intatto.

```sh
python -m pipeline.v2.presentation --states <stato.json> --out <nuova-cartella> --method preserve --max-side 2048
```

La procedura applica orientamento EXIF, converte trasparenze su sfondo bianco, ridimensiona proporzionalmente solo quando necessario e produce WebP per la revisione. Conserva SHA-256 della sorgente e del nuovo file, dimensioni sorgente orientate, dimensioni risultanti, `crop_box: null`, `retained_area: 1`, `upscaled: false`, operazioni eseguite e stato `pending`. I profili delle copie precedenti non vengono riutilizzati senza nuova revisione.

I vecchi esperimenti con crop AI `--method terra` e centro `--method center` restano riproducibili e sono **esplicitamente legacy**. Non sono richiamati dal nuovo flusso owner-first. Se si devono confrontare risultati storici quadrati, occorre selezionare uno di questi metodi.

## Gestione feedback

L'interfaccia di revisione separa:
- scelta editoriale: segnale di gusto;
- difetto di generazione: feedback sul processo SLOP, non sul gusto REAL;
- errore tecnico: non addestrare il modello delle preferenze;
- diritti/licenza: non addestrare il modello delle preferenze;
- autenticità/provenienza incerta: non addestrare il modello delle preferenze.

Le decisioni restano collegate all'hash dei pixel e alla revisione, senza modificare le decisioni già prese.

## Limiti

Non vengono aggiornati retroattivamente i dossier precedenti, né le immagini già pubblicate. Alcuni moduli v2 sperimentali (`pipeline/v2/direct.py` e `smart_crop.py`) continuano a utilizzare copie quadrate per riprodurre i propri esperimenti storici. Per nuove acquisizioni, utilizzare il percorso owner-first della dashboard oppure `--method preserve`.

Il nuovo percorso della dashboard conserva già le immagini caricate dall'owner e quelle Commons e utilizza rapporti variabili per le SLOP. Le distribuzioni di formato REAL/SLOP devono comunque essere monitorate per escludere indizi sistematici.

## Verifiche

`tests/preserve_v1_0_0_test.py` prova fotografia panoramica, orizzontale, verticale, quadrata, orientamento EXIF, manifest, integrazione CLI, assenza di sovrascrittura e riduzione proporzionale. I test legacy Terra sono aggiornati per invocare esplicitamente il vecchio metodo. Prima del merge sono richiesti esito positivo della CI e anteprima dell'interfaccia; nessun rilascio automatico di database o applicazione.
