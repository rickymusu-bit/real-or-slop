# Diagnostica build — 2026-11-06

Verifica dei log GitHub Actions e Cloudflare, senza rilanciare vecchi deploy o
applicare migrazioni remote.

## Errore attuale della CI

Il [job GitHub del commit 701b679](https://github.com/rickymusu-bit/real-or-slop/actions/runs/42167970993/job/127728798883)
fallisce nel test di ripresa editoriale v2. La fixture imposta ancora CC0 come
licenza delle nuove SLOP, mentre la policy richiesta dal proprietario accetta
CC BY 4.0 con attribuzione. Lint, unit test, build e integrazioni precedenti
nel job erano passati.

La fixture di configurazione corrente usa ora CC BY 4.0. Il dossier storico
del test conserva CC0: un'asserzione esplicita verifica che la ripresa non
riscriva quella licenza e non invii nuove generazioni. Il vincolo della
pipeline e della pubblicazione non viene allentato. Il test v2 isolato passa
localmente con API simulate.

## Fallimenti storici Cloudflare

Due build di produzione del 4 novembre sono state fermate dal controllo
preventivo dello schema, prima del deploy:

| Build | Commit | Migrazione allora pendente |
| --- | --- | --- |
| `47fe73de-5611-4d43-b32f-f963546ef9de` | `18ff5e` | `0015_rejected_review_deletion.sql` |
| `2433e986-66b1-44b9-a66e-59b7c3bb0e5d` | `33486c` | `0013_editorial_v2_experiments.sql` |

Il controllo chiede backup e approvazione esplicita quando rileva migrazioni
pendenti. La lettura della tabella remota `d1_migrations` conferma ora le
migrazioni da 0001 a 0017, comprese 0013 e 0015. La 0018 della matrice resta
locale alla PR: non è stata applicata alla produzione.

L'ultima build di produzione, `9daa6d81-1c4c-4533-ba66-3890ac5a358c`, sul
commit `67ecf49` del 5 novembre, risulta riuscita. Non occorre rilanciare
vecchi commit per eliminare il loro stato storico di errore.

## Preview della PR #55

Le sette build recenti della preview risultano riuscite; la più recente
verificata prima di questa correzione è
`0171ca02-fc54-461c-bf84-a30b7d56b0d4`, sul commit `701b679`.
I log segnalano binding DB, QUARANTINE e IMAGES assenti nella preview: il
successo della build non certifica il funzionamento delle rotte che li
richiedono. Non sono stati collegati i dati di produzione alla preview.

I push sulla PR attivano la preview automatica già configurata in Cloudflare.
Questa correzione non avvia un rilascio di produzione né modifica trigger,
binding, segreti o guardie delle migrazioni.
