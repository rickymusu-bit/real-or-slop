# Regole della galleria Console portatili Nintendo

Versione 1.1.0, aggiornata il 2026-11-25T15:24:14Z. Regole specifiche del protocollo `generazione-slop` 16.0.0, da integrare.

Sol sviluppa i parametri estratti e scrive **una scena fotografica completa in inglese**. Può proporre valori nuovi plausibili,
ma anche mantenere o ripristinare condizioni ordinarie. La scena rappresenta un singolo scatto, con una sola console,
una posizione fisicamente stabile e un ambiente coerente con la galleria. Sunburst riceve
il prompt della scena finale. Le regole qui sotto servono a Sol per costruirla e per scegliere quali dettagli rendere visibili.

## Osservazioni del test del 24 novembre

Nel confronto del 24 novembre, Sol e Sunburst hanno reso visibile il tratto nuovo in tutte e sei le immagini. In entrambe le
foto dell'Advance SP compaiono due esemplari, aperto e chiuso. Le descrizioni di Sol citavano sia la decorazione esterna sia i
comandi interni. Nei due Game Boy Color, la descrizione lasciava la posa e lo sfondo al generatore. Entrambi appaiono verticali
senza un sostegno visibile, con una composizione da esposizione.

## Uso del documento nella pipeline

Un documento modificabile dall'owner accompagna ciascuna galleria. Alla preparazione del batch, il Worker salva la revisione
usata e dà a Sol il documento insieme alla descrizione della REAL di partenza e agli estratti pertinenti della galleria.
Sol restituisce i cambiamenti effettivi, la scena sui suoi otto assi e il prompt inglese che li rende coerenti in un solo scatto.
L'owner può rivedere la scena prima di confermare la generazione. Il prompt consegnato a Sunburst contiene i dettagli
visibili della scena di arrivo. La prima generazione riceve solo testo; valutazione e correzioni confermate seguono
la specifica `generazione-slop`. L'uso del documento nel Worker rimane da implementare.

## Regole per Sol

1. **Tipo del soggetto.** Scegli una sola console, identifica il modello e conserva la geometria e i comandi del modello scelto.
   Se cambi modello, usa una descrizione che documenti quello di arrivo. I comandi entrano nel prompt quando sono visibili.
2. **Aspetto del soggetto.** Applica solo i parametri estratti, separando colore, finitura, edizione, usura, danno,
   invecchiamento, pulizia, stato visibile e contenuto dello schermo. Non accentuare i graffi quando è prevista usura lieve.
   Un valore ordinario o l'assenza del tratto è valido. Specifica apertura, display e accessori effettivamente visibili.
   Per un Advance SP descrivi la faccia esterna se chiuso o le superfici interne visibili se aperto. Non aprire o chiudere
   implicitamente la console per esibire una decorazione: adatta o scarta la proposta incompatibile con lo stato previsto.
3. **Persone.** Per questi scatti di oggetti, prevedi di norma zero persone visibili. Se la scena mostra la console in uso, specifica
   il gesto e le mani o le altre parti della persona che entrano nell'inquadratura. La presa deve sostenere il peso della console.
4. **Ambiente.** Mantieni luogo, piano d'appoggio, oggetti secondari e sfondo della descrizione di partenza. Una foto da catalogo
   può restare da catalogo; una foto amatoriale non deve diventare uno scatto commerciale. La posa varia solo se estratta.
   Il Game Boy Color riposa con il dorso sul piano e lo schermo verso l'alto, oppure sta inclinato grazie a un appoggio visibile
   o sostenuto da una mano. Per una posa verticale descrivi il sostegno.
5. **Punto di vista.** Usa una posizione sola della fotocamera. Dai altezza, angolo e distanza abbastanza precisi da mostrare il
   soggetto e chiarire il contatto con il piano. Ogni lato e ogni dettaglio citato deve essere visibile da quell'angolo. Varia
   l'inquadratura e la disposizione soltanto quando i parametri relativi sono estratti; segnala una somiglianza eccessiva.
6. **Luce.** Mantieni la configurazione fisica delle sorgenti nella descrizione della REAL; adatta ombre e riflessi alla nuova
   geometria, alla fotocamera e ai materiali. Una finestra laterale può produrre un riflesso sul guscio o sullo schermo.
   Il materiale e l'angolo devono spiegare dove appare.
7. **Tecnica fotografica.** Mantieni tipo di scatto, fuoco e limitazioni del medium di partenza. Non aggiungere sfocato o
   illuminazione da studio come miglioramento automatico; conserva il carattere ordinario della foto.
8. **Resa fotografica.** Mantieni colore, contrasto, esposizione e finitura fotografica della scena. Non imporre una resa
   comune a tutte le SLOP. Per `screen_content`, scegli contenuti plausibili per console ed epoca; a schermo spento o nascosto
   il parametro non è applicabile. Evidenzia testi e dati di salvataggio copiati che rendono il risultato troppo riconoscibile.

Prima di consegnare il prompt, verifica che **numero di console, appoggio, lati visibili, sfondo, luce e fuoco** descrivano lo
stesso scatto. Per ogni asse tieni i dettagli che si possono vedere o che determinano come quello scatto si presenta. Valuta le
candidate per cambiamenti effettivi, numero dei soggetti, appoggio fisico, parti visibili e coerenza del genere
fotografico con la galleria.

## Limiti osservati il 25 novembre

Il test sulle quattro REAL ha conservato il contesto, ma il generatore ha accentuato i graffi. La riparazione della croce
con immagine intera e maschera ha eliminato un riflesso sfaccettato, perdendo però dettagli corretti. Non è una riparazione
accettata. Il contenuto esatto del display era nella descrizione: trattarlo come parametro distinto permette di variarlo.
Le correzioni sono proposte dal valutatore e richiedono conferma dell'owner, senza loop automatici (specifica `generazione-slop`).

## Esempi illustrativi di scene

Questi esempi precedenti mostrano coerenza interna; non sono valori predefiniti o istruzioni a cambiare sempre l'ambiente.
Nel protocollo si applicano solo se compatibili con la descrizione di partenza e i parametri estratti.

### Advance SP avorio con stelle pixelate

> A casual colour photograph of one closed ivory Nintendo Game Boy Advance SP lying flat on a worn blue desk mat on a home desk.
> Pastel pixel stars run along the hinge edge of its square outer lid. A closed plastic cartridge case sits farther back, with the
> corner of a notebook near the back edge of the desk. Take the photo from an oblique angle above the near left corner so the
> whole outer lid and its contact with the mat are visible. Soft window light from the left casts a short shadow to the right.
> Focus on the lid and the star pattern, with the objects at the back gently soft. Use natural colours and moderate contrast.
> The desk and objects are the only things in view.

### Game Boy Color arancione traslucido

> A casual colour photograph of one translucent tangerine Nintendo Game Boy Color CGB-001 lying on its back on a dark woven
> placemat, screen facing up at a slight diagonal to the edge of a kitchen table. The screen is off. The shell reveals faint board
> edges and screw posts around the charcoal bezel and controls. The table edge and the back of a kitchen chair are visible beyond
> the placemat. Take the photo from a high three-quarter angle at the near right corner, with the outline of the console and its
> contact with the mat clearly in view. Soft daylight from the right catches the transparent rim and casts a soft shadow to the
> left. Focus on the shell and front controls with mild background softness, natural colours and moderate contrast. The frame
> contains the console and its domestic surroundings, with no people visible.
