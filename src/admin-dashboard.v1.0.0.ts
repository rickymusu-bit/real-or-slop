import { api, content } from "./main";
import { ADMIN_VIEWS, resolveAdminView, type AdminView } from "../shared/admin-navigation.v1.0.0";
import "./admin-dashboard.v1.0.0.css";

interface CatalogStatus {
  mode: "demo" | "production";
  published: { REAL: number; AI: number };
}
interface PendingReview { total: number }
interface TopicList { topics: Array<{ id: string }> }

const overviewMarkup = `
  <section id="admin-overview" class="admin-overview" aria-label="Riepilogo amministrativo">
    <div class="admin-overview-heading">
      <h2>Stato del lavoro</h2>
      <button type="button" id="admin-refresh-overview">Aggiorna dati</button>
    </div>
    <div class="admin-stat-grid">
      <article class="admin-stat"><span>Da revisionare</span><strong id="admin-stat-pending">—</strong><small>Immagini nella coda editoriale</small></article>
      <article class="admin-stat"><span>Argomenti</span><strong id="admin-stat-topics">—</strong><small>Argomenti registrati</small></article>
      <article class="admin-stat"><span>Pubblicate</span><strong id="admin-stat-published">—</strong><small>REAL + SLOP nel catalogo giocabile</small></article>
      <article class="admin-stat"><span>Partite</span><strong id="admin-stat-mode">—</strong><small>Modalità attualmente selezionata</small></article>
    </div>
    <p class="admin-data-status" id="admin-overview-status" role="status" aria-live="polite">Caricamento dei dati…</p>
    <section class="admin-action-panel" aria-labelledby="admin-actions-title">
      <h2 id="admin-actions-title">Da dove vuoi iniziare?</h2>
      <div class="admin-action-grid">
        <button type="button" data-admin-open="topics"><strong>Nuovo argomento</strong><span>Definisci e indicizza un tema</span></button>
        <button type="button" data-admin-open="production"><strong>Produci immagini</strong><span>Carica foto e prepara REAL / SLOP</span></button>
        <button type="button" data-admin-open="review"><strong>Revisione</strong><span>Esamina le candidate in attesa</span></button>
        <button type="button" data-admin-open="publication"><strong>Pubblica un ciclo</strong><span>Controlla gli insiemi bilanciati</span></button>
      </div>
    </section>
    <section class="admin-flow-panel" aria-labelledby="admin-flow-title">
      <h2 id="admin-flow-title">Flusso editoriale</h2>
      <ol>
        <li><strong>Argomento</strong><span>Descrizione e memoria</span></li>
        <li><strong>Produzione</strong><span>Ricerca e generazione</span></li>
        <li><strong>Revisione</strong><span>Giudizio e verifiche</span></li>
        <li><strong>Pubblicazione</strong><span>Catalogo REAL / SLOP</span></li>
      </ol>
      <p>La selezione della modalità Demo / Produzione è indipendente dalla pubblicazione delle immagini.</p>
    </section>
  </section>`;

function directChildren(element: HTMLElement) {
  return Array.from(element.children) as HTMLElement[];
}

