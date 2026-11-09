# Dashboard amministrativa: wizard REAL — v1.1.0

Aggiornato: 2026-11-09T21:32:33.955Z. Precedente: v1.0.0. Specifica e implementazione proposta nella branch
`feat/admin-real-wizard-v1.0.0`. Estende `docs/libreria-immagini.v1.3.0.md` senza modificare il
protocollo di provenienza, il budget unico o i file del gioco.

## Navigazione

`/admin` presenta quattro sezioni: **Caricamento REAL** (predefinita), **Generazione SLOP**
(segnaposto, da progettare separatamente), **Database immagini** (la libreria attuale,
senza rimuovere operazioni esistenti), **Impostazioni** (vocabolario, alias, budget).

## Caricamento REAL

**1. Selezione.** Campo per incollare più URL Wikimedia Commons e ricerca integrata.
La ricerca usa l'endpoint Commons già presente con ordinamento **rilevanza** oppure
**data recente** e paginazione. Una selezione locale di massimo 100 URL precede qualsiasi
acquisizione. Il passaggio alla fase successiva importa ogni URL in quarantena privata
e prepara nel browser la copia WebP. Se la copia fallisce, resta un'immagine privata
con comando per riprovare. Duplicati e URL invalidi non vengono importati.

**2. Tag e didascalie.** Ogni fotografia ha anteprima, campo didascalia (160 caratteri),
bolle per tag con cancellazione, inserimento manuale con suggerimenti dal vocabolario
effettivamente in uso, ed espansione di titolo, descrizione, autore, licenza,
dimensioni e link alla pagina Commons. Titolo e descrizione non vengono inviati al
giocatore durante la partita.

Il pulsante unico **Genera tag e didascalie con IA** chiede prima di selezionare le
immagini (inclusa selezione totale), poi mostra una conferma esplicita del costo
massimo e del budget residuo. Ogni immagine selezionata comporta **una sola
chiamata a pagamento**, che produce entrambi i campi. Non esistono modalità o
pulsanti per generare soltanto tag o soltanto didascalie.
I tag nuovi si aggiungono a quelli già presenti; la didascalia generata riempie
il campo vuoto, senza cancellare una didascalia compilata manualmente.
Nessuna chiamata a pagamento parte automaticamente.

Dopo la generazione, tag e didascalie restano modificabili. **Ripristina i testi
generati** recupera gratuitamente l'ultimo risultato della sessione salvato nel
browser, anche dopo un refresh nella stessa scheda. Non richiede una nuova chiamata
a pagamento, non recupera versioni più antiche e non sostituisce la cronologia
editoriale del server.

**3. Riepilogo.** Anteprima con la stessa copia WebP che verrà servita nel round
e il marchio **RS** sovrapposto con il metodo già vigente. La didascalia è visualizzata
sotto l'immagine e **non è impressa sui pixel WebP**. Servono una didascalia, almeno
un tag e una copia pronta per ogni immagine. Prima di confermare, l'owner deve
dichiarare di aver verificato autenticità, provenienza e condizioni della licenza.
Il sistema approva e pubblica le immagini in sequenza, senza ripetere quelle già
pubblicate dopo un errore; eventuali risultati parziali vengono mostrati.

## Criticità e limiti

- **Commons non certifica l'autenticità.** Una pagina Commons e una licenza
  compatibile non dimostrano da sole che una fotografia sia REAL. La verifica
  editoriale rimane dell'owner.
- **Metadati.** Nel menu espandibile sono visibili i metadati già importati nel
  database, non tutti gli EXIF dell'originale; il file WebP di gioco resta senza EXIF.
- **Pubblicazione non transazionale.** Su errori rete o storage, parte del gruppo
  può essere pubblicata mentre altre immagini restano approvate/in revisione;
  non si esegue un rollback automatico di immagini già pubblicate.
- **Draft.** Gli ID e i risultati da ripristinare sono in `sessionStorage`;
  i file acquisiti sono persistenti nella libreria privata. Chiudere la scheda
  può perdere il contesto del wizard, non le immagini private.
- **Marchio.** Il watermark visibile in anteprima è una sovrapposizione HTML/CSS;
  non è un watermark inciso nel file WebP. È coerente con
  `src/media-mark.v1.0.0.ts` e la policy vigente.
- Non si eseguono deploy, migrazioni remote, merge o chiamate OpenAI durante lo
  sviluppo. Verificare build, lint, test, integrazione D1/R2 e preview desktop/mobile
  prima dell'approvazione della PR.

## Versioni

App 1.3.0. Wizard `src/real-wizard.v1.1.0.ts` e librerie
`src/library.v1.2.0.ts`, `worker/library.v1.2.0.ts`,
`worker/analysis.v1.2.0.ts`. Le versioni precedenti rimangono
nel repository come storico. Non sono previste nuove migrazioni.

I draft già creati in precedenza usano la stessa chiave di sessione e restano
recuperabili nella stessa scheda.
