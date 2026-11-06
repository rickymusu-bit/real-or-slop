---
version: 1.0.0
created_at: 2026-11-06T17:00:00Z
status: provider-challenge-draft-only
source_issue: 56
---

# Accesso API Openverse

Verifica del 2026-11-06T16:48:06.704331Z con lo stesso `SearchClient` ufficiale
usato dalla pipeline, User-Agent identificativo e proxy/TLS ereditati dall'ambiente.
Nessuna credenziale Openverse è configurata: la richiesta è anonima. Il client
supporta già access token o client credentials quando configurati come secret;
non si stampano valori, non si registrano account con dati inventati.

| Evidenza | Valore osservato |
| --- | --- |
| Endpoint | `GET https://api.openverse.org/v1/images/?q=wildlife+rescue&page_size=1&page=1` |
| Stato | HTTP 403 |
| Content-Type | `text/html; charset=UTF-8` |
| Risposta | Challenge Cloudflare "Just a moment", non un JSON dell'API |
| Ray ID | `a565958119aba1c5-MSP` |
| Numero richieste della diagnosi | 1 |
| Inferenze o download | 0 |

La policy HTTP dell'ambiente risulta unrestricted/enforced. La pagina di challenge
identifica un ostacolo del servizio/perimetro Cloudflare, non un errore della
query. Non dimostra da sola quale regola o reputazione IP abbia causato il falso
positivo. Non basta presumere che aggiungere un token risolva il problema.

## Verifiche ufficiali e riproduzione

```sh
npm run check:openverse
npm run check:openverse -- --live
```

Senza `--live` non c'è rete. Il comando usa il client esistente, incluso OAuth
se le credenziali sono già configurate; al massimo due richieste (token + query).
Il report distingue challenge, 401, 403 JSON, rate limit e protocollo non valido.
Non registra il corpo dell'errore, header di autorizzazione, token o secret.
Non cambia IP/proxy, non esegue challenge browser e non prova host alternativi.

La [documentazione ufficiale](https://docs.openverse.org/api/reference/authentication_and_throttling.html)
descrive OAuth e tier. Il [runbook ufficiale di traffico](https://docs.openverse.org/meta/monitoring/traffic/runbooks/identifying-and-blocking-traffic-anomalies.html)
descrive regole WAF e managed challenge. Le issue pubbliche
[#5478](https://github.com/WordPress/openverse/issues/5478) e
[#5625](https://github.com/WordPress/openverse/issues/5625) riportano casi analoghi,
anche con applicazioni registrate: sono precedenti, non prova della causa esatta
di questa richiesta. Non sono stati usati proxy o servizi intermediari citati
nelle discussioni.

## Sblocco necessario

Il percorso supportato è chiedere a Openverse una verifica della challenge e la
modalità consentita per questo client API. Se richiedono un'app registrata,
il proprietario può configurare client ID/secret nel gestore dei secret
dell'ambiente; poi si ripete il comando ufficiale. La registrazione/autenticazione
non viene presentata come soluzione già provata al filtro Cloudflare.

È pronta sotto una segnalazione concreta per il thread pubblico
[#5625](https://github.com/WordPress/openverse/issues/5625). **Non è stata inviata**:
il proprietario ha scelto esplicitamente **"Lascia soltanto la bozza"**.
Non pubblicare messaggi senza una nuova istruzione. Non sono state modificate regole del provider,
credenziali o configurazione cloud.

### Bozza pronta per la pubblicazione

```text
We are evaluating the official Openverse image API for Real or Slop
(https://github.com/rickymusu-bit/real-or-slop), with bounded requests,
attribution/license verification and no automatic image publication.

Our server-side Python client receives a Cloudflare challenge:
- UTC: 2026-11-06T16:48:06.704331Z
- GET https://api.openverse.org/v1/images/?q=wildlife+rescue&page_size=1&page=1
- User-Agent: RealOrSlop/1.0 (https://github.com/rickymusu-bit/real-or-slop)
- HTTP 403, text/html; charset=UTF-8, "Just a moment" challenge page
- cf-ray: a565958119aba1c5-MSP
- Authentication: anonymous; no account or token has been registered for this test

We stopped after one diagnostic request. We are not attempting challenge bypass,
proxy rotation or aggressive retries. No credentials or private media are included.

Could you review the false-positive challenge and advise the supported process
for permitting this legitimate API client? If application registration or a
specific authentication setup is required, please let us know the supported path.
We can provide further request details privately if needed.
```

Fino allo sblocco, Openverse rimane indisponibile e distinto dai risultati
Commons. Nessun risultato sintetico viene spacciato per accesso reale riuscito.
