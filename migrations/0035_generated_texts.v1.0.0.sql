-- v1.0.0, 2026-11-09T22:50:37Z: docs/libreria-immagini.v1.4.0.md, section 10. Additive.
-- Owner decision of 2026-11-09: generation replaces tags and caption of the chosen images, happens at most once per
-- image, and the generated texts can always be restored at no cost. They are kept here, apart from the editable
-- fields. NULL: never generated. generated_tags is a JSON array of tag labels.
ALTER TABLE images ADD COLUMN generated_caption TEXT;
ALTER TABLE images ADD COLUMN generated_tags TEXT;
