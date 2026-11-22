-- Owner decision of 2026-11-22: the SLOP instructions of a gallery go, with their suggestion by a model. They were written from the title
-- alone and did not refer to the photos; each REAL has its own approved ideas. An idea is «to review» only when its REAL moves to
-- another gallery, so the revision stamped on an idea goes too. Title and description of a gallery stay as context.
ALTER TABLE galleries DROP COLUMN slop_instructions;
ALTER TABLE real_ideas DROP COLUMN gallery_revision;
-- «Premessa e prompt di galleria» still equal to the proposal saved by migration 0066 (it chose among the gallery instructions)
-- becomes the new proposal, which develops the idea; a text written by the owner stays and the proposal is offered beside it.
INSERT INTO model_contexts(id,part,body,created_at,pipeline)
SELECT lower(hex(randomblob(16))),'slop_gallery_prompt','Per una galleria tematica sviluppa in un falso fotografico concreto l’idea approvata per la REAL e scrivi il prompt inglese. Usa la foto intera, il suo titolo e la descrizione della fonte. Rendi specifici l’invenzione, quando c’è, e gli elementi reali da conservare, come la geografia, un edificio riconoscibile o gli elementi visibili di una mobilitazione. Varia le premesse quando le foto lo consentono. Privilegia credibilità fotografica, luce e tecnica plausibili.',strftime('%Y-%m-%dT%H:%M:%fZ','now'),2
WHERE (SELECT body FROM model_contexts WHERE part='slop_gallery_prompt' ORDER BY created_at DESC,rowid DESC LIMIT 1)='Per una galleria tematica proponi un falso fotografico concreto e scrivi il prompt inglese. Usa la foto intera, il suo titolo e la descrizione della fonte per scegliere una possibilità compatibile con le indicazioni della galleria. Rendi specifici l’invenzione e gli elementi reali da conservare, come la geografia, un edificio riconoscibile o gli elementi visibili di una mobilitazione. Varia le premesse quando le foto lo consentono. Privilegia credibilità fotografica, luce e tecnica plausibili.';
