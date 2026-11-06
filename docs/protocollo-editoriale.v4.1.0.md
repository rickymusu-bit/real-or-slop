# Protocollo editoriale v4.1.0

Revisione richiesta dal proprietario il 2026-11-05, successiva al
[pilota](pilota-matrice-v4-2026-11-05.md). Questa versione sostituisce le regole
di contesto e formato della [v4.0.0](protocollo-editoriale.v4.0.0.md). Matrice,
freeze, provenienza, rami indipendenti, budget, revisione individuale e gate di
pubblicazione restano quelli della v4, salvo quanto precisato qui.

## Contesto e opere d’arte

Il contesto può essere dato dalla didascalia, dall’immagine o da entrambe.
Quadri e opere a pieno fotogramma sono ammessi: cornice e ambiente esterno non
sono requisiti. Un linguaggio visivo non fotografico è descrittivo e non
costituisce da solo un blocco di approvazione. La fruibilità tecnica resta
necessaria. Le REAL, comprese le opere d’arte, richiedono origine umana
documentata e diritti compatibili; una didascalia non sostituisce queste prove.

Nelle didascalie REAL i fatti devono essere documentati o direttamente visibili.
L’associazione a una fonte rimane verificabile; nessun luogo, autore, data o
evento si inventa per completare il contesto. Restano le revisioni indipendenti
di immagine, didascalia e classificazione effettiva.

## Proporzioni libere

Le nuove esecuzioni dirette usano `whole_frame`: nessun ritaglio obbligatorio,
nessuna chiamata di selezione del taglio, nessun riempimento generativo.
La presentazione `1.2.0` applica orientamento EXIF e conversione WebP, riducendo
proporzionalmente il lato lungo fino a 1536 pixel senza ingrandire immagini
più piccole. Registra dimensioni effettive, intero fotogramma, area conservata
100%, operazioni e hash. Il profilo si calcola sui pixel di questa variante.

Il prompt inglese chiede al generatore di scegliere proporzioni adatte al
soggetto. La richiesta Images usa `size: auto`, con modello e qualità congelati
prima della ricerca. Nei dossier `parameters.size` descrive la richiesta
(`auto`); `width` e `height` registrano le dimensioni dei pixel restituiti e
presentati. Le SLOP non ricevono il formato, i pixel o i metadati della REAL.

Il catalogo corrente è `data/editorial/briefs.v4.1.0.json`, revisione 2 dei 288
draft. Il catalogo 4.0.0 rimane invariato. La tassonomia e gli envelope dei
documenti della matrice restano 4.0.0; i freeze nuovi registrano catalogo e
istruzioni 4.1.0, formato e `presentation_mode` espliciti. Gli hash impediscono
di trasformare un vecchio ciclo in uno nuovo durante il resume.

```sh
# Verifica e selezione offline, senza immagini o chiamate API:
python3 -m pipeline.v2.matrix_v4_0_0 --check
python3 -m pipeline.v2.matrix_v4_0_0 --out .pipeline/matrix/cycle-v41 \
  --cycle-id cycle-v41 --count 5 --size auto --presentation-mode whole_frame
```

`Config.environment()` usa `OPENAI_V2_IMAGE_SIZE=auto` e
`EDITORIAL_V2_PRESENTATION_MODE=whole_frame` per le nuove esecuzioni. I checkpoint
legacy senza il campo di presentazione mantengono `square_crop`; il percorso
esplicito legacy resta disponibile per recuperare il loro stato storico.
Nessun ritaglio o approvazione preesistente viene sovrascritto.

La galleria del pilota può essere riesportata dagli originali senza nuove
inferenze. Le copie intere hanno hash e coorte nuovi, profili non ancora
calcolati e giudizi pending. Le SLOP già generate conservano il formato che
avevano: non sono rigenerate per applicare retroattivamente `auto`.

Questa modifica non avvia acquisizioni, chiamate pagate, deploy, migrazioni
remote o pubblicazioni.
