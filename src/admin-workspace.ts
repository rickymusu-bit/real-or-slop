/** Dashboard structure and navigation; workflow modules remain responsible for mutations. */
import "./admin-workspace.css";
export function mountAdminWorkspace(page: HTMLElement) {
  const nav = page.querySelector<HTMLElement>(".admin-tabs")!;
  const layout = document.createElement("div"); layout.className = "admin-workspace";
  const body = document.createElement("div"); body.className = "admin-workspace-body";
  nav.before(layout); layout.append(nav, body);
  for (const panel of page.querySelectorAll<HTMLElement>(".admin-panel")) body.append(panel);
  const settings = page.querySelector<HTMLElement>("#admin-settings")!;
  const links = document.createElement("nav"); links.className="settings-index"; links.setAttribute("aria-label","Gruppi impostazioni");
  const groups = [["models","Modelli"],["thresholds","Generazione"],["contexts","Istruzioni IA"],["games","Partite"],["measures","Misure delle REAL"],["sources","Fonti Commons"],["leaderboard","Classifica"]];
  for (const [id, label] of groups) {
    const button = document.createElement("button"); button.type="button"; button.textContent=label;
    button.addEventListener("click", () => {
      const detail = settings.querySelector<HTMLDetailsElement>("#library-"+id)!;
      detail.open=true;
      detail.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
      detail.querySelector("summary")?.focus();
    }); links.append(button);
  }
  settings.querySelector("h2")!.after(links);
  for (const [id] of groups) settings.append(settings.querySelector("#library-"+id)!);
}
