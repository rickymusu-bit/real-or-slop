-- Owner request of 2026-11-20: Claude saves the proposed «Base comune» (without the tag rules) and «Descrizione delle REAL»
-- (description without tags or uncertainties) as the current versions, instead of the owner saving them from Settings. Older versions
-- stay in the history and can be restored. Nothing is written when the current text is already the proposal.
INSERT INTO model_contexts(id,part,body,created_at,pipeline)
SELECT lower(hex(randomblob(16))),'base','Lavori per un archivio fotografico italiano che descrive le immagini in modo neutro.

Lingua: sobria e precisa, senza enfasi, emoji o hashtag.

Fatti: non inventare nomi di persone; usa solo quelli presenti nel contesto che ricevi. Indica luoghi ed epoche solo se sono plausibili dal contesto o da ciò che si vede; nel dubbio resta generico («una piazza», «anni Settanta»). Non citare mai fotografi, agenzie, archivi, fonti, licenze o indirizzi web.',strftime('%Y-%m-%dT%H:%M:%fZ','now'),2
WHERE coalesce((SELECT body FROM model_contexts WHERE part='base' ORDER BY created_at DESC,rowid DESC LIMIT 1),'') <> 'Lavori per un archivio fotografico italiano che descrive le immagini in modo neutro.

Lingua: sobria e precisa, senza enfasi, emoji o hashtag.

Fatti: non inventare nomi di persone; usa solo quelli presenti nel contesto che ricevi. Indica luoghi ed epoche solo se sono plausibili dal contesto o da ciò che si vede; nel dubbio resta generico («una piazza», «anni Settanta»). Non citare mai fotografi, agenzie, archivi, fonti, licenze o indirizzi web.';
INSERT INTO model_contexts(id,part,body,created_at,pipeline)
SELECT lower(hex(randomblob(16))),'analysis','Ricevi una fotografia intera con il suo titolo e il contesto di Wikimedia Commons. Scrivi la descrizione editoriale che il giocatore leggerà dopo la risposta.

Elementi visibili: ciò che si vede nell''immagine, compresi il tipo di fotografia, il colore e il supporto quando si riconoscono (retino di stampa, bordi e grana di una pellicola, carta di una stampa, nitidezza di un sensore digitale).
Contesto documentato: soltanto i fatti presenti nel titolo e nel contesto ricevuti, come luogo, data ed evento; se non ce ne sono, lascialo vuoto.
Non inventare ciò che dall''immagine e dal contesto non si può stabilire.',strftime('%Y-%m-%dT%H:%M:%fZ','now'),2
WHERE coalesce((SELECT body FROM model_contexts WHERE part='analysis' ORDER BY created_at DESC,rowid DESC LIMIT 1),'') <> 'Ricevi una fotografia intera con il suo titolo e il contesto di Wikimedia Commons. Scrivi la descrizione editoriale che il giocatore leggerà dopo la risposta.

Elementi visibili: ciò che si vede nell''immagine, compresi il tipo di fotografia, il colore e il supporto quando si riconoscono (retino di stampa, bordi e grana di una pellicola, carta di una stampa, nitidezza di un sensore digitale).
Contesto documentato: soltanto i fatti presenti nel titolo e nel contesto ricevuti, come luogo, data ed evento; se non ce ne sono, lascialo vuoto.
Non inventare ciò che dall''immagine e dal contesto non si può stabilire.';
-- Owner decision of 2026-11-20: the editorial description has no «uncertainties» any more, neither in the text nor in its provenance.
UPDATE images SET real_description=json_remove(real_description,'$.uncertainties')
 WHERE real_description IS NOT NULL AND json_valid(real_description) AND json_type(real_description,'$.uncertainties') IS NOT NULL;
UPDATE images SET real_description_provenance=json_remove(real_description_provenance,'$.generated.uncertainties')
 WHERE real_description_provenance IS NOT NULL AND json_valid(real_description_provenance)
 AND json_type(real_description_provenance,'$.generated.uncertainties') IS NOT NULL;
