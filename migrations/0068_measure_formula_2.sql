-- Formula 2 of the measure of the REAL (owner decision of 2026-11-21, after the first measures): seven kinds of detail graded 0, 1 or 2,
-- people and anatomy among them. The measures already taken keep their scores and say they used formula 1.
ALTER TABLE real_measures ADD COLUMN formula INTEGER NOT NULL DEFAULT 1 CHECK(formula IN (1,2));
-- «Misura delle REAL» still equal to the first proposal of the code (graded kinds would contradict it) becomes the new proposal; a text
-- written by the owner stays and the new proposal is offered beside it.
INSERT INTO model_contexts(id,part,body,created_at,pipeline)
SELECT lower(hex(randomblob(16))),'real_measure','Misuri una fotografia per capire quanto sarebbe difficile riprodurla con un generatore di immagini. Non descriverla, non interpretarla e non giudicarne l''autenticità: osserva soltanto.

Soggetto: l''oggetto principale della foto, di solito quello del tema della galleria.

Altri oggetti: elenca ogni altro oggetto nitido che chi guarda saprebbe nominare (una cartuccia, una tazza, un cavo, una mano, una persona), compresi altri oggetti del tema della galleria. Oggetti uguali ripetuti contano uno per uno. Non elencare superfici e fondi (muro, pavimento, tavolo, tessuto, cielo), mobili che fanno da sfondo (divano, poltrona, sedile, scaffale) né oggetti sfocati di cui non si distingue alcun dettaglio. Le parti di un oggetto non sono oggetti a sé; una persona è un solo oggetto.

Riquadro: per ogni oggetto il rettangolo più stretto che lo contiene, in coordinate normalizzate sull''immagine intera.

Dettaglio: per ogni oggetto dai a ogni categoria un grado. 0: assente o non leggibile. 1: presente e leggibile. 2: fitto o minuto, cioè molti elementi piccoli o precisi da riprodurre esattamente. Categorie: scritte e loghi leggibili (2 se piccoli o numerosi); motivi ripetuti come feritoie, griglie, tasti in fila (2 se fitti); parti contabili come tasti, viti, porte (2 se molte o piccole); texture dei materiali (2 se la grana è nitida da vicino); superfici riflettenti o schermi (2 se riflessi o immagini sono complessi); giunzioni e meccanismi come cerniere, sportelli, fessure (2 se molti o in primo piano); persone e anatomia: mani, dita, volti, corpi (2 se mani o volti sono nitidi e in primo piano).

Nomi degli oggetti in italiano, brevi e generici.',strftime('%Y-%m-%dT%H:%M:%fZ','now'),2
WHERE (SELECT body FROM model_contexts WHERE part='real_measure' ORDER BY created_at DESC,rowid DESC LIMIT 1)='Misuri una fotografia per capire quanto sarebbe difficile riprodurla con un generatore di immagini. Non descriverla, non interpretarla e non giudicarne l''autenticità: osserva soltanto.

Soggetto: l''oggetto principale della foto, di solito quello del tema della galleria.

Altri oggetti: elenca ogni altro oggetto che chi guarda saprebbe nominare (una cartuccia, una tazza, un cavo, una mano, una persona), compresi altri oggetti del tema della galleria. Non elencare superfici e fondi (muro, pavimento, tavolo, tessuto, cielo) né ciò che è così sfocato da non distinguersi. Oggetti uguali ripetuti contano uno per uno.

Riquadro: per ogni oggetto un rettangolo approssimativo che lo contiene, in coordinate normalizzate sull''immagine intera.

Dettaglio: per ogni oggetto segna soltanto le categorie leggibili nell''immagine: scritte e loghi leggibili; motivi ripetuti (feritoie, griglie, tasti in fila); parti contabili (tasti, viti, porte); texture dei materiali (plastica goffrata, metallo spazzolato, usura); superfici riflettenti o schermi; giunzioni e meccanismi (cerniere, sportelli, fessure tra le parti).

Nomi degli oggetti in italiano, brevi e generici.';
