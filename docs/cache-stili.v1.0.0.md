# Aggiornamento della risorsa CSS — 1.0.0

Aggiornato: 2026-11-07T08:22:23Z. Base main: 6ed8b88.

Segnalazione: sul telefono la home resta priva di stili dopo la correzione MIME.
L'URL è confermato dal proprietario. Le richieste desktop/Android alla home e
all'allenamento ricevono ora text/css, ma l'indirizzo del CSS è ancora quello
servito precedentemente come application/octet-stream. La causa sul dispositivo
non è ancora osservabile direttamente; riutilizzo della risorsa e cache del
browser non erano coperti dal test precedente, che usava richieste nuove.

Decisione prima del codice: cambiare il contenuto del foglio con un identificatore
CSS di rilascio diagnostico, ottenendo un nuovo nome Vite con hash. Impedire la
conservazione dell'HTML della home. Nessuna modifica a layout, dati o pipeline.
Verificare browser con cache attiva, anche inizialmente popolata da CSS difettoso,
e confrontare la nuova risorsa online prima di chiedere un riscontro sul telefono.


Riproduzione locale completata con Chromium e cache HTTP attiva (nessuna route
Playwright): HTML/JavaScript reali della versione precedente e CSS con il MIME
errato. Dopo la sola correzione del tipo, al reload il browser conserva il layout
senza stili e la freccia da 374 px, sia con max-age=0 sia con max-age=3600. Con il
nuovo URL compilato recupera il tema scuro, identifica il foglio 0.16.2 e mostra
la freccia da 16 px. Questo dimostra il caso che mancava nella verifica precedente;
il riscontro finale sul dispositivo del proprietario resta necessario.
