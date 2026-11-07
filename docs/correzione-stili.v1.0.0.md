# Ripristino degli stili — 1.0.0

Verificato: 2026-11-07T07:32:50Z. Base main: d204961.

Prima delle modifiche: la home contiene il link al CSS corretto, servito con HTTP
200 e byte identici alla build, ma Content-Type application/octet-stream. Il
browser ignora il foglio; JavaScript crea la pagina priva di stili. Il controllo
post-rilascio precedente verificava JavaScript ma non il MIME CSS.

Decisione: usare `_headers`, supportato ufficialmente dagli asset statici Workers,
per dichiarare text/css sulle sole risorse CSS. Conservare asset statici diretti,
API, autenticazione, dati, budget e pipeline. Nessuna migrazione.

Verifica: estendere i controlli HTTP agli stili e verificare MIME e risorse dopo
ogni deploy. Riprodurre il MIME errato nei test, provare Chromium mobile/desktop
e verificare la risposta CSS effettiva online, anche con cache condizionale.
