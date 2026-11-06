---
version: 1.0.0
created_at: 2026-11-06T18:28:00Z
status: local-verification-not-activated
source_issue: 56
---

# Verifica del ciclo riprendibile REAL

Base: `af24eb7` sul branch `feat/56-real-discovery`, PR #59 sulla #58.
Specifica del delta e comandi: [ciclo REAL](ciclo-discovery-real.v1.0.0.md).
Nessuna inferenza pagata o nuova verifica fotografica reale in questa consegna.

## Risultati

- `npm test`: 18 file Node e 208 test Python, tutti passati con Python 3.12.14
  e dipendenze del repository. Undici nuovi test del ciclo coprono attese,
  gate prima degli effetti, ripresa/cache, documenti e pixel revisionati,
  ricevute A/B, diniego provider, feedback, HTML/export e handoff privato.
- `npm run lint`, `npm run build`, `npm run deploy:check`: passati. Resta
  l'avviso preesistente sul chunk della similarità oltre 500 kB.
- `npm run dry-run`: packaging Worker passato, senza deploy remoto.
- `ROS_TEST_REAL=1 npm run test:integration`: passata la suite locale completa,
  incluse prenotazioni atomiche, budget cumulativi, cache del modello fittizio,
  sampling, gioco e scadenza server. Il primo avvio non poteva aprire socket
  locali nella sandbox; rieseguito con accesso di rete del processo, senza API
  pagate o database remoto.
- `npm run benchmark:pilot -- --fixture`: quattro caselle, 12 richieste
  simulate del client A/B; 8 ricerche simulate generali e 4 adattate effettive
  perché la fixture ripete varianti e riusa la cache. Il rapporto dichiara
  i conteggi effettivi; nessuna conclusione di efficacia da questi numeri.
- `--report-only` sul pilota: passato, aggiorna le misure locali senza client
  HTTP/modello. Resa documentale/editoriale ancora non misurata, valori `null`.
- Rigenerazione offline della galleria del controllo Commons già eseguito:
  151 candidate, zero review abilitate prima di dossier e profili; vecchio
  `index.html` e cache di anteprime preservati. Nessuna nuova ricerca/download.

I test di revisione verificano che correggere le sole prove riusi la valutazione
degli stessi pixel; cambiare pixel richieda un nuovo profilo e non erediti
approvazioni; i file precedenti rimangano identici. L'export positivo è provato
su dati dichiaratamente sintetici in directory temporanee, senza attribuirlo
a una vera approvazione del proprietario o a un'ammissione in produzione.

## Limiti operativi

Il benchmark Commons live precedente resta un controllo con query manuali.
Il nuovo pilota da output GPT è implementato ma non eseguito a pagamento:
richiede un tetto di spesa esplicito, ledger e gate. La resa delle fotografie
autentiche/licenziabili/interessanti richiede dossier e review individuale.
Openverse resta soggetto alla challenge descritta nel report di accesso; la
segnalazione rimane una bozza, come richiesto dal proprietario.

Nessun merge, rilascio, cron, migrazione remota, pubblicazione di immagini,
modifica di secret o eliminazione delle pipeline/dati storici.
