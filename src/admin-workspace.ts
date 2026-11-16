/** Dashboard structure and navigation; workflow modules remain responsible for mutations. */
import "./admin-workspace.css";
export function mountAdminWorkspace(page: HTMLElement) {
  const nav = page.querySelector<HTMLElement>(".admin-tabs")!;
  const layout = document.createElement("div"); layout.className = "admin-workspace";
  const body = document.createElement("div"); body.className = "admin-workspace-body";
  nav.before(layout); layout.append(nav, body);
  for (const panel of page.querySelectorAll<HTMLElement>(".admin-panel")) body.append(panel);
  const hints: Record<string, string> = {real:"Cerca e prepara fotografie autentiche",slop:"Ispirazione, generazione e revisione",database:"Trova, modifica e pubblica le immagini",stats:"Controlla gioco, catalogo e chiamate",settings:"Configura modelli e strumenti"};
  for (const button of nav.querySelectorAll<HTMLButtonElement>("[data-admin-tab]")) {
    const hint = document.createElement("small"); hint.textContent = hints[button.dataset.adminTab!];
    hint.setAttribute("aria-hidden","true"); button.append(hint);
  }
  for (const [id, text] of Object.entries({database:"Una vista unica per controllare cosa è pronto, cosa è nel gioco e cosa richiede attenzione.", stats:"Dati di gioco e generazione, con un periodo di osservazione comune.", settings:"Apri il gruppo di comandi che ti serve. Ogni modulo salva i propri valori."})) {
    const heading = page.querySelector("#admin-"+id+" > h2")!;
    const intro = document.createElement("p"); intro.className = "section-intro"; intro.textContent = text; heading.after(intro);
  }
  const settings = page.querySelector<HTMLElement>("#admin-settings")!;
  const links = document.createElement("nav"); links.className="settings-index"; links.setAttribute("aria-label","Gruppi impostazioni");
  const groups = [["models","Modelli"],["thresholds","Generazione"],["contexts","Istruzioni IA"],["vocabulary","Tag"],["games","Partite"],["leaderboard","Classifica"]];
  for (const [id, label] of groups) {
    const button = document.createElement("button"); button.type="button"; button.textContent=label;
    button.addEventListener("click", () => {
      const detail = settings.querySelector<HTMLDetailsElement>("#library-"+id)!;
      detail.open=true;
      detail.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
      detail.querySelector("summary")?.focus();
    }); links.append(button);
  }
  settings.querySelector(".section-intro")!.after(links);
  for (const [id] of groups) settings.append(settings.querySelector("#library-"+id)!);
}
