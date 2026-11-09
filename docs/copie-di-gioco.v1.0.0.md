# Copie di gioco WebP uniformi — specifica 1.0.0

Creata: 2026-11-09T11:00:00Z. Stato: richiesta dall'owner il 2026-11-09 («ok, WebP, procedi»).
Completa la sezione 6.4 di `docs/lotti-editoriali.v1.6.2.md` (metadati uniformi nel gioco).
Base: PR rickymusu-bit/real-or-slop#98 (app 0.30.0). App 0.31.0, schema 0032.

## Problema

La pulizia dei metadati (0.30.0) toglie EXIF, ICC, XMP, Content Credentials e dati accodati,
ma lascia altri indizi sull'origine: il formato (REAL in JPEG, SLOP in WebP o PNG), le tabelle
di compressione JPEG, il peso e le dimensioni del file. Convertire tutto in PNG non serve: il PNG
conserva i pixel come sono, compresi i blocchi della compressione JPEG originale, e una foto da
24 megapixel supererebbe i 12 MB ammessi dal gioco.

## Ricetta

Uguale per REAL e SLOP (`shared/game-copy.v1.0.0.ts`, `GAME_COPY_RECIPE`):

- WebP con perdita, qualità 0,85;
- lato lungo al massimo 2048 px, proporzioni conservate, nessun ingrandimento;
- orientamento EXIF applicato ai pixel, colori in sRGB, sfondo bianco per eventuali trasparenze;
- nessun metadato; il Worker ripassa comunque la copia nella pulizia della 0.30.0.

Il ridimensionamento cancella in gran parte la griglia della compressione d'origine; dopo la
ricodifica formato, compressione e peso non distinguono più le due categorie.

## Dove avviene

La codifica avviene nel browser dell'owner, non nel Worker: sul piano Free un Worker ha 10 ms di
CPU, insufficienti per ricodificare una foto da 24 megapixel.

1. All'ammissione (Revisione → «Ammetti al catalogo privato») la dashboard legge il file
   approvato, prepara la copia e la invia a `POST /api/admin/editorial/cycle/game-copy?image_id=`.
2. Se la copia non riesce (rete, browser senza esportazione WebP, per esempio alcune versioni di
   Safari), l'ammissione resta valida e il messaggio lo segnala. Pubblicazione → «Prepara le copie
   di gioco mancanti» le prepara una alla volta.
3. La pubblicazione del ciclo considera soltanto le immagini con la copia; «Controlla
   disponibilità» indica quante ne mancano.

## Verifiche del Worker

- l'immagine deve essere ammessa con lo stesso hash del file in archivio;
- il file inviato deve essere WebP leggibile, fino a 4 MB;
- le dimensioni devono essere esattamente quelle attese, calcolate dal file ammesso (orientamento
  compreso) con la stessa funzione del browser;
- la copia è salvata in R2 sotto `game-copies/<image_id>/<sha256>.webp` e registrata in
  `editorial_game_copies` (migrazione additiva 0032): una per immagine, immutabile, con l'hash
  del file da cui deriva e la ricetta. Un secondo invio restituisce la copia già registrata.

Il Worker non può dimostrare che la copia raffiguri davvero il file approvato: la fiducia è la
stessa dell'anteprima di profilazione, cioè l'owner autenticato. Le dimensioni esatte escludono
gli scambi accidentali tra immagini di forma diversa.

## Voti e originali

I voti dell'owner restano legati all'hash del file approvato, che non cambia. La copia di gioco è
un derivato: il gioco serve la copia quando esiste e corrisponde all'hash corrente dell'immagine,
altrimenti il file ammesso ripulito dai metadati (immagini storiche, demo SVG invariate).

## Limiti

- La qualità di ricampionamento dipende dal browser; resta uniforme se l'owner usa sempre lo
  stesso browser.
- Una copia registrata non si sostituisce: per rifarla servirebbe una nuova migrazione.
- I percorsi di pubblicazione storici fuori dal ciclo non richiedono la copia; oggi in produzione
  non ci sono immagini pubblicate non demo.
- La migrazione 0032 va applicata in produzione prima del deploy dell'app 0.31.0, solo su
  autorizzazione esplicita.
