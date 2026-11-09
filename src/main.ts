import { setupGame, stopPlay } from "./play";
import { showLibrary } from "./library.v1.1.0";
import "./style.css";
const root = document.querySelector<HTMLDivElement>("#app")!;
/** The demo catalog is gone with the clean database: every published image is a real library image. */
export const publicDemo = false;
export { escape } from "../shared/html";
export async function api<T = Record<string, unknown>>(
  path: string,
  options: RequestInit = {},
) {
  const response = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(data.error || "Connessione non disponibile");
  return data;
}
const links = [
  ["/allenamento", "Allenamento"],
  ["/tempo", "A tempo"],
];
export const content = () => document.querySelector<HTMLElement>("#content")!;
function shell() {
  root.innerHTML = `<a class="skip-link" href="#content">Salta al contenuto</a><header><a class="brand" href="/" aria-label="REAL or SLOP, inizio"><span class="brand-real">REAL</span><span class="brand-or">or</span><span class="brand-slop">SLOP</span></a><nav aria-label="Principale">${links.map(([url, label]) => `<a href="${url}" ${location.pathname === url ? 'aria-current="page"' : ""}>${label}</a>`).join("")}<a href="/informazioni" class="nav-info" aria-label="Informazioni">?</a></nav></header><main id="content" tabindex="-1"></main><footer><span>Guarda meglio. Metti tutto in dubbio.</span><div><a href="/informazioni">Come funziona & privacy</a><a href="/crediti">Fonti e crediti</a><span class="demo-dot">${publicDemo ? "Demo sintetica" : "Catalogo verificato"}</span></div></footer>`;
}
const arrow = '<svg class="arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16 16 4M4 4h12v12"/></svg>';
const mosaic = () => `<figure class="gallery-preview"><figcaption><span>STUDI SINTETICI</span><span>001 — 002</span></figcaption><div class="diptych" aria-hidden="true"><div class="art art-one"><span class="sun"></span><div class="ridge r1"></div><div class="ridge r2"></div><div class="ridge r3"></div></div><div class="art art-two"><div class="orb"></div></div></div><p>${publicDemo ? "Illustrazioni originali della demo. Nessuna fotografia verificata." : "Studi decorativi: non sono immagini del catalogo."}</p></figure>`;
function home() {
  content().innerHTML = `<section class="hero"><div class="hero-copy"><div class="eyebrow">ESPERIMENTO VISIVO${publicDemo ? " · DEMO" : ""}</div><h1>Guarda.<br>Dubita.<br><em>Decidi.</em></h1><p class="lead">Un’immagine. Due possibilità. Osserva i dettagli, scegli REAL o SLOP e scopri la storia dopo la risposta.</p><a class="button primary" href="/allenamento">${publicDemo ? "Esplora la demo" : "Inizia a giocare"} <span>${arrow}</span></a><div class="hero-meta"><span>Nessun account</span><span>Due modi di osservare</span></div></div>${mosaic()}</section><section class="modes"><div class="section-line"><div><span class="eyebrow">SCEGLI COME GIOCARE</span><h2>Il tuo sguardo, le tue regole.</h2></div><p>Inizia con calma. Poi alza la posta.</p></div><div class="cards">${[
    [
      "01",
      "◎",
      "Allenamento",
      "Prenditi il tuo tempo. Osserva, scegli e scopri la storia dietro ogni immagine.",
      "/allenamento",
      "Allena lo sguardo",
    ],
    [
      "02",
      "◷",
      "Contro il tempo",
      "Un conto alla rovescia per ogni immagine. Scegli prima che il tempo scada.",
      "/tempo",
      "Accetta la sfida",
    ],
  ]
    .map(
      ([n, icon, title, desc, url, cta]) =>
        `<a class="mode-card" href="${url}"><div class="card-top"><span class="mode-icon">${icon}</span><span>${n}</span></div><h3>${title}</h3><p>${desc}</p><div class="card-link">${cta}<span>${arrow}</span></div></a>`,
    )
    .join(
      "",
    )}</div></section>${publicDemo ? '<aside class="demo-banner">◈ <span><strong>Demo.</strong> Le illustrazioni sono sintetiche e le etichette simulate: non misurano il riconoscimento delle immagini IA.</span></aside>' : '<aside class="demo-banner">◈ <span>Le immagini delle partite provengono dal catalogo REAL/SLOP approvato e pubblicato.</span></aside>'}`;
}
function info() {
  content().innerHTML = `<section class="page narrow"><div class="eyebrow">UNO SGUARDO PIÙ CONSAPEVOLE</div><h1>Come funziona.</h1><p class="lead">Scegli REAL (reale) oppure SLOP (generata con IA). Dopo ogni risposta scopri spiegazione, provenienza e licenza.</p>${publicDemo ? '<h2>Una demo dichiarata</h2><p>Le illustrazioni attuali sono create in codice. Le etichette sono simulate e non costituiscono un test di riconoscimento delle immagini IA.</p>' : '<h2>Il catalogo giocabile</h2><p>Le immagini in partita provengono dal catalogo REAL/SLOP pubblicato, dopo approvazione e verifiche editoriali. Le immagini ancora in revisione non entrano nelle partite.</p>'}<h2 id="origine">Le regole del catalogo verificato</h2><p>REAL indica fotografie autentiche verificate e SLOP immagini generate integralmente con intelligenza artificiale. Le SLOP del nuovo protocollo nascono da idee originali, senza fotografie di riferimento. Escludiamo le fotografie modificate solo in parte con strumenti generativi: richiedono un diverso tipo di verifica.</p><p>Stranezza, bellezza, ordinarietà e imperfezioni non provano l’origine di un’immagine. Nella vita reale possono servire informazioni sulla fonte e sul contesto: i soli pixel non consentono sempre una risposta affidabile. L’origine sintetica, la veridicità della scena e l’intento di ingannare sono aspetti distinti. La parola Slop nel titolo non esprime un giudizio morale o automatico sulla qualità.</p><h2>Privacy</h2><p>Nessun account richiesto, nessun analytics o cookie pubblicitario. Un cookie tecnico conserva la sessione anonima. Il server registra risposte e tempi per il funzionamento e le statistiche. Il rilevamento della pagina nascosta oscura le immagini soltanto nel browser: non registra la tua navigazione e non applica penalità. Prima del lancio pubblico saranno definiti titolare, contatti e conservazione. Puoi eliminare il cookie dalle impostazioni del browser.</p><h2>Tempo e immagini</h2><p>In Allenamento il tempo di osservazione è misurato e mostrato nel riepilogo, senza modificare i punti. A tempo ogni immagine ha un countdown: cambiare scheda non lo sospende. Quando la pagina diventa nascosta, l’immagine viene coperta; al ritorno puoi mostrarla di nuovo se il round è ancora aperto. I comandi diretti di salvataggio sono limitati sulle immagini di gioco, ma screenshot e copie restano tecnicamente possibili.</p><h2>Comandi</h2><p>Durante una domanda: R per REAL, I per SLOP (generata con IA). Tocca l’immagine per ingrandirla, oppure usa Invio o Spazio quando ha il focus. Chiudi con Escape. Ogni funzione è disponibile con tastiera e touch.</p></section>`;
}
function credits() {
  content().innerHTML = `<section class="page narrow"><div class="eyebrow">TRASPARENZA, PRIMA DI TUTTO</div><h1>Fonti e crediti.</h1><p class="lead">${publicDemo ? "La demo contiene illustrazioni geometriche originali Real or Slop." : "Il gioco usa il catalogo REAL e SLOP approvato e pubblicato."}</p><p>${publicDemo ? "Le illustrazioni dimostrative non contengono materiale di terzi. " : ""}L’interfaccia usa Space Grotesk Bold e Inter distribuiti localmente con licenza SIL Open Font License 1.1: <a href="/fonts/OFL-space-grotesk.txt" target="_blank" rel="noopener noreferrer">licenza Space Grotesk</a> e <a href="/fonts/OFL-inter.txt" target="_blank" rel="noopener noreferrer">licenza Inter</a>. Nel catalogo definitivo, fonte, autore, licenza, obblighi di attribuzione e prove saranno mostrati dopo la risposta. Le immagini in revisione rimangono private.</p><a class="button" href="/allenamento">${publicDemo ? "Esplora la demo" : "Inizia a giocare"}</a></section>`;
}

export async function render() {
  stopPlay();
  shell();
  if (location.pathname === "/") home();
  else if (location.pathname === "/informazioni") info();
  else if (location.pathname === "/crediti") credits();
  else if (location.pathname === "/allenamento") await setupGame("training");
  else if (location.pathname === "/tempo") await setupGame("timed");
  else if (location.pathname === "/pvp") content().innerHTML = '<section class="page narrow"><h1>La sfida tra amici torna più avanti.</h1><p>Il PvP è temporaneamente sospeso.</p><a class="button" href="/tempo">Gioca a tempo</a></section>';
  else if (location.pathname === "/admin") await showLibrary();
  else
    content().innerHTML =
      '<section class="page"><h1>Pagina non trovata.</h1><a href="/">Torna all’inizio</a></section>';
}
document.addEventListener("click", (event) => {
  const a = (event.target as HTMLElement).closest<HTMLAnchorElement>(
    'a[href^="/"]',
  );
  if (a && !a.target && !a.hasAttribute("download") && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    history.pushState({}, "", a.href);
    void render().then(() => content().focus({ preventScroll: true }));
    window.scrollTo(0, 0);
  }
});
window.addEventListener("popstate", () => void render().then(() => content().focus({ preventScroll: true })));
void render();
