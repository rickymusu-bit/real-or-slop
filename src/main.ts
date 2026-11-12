/** App shell. 2026-11-12T09:00:00Z: one game mode with levels at /gioca, leaderboard on the home page; training, timed and PvP
 * pages are gone (old addresses lead to /gioca) (docs/gioco-a-livelli.v1.0.0.md). */
import { setupGame, stopPlay } from "./play.v2.0.0";
import { showLibrary } from "./library.v1.13.0";
import "./style.css";
const root = document.querySelector<HTMLDivElement>("#app")!;
/** The demo catalog is gone with the clean database: every published image is a real library image. */
export const publicDemo = false;
import { escape } from "../shared/html";
export { escape };
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
const links = [["/gioca", "Gioca"]];
export const content = () => document.querySelector<HTMLElement>("#content")!;
function shell() {
  root.innerHTML = `<a class="skip-link" href="#content">Salta al contenuto</a><header><a class="brand" href="/" aria-label="REAL or SLOP, inizio"><span class="brand-real">REAL</span><span class="brand-or">or</span><span class="brand-slop">SLOP</span></a><nav aria-label="Principale">${links.map(([url, label]) => `<a href="${url}" ${location.pathname === url ? 'aria-current="page"' : ""}>${label}</a>`).join("")}<a href="/informazioni" class="nav-info" aria-label="Informazioni">?</a></nav></header><main id="content" tabindex="-1"></main><footer><span>Guarda meglio. Metti tutto in dubbio.</span><div><a href="/informazioni">Come funziona & privacy</a><a href="/crediti">Fonti e crediti</a><span class="demo-dot">${publicDemo ? "Demo sintetica" : "Catalogo verificato"}</span></div></footer>`;
}
const arrow = '<svg class="arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16 16 4M4 4h12v12"/></svg>';
const mosaic = () => `<figure class="gallery-preview"><figcaption><span>STUDI SINTETICI</span><span>001 — 002</span></figcaption><div class="diptych" aria-hidden="true"><div class="art art-one"><span class="sun"></span><div class="ridge r1"></div><div class="ridge r2"></div><div class="ridge r3"></div></div><div class="art art-two"><div class="orb"></div></div></div><p>${publicDemo ? "Illustrazioni originali della demo. Nessuna fotografia verificata." : "Studi decorativi: non sono immagini del catalogo."}</p></figure>`;
function home() {
  content().innerHTML = `<section class="hero"><div class="hero-copy"><div class="eyebrow">ESPERIMENTO VISIVO</div><h1>Guarda.<br>Dubita.<br><em>Decidi.</em></h1><p class="lead">Una foto alla volta, col tempo che scorre. È una fotografia vera o l’ha generata un’intelligenza artificiale? Scegli REAL o SLOP.</p><a class="button primary" href="/gioca">Inizia a giocare <span>${arrow}</span></a><div class="hero-meta"><span>Nessun account</span><span>Quattro livelli</span></div></div>${mosaic()}</section><section class="modes"><div class="section-line"><div><span class="eyebrow">CLASSIFICA</span><h2>Chi guarda meglio.</h2></div><p>Il miglior punteggio di ogni giocatore. Contano le foto e l’accuratezza: rispondere a caso vale zero.</p></div><div id="leaderboards" class="leaderboards"><p class="hint">Caricamento…</p></div></section>`;
  const table = (caption: string, rows: { rank: number; nickname: string; level_label: string; score: number }[]) =>
    `<div class="leaderboard"><table><caption>${caption}</caption><thead><tr><th scope="col">#</th><th scope="col">Giocatore</th><th scope="col">Livello</th><th scope="col">Punti</th></tr></thead><tbody>${rows.length
      ? rows.map(r => `<tr><td>${r.rank}</td><td>${escape(r.nickname)}</td><td>${escape(r.level_label)}</td><td>${r.score.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td></tr>`).join("")
      : '<tr><td colspan="4">Ancora nessuna partita in classifica.</td></tr>'}</tbody></table></div>`;
  void api<{ week: Parameters<typeof table>[1]; all: Parameters<typeof table>[1] }>("/leaderboard")
    .then(data => { const box = document.querySelector("#leaderboards"); if (box) box.innerHTML = table("Ultimi 7 giorni", data.week) + table("Di sempre", data.all); })
    .catch(() => { const box = document.querySelector("#leaderboards"); if (box) box.innerHTML = '<p class="hint">Classifica non disponibile.</p>'; });
}
function info() {
  content().innerHTML = `<section class="page narrow"><div class="eyebrow">UNO SGUARDO PIÙ CONSAPEVOLE</div><h1>Come funziona.</h1><p class="lead">Per ogni foto scegli REAL (una fotografia vera) oppure SLOP (generata con l’intelligenza artificiale). Alla fine vedi tutte le foto della partita, con le fonti delle REAL e il prompt delle SLOP.</p><h2>Livelli e tempo</h2><p>Facile: 10 foto, 20 secondi per foto. Medio: 15 foto, 15 secondi. Difficile: 20 foto, 10 secondi. Esperto: 25 foto, 5 secondi. Il tempo di una foto parte quando la foto compare e si ferma quando rispondi; se scade, la foto conta come non riconosciuta e si passa alla successiva. Se lasci la pagina, foto e didascalia si oscurano ma il tempo continua.</p><h2>Punteggio</h2><p>Punteggio = foto × (2 × accuratezza bilanciata − 1). L’accuratezza bilanciata è la media tra la quota di REAL riconosciute e quella di SLOP riconosciute: chi risponde a caso, o sempre allo stesso modo, fa zero; chi non sbaglia mai fa tanti punti quante sono le foto del livello. Conta solo una partita giocata fino all’ultima foto.</p><h2>Comandi</h2><p>Sul telefono scorri la foto: verso destra REAL, verso sinistra SLOP. Sul computer usa i pulsanti sotto la foto oppure i tasti R (REAL) e S (SLOP).</p><h2 id="origine">Le regole del catalogo</h2><p>REAL indica fotografie autentiche verificate, SLOP immagini generate integralmente con intelligenza artificiale. Tutte le foto sono mostrate nello stesso formato 4:5, senza metadati, con il marchio RS. Stranezza, bellezza, ordinarietà e imperfezioni non provano l’origine di un’immagine: i soli pixel non consentono sempre una risposta affidabile.</p><h2>Classifica e privacy</h2><p>Nessun account. Un cookie tecnico conserva la sessione anonima e serve anche a mostrare in classifica solo il miglior punteggio di ogni giocatore. Se entri in classifica, il soprannome che scegli è pubblico; ricevi un codice partita, mostrato una sola volta, che dimostra che la partita è tua: il sito conserva solo un’impronta del codice. Il server registra risposte e tempi per il funzionamento e le statistiche. Prima del lancio pubblico saranno definiti titolare, contatti e conservazione.</p></section>`;
}
function credits() {
  content().innerHTML = `<section class="page narrow"><div class="eyebrow">TRASPARENZA, PRIMA DI TUTTO</div><h1>Fonti e crediti.</h1><p class="lead">${publicDemo ? "La demo contiene illustrazioni geometriche originali Real or Slop." : "Il gioco usa il catalogo REAL e SLOP approvato e pubblicato."}</p><p>${publicDemo ? "Le illustrazioni dimostrative non contengono materiale di terzi. " : ""}L’interfaccia usa Space Grotesk Bold e Inter distribuiti localmente con licenza SIL Open Font License 1.1: <a href="/fonts/OFL-space-grotesk.txt" target="_blank" rel="noopener noreferrer">licenza Space Grotesk</a> e <a href="/fonts/OFL-inter.txt" target="_blank" rel="noopener noreferrer">licenza Inter</a>. Nel catalogo definitivo, fonte, autore, licenza, obblighi di attribuzione e prove saranno mostrati dopo la risposta. Le immagini in revisione rimangono private.</p><a class="button" href="/gioca">Inizia a giocare</a></section>`;
}

export async function render() {
  stopPlay();
  shell();
  if (location.pathname === "/") home();
  else if (location.pathname === "/informazioni") info();
  else if (location.pathname === "/crediti") credits();
  else if (location.pathname === "/gioca") await setupGame();
  else if (["/allenamento", "/tempo", "/pvp"].includes(location.pathname)) { history.replaceState({}, "", "/gioca"); await setupGame(); }
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
