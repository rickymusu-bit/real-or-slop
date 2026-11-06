---
version: 1.0.0
created_at: 2026-11-06T18:47:00Z
status: registration-guide-no-client-created
---

# Registrare il client Openverse di Real or Slop

La [documentazione ufficiale](https://api.openverse.org/v1/) descrive la
registrazione dell'applicazione tramite API. Servono nome univoco dell'app,
descrizione e un'email di contatto. Non basta il solo client ID: la risposta
contiene anche un client secret da conservare privatamente. Openverse invia
un link all'email: occorre confermarlo per ottenere i limiti autenticati.

Per preparare la registrazione del progetto:

- Nome proposto: `real-or-slop-rickymusu-bit` (deve essere ancora disponibile).
- Descrizione: `Private photographic discovery pilot for the Real or Slop image-origin game.`
- Email: quella scelta dal proprietario, mai dedotta dai commit o pubblicata nei report.

Si invia un solo `POST https://api.openverse.org/v1/auth_tokens/register/`
con corpo JSON e campi `name`, `description`, `email`. Il client ID e il secret
ricevuti vanno salvati subito: non sono recuperabili successivamente tramite
questa procedura. Non inserirli in issue, PR, repository o messaggi pubblici.

## Se si esegue dal proprio computer

Creare `registrazione-openverse.json` con questi campi, sostituendo l'email:

```json
{
  "name": "real-or-slop-rickymusu-bit",
  "description": "Private photographic discovery pilot for the Real or Slop image-origin game.",
  "email": "LA_TUA_EMAIL"
}
```

Da un terminale nella stessa cartella, salvare la risposta in un file privato:

```sh
umask 077
curl --fail-with-body --request POST \
  'https://api.openverse.org/v1/auth_tokens/register/' \
  --header 'Content-Type: application/json' \
  --data-binary @registrazione-openverse.json \
  --output openverse-client.private.json
```

Controllare che il file contenga JSON con `client_id` e `client_secret`, poi
confermare il link ricevuto per email. Se contiene una pagina HTML/challenge
o un errore, la registrazione non è dimostrata; evitare invii ripetuti.

## Uso nella pipeline

Configurare privatamente nell'ambiente di esecuzione `OPENVERSE_CLIENT_ID` e
`OPENVERSE_CLIENT_SECRET`. Il `SearchClient` del progetto scambia le credenziali
per un token tramite `POST /v1/auth_tokens/token/`, con corpo form-urlencoded
e `grant_type=client_credentials`; aggiunge poi il bearer token alle ricerche.
Non occorre copiare un access token a ogni esecuzione. È supportato anche
`OPENVERSE_ACCESS_TOKEN` se già disponibile, ma ha una scadenza.

```sh
npm run check:openverse -- --live
```

Il controllo stampa modalità di autenticazione ed esito senza valori delle
credenziali. La [documentazione su autenticazione e limiti](https://docs.openverse.org/api/reference/authentication_and_throttling.html)
spiega il livello standard ottenuto autenticandosi. L'API supporta anche richieste
anonime: il precedente 403 HTML con challenge Cloudflare non dimostra da solo
che manchino credenziali. Dopo la registrazione si verifica separatamente
l'esito OAuth e quello della ricerca, senza promettere lo sblocco del firewall.

La segnalazione pubblica preparata nel report di accesso resta soltanto una bozza,
come richiesto dal proprietario. Questa guida non registra automaticamente client,
non invia email dal suo account e non contiene credenziali.
