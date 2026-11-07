# Aggiornamenti asincroni della dashboard — 1.0.0

Aggiornato: 2026-11-07T20:09:10Z. Issue #64 / PR #77.

La prima CI del commit `64d5c80` ha superato unit test, build, migrazioni e
integrazione HTTP, ma il browser mobile ha trovato «Analizza i pixel» nascosto
dopo l'apertura del pannello. Il refresh successivo all'upload ricreava i
`details` chiusi e poteva arrivare dopo l'interazione dell'owner.

La dashboard conserva ora le sezioni aperte durante il rendering, ignora risposte
superate da un refresh più recente o da un cambio di argomento, e non annulla il
blocco dei comandi mentre una chiamata esplicita è ancora in corso. Nessuna nuova
chiamata a pagamento, migrazione o variazione del protocollo.

Il browser E2E verifica che il ranking resti aperto dopo profilazione e confronto
con il tema, su desktop e mobile, senza forzare i click o ignorare elementi nascosti.
Il rilascio rimane subordinato alla nuova CI completa.
