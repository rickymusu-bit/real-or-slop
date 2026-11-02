import { setupPvp, stopPvp } from "./pvp";
import { setupGame, stopPlay } from "./play";
import { showAdmin } from "./admin";
import { showSlopStudio } from "./slop";
import "./style.css";
declare const __ROS_BRAND_READY__: boolean;
const root = document.querySelector<HTMLDivElement>("#app")!;
const brandIcon = __ROS_BRAND_READY__
  ? '<img class="ros-logo-icon" src="/brand/logo-real-slop-v1.0.0.png" width="1254" height="1254" alt="" decoding="async">'
  : "";
const brandHero = __ROS_BRAND_READY__
  ? '<div class="hero-brand-photo" aria-hidden="true"><img src="/brand/hero-real-slop-v1.0.0.png" width="1672" height="941" alt="" decoding="async" fetchpriority="high"></div>'
  : "";
const brandMascot = __ROS_BRAND_READY__
  ? '<img class="ros-mode-mascot" src="/brand/mascot-real-slop-v1.0.0.png" width="1254" height="1254" alt="" loading="lazy" decoding="async">'
  : "";

export const escape = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
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
  ["/pvp", "Sfida un amico"],
];
export const content = () => document.querySelector<HTMLElement>("#content")!;
function shell() {
  if (__ROS_BRAND_READY__ && !document.querySelector('link[data-ros-favicon]')) {
    for (const size of [16, 32]) {
      const icon = document.createElement("link");
      icon.rel = "icon";
      icon.type = "image/png";
      icon.sizes = `${size}x${size}`;
      icon.href = `/brand/favicon-${size}-v1.0.0.png`;
      icon.dataset.rosFavicon = "true";
      document.head.append(icon);
    }
  }
  root.innerHTML = `<a class="skip-link" href="#content">Salta al contenuto</a><header><a class="brand" href="/" aria-label="REAL or SLOP, inizio">${brandIcon}<span class="brand-labels"><span class="brand-real">REAL</span><span class="brand-or">or</span><span class="brand-slop">SLOP</span></span></a><nav aria-label="Principale">${links.map(([url, label]) => `<a href="${url}" ${location.pathname === url ? 'aria-current="page"' : ""}>${label}</a>`).join("")}<a href="/informazioni" class="nav-info" aria-label="Informazioni">?</a></nav></header><main id="content" tabindex="-1"></main><footer><span>Guarda meglio. Metti tutto in dubbio.</span><div><a href="/informazioni">Come funziona & privacy</a><a href="/crediti">Fonti e crediti</a><span class="demo-dot">Demo sintetica</span></div></footer>`;
}
const arrow = '<svg class="arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16 16 4M4 4h12v12"/></svg>';
const mosaic = `<figure class="gallery-preview"><figcaption><span>STUDI SINTETICI</span><span>001 — 002</span></figcaption><div class="diptych" aria-hidden="true"><div class="art art-one"><span class="sun"></span><div class="ridge r1"></div><div class="ridge r2"></div><div class="ridge r3"></div></div><div class="art art-two"><div class="orb"></div></div></div><p>Illustrazioni originali della demo.<br>Nessuna fotografia o immagine verificata.</p></figure>`;
function home() {
  content().innerHTML = `<section class="${__ROS_BRAND_READY__ ? "hero hero-branded" : "hero"}"><div class="hero-copy"><div class="eyebrow">ESPERIMENTO VISIVO · DEMO</div><h1>Guarda.<br>Dubita.<br><em>Decidi.</em></h1><p class="lead">Un’immagine. Due possibilità. Osserva i dettagli, scegli REAL o SLOP e scopri la storia dopo la risposta.</p><a class="button primary" href="/allenamento">Esplora la demo <span>${arrow}</span></a><div class="hero-meta"><span>Nessun account</span><span>Tre modi di osservare</span></div></div>${__ROS_BRAND_READY__ ? brandHero : mosaic}</section><section class="modes"><div class="section-line"><div><span class="eyebrow">SCEGLI COME GIOCARE</span><h2>Il tuo sguardo, le tue regole.</h2></div><div class="modes-aside"><p>Inizia con calma. Poi alza la posta.</p>${brandMascot}</div></div><div class="cards">${[
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
      "Il tempo scorre. Quante immagini riesci a riconoscere prima dello zero?",
      "/tempo",
      "Accetta la sfida",
    ],
    [
      "03",
      "⚑",
      "Uno contro uno",
      "Stesse immagini. Stesso tempo. Sfida un amico e scopri chi ha più intuito.",
      "/pvp",
      "Crea una stanza",
    ],
  ]
    .map(
      ([n, icon, title, desc, url, cta]) =>
        `<a class="mode-card" href="${url}"><div class="card-top"><span class="mode-icon">${icon}</span><span>${n}</span></div><h3>${title}</h3><p>${desc}</p><div class="card-link">${cta}<span>${arrow}</span></div></a>`,
    )
    .join(
      "",
    )}</div></section><aside class="demo-banner">◈ <span><strong>Stai esplorando una demo.</strong> Le illustrazioni sono sintetiche e le risposte simulate. Il catalogo verificato arriverà dopo la revisione editoriale.</span></aside>`;
}
function info() {
  content().innerHTML = `<section class="page narrow"><div class="eyebrow">UNO SGUARDO PIÙ CONSAPEVOLE</div><h1>Come funziona.</h1><p class="lead">Scegli REAL (reale) oppure SLOP (generata con IA). Dopo ogni risposta scopri spiegazione, provenienza e licenza.</p><h2>Una demo dichiarata</h2><p>Le illustrazioni attuali sono create in codice dal progetto. Le etichette sono simulate per provare le funzioni: non sono fotografie documentate né un test del riconoscimento delle immagini IA.</p><h2>Il catalogo futuro</h2><p>Solo immagini approvate dall’amministratore. “Reale” richiede provenienza documentata e diritti verificati; le immagini IA sono create dal proprietario per un gioco di fantasia. La parola Slop nel titolo non valuta automaticamente la qualità.</p><h2>Privacy</h2><p>Nessun account richiesto, nessun analytics o cookie pubblicitario. Un cookie tecnico conserva la sessione anonima; il nickname PvP è facoltativo. Le risposte vengono conservate localmente per il funzionamento e le statistiche. Non inserire dati personali nel nickname. Prima del lancio pubblico saranno definiti titolare, contatti e conservazione. Puoi eliminare il cookie dalle impostazioni del browser.</p><h2>Comandi</h2><p>Durante una domanda: R per REAL, I per SLOP (generata con IA). Tocca l’immagine per ingrandirla, oppure usa Invio o Spazio quando ha il focus. Chiudi con Escape. Ogni funzione è disponibile con tastiera e touch.</p></section>`;
}
function credits() {
  content().innerHTML = `<section class="page narrow"><div class="eyebrow">TRASPARENZA, PRIMA DI TUTTO</div><h1>Fonti e crediti.</h1><p class="lead">La demo contiene soltanto illustrazioni geometriche originali Real or Slop.</p><p>Le illustrazioni del gioco non contengono materiale di terzi. L’interfaccia usa Space Grotesk Bold e Inter distribuiti localmente con licenza SIL Open Font License 1.1: <a href="/fonts/OFL-space-grotesk.txt" target="_blank" rel="noopener noreferrer">licenza Space Grotesk</a> e <a href="/fonts/OFL-inter.txt" target="_blank" rel="noopener noreferrer">licenza Inter</a>. Nel catalogo definitivo, fonte, autore, licenza, obblighi di attribuzione e prove saranno mostrati dopo la risposta. Le immagini in revisione rimangono private.</p><a class="button" href="/allenamento">Esplora la demo</a></section>`;
}

export async function render() {
  stopPlay();
  stopPvp();
  shell();
  if (location.pathname === "/") home();
  else if (location.pathname === "/informazioni") info();
  else if (location.pathname === "/crediti") credits();
  else if (location.pathname === "/allenamento") await setupGame("training");
  else if (location.pathname === "/tempo") await setupGame("timed");
  else if (location.pathname === "/pvp") await setupPvp();
  else if (location.pathname === "/admin") await showAdmin();
  else if (location.pathname === "/admin/slop") await showSlopStudio();
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
