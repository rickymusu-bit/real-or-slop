# Lotti editoriali, tag per foto e SLOP dal lotto — specifica 1.1.0

Stato: **bozza da approvare**, non ancora vigente. Creata: 2026-11-08T19:25:20Z.
Aggiornata: 2026-11-08T19:45:00Z (1.1.0: formato dei tag senza lingua obbligata e
senza spazi; almeno un tag per foto; foto rimaste senza tag). Versione precedente:
`docs/lotti-editoriali.v1.0.0.md`.
Base: main `ca07046` (app 0.23.2, schema 0028). Sostituirà, per i nuovi lotti,
le parti di `AGENTS.md`/`MASTER.md` 13.0.0 indicate nella sezione 9; all'approvazione
entrambi passano a 14.0.0 con nuovi snapshot in `docs/`.

## 1. Obiettivo

Il database viene popolato da due sole fonti:

- fotografie REAL scelte personalmente dall'owner, per ora da Wikimedia Commons
  (l'upload dal dispositivo resta disponibile);
- immagini SLOP generate a partire da titolo, descrizione e foto del lotto.

Topic Discovery resta spento e diventa sviluppo futuro (sezione 8).

## 2. Lotto

Un lotto è una galleria **monotematica**: un singolo tema, argomento o avvenimento.

- Titolo obbligatorio, univoco dopo normalizzazione (regola attuale degli argomenti).
- Descrizione obbligatoria, massimo 500 caratteri, scritta dall'owner. La proposta GPT
  esistente resta facoltativa e richiede sempre approvazione.
- Almeno una fotografia REAL per poter chiudere il lotto.
- Stati: `aperto` (raccolta) → `chiuso` (generazione avviata). Un lotto chiuso accetta
  ancora nuove foto REAL e nuove richieste di generazione (sezione 5.4).
- Gli argomenti esistenti diventano lotti `aperti` senza perdere id, titolo, proposte o
  foto. Nessuna riscrittura dei metadati storici.

### 2.1 Proposte non utilizzabili

Le proposte di link restano immutabili (trigger 0019). Si aggiunge l'azione
**Scarta proposta** per i link mai acquisiti: registra un evento append-only e nasconde
la proposta dalla lista, senza cancellare la riga. Risolve casi come il link a una
miniatura `thumb.wikimedia.org` nel lotto «Proteste a Parigi, ottobre 2026», che oggi
resta visibile come «fonte non supportata».

## 3. Esplora Commons nella dashboard

Obiettivo: niente più link copiati a mano tra Commons, note e dashboard.

- Pannello **Esplora Commons** nel lotto selezionato: ricerca testuale e navigazione per
  categorie e sottocategorie di Commons (es. `Protests in Paris`).
- Griglia di miniature con titolo, autore, licenza, dimensioni e link alla pagina `File:`.
- Selezione multipla con caselle; **Aggiungi al lotto** registra le pagine `File:` scelte
  come proposte e, a scelta, le acquisisce subito con il flusso Commons esistente
  (originale, hash, geometria EXIF, quarantena).
- Le richieste passano dal Worker, riusando `worker/commons-editorial.v1.0.0.ts` e la sua
  allowlist di host. Nessuna chiamata a pagamento. Già presenti o eliminate in passato
  vengono segnalate prima dell'aggiunta.
- Un iframe di Commons non è adatto: il browser non permette alla dashboard di leggere
  le selezioni fatte in una pagina di un altro dominio.
- I link incollati a mano verso `upload.wikimedia.org` o `thumb.wikimedia.org` vengono
  ricondotti alla pagina `File:` corrispondente prima del salvataggio.

## 4. Tag per singola fotografia

I tag appartengono alla foto, non al lotto. Servono all'owner per cercare e filtrare in un
catalogo ampio e, in futuro, per sfide tematiche. Valgono con lo stesso vocabolario per
REAL e SLOP.

### 4.1 Formato e convenzione

- Formato obbligatorio: **tutto minuscolo, nessuno spazio**. Caratteri ammessi: lettere
  Unicode minuscole (anche accentate), cifre e trattino `-` come separatore tra parole;
  massimo 40 caratteri; niente trattini iniziali, finali o doppi.
  Esempi: `pompiere`, `firefighter`, `auto-in-fiamme`, `burning-car`, `vetrina-infranta`.
  Il server rifiuta i tag non conformi; l'interfaccia propone la forma corretta
  (`Auto in fiamme` → `auto-in-fiamme`) senza salvarla da sola.
- Nessuna lingua obbligatoria. Per non frammentare il vocabolario (`pompiere` e
  `firefighter` come tag distinti), le proposte del modello riusano prima i tag esistenti;
  i termini nuovi sono proposti nella lingua della descrizione del lotto, oggi inglese.
  Due tag equivalenti si possono collegare come alias di un tag canonico.
- Ogni tag ha una faccetta, salvata come attributo e non nel testo del tag:

  | Faccetta | Contenuto | Esempi |
  |---|---|---|
  | `soggetto` | persone per ruolo visibile, animali, gruppi | pompiere, manifestante-incappucciato, folla |
  | `azione` | ciò che accade | spegnere-incendio, rompere-vetrina, marciare |
  | `oggetto` | elementi rilevanti | auto-in-fiamme, cartello, fumogeno |
  | `ambiente` | luogo generico, luce, meteo | strada, piazza, notte, pioggia |
  | `inquadratura` | punto di vista e distanza | primo-piano, campo-largo, dall-alto |

- Le proposte del modello descrivono **ciò che è visibile**: niente identità di persone,
  date, attribuzioni politiche o fatti non deducibili dai pixel. Luogo ed evento
  appartengono al lotto, che è già filtrabile. L'owner può creare anche tag interpretativi.
- Nessun tag può rivelare l'origine (`reale`, `generata`, `ia`, `ai`, nomi di modelli…):
  l'origine è un campo separato e questi termini sono rifiutati dal vocabolario.
- Il testo viene normalizzato NFKC prima dei controlli; univocità per testo del tag.

### 4.2 Proposte e scelta

- Pulsante esplicito (per foto o per lotto): un modello con visione riceve **solo i pixel**
  (anteprima fedele esistente) e propone fino a 12 tag, preferendo il vocabolario già
  esistente e marcando i termini nuovi. Chiamata a pagamento, con ricevuta, prenotazione
  sul budget condiviso e nessun reinvio di esiti incerti.
- L'owner seleziona, scarta o crea tag. Si salvano soltanto i tag scelti dall'owner;
  le proposte restano diagnostica.
- Aggiunte e rimozioni sono eventi append-only; lo stato corrente è derivato.
- Il legame foto↔tag usa `(inbox_id, sha256)`, non i metadati immutabili, e segue la foto
  anche dopo l'ammissione e la pubblicazione.

### 4.3 Almeno un tag per foto

- Una foto REAL o SLOP senza tag resta in revisione: approvazione, ammissione e
  pubblicazione richiedono **almeno un tag** scelto dall'owner. Il controllo è nel server,
  non solo nell'interfaccia.
- La revisione ha una sezione **Foto senza tag**.
- Rimozione di un tag dal vocabolario (o da una foto): le foto che conservano altri tag
  restano nel proprio stato. Quelle che restano senza tag:
  - se non pubblicate, tornano in **Foto senza tag** e non possono essere ammesse o
    pubblicate finché non ricevono un tag;
  - se già pubblicate, restano nel gioco e compaiono in **Foto senza tag** con un avviso.
    Toglierle automaticamente dal catalogo cambierebbe composizione e partite assegnate per
    una modifica di classificazione; il ritiro resta un'azione separata ed esplicita.
- Prima di rimuovere un tag, la dashboard mostra quante foto resterebbero senza tag,
  divise tra pubblicate e non pubblicate, e chiede conferma.

## 5. Generazione SLOP dal lotto (strada A, solo testo al generatore)

### 5.1 Quantità e margine

- Numero richiesto alla chiusura: `ceil(REAL_valide × (1 + margine))`, dove `REAL_valide`
  sono le foto REAL del lotto non rifiutate.
- Margine predefinito **50%**, regolabile in Impostazioni (valore globale, 0–200%) e
  modificabile per il singolo lotto prima della conferma.
- Prima dell'avvio la dashboard mostra numero di immagini, costo stimato e residuo del
  budget; la generazione parte solo con conferma esplicita.

### 5.2 Piano

1. Alla chiusura, un modello con visione riceve titolo, descrizione e anteprime delle REAL
   del lotto.
2. Produce un **piano** di N scene testuali, considerando la galleria nel suo insieme:
   soggetti, azioni, ambienti, luce, inquadrature e formati distribuiti con buona varietà;
   stile fotografico documentario coerente con il lotto.
3. Regole del piano: nessuna scena può riprodurre la composizione di una singola foto;
   niente persone reali identificabili, loghi o testi copiati; nessun riferimento a
   autori o licenze.
4. Il piano è salvato con hash degli input (testo e sha256 delle REAL usate), modello e
   versione del template; è immutabile.

### 5.3 Generazione

- Il generatore riceve **solo il testo di una scena**: mai pixel, URL o metadati REAL.
- I formati verticale, orizzontale e quadrato seguono la distribuzione dei formati delle
  REAL del lotto.
- Ogni SLOP entra in revisione (`pending`) con `lot_id`, riferimento alla scena e al piano.
- Dopo la generazione, il confronto di somiglianza esistente segnala le SLOP troppo vicine
  a una REAL del lotto; la decisione resta all'owner.

### 5.4 Generazioni aggiuntive

- Su un lotto chiuso l'owner può chiedere **Genera altre K immagini**. Le SLOP già
  generate, accettate o rifiutate, restano invariate.
- Il nuovo piano riceve le scene precedenti come elenco da non ripetere e le REAL aggiunte
  dopo la chiusura.
- I rifiuti editoriali delle SLOP alimentano i feedback SLOP esistenti; i rifiuti tecnici
  o di generazione restano diagnostica.

## 6. Composizione del catalogo

- La pubblicazione non richiede più quantità uguali di REAL e SLOP: si pubblica per lotto
  ciò che è stato ammesso.
- La dashboard mostra la quota REAL/SLOP del catalogo pubblicato e un **avviso non
  bloccante** fuori dall'intervallo 40–60%.
- Il gioco mantiene una moneta 50/50 indipendente per round: le immagini della categoria
  minoritaria vengono quindi estratte più spesso.
- Vincolo esistente da tenere visibile: una partita non può avere più round della
  categoria meno numerosa (`worker/sampling.ts`, capacità = min(REAL, SLOP)). La dashboard
  avvisa anche quando il numero assoluto della categoria minoritaria si avvicina alla
  lunghezza di una partita.

## 7. Dati (migrazione additiva 0029, da definire nel dettaglio)

- Stato del lotto: id dell'argomento, descrizione del lotto, stato, margine, chiusura.
- Impostazioni: margine predefinito.
- Vocabolario: tag, faccetta, testo normalizzato, alias, origine (owner o proposta accettata).
- Eventi foto↔tag append-only e proposte di tag con ricevuta.
- Piani SLOP, scene e richieste di generazione, collegati al lotto e al budget.
- Eventi di scarto delle proposte di link.
- Nessuna tabella esistente viene ricostruita; nessun dato storico viene riscritto.

## 8. Topic Discovery

Resta spento. Codice, tabelle e memoria semantica restano in sola lettura per un uso
futuro; non sono richiesti embedding per creare o chiudere un lotto.

## 9. Contratti sostituiti per i nuovi lotti

| Contratto attuale (13.0.0) | Nuova regola |
|---|---|
| Prompt SLOP congelati prima di osservare le REAL; il preparatore SLOP non vede foto, titoli o descrizioni | Il pianificatore vede titolo, descrizione e pixel REAL del lotto; il generatore riceve solo testo |
| SLOP solo sul deficit rispetto alle REAL approvate | SLOP pari a REAL valide + margine regolabile, più generazioni aggiuntive su richiesta |
| Pubblicazione atomica con quantità uguali | Pubblicazione per lotto e avviso non bloccante fuori da 40–60% |
| Embedding dell'argomento al salvataggio | Non richiesto; Topic Discovery rinviato |
| Un argomento per foto, nei metadati | Un lotto per foto (invariato) più tag multipli per foto |

Restano invariati: verifica documentale e licenze separate dal voto, voto sui pixel
correnti, quarantena e originali, gate del budget, nessuna chiamata a pagamento nei test
o senza conferma, nessun reinvio di esiti incerti, audit e cancellazioni limitate.

## 10. Rischi

- **Diritti**: le SLOP sono generate da testo, ma il piano deriva da foto spesso CC BY-SA;
  il divieto di riprodurre singole composizioni e il controllo di somiglianza riducono il
  rischio di opere derivate, senza eliminarlo.
- **Coppie riconoscibili**: SLOP troppo simili a una REAL pubblicata rendono il gioco banale;
  le segnalazioni di somiglianza vanno riviste prima della pubblicazione.
- **Costi**: il margine moltiplica la spesa; stima e conferma prima di ogni generazione.
- **Catalogo piccolo**: lo sbilanciamento aumenta le ripetizioni della categoria minoritaria
  e accorcia le partite possibili.

## 11. Verifiche

- Unitari: formato dei tag (maiuscole, spazi, trattini, lunghezza, Unicode), faccette,
  alias, divieto dei tag d'origine; calcolo
  di N con margini limite; conversione dei link Commons verso pagine `File:`.
- Integrazione con D1/R2 locali e provider fittizi: chiusura con zero foto rifiutata,
  piano immutabile, generatore che riceve solo testo (verifica del payload), generazione
  aggiuntiva che non tocca le SLOP esistenti, doppio clic e concorrenza, esiti incerti,
  budget esaurito, scarto di proposte, approvazione e pubblicazione rifiutate senza tag,
  rimozione di un tag con foto pubblicate e non pubblicate.
- Browser desktop e mobile: Esplora Commons con selezione multipla, tag proposti e creati,
  avviso di composizione, cambio sezione senza perdita di input.

## 12. Fasi di consegna

1. Lotti, Esplora Commons, scarto delle proposte, conversione dei link Commons.
2. Vocabolario e tag per foto, con proposte dai pixel.
3. Piano e generazione SLOP con margine e generazioni aggiuntive.
4. Pubblicazione per lotto e avvisi di composizione.

Ogni fase in una PR separata, con anteprima verificata, CI e approvazione dell'owner;
migrazioni remote e deploy solo su autorizzazione esplicita.

## 13. Decisioni ancora aperte

- Faccette definitive (proposta: le cinque della sezione 4.1).
- Foto pubblicate rimaste senza tag (proposta: restano nel gioco con avviso, sezione 4.3).
- Modifica di titolo e descrizione dopo la chiusura del lotto (proposta: titolo immutabile;
  descrizione modificabile, con effetto solo sui piani successivi).
- Visibilità dei tag ai giocatori (proposta: no, finché non esistono le sfide tematiche).
