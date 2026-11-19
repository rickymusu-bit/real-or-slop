/** Statistics, «Distribuzione delle immagini» (spec `database-immagini`, section 5): REAL and SLOP overall and per tag,
 * published and approved stacked, with the spread; filters, sorting, compact view, tooltip and table view. */
import "./database.css";
import { escape } from "../shared/html";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "../shared/tag-categories";

export interface DistributionTag { label: string; category: Category; real_approved: number; real_published: number; slop_approved: number; slop_published: number; spread: number }
export interface Distribution { totals: { REAL: { approved: number; published: number }; SLOP: { approved: number; published: number } }; tags: DistributionTag[] }
type Order = "spread" | "total" | "label";
const CATEGORY_FILTER: Category[] = [...CATEGORIES];
const signed = (n: number) => (n > 0 ? "+" : "") + n;
const pct = (part: number, whole: number) => whole ? Math.round(part / whole * 100) + "%" : "—";

/** A stacked bar: published from the zero line, approved after it, a 2px gap between. Width in % of the half track. */
function stack(published: number, approved: number, max: number, side: "real" | "slop") {
  const seg = (n: number, state: string) => n ? `<span class="dist-seg dist-${side} dist-${state}" style="width:${(n / max * 100).toFixed(2)}%"></span>` : "";
  // On the SLOP side the bar grows leftwards: published stays next to the zero line.
  return side === "real" ? seg(published, "published") + seg(approved, "approved") : seg(approved, "approved") + seg(published, "published");
}

