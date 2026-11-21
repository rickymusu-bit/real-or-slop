-- Owner decisions of 2026-11-20: the REAL have no editorial description and the SLOP no description. The results show the credits
-- of a REAL and the prompt and model of a SLOP; the SLOP proposals read the whole original, its title and its source description.
-- The paid analysis of the REAL goes with its fields. Paid calls already recorded stay in the register.
--
-- On the owner's request the proposed «Base comune» (without tags and descriptions) and «Premessa e prompt di galleria» (which now
-- reads the source description) become the current versions, unless they already are. Older versions, those of the retired
-- «Descrizione delle REAL» included, stay in the history.
INSERT INTO model_contexts(id,part,body,created_at,pipeline)
SELECT lower(hex(randomblob(16))),'base','Lavori per un archivio fotografico italiano.

Lingua: sobria e precisa, senza enfasi, emoji o hashtag.

Fatti: non inventare nomi di persone; usa solo quelli presenti nel contesto che ricevi. Indica luoghi ed epoche solo se sono plausibili dal contesto o da ciò che si vede; nel dubbio resta generico («una piazza», «anni Settanta»). Non citare mai fotografi, agenzie, archivi, fonti, licenze o indirizzi web.',strftime('%Y-%m-%dT%H:%M:%fZ','now'),2
WHERE coalesce((SELECT body FROM model_contexts WHERE part='base' ORDER BY created_at DESC,rowid DESC LIMIT 1),'') <> 'Lavori per un archivio fotografico italiano.

Lingua: sobria e precisa, senza enfasi, emoji o hashtag.

Fatti: non inventare nomi di persone; usa solo quelli presenti nel contesto che ricevi. Indica luoghi ed epoche solo se sono plausibili dal contesto o da ciò che si vede; nel dubbio resta generico («una piazza», «anni Settanta»). Non citare mai fotografi, agenzie, archivi, fonti, licenze o indirizzi web.';
INSERT INTO model_contexts(id,part,body,created_at,pipeline)
SELECT lower(hex(randomblob(16))),'slop_gallery_prompt','Per una galleria tematica proponi un falso fotografico concreto e scrivi il prompt inglese. Usa la foto intera, il suo titolo e la descrizione della fonte per scegliere una possibilità compatibile con le indicazioni della galleria. Rendi specifici l’invenzione e gli elementi reali da conservare, come la geografia, un edificio riconoscibile o gli elementi visibili di una mobilitazione. Varia le premesse quando le foto lo consentono. Privilegia credibilità fotografica, luce e tecnica plausibili.',strftime('%Y-%m-%dT%H:%M:%fZ','now'),2
WHERE coalesce((SELECT body FROM model_contexts WHERE part='slop_gallery_prompt' ORDER BY created_at DESC,rowid DESC LIMIT 1),'') <> 'Per una galleria tematica proponi un falso fotografico concreto e scrivi il prompt inglese. Usa la foto intera, il suo titolo e la descrizione della fonte per scegliere una possibilità compatibile con le indicazioni della galleria. Rendi specifici l’invenzione e gli elementi reali da conservare, come la geografia, un edificio riconoscibile o gli elementi visibili di una mobilitazione. Varia le premesse quando le foto lo consentono. Privilegia credibilità fotografica, luce e tecnica plausibili.';
UPDATE images SET description='' WHERE origin='SLOP';
ALTER TABLE images DROP COLUMN real_description;
ALTER TABLE images DROP COLUMN real_description_provenance;
ALTER TABLE images DROP COLUMN commons_description;
ALTER TABLE images DROP COLUMN analysis_status;
ALTER TABLE images DROP COLUMN analysis_error;
ALTER TABLE images DROP COLUMN analyzed_at;
ALTER TABLE images DROP COLUMN analysis_base_context;
ALTER TABLE images DROP COLUMN analysis_task_context;
