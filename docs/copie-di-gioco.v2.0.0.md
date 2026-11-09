# Copie di gioco WebP uniformi — specifica 2.0.0

Creata: 2026-11-09T12:00:00Z. Sostituisce `docs/copie-di-gioco.v1.0.0.md`, mai rilasciata.
Decisione dell'owner del 2026-11-09: «Io devo dare l'approvazione su ciò che il giocatore vedrà.
Quindi devo approvare la copia in WebP, non l'originale.»
Base: PR rickymusu-bit/real-or-slop#98. App 0.32.0, schema 0032 (`0032_review_game_copies.v1.0.0.sql`).

## Cambio rispetto alla 1.0.0

Nella 1.0.0 la copia nasceva all'ammissione, dopo il voto: l'owner approvava l'originale e il gioco
mostrava un file che nessuno aveva guardato. Nella 2.0.0 la copia nasce **prima del voto** e
diventa il file mostrato nella Revisione, approvato, ammesso e servito ai giocatori.

## Ricetta

Invariata, uguale per REAL e SLOP (`shared/game-copy.v1.0.0.ts`): WebP qualità 0,85, lato lungo
al massimo 2048 px senza ingrandimenti, orientamento applicato, sRGB, sfondo bianco per le
trasparenze, nessun metadato. La codifica avviene nel browser dell'owner (il Worker sul piano Free
non ha CPU sufficiente).

## Quando nasce la copia

La copia viene preparata appena la foto entra nella coda, prima di qualunque operazione legata ai
suoi pixel:

- caricamento dal dispositivo (Argomenti → carica);
- acquisizione da Commons, singola o dall'esploratore;
- generazione SLOP dalla dashboard;
- prima del profilo visivo («Analizza i pixel»), che quindi descrive la copia.

Se in uno di questi passaggi la copia non riesce (browser senza esportazione WebP, rete), la scheda
della Revisione la prepara quando è sullo schermo e mostra l'errore con «Riprova». Un modulo
nascosto della dashboard non cambia mai l'identità di una foto mentre l'owner lavora altrove.

## Identità, voti e originali

- `editorial_review_game_copies`: una copia per file della coda (id + hash del file d'origine),
  immutabile; il file è in quarantena sotto `game-copies/<id>/<sha256>.webp`.
- La vista `editorial_review_effective_images` (stesse colonne della 0016) espone la copia come
  file effettivo: `sha256` e `media_key` sono quelli della copia, `source_sha256` resta l'hash
  dell'originale, `metadata_json.game_copy` ne riporta dimensioni, peso e ricetta.
- **Approvare richiede la copia.** La decisione è legata all'hash della copia; un voto dato
  sull'originale non vale per l'ammissione, che a sua volta richiede la copia.
- L'ammissione copia nel catalogo il file effettivo, cioè la copia approvata, e conserva l'originale
  in `originals/`. Il gioco serve esattamente i byte approvati (ripassati dalla pulizia dei metadati
  della 0.30.0, che su un WebP senza metadati non cambia nulla).
- Le presentazioni 1024 della pipeline storica (0016) mantengono la precedenza, come
  normalizzazione esplicita successiva all'approvazione.

## Verifiche del Worker (`POST /api/admin/review-inbox/:id/game-copy?source_sha256=`)

- l'hash indicato deve essere quello dell'originale corrente (oppure quello della copia esistente,
  che viene solo confermata); immagini rifiutate escluse;
- WebP leggibile fino a 4 MB, ripassato dalla pulizia dei metadati;
- dimensioni esattamente uguali a quelle attese dal file in revisione, orientamento compreso;
- una richiesta vuota conferma una copia esistente senza scaricare né ricodificare nulla.

Il Worker non può dimostrare che la copia raffiguri l'originale: per questo è la copia, e non
l'originale, che l'owner guarda e approva.

## Limiti

- Alcune versioni di Safari non esportano WebP: la dashboard lo segnala.
- La qualità del ricampionamento dipende dal browser; usare sempre lo stesso.
- Una copia registrata non si sostituisce.
- Foto già approvate prima della 0.32.0 vanno riaperte in Revisione e approvate di nuovo sulla copia.
- Profili visivi calcolati sull'originale prima della copia non si applicano alla copia.
