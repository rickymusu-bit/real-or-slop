# Dashboard amministrativa: wizard REAL — v1.2.0

Aggiornato: 2026-11-09T22:50:37Z. Precedente: v1.1.0 (implementata in `main` con la PR 103). App 1.4.0. Estende `docs/libreria-immagini.v1.4.0.md` senza modificare il
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
Decisione dell'owner del 2026-11-09: «quando chiedo di generare tags e didascalie, tutto quello che
avevo scritto nelle immagini selezionate viene sovrascritto dai dati generati dal modello. Dopodiché posso
fare le mie modifiche. Schiacciando "ripristina i testi" resetto le mie modifiche e ritorno a tags e
didascalie generate. Generazione e ripristina riguardano solo le immagini selezionate; le altre non sono
toccate. Un'immagine che ha già ricevuto tags e didascalia generati non può riceverli di nuovo (ma tags e
didascalia possono essere sempre modificati e resettati)». Quindi:

- la generazione **sostituisce** tag e didascalia delle immagini scelte; le altre non cambiano;
- si genera **una sola volta** per immagine: nel dialogo un'immagine già generata è marcata e non
  selezionabile, e il server rifiuta comunque una seconda generazione prima di riservare o inviare;
- il dialogo preseleziona le immagini mai generate o rifiutate senza addebito. Un esito incerto non ha
  prodotto testi: resta deselezionato e si riprova solo su scelta esplicita, con avviso nella conferma;
  un'immagine con analisi in corso non è selezionabile;
- nessuna chiamata a pagamento parte automaticamente.

Dopo la generazione, tag e didascalie restano modificabili. **Ripristina i testi generati** apre un
dialogo con le sole immagini che hanno testi generati (nessuna preselezionata, «Seleziona tutte»
disponibile) e riporta quelle scelte ai tag e alla didascalia generati, senza costi; le modifiche
dell'owner su quelle immagini si perdono, le altre immagini non cambiano. Lo stesso comando è presente
su ogni scheda per la singola immagine e nella sezione Database. I testi generati sono conservati nel
database (`generated_tags`, `generated_caption`, migrazione 0035), quindi il ripristino funziona anche
dopo aver chiuso la scheda o in un'altra sessione.

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
- **Draft.** Gli ID delle immagini del wizard sono in `sessionStorage`;
  i file acquisiti sono persistenti nella libreria privata. Chiudere la scheda
  può perdere il contesto del wizard, non le immagini private.
- **Marchio.** Il watermark visibile in anteprima è una sovrapposizione HTML/CSS;
  non è un watermark inciso nel file WebP. È coerente con
  `src/media-mark.v1.0.0.ts` e la policy vigente.
- Non si eseguono deploy, migrazioni remote, merge o chiamate OpenAI durante lo
  sviluppo. Verificare build, lint, test, integrazione D1/R2 e preview desktop/mobile
  prima dell'approvazione della PR.

## Versioni

App 1.4.0. Wizard `src/real-wizard.v1.2.0.ts` e librerie
`src/library.v1.3.0.ts`, `worker/library.v1.3.0.ts`,
`worker/analysis.v1.3.0.ts`. Le versioni precedenti rimangono
nel repository come storico. Migrazione additiva `0035_generated_texts.v1.0.0.sql`.

I draft già creati in precedenza usano la stessa chiave di sessione e restano
recuperabili nella stessa scheda.
