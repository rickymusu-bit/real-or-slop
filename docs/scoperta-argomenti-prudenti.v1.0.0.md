# Argomenti plausibili e memoria semantica — 1.0.0

Aggiornato: 2026-11-08T02:24:00Z. Decisione dell'owner nella sessione corrente,
successiva a #64 / #78; base main `ff11c3d`.

## Decisioni prima del codice

| Fonte | Contraddizione / stato | Decisione e prova |
| --- | --- | --- |
| #64, cluster densi e zone poco coperte | Una regione vuota può contenere descrizioni prive di senso; distanza non dimostra utilità | Prima proposte testuali coerenti e fotograficamente plausibili; poi embedding e confronto con lo storico; test outlier inammissibile e episodio distinto ma vicino |
| UI attuale, percentuale di novità | `1-coseno` non è qualità né copertura del mondo | Distanza dal vicino soltanto diagnostica, senza percentuale di qualità, soglie di maturità arbitrarie o ordinamento per massima distanza |
| Corpus in popolamento | I test su fixture non misurano utilità dei suggerimenti | Mostrare consistenza del corpus e proposte valutate dall'owner; qualità/copertura restano non validate anche con molti vettori o revisioni duplicate |
| Proposta precedente di propagare la descrizione | Utilità per ricerca keyword e libertà SLOP non dimostrate | Titolo per pianificazione REAL; titolo e feedback storici SLOP congelati; nessuna propagazione automatica della descrizione. Eventuali esperimenti richiedono un delta separato |

Le descrizioni continuano ad alimentare gli embedding e il controllo di pertinenza
già esistente, separato dal pianificatore delle query. Non si modifica il flusso
#78 di conferma né si inventano fonti o fatti verificati.

## Contratto

La prima chiamata GPT propone al massimo cinque argomenti naturali con descrizione,
motivazione e un'autovalutazione strutturata di coerenza, specificità e plausibilità
fotografica. È una stima del modello, non una certificazione. Proposte negative o
malformate in questa prima fase restano nell'audit senza embedding e senza voto
editoriale inventato.

Le proposte ammissibili vengono indicizzate e confrontate con lo storico compatibile.
I vicini dello stesso lotto sono distinti da quelli storici: non dimostrano
copertura precedente. La seconda chiamata esistente rivede ammissibilità e duplicati;
una distanza elevata non può rendere ammissibile una proposta incoerente. Episodi,
periodi o prospettive distinti possono restare validi anche con coseno alto.
Un'esclusione nella seconda revisione conserva il vettore già prodotto per audit,
ma lo esclude dal corpus dei vicini successivi; non riscrive il giudizio dell'owner.

La UI espone l'esito del modello e conserva la scelta finale dell'owner. Le
valutazioni negative automatiche non sono registrate come rifiuti umani. La
copertura è informazione secondaria di confronto con quanto già registrato;
non si cercano vettori arbitrari e non si generano testi per riempire buchi.

Si mantiene il limite precedente: fino a due chiamate testo e cinque embedding,
con gate, ledger, ricevute e nessun retry automatico di esiti incerti. Nessuna
chiamata reale a pagamento, migrazione remota, merge o deploy in questa consegna.
I record storici e le ricevute già presenti restano conservati.

La migrazione additiva 0025 introduce valutazioni e un registro di operazioni per
intero lotto. Una prenotazione locale acquisita prima delle chiamate protegge
anche replay concorrenti: esito completato riusato, invio in corso/incerto bloccato.
Nessun numero minimo inventato dichiara il corpus maturo. I contatori distinguono
argomenti correnti, argomenti indicizzati e proposte valutate dall'owner; le vecchie
revisioni e le proposte del lotto corrente non gonfiano la copertura storica.

## Rilascio

Richiede approvazione dell'owner dopo verifiche e anteprime. Prima del codice nuovo
eseguire backup e applicare le migrazioni mancanti nell'ordine, inclusa 0024 prima
di 0025. Nessun seed remoto o cambiamento di credenziali/limiti è incluso. Un
rollback del codice conserva le tabelle aggiunte e ripristina le regole precedenti;
non cancellare valutazioni, ricevute, vettori o giudizi per annullare il rilascio.
