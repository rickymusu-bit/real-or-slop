# Verifica isolata delle chiamate AI della dashboard — 1.0.0

Aggiornato: 2026-11-07T15:33:21.304Z. Test della issue #64, senza servizi esterni.

`tests/workspace-ai-transport.v1.0.0.test.ts` esegue direttamente il codice del Worker per la preparazione delle chiamate e la registrazione dei job, con database in memoria e trasporto HTTP simulato. Non configura token reali, non effettua chiamate di rete e non tocca il database o lo storage di produzione.

I casi controllano:
1. Prenotazione prima dell'invio della richiesta Responses, output JSON strutturato e `store:false`.
2. Audit e riuso del risultato della stessa operazione senza chiamata o prenotazione duplicata.
3. Risposta del provider fallita/incerta: stato `uncertain`, nessun secondo invio alla ripetizione della stessa chiave operativa.
4. Generazione SLOP singola, formato indipendente dal ramo REAL, prenotazione contabile e blocco di un secondo invio allo stesso slot.

Questi test verificano la logica del Worker e il protocollo interno, ma **non** riproducono completamente D1 (transazioni SQL e trigger), R2, una tariffa reale né la resa visiva di una generazione. Per il rilascio occorrono anche i test HTTP su un Worker locale con backend finto e un controllo dell'interfaccia amministrativa.

Nessun flag di spesa attivato o modificato dalla PR.
