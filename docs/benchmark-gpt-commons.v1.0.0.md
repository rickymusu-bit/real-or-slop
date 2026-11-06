---
version: 1.0.0
created_at: 2026-11-06T18:49:50Z
status: live-query-pilot-completed-documentary-review-deferred
source_issue: 56
---

# Pilota GPT su Commons

Il proprietario ha autorizzato il pilota GPT e rinviato origine e licenze.
Il controllo manuale precedente resta distinto e conservato. Questo pilota usa
le query delle risposte effettive di GPT-6.1 Terra, con ricevute dei due stadi
verificate contro input, output, modello e request ID. Nessun testo manuale
sostituisce le query restituite. Il confronto riguarda soltanto il retrieval.

## Campione e risultati

Quattro caselle già usate nel controllo manuale, due strategie per casella:
quattro chiamate A e otto B. Per ciascuna strategia si confrontano la query
generale e la prima variante testuale adattata a Commons. Le altre eventuali
varianti restano archiviate. Nessuna esplorazione di categorie in questo pilota.
Ogni braccio dispone di otto richieste, una pagina di massimo venti record,
stesso filtro `filetype:bitmap`, ordine seedato 56 prima del retrieval.

| Casella | Generali: file distinti | Adattate GPT: file distinti |
| --- | ---: | ---: |
| Animali / compassione / media | 0 | 5 |
| Scienza e tecnologia / curiosità / media | 5 | 8 |
| Case e architettura / nostalgia / bassa | 5 | 4 |
| Viaggi e paesaggi / meraviglia / alta | 1 | 2 |
| Totale per braccio | 11 | 19 |

Le richieste effettive sono otto per ciascun braccio, senza errori HTTP.
Cinque query generali e due adattate non restituiscono file accettati.
Il decoder accetta JPEG/PNG/WebP: sedici altri formati sono esclusi nel braccio
adattato. Sono 29 fonti distinte nell'unione, una presente in entrambi i gruppi.
Gli URL di licenza riconosciuti nei metadati sono 8/11 e 3/19 rispettivamente:
questo controllo meccanico non equivale a verificare diritti o autenticità.

Esempi dalle risposte, senza riformulazioni manuali:

| Generale | Adattata a Commons |
| --- | --- |
| `volunteer feeding dog in animal shelter kennel` | `volunteer feeding dog animal shelter` |
| `technician testing an open circuit board` | `technician testing circuit board` |
| `older neighborhood houses front porches summer` | `older houses front porches summer` |

Il campione è piccolo e limitato a Commons/prima pagina. L'adattamento aumenta
i file restituiti in questo campione ma non dimostra che siano fotografie migliori
o ammissibili. I risultati non si confrontano come efficacia con il precedente
controllo manuale da 149 file, che usa query diverse. Profilazione visiva, review
documentale e approvazione umana non sono eseguite: la resa approvata resta `null`.

## Primo tentativo e correzione

La prima risposta conteneva un identificativo come `1,2,...44(more)`, incompatibile
con gli slug richiesti. L'API applicava il `pattern` JSON Schema come ricerca
di sottostringa, mentre il validatore locale usa `fullmatch`. La pipeline ha
conservato la risposta come `invalid` e si è fermata prima di qualsiasi ricerca.

La compilazione dello schema inviato all'API ora ancora i pattern all'intera
stringa, mantenendo invariato il contratto locale. La nuova revisione del run
contiene dodici risposte valide; quella iniziale resta nell'archivio precedente.
Non sono stati modificati ID/query nelle risposte, cancellate ricevute o reinviate
richieste incerte. Un test riproduce il difetto, verifica lo stop su risposta
invalida e richiede una nuova revisione esplicita per ripartire.

## Costi e conservazione

Tredici chiamate complessive, inclusa quella rifiutata dal validatore. Il ledger
D1 locale isolato conserva tredici prenotazioni per 0,53 USD: 0,05 per il primo
tentativo e 12 × 0,04 per la revisione valida, entro il tetto di 0,60 USD.
Ogni richiesta è limitata a 4.000 token di output; nella revisione valida il corpo
JSON è limitato a 10.000 byte. Nessun modello è chiamato dal Worker di prenotazione.

Uso complessivo riportato dalle API: 11.461 token input, di cui 1.346 cached e
5.390 cache-write, e 1.188 output. Con le [tariffe pubbliche del modello](https://developers.openai.com/api/docs/models/gpt-6.1-terra)
e le assunzioni salvate nel JSON, la stima è circa **0,0175 USD**. Non è una fattura:
prenotazioni, costo stimato e addebito effettivo restano distinti.

Rapporto aggregato: [benchmark-gpt-commons.v1.0.0.json](benchmark-gpt-commons.v1.0.0.json).
Ricevute complete, query/output e candidate restano privati sotto
`.pipeline/real-pilot/v1.0.0` (tentativo invalido e ledger) e `v1.1.0` (pilota valido).
La galleria privata della revisione valida contiene 29 candidate con anteprime
Wikimedia; la singola chiamata aggiuntiva per gli URL delle anteprime è separata
dalle sedici ricerche del confronto. Nessun originale scaricato o pubblicato.

## Verifica e passo successivo

`npm test`: 18 file Node e 209 test Python passati; controlli mirati finali REAL:
37 test passati. La compilazione dello schema non modifica schemi storici o dati.
La galleria ora distingue i file di configurazione/rapporto dalle ricevute SHA
nei run annidati del pilota; il test attraversa anche questo layout.

Origine e licenze rimangono pendenti per richiesta del proprietario; nessuna
attestazione è stata inventata e nessun gate è stato saltato. Openverse è escluso
dal pilota: la [guida di registrazione](openverse-registrazione.v1.0.0.md) prepara
il passo successivo. Nessun client è stato ancora registrato. La segnalazione
esterna precedente resta una bozza. Nessun merge, deploy, migrazione remota,
pubblicazione nel gioco o eliminazione di dati storici.
