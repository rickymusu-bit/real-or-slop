---
version: 3.0.0
adopted_at: 2026-11-04
status: adopted-manual-review
transport: synchronous-direct-api
---

# Protocollo editoriale: brief condivisi

Questo è il protocollo di riferimento scelto dal proprietario. Il catalogo nasce
da **brief originali condivisi**, che possono guidare la ricerca REAL e la
generazione SLOP. La coppia aiuta il confronto, ma non è un requisito di ammissione.
Le specifiche precedenti restano storiche, non istruzioni alternative
per i nuovi cicli. L'adozione riguarda il metodo editoriale: non abilita spesa,
pubblicazione o caricamenti automatici in produzione.

## Unità di lavoro e sequenza

1. Scegliere pochi brief dal catalogo versionato o proporne di nuovi.
2. Congelare descrizione, mezzo, prompt SLOP, query, ID e revisione del brief,
   versione e hash del catalogo, istruzioni e selezione del ciclo.
3. Quando il ciclo prevede nuove REAL, cercare immagini coerenti con il brief,
   verificare la fonte e proporre una
   candidata con composizione leggibile e interesse visivo. La ricerca è oggi
   assistita: non è implementata una garanzia di migliore corrispondenza globale.
4. Quando il ciclo prevede nuove SLOP, generarle dal solo prompt congelato.
   **Il generatore non riceve la REAL, il suo titolo,
   una sua descrizione, i suoi metadati o il suo profilo.** L'intento visivo è
   comune; non si promette indipendenza statistica dei due risultati.
5. Applicare alle nuove candidate la presentazione 1024×1024. Terra sceglie il ritaglio
   conservando soggetto e contesto; il codice applica il ridimensionamento.
6. Calcolare il profilo sui file finali, conservandone gli hash e gli originali.
7. Quando entrambe sono disponibili, presentare REAL a sinistra e SLOP a destra,
   unite per il confronto anche su mobile. Le immagini senza corrispondente
   restano revisionabili singolarmente. Ogni immagine ha una decisione e una nota proprie.
8. Conservare decisioni, eventuali varianti, prove e collegamento al brief.
   Registrare nel database ogni immagine approvata individualmente, senza
   cercare o generare un corrispondente. Non è richiesta una coppia completa.

Per nuovi cicli che prevedono entrambe le origini, cercare prima la REAL può
contenere le generazioni inutili; il prompt SLOP resta congelato prima della
ricerca. Questa sequenza non si applica alle immagini già disponibili o approvate.
Un rifiuto non modifica automaticamente il brief e non rifiuta l'altra immagine.

**Tutte le immagini già trovate o generate vanno conservate**, inclusi originali,
varianti e rifiuti. Si attendono le selezioni esplicite del proprietario: un nuovo
criterio, un brief incompleto o l'adozione del protocollo non autorizzano
cancellazioni, sostituzioni o nuove ricerche per completare coppie.

La cancellazione è una scelta esplicita del proprietario: dopo un rifiuto può
usare **Elimina definitivamente** nella coda. Si elimina la singola scheda dal
database di revisione e se ne impedisce la reimportazione. Dossier e giudizi
rimangono conservati; non si applica alcuna pulizia automatica alle altre immagini.

## Catalogo dei brief

Il [catalogo canonico inglese v1.1.0](../data/editorial/briefs.v1.1.0.json) contiene
**100 bozze** originali redatte come seed editoriale, ora alla revisione 2:
non sono cento immagini approvate né
un corpus ottenuto descrivendo foto REAL. Ogni voce ha ID stabile, revisione,
stato, tag descrittivi, mezzo, descrizione, prompt autonomo e due query.

Descrizioni, tag e prompt nuovi usano solo inglese, senza traduzione italiana
parallela. Le query principali sono inglesi; una query alternativa può usare
altre lingue per la scoperta REAL. Tassonomia, traduzioni e mappatura di revisione
sono tracciate nell'[indice testuale v1.0.0](indice-brief.v1.0.0.md).
Il [catalogo italiano originale](../data/editorial/briefs.v1.json) rimane
immutato, così come gli snapshot dei cicli già congelati. Il CLI usa il nuovo
catalogo per default; per riprodurre una selezione storica specificare quello
originale con `--catalog` e conservare la cartella già congelata.

Le aree comprendono ritratti, attività, botanica, animali, paesaggi, architettura,
ingegneria civile, oggetti, arte e dettagli. I tag servono a osservare la copertura
e preferire novità nella selezione: non impongono percentuali per il portfolio,
non assegnano difficoltà e non costituiscono quote da rispettare nel gioco.

Un brief è abbastanza ampio da consentire più interpretazioni di qualità. Non
deve prescrivere dettagli incidentali difficili da trovare né spingere tutti i
soggetti verso persone, attività o caos. Si lasciano liberi composizione, luce
e dettagli compatibili con l'intento e con i criteri del proprietario.

`draft` significa ipotesi da provare, non approvazione umana; una bozza può
servire a proporre immagini. `approved` indica un'approvazione esplicita del
brief, non delle immagini; `retired` lo esclude dai cicli successivi. Non si
ritira automaticamente un tema perché una singola interpretazione è rifiutata.
Per cambiare una voce mantenere l'ID, aumentare `revision` e versionare il
catalogo; i cicli congelati mantengono il proprio snapshot e non vengono riscritti.