export function mountDistribution(root: HTMLElement, load: () => Promise<Distribution>) {
  let data: Distribution | null = null, hidden = new Set<Category>(), expanded = false, topN = 15, search = "", order: Order = "spread", table = false, error = "";

  const tagText = (t: DistributionTag) => `${t.label}, ${CATEGORY_LABELS[t.category]}: REAL ${t.real_approved + t.real_published} ` +
    `(pubblicate ${t.real_published}, approvate ${t.real_approved}), SLOP ${t.slop_approved + t.slop_published} ` +
    `(pubblicate ${t.slop_published}, approvate ${t.slop_approved}), spread ${signed(t.spread)}`;
  const rows = () => {
    const list = (data?.tags || []).filter(t => !hidden.has(t.category) && (!search || t.label.includes(search)));
    const total = (t: DistributionTag) => t.real_approved + t.real_published + t.slop_approved + t.slop_published;
    list.sort(order === "label" ? (a, b) => a.label.localeCompare(b.label) : order === "total" ? (a, b) => total(b) - total(a) || a.label.localeCompare(b.label)
      : (a, b) => b.spread - a.spread || a.label.localeCompare(b.label));
    return expanded ? list : list.slice(0, topN);
  };
  const legend = () => '<p class="dist-legend" aria-label="Legenda">' +
    '<span><i class="dist-key dist-real dist-published"></i>REAL pubblicate</span><span><i class="dist-key dist-real dist-approved"></i>REAL approvate</span>' +
    '<span><i class="dist-key dist-slop dist-published"></i>SLOP pubblicate</span><span><i class="dist-key dist-slop dist-approved"></i>SLOP approvate</span></p>';

  const overview = () => {
    if (!data) return "";
    const r = data.totals.REAL, s = data.totals.SLOP, real = r.approved + r.published, slop = s.approved + s.published, all = real + slop;
    const max = Math.max(1, real, slop), spread = real - slop;
    const text = `Tutte le immagini: REAL ${real} (pubblicate ${r.published}, approvate ${r.approved}), SLOP ${slop} (pubblicate ${s.published}, approvate ${s.approved}), spread ${signed(spread)}`;
    const published = r.published + s.published;
    return '<section class="dist-overview" aria-label="Distribuzione tra REAL e SLOP">' +
      `<p class="dist-figures"><span><strong>${real}</strong> REAL <small>${pct(real, all)}</small></span><span><strong>${slop}</strong> SLOP <small>${pct(slop, all)}</small></span>` +
      `<span><strong>${signed(spread)}</strong> spread</span><span><strong>${published}</strong> pubblicate, REAL ${pct(r.published, published)}</span></p>` +
      `<div class="dist-row dist-total" role="img" aria-label="${escape(text)}" data-tip="${escape(text)}" tabindex="0"><span class="dist-label">Tutte</span>` +
      `<span class="dist-track"><span class="dist-half dist-left">${stack(s.published, s.approved, max, "slop")}</span>` +
      `<span class="dist-half dist-right">${stack(r.published, r.approved, max, "real")}</span></span><span class="dist-value">${signed(spread)}</span></div>` +
      (published && (r.published / published < 0.4 || r.published / published > 0.6)
        ? '<p class="hint">Le pubblicate escono dal rapporto 40–60% tra REAL e SLOP (avviso non bloccante della specifica).</p>' : "") + "</section>";
  };
  const chart = () => {
    const list = rows();
    if (!list.length) return '<p class="hint">Nessun tag da mostrare con questi filtri.</p>';
    const max = Math.max(1, ...list.map(t => Math.max(t.real_approved + t.real_published, t.slop_approved + t.slop_published)));
    return '<div class="dist-axis" aria-hidden="true"><span></span><span class="dist-track"><span>← SLOP</span><span>REAL →</span></span><span>spread</span></div>' +
      `<div class="dist-chart${expanded ? " dist-expanded" : ""}" role="list" aria-label="Distribuzione per tag">` + list.map(t =>
        `<div class="dist-row" role="listitem" tabindex="0" aria-label="${escape(tagText(t))}" data-tip="${escape(tagText(t))}">` +
        `<span class="dist-label"><i class="dist-cat tag-cat-${t.category}" title="${escape(CATEGORY_LABELS[t.category])}"></i>${escape(t.label)}</span>` +
        `<span class="dist-track"><span class="dist-half dist-left">${stack(t.slop_published, t.slop_approved, max, "slop")}</span>` +
        `<span class="dist-half dist-right">${stack(t.real_published, t.real_approved, max, "real")}</span></span>` +
        `<span class="dist-value">${signed(t.spread)}</span></div>`).join("") + "</div>";
  };
  const tableView = () => '<div class="dist-table-wrap"><table class="dist-table"><caption>Immagini approvate e pubblicate per tag</caption><thead><tr>' +
    '<th scope="col">Tag</th><th scope="col">Categoria</th><th scope="col">REAL pubblicate</th><th scope="col">REAL approvate</th>' +
    '<th scope="col">SLOP pubblicate</th><th scope="col">SLOP approvate</th><th scope="col">Spread</th></tr></thead><tbody>' +
    rows().map(t => `<tr><th scope="row">${escape(t.label)}</th><td>${escape(CATEGORY_LABELS[t.category])}</td><td>${t.real_published}</td>` +
      `<td>${t.real_approved}</td><td>${t.slop_published}</td><td>${t.slop_approved}</td><td>${signed(t.spread)}</td></tr>`).join("") + "</tbody></table></div>";

  const render = () => {
    root.innerHTML = '<p class="hint">Immagini approvate e pubblicate. A destra le REAL, a sinistra le SLOP; in ogni barra la parte piena sono le pubblicate, ' +
      "quella tratteggiata le approvate. Lo spread è REAL meno SLOP, approvate e pubblicate insieme: positivo dove mancano SLOP.</p>" +
      (error ? `<p class="slop-closed" role="alert">${escape(error)}</p>` : "") + overview() + legend() +
      '<div class="slop-filters" role="group" aria-label="Filtra per categoria">' + CATEGORY_FILTER.map(c =>
        `<button type="button" class="tag-legend-item tag-cat tag-cat-${c}" data-dist-cat="${c}" aria-pressed="${!hidden.has(c)}">${escape(CATEGORY_LABELS[c])}</button>`).join("") +
      '<button type="button" data-dist-cat="all">Tutte</button></div>' +
      '<div class="dist-controls library-inline"><label>Ordina<select data-dist-order>' +
      ([["spread", "per spread"], ["total", "per numero di immagini"], ["label", "per nome"]] as const)
        .map(([value, label]) => `<option value="${value}"${order === value ? " selected" : ""}>${label}</option>`).join("") + "</select></label>" +
      `<label>Cerca<input type="search" data-dist-search value="${escape(search)}" autocomplete="off" autocapitalize="none" spellcheck="false"></label>` +
      (expanded ? '<button type="button" data-dist="compact">Vista compatta</button>'
        : '<label>Primi<select data-dist-top>' + [10, 15, 30, 50].map(n => `<option value="${n}"${n === topN ? " selected" : ""}>${n}</option>`).join("") +
          '</select> tag</label><button type="button" data-dist="expand">Mostra tutti</button>') +
      `<button type="button" data-dist="table" aria-pressed="${table}">${table ? "Mostra il grafico" : "Mostra la tabella"}</button></div>` +
      `<p class="hint">${(data?.tags.length || 0)} tag in uso tra approvate e pubblicate.</p>` +
      (table ? tableView() : chart()) + '<div class="dist-tip" role="tooltip" hidden></div>';
  };
  const refresh = async () => {
    try { data = await load(); error = ""; } catch (e) { error = e instanceof Error ? e.message : String(e); }
    render();
  };

  root.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button) return;
    const cat = button.dataset.distCat;
    if (cat === "all") hidden = new Set();
    else if (cat) { if (hidden.has(cat as Category)) hidden.delete(cat as Category); else hidden.add(cat as Category); }
    else if (button.dataset.dist === "expand") expanded = true;
    else if (button.dataset.dist === "compact") expanded = false;
    else if (button.dataset.dist === "table") table = !table;
    else return;
    render();
  });
  root.addEventListener("change", event => {
    const field = event.target as HTMLSelectElement;
    if (field.matches("[data-dist-order]")) order = field.value as Order;
    else if (field.matches("[data-dist-top]")) topN = Number(field.value);
    else return;
    render();
  });
  let timer = 0;
  root.addEventListener("input", event => {
    const field = event.target as HTMLInputElement;
    if (!field.matches("[data-dist-search]")) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      search = field.value.trim().toLowerCase(); render();
      const again = root.querySelector<HTMLInputElement>("[data-dist-search]");
      again?.focus(); again?.setSelectionRange(again.value.length, again.value.length);
    }, 200);
  });
  // Tooltip on hover and focus: tag, category, the four counts and the spread.
  const tip = (target: HTMLElement | null) => {
    const box = root.querySelector<HTMLElement>(".dist-tip");
    if (!box) return;
    if (!target) { box.hidden = true; return; }
    box.textContent = target.dataset.tip || "";
    const host = root.getBoundingClientRect(), row = target.getBoundingClientRect();
    box.style.left = Math.max(0, Math.min(row.left - host.left + 40, host.width - 300)) + "px";
    box.style.top = (row.bottom - host.top + 4) + "px";
    box.hidden = false;
  };
  root.addEventListener("pointerover", event => tip((event.target as HTMLElement).closest<HTMLElement>("[data-tip]")));
  root.addEventListener("pointerleave", () => tip(null));
  root.addEventListener("focusin", event => tip((event.target as HTMLElement).closest<HTMLElement>("[data-tip]")));
  root.addEventListener("focusout", () => tip(null));
  render();
  return { refresh };
}
