/** Privacy notice and terms of use (docs/privacy-note-legali.v1.0.0.md). v1.0.0, 2026-11-12T19:00:00Z.
 * A draft written from what the code does, to be checked by a lawyer before the public launch. The controller's name and address come
 * from shared/legal.v1.0.0.ts; until they are filled in, both pages say so. */
import "./legal.v1.0.0.css";
import { escape } from "../shared/html";
import { CONTROLLER, CONTROLLER_READY, GAME_RETENTION_MONTHS, LEGAL_UPDATED, MIN_AGE } from "../shared/legal.v1.0.0";

const contact = () => CONTROLLER_READY
  ? `${escape(CONTROLLER.name)}, <a href="mailto:${escape(CONTROLLER.email)}">${escape(CONTROLLER.email)}</a>`
  : '<strong>dati del titolare in corso di pubblicazione</strong>';
const draft = () => CONTROLLER_READY ? "" : '<p class="legal-draft">Bozza: titolare e contatti saranno indicati prima dell’apertura al pubblico.</p>';

export const privacyPage = () => `<section class="page narrow legal"><div class="eyebrow">AGGIORNATA IL ${LEGAL_UPDATED.toUpperCase()}</div><h1>Privacy e cookie.</h1>${draft()}
<p class="lead">REAL or SLOP è un progetto personale e non commerciale. Non servono account e non raccogliamo nome, email o altri dati che ti identifichino direttamente.</p>
<h2>Titolare</h2><p>Il titolare del trattamento è ${contact()}. Allo stesso recapito puoi esercitare i tuoi diritti.</p>
<h2>Quali dati e perché</h2><ul>
<li><strong>Cookie tecnico di sessione</strong> (<code>ros_owner</code>): un codice casuale che dura un anno. Serve a far funzionare la partita e a mostrare in classifica solo il miglior punteggio di ogni giocatore. Nel nostro database ne conserviamo solo un’impronta, da cui non si risale al codice. È indispensabile al servizio, quindi non richiede consenso; puoi cancellarlo dalle impostazioni del browser.</li>
<li><strong>Partite</strong>: livello, foto mostrate, risposte e tempi, legati all’impronta del cookie e non a un nome. Servono al gioco, alle statistiche anonime sulle foto e a prevenire abusi. Le cancelliamo automaticamente dopo ${GAME_RETENTION_MONTHS} mesi.</li>
<li><strong>Classifica</strong>, solo se scegli di entrarci: soprannome, livello, punteggio e data, <strong>pubblici</strong>, e l’impronta del codice partita. Non usare il tuo nome e cognome. Restano finché non chiedi di cancellarli.</li>
<li><strong>Indirizzo IP</strong>: un’impronta dell’indirizzo, per circa un minuto, per limitare le richieste ripetute. Cloudflare, che ospita il sito, tratta gli indirizzi IP per far funzionare e proteggere il servizio.</li></ul>
<p>Non usiamo analytics, pubblicità né cookie di terze parti. Non vendiamo né cediamo dati.</p>
<h2>Base giuridica</h2><p>Il trattamento serve a fornirti il gioco che hai chiesto di usare (art. 6.1.b GDPR) e, per la sicurezza e le statistiche anonime, al legittimo interesse a far funzionare il servizio senza abusi (art. 6.1.f). La pubblicazione del soprannome avviene solo se entri in classifica.</p>
<h2>Fornitori</h2><p>Il sito è ospitato da Cloudflare, Inc., che agisce come responsabile del trattamento. Alcuni dati possono essere trattati negli Stati Uniti, con le garanzie dell’EU-US Data Privacy Framework. Le foto e i testi del catalogo vengono elaborati con servizi di OpenAI dall’amministratore; nessun dato dei giocatori viene inviato a OpenAI.</p>
<h2>Età</h2><p>Per entrare in classifica dichiari di avere almeno ${MIN_AGE} anni oppure il permesso di un genitore o di chi ne fa le veci. Il gioco si può usare anche senza entrare in classifica.</p>
<h2>I tuoi diritti</h2><p>Puoi chiedere accesso, rettifica, cancellazione e limitazione dei dati, e opporti al trattamento. Per una voce della classifica indica il <strong>codice partita</strong> che hai ricevuto: è il modo per riconoscerla. I dati delle partite sono legati solo al cookie del tuo browser: senza quel cookie non possiamo attribuirli a te. Hai diritto di proporre reclamo al Garante per la protezione dei dati personali (garanteprivacy.it).</p></section>`;

export const termsPage = () => `<section class="page narrow legal"><div class="eyebrow">AGGIORNATI IL ${LEGAL_UPDATED.toUpperCase()}</div><h1>Termini d’uso.</h1>${draft()}
<p class="lead">REAL or SLOP è un gioco educativo: serve ad allenare lo sguardo critico verso le immagini generate con l’intelligenza artificiale.</p>
<h2>Immagini SLOP</h2><p>Le immagini SLOP sono <strong>false</strong>: generate integralmente con l’intelligenza artificiale apposta per il gioco, con didascalie plausibili ma inventate. Raffigurano scene mai accadute. Ogni immagine del gioco porta il marchio «RS» e l’origine viene rivelata dopo ogni risposta.</p>
<h2>Uso delle immagini</h2><p>Le immagini e le didascalie sono pensate per essere viste nel gioco. È vietato diffonderle fuori dal gioco presentandole come vere, togliere il marchio o usarle per ingannare. Le fotografie REAL provengono da Wikimedia Commons e restano soggette alle loro licenze: autore, licenza e fonte sono indicati dopo ogni partita e nella pagina <a href="/crediti">Fonti e crediti</a>.</p>
<h2>Classifica</h2><p>Il soprannome deve essere decoroso e non deve contenere il tuo nome e cognome né dati di altre persone. Possiamo nascondere o cancellare voci che violano queste regole o che risultano ottenute con mezzi scorretti.</p>
<h2>Nessuna garanzia</h2><p>Il gioco è offerto così com’è, gratuitamente e senza garanzia di disponibilità continua. Il risultato di una partita non certifica la capacità di riconoscere un’immagine vera da una generata: i soli pixel non bastano sempre a stabilire l’origine di una foto.</p>
<h2>Contatti</h2><p>${contact()}. Vedi anche <a href="/privacy">Privacy e cookie</a>.</p></section>`;
