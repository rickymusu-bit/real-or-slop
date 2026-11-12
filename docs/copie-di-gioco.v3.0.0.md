# Copie di gioco 4:5 con inquadratura — specifica 3.0.0

Stato: decisioni dell'owner del 2026-11-11 (sezione 1); testo da approvare con la PR. Realizzata nell'app 1.11.0 con la migrazione 0042.
Creata: 2026-11-12T08:00:00Z. Sostituisce `docs/copie-di-gioco.v2.0.0.md` per formato e ricetta; resta valido il principio della 2.0.0:
l'owner approva la copia, non l'originale, e il gioco serve esattamente quei byte. Modifica la sezione 6 di `docs/wizard-slop.v1.4.1.md`
(formati a rotazione) e la sezione 13 (dimensione chiesta al generatore).

## 1. Decisioni dell'owner (2026-11-11)

- «Sul mobile un formato troppo largo o troppo lungo è scomodo, visto che si deve anche leggere la didascalia. Forse bisogna tagliare
  tutte le foto nello stesso formato.» Proposto il 4:5 verticale, con ritaglio scelto dall'owner; approvato.
- «Escludi le ND»: le foto con licenza senza opere derivate escono dal gioco, perché il ritaglio è una modifica della foto.
- Le SLOP si generano direttamente in 4:5 dove il modello lo consente.

Il formato unico toglie anche un indizio: le SLOP uscivano dal generatore solo in tre formati (quadrato, 2:3, 3:2), le REAL in ogni
proporzione.

## 2. Ricetta e inquadratura

- Ricetta uguale per REAL e SLOP (`shared/game-copy.v2.0.0.ts`): **4:5 verticale**, WebP qualità 0,85, al massimo **2048 px di altezza**
  (1638 × 2048), mai ingrandita, orientamento applicato, sRGB, sfondo bianco per le trasparenze, nessun metadato. Identificativo
  `webp-q0.85-4x5-max2048-srgb-v2`.
- **Inquadratura:** un riquadro 4:5 sull'originale orientato, registrato come `{x, y, height}` in pixel (la larghezza è sempre
  `round(height × 4/5)`), colonna `copy_crop` (migrazione additiva `0042_game_copy_crop.v1.0.0.sql`).
- Appena una foto entra nella libreria il browser prepara la copia con il **riquadro centrato più grande**. L'owner lo cambia con
  «Inquadratura» nel passo 2 del wizard REAL e nel dettaglio della sezione Database: trascina il riquadro (o lo sposta con le frecce),
  ne cambia la dimensione con il cursore, «Centra» torna al riquadro centrato. Fuori dal riquadro l'immagine è scurita.
- Riquadro minimo: 64 px di altezza, o meno se l'immagine stessa è più piccola.
- Il server verifica che il riquadro stia nell'immagine e che la copia abbia esattamente le dimensioni attese da quel riquadro; non può
  verificare che i pixel vengano davvero dal riquadro, ed è per questo che l'owner guarda e approva la copia.

## 3. Cambiare la copia

- La 2.0.0 diceva «una copia registrata non si sostituisce». Ora un'immagine `nuova` o `approvata` può cambiare inquadratura: la copia
  nuova sostituisce la vecchia, che esce dalla quarantena. L'immagine resta nello stato in cui era, come per le altre modifiche
  (`docs/database-immagini.v1.0.1.md`, sezione 2): l'owner vede la copia nuova mentre la sceglie.
- Una pubblicata si modifica dopo «Modifica», che la ritira (le partite in corso tengono la copia vecchia fino alla fine).
- Le statistiche si contano sulla copia attuale: una nuova inquadratura le fa ripartire da zero.
- Una copia fatta prima della migrazione 0042 non ha inquadratura: è segnalata «da rifare in 4:5» e blocca approvazione e
  pubblicazione finché l'owner non sceglie l'inquadratura. Il database di produzione era vuoto al rilascio, quindi nessuna foto
  pubblicata è da rifare.

## 4. SLOP

- Generatore: **1024 × 1280** (4:5) per i modelli GPT Image 2.5 e 2.6, che accettano dimensioni libere (multipli di 16, proporzioni
  tra 1:3 e 3:1, riferimento delle API immagini di OpenAI letto il 2026-11-11); **1024 × 1536** (2:3) per gli altri modelli in elenco,
  che offrono solo le dimensioni standard: il riquadro 4:5 ne taglia circa un sesto dell'altezza. Regola in
  `shared/image-size.v1.0.0.ts`, per lo studio SLOP e per la rigenerazione della sezione Database.
- Non è stato verificato con una chiamata reale che `gpt-image-2.5-flare` accetti 1024 × 1280: se lo rifiutasse, OpenAI risponde con
  un errore 4xx senza addebito e la generazione risulta non riuscita. Da controllare alla prima generazione autorizzata dall'owner.

## 5. Licenze senza opere derivate

- Riconosciute dal nome o dall'indirizzo della licenza (`shared/licenses.v1.0.0.ts`): CC BY-ND, CC BY-NC-ND di ogni versione,
  «NoDerivs», «NoDerivatives».
- L'importazione da Commons le **rifiuta** con il motivo. Una REAL già in libreria con una licenza ND è segnalata «licenza ND: esclusa»
  e **non si può approvare né pubblicare**.
- Le foto caricate dal dispositivo non hanno una licenza registrata: la verifica resta dell'owner, come la conferma dei diritti.

## 6. Verifiche

Test unitari `tests/game-copy.v2.0.0.test.ts` (riquadro centrato, limiti, dimensioni, licenze, dimensione del generatore); test
d'integrazione `library.v1.3.0`, `analysis.v1.7.0`, `slop.v1.2.0`, `database.v1.1.0` con l'encoder di prova `tests/game_copy_v2_0_0.py`;
nel browser `database_browser.v1.1.0` (editor dell'inquadratura su desktop e mobile).

## 7. Rischi e limiti

- Il riquadro centrato può tagliare il soggetto: l'owner deve guardare ogni copia prima di approvare.
- Su un originale molto largo il 4:5 ne mostra una parte piccola: va scelta la parte che conta.
- Il gioco mostrerà le copie in un riquadro 4:5 fisso dalla fase successiva (partita a livelli).
