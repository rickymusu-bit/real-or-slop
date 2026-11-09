# Spazio dei file in R2 — specifica 1.0.0

Creata: 2026-11-09T13:00:00Z. Decisione dell'owner del 2026-11-09 (opzione 1): originali conservati,
nessun duplicato, file cancellati insieme alle foto eliminate definitivamente.
Base: PR rickymusu-bit/real-or-slop#98, app 0.33.0. Nessuna migrazione.

## Dove stanno i file

Le immagini non sono nel database: il D1 contiene solo righe di metadati. I file sono in R2.

| File | Bucket | Copie |
|---|---|---|
| Originale (caricato, acquisito da Commons o generato) | quarantena privata | 1 |
| Copia di gioco WebP approvata | quarantena privata (`game-copies/`) | 1 |
| File del gioco (la stessa copia, dopo l'ammissione) | catalogo `IMAGES` | 1 |

Prima della 0.33.0 l'ammissione duplicava in quarantena sia l'originale (`originals/<id>`) sia il
file approvato (`editorial-cycle/<origine>/<hash>`). Ora l'ammissione verifica entrambi i file e
copia solo il file approvato nel catalogo; le route admin `/api/admin/originals/<id>` e
`/api/admin/assets/<id>` leggono originale e file approvato dalla coda quando la copia dedicata
non esiste. Le immagini ammesse prima conservano i loro file come sono.

La copia nel catalogo resta separata: il bucket del gioco non deve dare accesso alla quarantena.

## Eliminazione definitiva

«Elimina definitivamente» e «Elimina tutte» (solo foto rifiutate) cancellano anche i file R2:

- solo quelli creati dalla dashboard: `owner-proposals/` (upload), `editorial-intelligence/`
  (Commons), `workspace-slop/` (generazioni), `game-copies/` (copie di gioco);
- solo se nessuna foto rimasta nella coda, nessuna copia di gioco di una foto rimasta e nessuna
  immagine del catalogo li usa;
- dopo la cancellazione delle righe: se la rimozione dei file fallisce, restano file orfani, mai
  righe senza file.

Gli archivi storici (pipeline legacy, tentativi scartati, presentazioni 1024) mantengono i loro file,
come richiede `AGENTS.md`. Restano conservati anche dossier, voti e il registro delle eliminazioni
(`editorial_review_deleted_images`), che impedisce il reimport.

## Ordini di grandezza

Con un originale medio di 5 MB e una copia di 0,8 MB, una foto ammessa occupa circa 6,6 MB
(prima circa 12 MB). R2 include 10 GB gratuiti e costa poi circa 0,015 $ per GB al mese, senza costi
di traffico: 10.000 foto ammesse sono circa 66 GB, meno di 1 $ al mese.

## Possibili sviluppi

- Originali delle foto pubblicate nella classe R2 ad accesso raro (circa un terzo in meno).
- Pulizia una tantum dei file orfani lasciati dalle eliminazioni precedenti alla 0.33.0, da
  eseguire solo su autorizzazione esplicita dopo un inventario.