## Cicli piccoli, solo API dirette

Il catalogo può crescere senza generare immagini. Il ciclo corrente predefinito
seleziona **5 brief, fino a 10 immagini**. Il limite è **25 brief / 50 immagini
finali complessive per ciclo**, non cinquanta per ciascuna origine. Prima di
procedere con altri cicli si raccoglie la revisione singola del proprietario.

Generazione, crop e profili usano API dirette Responses e Images, senza
Files/Batch, attese differite, fallback di modello o retry impliciti. I moduli
Batch restano per archivi e test di compatibilità; non sono il trasporto del
protocollo corrente. Un eventuale uso futuro richiede una scelta esplicita.

La selezione dal catalogo è interamente locale, senza costo API:

```sh
python3 -m pipeline.v2.brief_catalog --check
python3 -m pipeline.v2.brief_catalog --count 5 --seed 34 \
  --out .pipeline/v2/ciclo-001
# Selezione esplicita o esclusione di ID già esaminati:
python3 -m pipeline.v2.brief_catalog --ids brief-0015 brief-0051 \
  --out .pipeline/v2/ciclo-002
```

L'output contiene `briefs.json`, `slop-plan.json`, `catalog-selection.json`,
istruzioni e hash congelati. Ripetere la stessa selezione recupera gli stessi
file; una destinazione con un piano diverso viene rifiutata. `--exclude` evita
di riproporre ID già esaminati. Dopo la raccolta documentata, il piano SLOP e il
manifest REAL sono eseguiti separatamente con `pipeline.v2.direct`, modello,
budget e ledger privato espliciti. La creazione del ciclo non avvia inferenze.

## Qualità e contesto

I [criteri editoriali](criteri-editoriali.md) sono vincolanti per entrambe le
origini. Ogni soggetto è immerso in uno sfondo e in un ambiente leggibile.
Scontorni, fondali uniformi e oggetti da catalogo senza contesto sono esclusi.
Un solo soggetto o un ritratto sono ammessi: non occorre affollare la scena.

Le opere d'arte si mostrano da una certa distanza, con l'opera intera, la cornice
quando presente e ambiente ed elementi vicini. La scena dipinta dentro il
quadro non sostituisce il contesto esterno all'opera. La REAL è acquisita da una
fotografia ambientata esistente; la SLOP genera l'intera scena da testo.

Per le REAL contano corrispondenza, composizione, interesse e fruibilità: una
foto accidentale o priva di un punto di lettura non diventa buona perché autentica.
Una foto ordinaria non è automaticamente esclusa. I criteri non si riducono a
un punteggio di sorpresa, bellezza o presunta capacità di ingannare il giocatore.

L'ingrandimento non esclude automaticamente una candidata. Si conservano
dimensioni native, fattore di scala, coordinate e flag; si confrontano per
origine ingrandimento, nitidezza, rumore e altri indizi tecnici. Avere le stesse
dimensioni finali non garantisce uguale definizione percepita.

## Revisione, feedback e consegna

Il proprietario approva o rifiuta **ogni singola immagine**. Quelle approvate
si ammettono individualmente al database; assenza o rifiuto di un corrispondente
non bloccano la registrazione. Le verifiche documentali di origine e licenza
restano distinte dalla scelta editoriale. Le gallerie si
consegnano su Drive privato con confronti affiancati quando disponibili,
PNG/PDF e cartelle REAL/
e SLOP/ separate nello ZIP. I voti e le note esportati sono legati ai file finali;
una sostituzione non eredita l'approvazione dell'immagine precedente.

Il feedback deve distinguere problemi del brief, dell'abbinamento REAL e
dell'interpretazione SLOP. Le revisioni possono guidare successive istruzioni
ed esempi del generatore di brief, conservando libertà e varietà. Non è stato
eseguito fine-tuning né apprendimento automatico dai voti; non si importano le
preferenze della vecchia pipeline e non si trasformano foto REAL in prompt SLOP.

I profili Terra descrivono i pixel; non sono verità su origine o difficoltà.
Autenticità, attribuzioni e licenze richiedono evidenze distinte. Le scelte
editoriali non certificano diritti e non pubblicano immagini. I contratti dati
`2.0.0` e le route private esistenti restano compatibili; il numero 3.0.0 qui
versiona il metodo editoriale, non riscrive dossier e checkpoint precedenti.

## Evidenze e limiti attuali

Il [pilota di cinque brief](pilota-brief-condivisi-2026-11-04.md) ha prodotto
dieci immagini con API dirette, costo stimato 0,318687 USD e galleria privata.
La sedia REAL è stata rifiutata e le immagini artistiche sono annotate rispetto ai
criteri aggiornati. Tutti i file restano conservati in attesa delle selezioni;
non si avviano sostituzioni. Questi feedback restano nello storico; il pilota non viene
presentato come un insieme di dieci immagini già approvate.

Il precedente [benchmark da 200](benchmark-200-risultati-2026-11-04.md) resta
storico. La ricerca REAL e l'abbinamento non sono ancora interamente automatici;
una disponibilità limitata delle fonti non si risolve con la sola dimensione
del catalogo di brief. Non sono stati misurati risultati con giocatori.
L'adozione di questo protocollo non abilita un endpoint di pubblicazione,
cron, nuovi addebiti o trasferimenti al catalogo giocabile.
