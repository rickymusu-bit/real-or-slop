# Correzioni dashboard e link — v1.0.0

Aggiornato: 2026-11-08T12:52:41.502Z. App 0.22.1. Branch `fix/admin-workspace-ux-v0.22.1`.

## Diagnosi

Il vecchio ordine dei moduli era visibile perché `showAdmin()` rendeva i
componenti prima di creare il guscio responsive della dashboard.
La classe `admin-bootstrapping` e lo stato aria-busy impediscono il flash.

La proposta foto accettava un solo link. Il nuovo endpoint batch privato
accetta massimo venti link HTTPS, valida integralmente prima del salvataggio,
ignora i duplicati per argomento e riporta quanti URL sono già presenti.
Non avvia acquisizione, modelli né pubblicazione.

«Proteste a Parigi, ottobre 2026» era un placeholder dimostrativo nel codice,
non un seed automatico. Se l'argomento compare nell'elenco, è presente nei dati
correnti. Nessun record viene eliminato o modificato; inoltre non si seleziona
più automaticamente il primo tema.

Il comando di acquisizione era in un pannello distante dal form e il suo stato
veniva scritto alla fine di una pagina molto lunga. Adesso i link Commons
supportati mostrano «Acquisisci fotografia» accanto alla singola proposta, con
stato visibile e aggiornamento dei pannelli; per gli altri domini viene spiegato
che bisogna caricare l'originale da dispositivo. La verifica di provenienza,
licenza e approvazione resta separata.

## Verifiche

E2E browser 1440px e 390px con provider esterno simulato; proposta di due link,
ripetizione idempotente, acquisizione Commons e verifica stato, procedura
completa di revisione e pubblicazione, nessun flash. Test unitari di
normalizzazione e sicurezza dei link. Nessuna migrazione D1, nessun cambiamento
a segreti/Cloudflare e nessuna nuova spesa AI. Merge e deploy separati.
