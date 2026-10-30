# Licenze delle immagini — policy 2026-10-30

L’importazione crea soltanto candidate private. Per l’approvazione sono ammesse:

- CC0 1.0 e Public Domain Mark 1.0. PDM è una marcatura: verificare il fondamento del pubblico dominio della singola immagine.
- CC BY, CC BY-SA, CC BY-NC, CC BY-ND, CC BY-NC-SA e CC BY-NC-ND **2.0, 3.0 e 4.0**, con le varianti territoriali/IGO effettivamente pubblicate presenti nell’elenco condiviso.

Il proprietario ha confermato il 30 ottobre 2026 che il sito è non commerciale e che le immagini non saranno adattate: le licenze NC e ND sono incluse su questa base. Rimangono escluse identità non censite e altre versioni come 1.0 o 2.5. Un’istituzione pubblica, una sigla testuale o il pubblico dominio dell’edificio fotografato non dimostrano la licenza della fotografia.

## Identità e varianti dei link

`shared/licenses.json` è l’unico elenco di identità riconosciute per il Worker e la pipeline Python. Contiene 386 identità: CC0, PDM, 114 licenze 2.0, 264 licenze 3.0 e 6 licenze 4.0, distribuite fra le sei famiglie sopra elencate. I codici territoriali sono quelli del registro CC; non si accetta un suffisso geografico arbitrario né una variante 4.0 nazionale inesistente.

Esempi di normalizzazione:

| Link della fonte | Identità conservata |
| --- | --- |
| `http://creativecommons.org/licenses/by-sa/3.0/` | CC BY-SA 3.0 |
| `https://creativecommons.org/licenses/by-sa/3.0/de/deed.en` | CC BY-SA 3.0 DE |
| `https://creativecommons.org/licenses/by/2.0/it/legalcode` | CC BY 2.0 IT |
| `http://creativecommons.org/licenses/by-nc-nd/3.0/de/deed.en` | CC BY-NC-ND 3.0 DE |

Sono riconosciuti l’host ufficiale (anche `www`), HTTP/HTTPS, slash finale e link `deed`/`legalcode` con lingua. Non si risolvono redirect di host esterni e non si fanno richieste di rete durante importazione o approvazione. Host falsificati, credenziali negli URL, query, frammenti, porte, percorsi aggiuntivi, codifiche percentuali e versioni/giurisdizioni sconosciute restano non riconosciuti.

La normalizzazione cambia soltanto il riferimento alla stessa licenza. **Non converte CC BY-SA 3.0 DE in CC BY-SA 3.0 o 4.0.** La pipeline conserva anche la stringa `rights` originale del provider. D1 conserva nome e URL canonici, utilizzati nei crediti post-risposta; i record esistenti non sono migrati o riclassificati automaticamente.

## Revisione e filtri

La compatibilità tecnica non certifica i diritti dell’immagine. Restano obbligatorie le conferme umane di diritti e autenticità, prova della fonte, note editoriali e file in quarantena. Prima dell’approvazione verificare gli obblighi della versione esatta e dell’eventuale port: attribuzione, fonte e link alla licenza, indicazione delle modifiche, share-alike, eventuale titolo e avvisi richiesti. Diritti di persone, marchi, opere riprodotte e altri diritti non sono cancellati dalla licenza del file.

Non nascondere crediti obbligatori per evitare spoiler. Se la modalità di attribuzione del gioco non rispetta i termini della singola immagine, lasciarla in revisione o scegliere un altro asset. La pipeline non sostituisce attribuzioni e non approva automaticamente.

### Vincoli NC e ND nel progetto

- **NC:** l’uso delle immagini resta non commerciale. Una futura monetizzazione richiede una nuova valutazione delle immagini NC prima del riuso; la presente inclusione non autorizza quell’uso futuro.
- **ND:** non condividere adattamenti delle immagini. Conservare il fotogramma completo, senza ritagli, montaggi, colorizzazioni, filtri creativi o restauri generativi. La pipeline corrente effettua orientamento EXIF, ridimensionamento proporzionale e ricodifica WebP; il file scaricato dalla fonte rimane conservato integralmente. Queste sono le sole operazioni tecniche del flusso attuale: la verifica umana dei diritti comprende versione della licenza, contenuto e trattamento del file.
- **NC-SA e NC-ND:** mantenere entrambi i vincoli nel nome e nel link. Non sostituirli con CC BY o con una versione meno restrittiva; anche nei crediti deve rimanere la licenza esatta.

La [FAQ ufficiale Creative Commons sul cambio di formato](https://creativecommons.org/faq/#can-i-take-a-cc-licensed-work-and-use-it-in-a-different-format), consultata il 30 ottobre 2026, conferma che l’uso in formati differenti è consentito anche con ND. Ciò non autorizza modifiche creative. Nessun nuovo editor o processo di adattamento viene aggiunto.

Il filtro `licenses` delle ricerche usa i nomi esatti dell’elenco. Per esempio, `CC BY-SA 3.0 DE` è distinto da `CC BY-SA 3.0`: richiedere una forma non include implicitamente l’altra. Omettere il filtro consente la raccolta ampia con valutazione individuale; le fonti ambigue rimangono in revisione. La configurazione di esempio CC0/4.0 resta un filtro selettivo intenzionale.

## Provenienza e aggiornamento dell’elenco

Identità delle sei famiglie CC estratte dal registro ufficiale Creative Commons:

- Repository: https://github.com/creativecommons/cc-legal-tools-data
- File: https://github.com/creativecommons/cc-legal-tools-data/blob/main/config/cc-legal-tools.csv
- Blob verificato: `a72ca160a1093c70657094af61c7d8aa868e7d02`, consultato il 30 ottobre 2026.
- Colonne usate: `CATEGORY`, `VERSION`, `UNIT`, `JURISDICTION`, `CANONICAL_URL`, `IDENTIFIER`; selezione di `licenses`, `by`/`by-sa`/`by-nc`/`by-nd`/`by-nc-sa`/`by-nc-nd`, versioni 2.0/3.0/4.0. CC0/PDM erano già ammessi.

L’elenco è locale, revisionabile e non si aggiorna automaticamente da fonti esterne. I test condividono casi di accettazione/rifiuto tra TypeScript e Python; l’integrazione locale verifica importazione, conferme, approvazione e conservazione in D1 di nome, versione e giurisdizione.

Non sono richieste migrazioni di schema o modifiche ai bucket. L’applicazione della policy al sito remoto richiede il consueto rilascio del codice verificato.
