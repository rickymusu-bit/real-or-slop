---
version: 1.0.0
created_at: 2026-11-06T18:51:20.887633Z
status: provider-challenge-client-not-created
---

# Tentativo di registrazione Openverse

Dopo la scelta dell'email da parte del proprietario è stata inviata una sola
richiesta ufficiale `POST https://api.openverse.org/v1/auth_tokens/register/`
con nome applicazione, descrizione ed email. L'email e il payload completo
rimangono nei file privati, non in questo report.

| Campo | Esito |
| --- | --- |
| UTC | `2026-11-06T18:51:20.887633Z` |
| HTTP | 403 |
| Content-Type | `text/html; charset=UTF-8` |
| Classificazione | Challenge Cloudflare prima della registrazione |
| Ray ID | `a5664a028a544c9e-MSP` |
| SHA-256 corpo osservato | `b09573195ffb6519232f2bc2f154dfa6ab477e09360c6bdb6e9fa5cee8e2993c` |
| Credenziali ricevute | Nessuna |

Il client non risulta creato; non è dimostrato l'invio di alcuna email di verifica.
Nessun retry automatico, credenziale inventata o richiesta a host alternativi.
Il diniego proviene dalla destinazione, non da una bocciatura di approvazione
automatica dell'assistente.

La [guida](openverse-registrazione.v1.0.0.md) descrive registrazione e OAuth.
Il file `.pipeline/openverse/registration-request.v1.0.0.json` è già compilato
con l'email scelta e ha permessi privati. Dal proprio computer si può scaricarlo
e inviare la richiesta con il comando della guida, sostituendo il nome del file
di input; salvare privatamente l'eventuale risposta, poi confermare il link email.
La richiesta può comunque essere soggetta alle protezioni del provider.

Solo dopo una registrazione riuscita si può verificare il token e ripetere la
ricerca autenticata. L'API documenta anche accesso anonimo: il solo 403 HTML
non dimostra che il problema sia esclusivamente di autenticazione. La bozza di
segnalazione al progetto esterno resta non pubblicata come richiesto.
