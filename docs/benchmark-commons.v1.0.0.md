---
version: 1.0.0
created_at: 2026-11-06T17:00:00Z
status: live-retrieval-control-not-editorial-validation
source_issue: 56
---

# Controllo reale su Commons

Richiesta del proprietario: eseguire il benchmark Commons, poi verificare
Openverse. Questo primo controllo usa ricerche reali e query preregistrate
manualmente; **non è un confronto di output GPT-6.1**. La domanda sul tetto
di spesa per strategie/adattamento/profili GPT è ancora in attesa di risposta.
Nessuna inferenza è stata eseguita o addebitata per questo controllo.

## Metodo fissato prima delle ricerche

Quattro intenzioni, due strategie per intenzione, due braccia general/adapted.
Le query sono nel piano [1.1.0](../data/editorial/commons-benchmark.v1.1.0.json):
animali/compassione/media, tecnologia/curiosità/media,
case/nostalgia/bassa, paesaggi/meraviglia/alta. Non è un campione rappresentativo
delle 432 combinazioni e non prova che le immagini suscitino quelle emozioni.

Una pagina, massimo 20 record per query, 8 richieste per braccio; ordine dei
bracci mescolato con seed 56. Tutte le coppie sono conservate, senza selezionare
quelle con risultato favorevole. Si usa lo stesso User-Agent identificativo
della pipeline e lo stesso filtro deterministico `filetype:bitmap` in entrambi
i bracci. Il filtro limita la ricerca a immagini raster, non certifica fotografie.
JPEG/PNG/WebP sono i formati decodificabili dal percorso attuale; gli altri
file restano contati separatamente. Nessuna categoria o ID è inventato.

```sh
npm run benchmark:commons
npm run benchmark:commons -- --live
# Oppure:
python3 -m pipeline.real.commons_benchmark --plan data/editorial/commons-benchmark.v1.1.0.json --out .pipeline/commons-benchmark/v1.1.0 --live
```

Senza `--live` non c'è rete. Stesso piano/directory riusa le ricevute, senza
nuove ricerche; per ripetere una misura in un altro momento occorre una directory
nuova. Run privati in `.pipeline/`, snapshot con checksum e freeze delle intenzioni
prima del retrieval. Nessun ramo SLOP viene ideato o generato.

## Risultati osservati

Fonte dati: [rapporto reale 1.1.0](benchmark-commons-control.v1.1.0.json).
I conteggi sono limitati alla prima pagina, non al totale indicizzato dal motore.
L'export `public_report` conserva i conteggi ma omette URL e ID delle candidate:
dossier completi e ricevute sorgenti rimangono nei run privati `.pipeline/`.

| Misura | Query generali | Query adattate manualmente |
| --- | ---: | ---: |
| Richieste API | 8 | 8 |
| JPEG/PNG/WebP restituiti | 2 | 149 |
| Identità fonte distinte | 2 | 149 |
| Query senza JPEG/PNG/WebP accettati | 7 | 0 |
| Errori HTTP/rate limit | 0 | 0 |
| Record con URL di licenza riconosciuto | 0 | 97 |
| Altri formati esclusi dal decoder | 0 | 11 |
| Origine/diritti verificati per immagine | Non misurati | Non misurati |
| Valutazione visiva cieca | Non eseguita | Non eseguita |
| Approvazioni umane | Non disponibili | Non disponibili |

I 97 URL riconosciuti **non sono 97 immagini approvate o sicuramente utilizzabili**.
Autore, origine umana, eventuali alterazioni, obblighi, contenuto fotografico e
interesse vanno verificati per ogni asset. Licenze mancanti nei metadati non
dimostrano necessariamente diritti assenti: richiedono il dossier alla fonte.
`approved_yield` resta `null`, senza trasformare giudizi mancanti in zero.

Il risultato dimostra che queste riformulazioni sono più reperibili su Commons
in questo piccolo controllo. Non stima l'efficacia di GPT, la resa editoriale
approvata, la qualità emotiva o l'efficacia formativa. Le frasi generali e le
keyword brevi sono scelte di controllo dell'assistente, non output API attribuiti
a un modello. Servono ricevute A/B reali per il benchmark GPT richiesto dalla #56.

## Controllo iniziale e correzione del confondente

Sono conservati anche il [piano iniziale 1.0.0](../data/editorial/commons-benchmark.v1.0.0.json)
e il [rapporto iniziale](benchmark-commons-control.v1.0.0.json), senza filtro bitmap.
Le query generali restituivano 160 PDF da ricerca nel testo, esclusi dal decoder:
lo zero immagini non significava zero hit HTTP/API. Le query adattate davano
142 JPEG/PNG/WebP e 18 file esclusi. Non si usa questo confronto come misura
finale di retrieval fotografico. Il piano 1.1.0 corregge il filtro per **entrambi**
i bracci prima di rieseguire tutte le coppie; nessun risultato storico riscritto.

Il filtro è stato verificato con una richiesta reale senza warning API e con
risultati bitmap. Il tipo file non viene confuso con la licenza o l'autenticità.
La diagnosi precedente "Commons e Openverse 403" era troppo generale: Commons
funziona con le richieste della pipeline. I vecchi snapshot rimangono osservazioni
del loro momento; il presente report aggiorna lo stato effettivamente verificato.

## Passo successivo

Sono stati verificati senza inferenza `/v1/models` (disponibile `gpt-6.1-terra`)
e [prezzi ufficiali](https://developers.openai.com/api/docs/pricing): standard
1 USD/M input e 5 USD/M output, con cache distinta. Ciò non abilita spesa.
Il pilota GPT potrà usare ledger locale isolato e tetto autorizzato, senza deploy
o modifiche ai gate di produzione. Il piano proposto mantiene quattro intenzioni,
due strategie ciascuna e una variante testuale per strategia, scelta prima dei
risultati; verifiche documentali e approvazioni restano separate.

Openverse è diagnosticato nel [report di accesso](openverse-accesso.v1.0.0.md).
Nessun deploy, migrazione remota, cron, pubblicazione, eliminazione o chiamata
pagata eseguita. Il codice di gioco e il campionamento rimangono invariati.

Verifiche di questa consegna: suite completa Node e **197 test Python** passati,
lint/build/deploy:check passati; cinque test nuovi su replay senza rete, filtro
uguale nei due bracci, stop immediato su diniego, challenge vs autenticazione e
assenza di secret nei report. Snapshot MASTER 2.0.1 verificato e versioni
precedenti conservate, 94 link locali validi, `git diff --check` passato.
Rimane l'avviso build preesistente sui chunk grandi. Nessun Worker, schema o
workflow schedulato modificato da questo aggiornamento.