export function mountAdminDashboard() {
  const root = content();
  const review = root.querySelector<HTMLElement>(".visual-review")!;
  const catalog = root.querySelector<HTMLElement>(".game-catalog-mode")!;
  const workspace = root.querySelector<HTMLElement>("#editorial-workspace")!;
  const intelligence = root.querySelector<HTMLElement>("#editorial-intelligence")!;
  if (!review || !catalog || !workspace || !intelligence)
    throw new Error("Dashboard incompleta: manca un modulo amministrativo");

  // Move existing, already-initialized modules; never recreate their forms,
  // listeners, in-flight operations or user-entered values when changing section.
  const shell = document.createElement("div");
  shell.className = "admin-dashboard";
  shell.innerHTML = `
    <aside class="admin-sidebar">
      <div class="admin-side-title">REAL OR SLOP <span>Amministrazione</span></div>
      <nav class="admin-navigation" aria-label="Sezioni amministrazione">
        ${ADMIN_VIEWS.map(view => `<button type="button" data-admin-view="${view.id}">${view.label}</button>`).join("")}
      </nav>
      <div class="admin-side-links">
        <a href="/admin?advanced=1">Gestione avanzata</a>
        <a href="/admin/similarity">Analisi somiglianze</a>
        <a href="/admin/editorial-v2">Laboratorio editoriale v2</a>
      </div>
    </aside>
    <div class="admin-main">
      <header class="admin-view-heading">
        <div class="admin-heading-line">
          <span class="admin-eyebrow">DASHBOARD PRIVATA</span>
          <span class="admin-live-mode" id="admin-live-mode">Modalità in verifica</span>
        </div>
        <h1 id="admin-view-title"></h1>
        <p id="admin-view-description"></p>
      </header>
      <div class="admin-stage" id="admin-stage"></div>
    </div>`;
  const stage = shell.querySelector<HTMLElement>("#admin-stage")!;
  const overview = document.createElement("div");
  overview.innerHTML = overviewMarkup;
  const overviewSection = overview.firstElementChild as HTMLElement;
  stage.append(overviewSection, workspace, intelligence, review, catalog);
  root.replaceChildren(shell);

  const publishing = review.querySelector<HTMLElement>(".admin-publication-area");
  if (!publishing) throw new Error("Comandi di pubblicazione non disponibili");
  const detail = publishing.querySelector<HTMLDetailsElement>("details");

  const workspaceChildren = directChildren(workspace);
  const wsIntro = new Set(workspaceChildren.slice(0, 3));
  const topicOnly = new Set<HTMLElement>([
    workspace.querySelector<HTMLElement>("#workspace-topic-form")!,
    workspace.querySelector<HTMLElement>("#workspace-topic-status")!,
    workspace.querySelector<HTMLElement>("#workspace-description-drafts")!,
    workspace.querySelector<HTMLElement>("#workspace-semantic-form")!,
  ]);
  const topicPicker = workspace.querySelector<HTMLElement>("#workspace-topic-select")?.closest("label") as HTMLElement | null;
  const workspaceStatus = workspace.querySelector<HTMLElement>("#workspace-status");
  const intelligenceChildren = directChildren(intelligence);
  const intelIntro = new Set(intelligenceChildren.slice(0, 3));
  const columns = intelligence.querySelector<HTMLElement>(".intel-columns");

  const nav = Array.from(shell.querySelectorAll<HTMLButtonElement>("[data-admin-view]"));
  const title = shell.querySelector<HTMLElement>("#admin-view-title")!;
  const description = shell.querySelector<HTMLElement>("#admin-view-description")!;
  const overviewStatus = shell.querySelector<HTMLElement>("#admin-overview-status")!;
  const modeIndicator = shell.querySelector<HTMLElement>("#admin-live-mode")!;
  let loadNumber = 0;

  async function refreshOverview() {
    const sequence = ++loadNumber;
    overviewStatus.textContent = "Aggiornamento dei dati…";
    const [mode, pending, topics] = await Promise.allSettled([
      api<CatalogStatus>("/admin/game-catalog-mode"),
      api<PendingReview>("/admin/review-inbox?state=pending&origin=all&offset=0"),
      api<TopicList>("/admin/editorial/workspace"),
    ]);
    if (!shell.isConnected || sequence !== loadNumber) return;
    const set = (id: string, value: string) => {
      shell.querySelector<HTMLElement>("#" + id)!.textContent = value;
    };
    if (mode.status === "fulfilled") {
      set("admin-stat-mode", mode.value.mode === "demo" ? "Demo" : "Produzione");
      set("admin-stat-published", String(mode.value.published.REAL + mode.value.published.AI));
      modeIndicator.textContent = mode.value.mode === "demo" ? "Partite: Demo" : "Partite: Produzione";
    } else {
      set("admin-stat-mode", "—");
      set("admin-stat-published", "—");
      modeIndicator.textContent = "Modalità non disponibile";
    }
    set("admin-stat-pending", pending.status === "fulfilled" ? String(pending.value.total) : "—");
    set("admin-stat-topics", topics.status === "fulfilled" ? String(topics.value.topics.length) : "—");
    const failures = [mode, pending, topics].filter(result => result.status === "rejected").length;
    overviewStatus.textContent = failures ? `Dati parziali: ${failures} richieste non riuscite. Riprova con Aggiorna dati.`
      : "Dati aggiornati dal catalogo e dalla coda editoriale.";
  }

  function show(view: AdminView, fromInteraction = false) {
    shell.dataset.view = view;
    const selected = ADMIN_VIEWS.find(item => item.id === view)!;
    title.textContent = selected.label;
    description.textContent = selected.description;
    nav.forEach(button => {
      if (button.dataset.adminView === view) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    overviewSection.hidden = view !== "overview";
    review.hidden = view !== "review" && view !== "publication";
    workspace.hidden = view !== "topics" && view !== "production";
    intelligence.hidden = view !== "topics" && view !== "production" && view !== "settings";
    catalog.hidden = view !== "settings";

    for (const child of directChildren(review)) child.hidden = view === "publication" ? child !== publishing : child === publishing;
    if (view === "publication" && detail) detail.open = true;

    for (const child of workspaceChildren) {
      if (wsIntro.has(child)) child.hidden = true;
      else if (child === topicPicker || child === workspaceStatus) child.hidden = false;
      else if (topicOnly.has(child)) child.hidden = view !== "topics";
      else child.hidden = view !== "production";
    }
    for (const child of intelligenceChildren) {
      if (intelIntro.has(child)) child.hidden = true;
      else if (child.id === "intel-overview") child.hidden = view === "settings";
      else if (child.id === "intel-budget") child.hidden = view === "topics";
      else if (child === columns) child.hidden = view === "settings";
      else if (child.id === "intel-status") child.hidden = false;
      else child.hidden = view !== "production";
    }
    if (columns) {
      directChildren(columns).forEach((child, index) => {
        child.hidden = view === "topics" ? index !== 0 : index === 0;
      });
    }
    if (view === "overview") void refreshOverview();
    if (fromInteraction) {
      const url = new URL(location.href);
      url.searchParams.set("view", view);
      history.replaceState(history.state, "", url);
      window.scrollTo(0, 0);
      title.focus({ preventScroll: true });
    }
  }

  // Headings can receive focus after keyboard navigation.
  title.tabIndex = -1;
  shell.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-admin-view],[data-admin-open]");
    if (button && shell.contains(button)) {
      show(resolveAdminView(button.dataset.adminView || button.dataset.adminOpen), true);
    }
  });
  shell.querySelector("#admin-refresh-overview")!.addEventListener("click", () => void refreshOverview());
  show(resolveAdminView(new URL(location.href).searchParams.get("view")));
}
