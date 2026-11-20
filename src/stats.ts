/** Dashboard «Statistiche» (spec `statistiche-impostazioni`, section 3): games now and open, games and answers of the
 * period, paid calls, balance of the catalogue with the formats of the published copies. Display only. */
import "./stats.css";
import { escape } from "../shared/html";

type Level = "facile" | "medio" | "difficile" | "esperto";
const LABEL: Record<Level, string> = { facile: "Facile", medio: "Medio", difficile: "Difficile", esperto: "Esperto" };
const KIND: Record<string, string> = { analysis: "Analisi delle foto", prompts: "Proposte e prompt SLOP", images: "Immagini", evaluation: "Valutazione SLOP" };
const STATUS: Record<string, string> = { completed: "riuscita", failed: "rifiutata, senza addebito", uncertain: "esito incerto", pending: "in corso" };
interface Stats {
  processes?: {state:string;n:number;attempts:number}[]; period: string; generated_at: string;
  live: { now: number; by_level: Record<Level, number>; open: number; window_minutes: number };
  games: { level: Level; started: number; completed: number; invalidated: number; unfinished: number; mean_score: number | null }[];
  answers: { concluded_games: number; photos: number; real: { right: number; total: number }; slop: { right: number; total: number }; timed_out: number; balanced_accuracy: number | null };
  leaderboard: { entries: number; hidden: number };
  calls: { totals: { kind: string; status: string; n: number; input_tokens: number; output_tokens: number }[];
    recent: { kind: string; model: string; status: string; input_tokens: number | null; output_tokens: number | null; created_at: string }[] };
  balance: { real: { approved: number; published: number }; slop: { approved: number; published: number }; real_share_published: number | null; warning: boolean; formats?: { format: string; real: number; slop: number }[];
    balance?: { real: number; slop: number; pending: number; available: number };
    levels: { id: Level; label: string; photos: number; available: boolean }[] };
}
const pct = (a: number, b: number) => b ? Math.round(a / b * 100) + "%" : "—";
const num = (n: number) => n.toLocaleString("it-IT");
const tile = (value: string, label: string, note = "") => `<div class="stat-tile"><strong>${value}</strong><span>${label}</span>${note ? `<small>${note}</small>` : ""}</div>`;

export function mountStats(root: HTMLElement, load: (period: string) => Promise<Stats>) {
  let period = "30", kind = "", status = "", data: Stats | null = null, error = "", view = "all";
  const applyView = () => root.querySelectorAll<HTMLElement>(".stats-block").forEach(block => { block.hidden = view !== "all" && block.getAttribute("aria-labelledby") !== "stats-" + view; });
  const render = () => {
    if (!data) { root.innerHTML = error ? `<p role="alert">${escape(error)}</p>` : '<p class="hint">Caricamento…</p>'; return; }
    const d = data, a = d.answers, b = d.balance;
    const calls = d.calls.recent.filter(c => (!kind || c.kind === kind) && (!status || c.status === status));
    const totals = (k: string) => d.calls.totals.filter(t => t.kind === k);
    const share = b.real_share_published;
    root.innerHTML = `<nav class="stats-views" aria-label="Viste statistiche">${[["all","Panoramica"],["live","Adesso"],["games","Gioco"],["calls","Chiamate IA"],["balance","Catalogo"]].map(([key,label]) => `<button type="button" data-stats-view="${key}" aria-pressed="${view===key}">${label}</button>`).join("")}</nav><div class="stats-head library-inline"><label>Periodo<select data-stats-period>${[["7", "Ultimi 7 giorni"], ["30", "Ultimi 30 giorni"], ["all", "Da sempre"]]
        .map(([v, l]) => `<option value="${v}"${v === period ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      <button type="button" data-stats-refresh>Aggiorna</button><small class="hint">Aggiornato alle ${escape(new Date(d.generated_at).toLocaleTimeString("it-IT"))}</small></div>
    ${error ? `<p role="alert">${escape(error)}</p>` : ""}
    <section class="stats-block" aria-labelledby="stats-live"><h3 id="stats-live">Adesso</h3><div class="stat-tiles">
      ${tile(num(d.live.now), "partite in corso adesso", `una foto mostrata o una risposta negli ultimi ${d.live.window_minutes} minuti`)}
      ${tile(num(d.live.open), "partite aperte", "iniziate e non concluse, entro la durata massima delle Impostazioni")}
      ${(Object.keys(LABEL) as Level[]).map(l => tile(num(d.live.by_level[l] || 0), "adesso / " + LABEL[l])).join("")}</div></section>
    <section class="stats-block" aria-labelledby="stats-games"><h3 id="stats-games">Partite del periodo</h3>
      <div class="stats-table-wrap"><table class="stats-table"><thead><tr><th scope="col">Livello</th><th scope="col">Iniziate</th><th scope="col">Concluse</th>
        <th scope="col">Non concluse</th><th scope="col">Scadute prima dell'inizio</th><th scope="col">Punteggio medio</th></tr></thead><tbody>
        ${d.games.map(g => `<tr><th scope="row">${LABEL[g.level]}</th><td>${num(g.started)}</td><td>${num(g.completed)}</td><td>${num(g.unfinished)}</td><td>${num(g.invalidated)}</td>
          <td>${g.mean_score === null ? "—" : g.mean_score.toLocaleString("it-IT", { minimumFractionDigits: 1 })}</td></tr>`).join("")}</tbody></table></div>
      <div class="stat-tiles">${tile(num(a.photos), "foto giocate", `in ${num(a.concluded_games)} partite concluse`)}
        ${tile(pct(a.real.right, a.real.total), "REAL riconosciute", `${num(a.real.right)} su ${num(a.real.total)}`)}
        ${tile(pct(a.slop.right, a.slop.total), "SLOP riconosciute", `${num(a.slop.right)} su ${num(a.slop.total)}`)}
        ${tile(a.balanced_accuracy === null ? "—" : Math.round(a.balanced_accuracy * 100) + "%", "accuratezza bilanciata")}
        ${tile(num(a.timed_out), "foto scadute")}
        ${tile(num(d.leaderboard.entries), "voci in classifica", d.leaderboard.hidden ? `${num(d.leaderboard.hidden)} nascoste` : "")}</div></section>
    <section class="stats-block" aria-labelledby="stats-calls"><h3 id="stats-calls">Chiamate a pagamento</h3>
      <p class="hint">Il limite di spesa che conta è quello del progetto OpenAI (platform.openai.com). Un esito incerto potrebbe essere stato addebitato e non viene mai ripetuto.</p>
      <div class="stat-tiles">${Object.keys(KIND).map(k => { const t = totals(k), n = t.reduce((s, x) => s + x.n, 0), uncertain = t.filter(x => x.status === "uncertain").reduce((s, x) => s + x.n, 0);
        return tile(num(n), KIND[k], `token ${num(t.reduce((s, x) => s + x.input_tokens, 0))} in, ${num(t.reduce((s, x) => s + x.output_tokens, 0))} out${uncertain ? ` / <b class="stats-uncertain">${num(uncertain)} incerte</b>` : ""}`); }).join("")}</div>
      <div class="library-inline stats-filters"><label>Tipo<select data-stats-kind><option value="">Tutti</option>${Object.entries(KIND).map(([v, l]) => `<option value="${v}"${v === kind ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <label>Esito<select data-stats-status><option value="">Tutti</option>${Object.entries(STATUS).map(([v, l]) => `<option value="${v}"${v === status ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <div class="stats-table-wrap"><table class="stats-table stats-calls"><thead><tr><th scope="col">Data</th><th scope="col">Tipo</th><th scope="col">Modello</th>
        <th scope="col">Esito</th><th scope="col">Token in</th><th scope="col">Token out</th></tr></thead><tbody>
        ${calls.map(c => `<tr class="${c.status === "uncertain" ? "is-uncertain" : ""}"><td>${escape(new Date(c.created_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }))}</td>
          <td>${escape(KIND[c.kind] || c.kind)}</td><td>${escape(c.model)}</td><td>${escape(STATUS[c.status] || c.status)}</td><td>${c.input_tokens ?? "—"}</td><td>${c.output_tokens ?? "—"}</td></tr>`).join("")
          || '<tr><td colspan="6">Nessuna chiamata in questo periodo.</td></tr>'}</tbody></table></div>
      ${d.calls.recent.length === 200 ? '<p class="hint">Mostrate le ultime 200 chiamate del periodo.</p>' : ""}</section>
    <section class="stats-block" aria-labelledby="stats-balance"><h3 id="stats-balance">Equilibrio del catalogo</h3>
      <div class="stat-tiles">${tile(num(b.real.published), "REAL pubblicate", `${num(b.real.approved)} approvate`)}${tile(num(b.slop.published), "SLOP pubblicate", `${num(b.slop.approved)} approvate`)}
        ${tile(share === null ? "—" : Math.round(share * 100) + "%", "REAL tra le pubblicate")}</div>
      ${share === null ? "" : `<div class="share-bar" role="img" aria-label="REAL ${Math.round(share * 100)}%, SLOP ${100 - Math.round(share * 100)}% delle pubblicate; fascia consigliata 40–60%">
        <span class="share-real" style="width:${share * 100}%"></span><span class="share-slop" style="width:${(1 - share) * 100}%"></span><i class="share-band" aria-hidden="true"></i></div>
        <p class="share-legend"><span><i class="share-key share-real"></i>REAL</span><span><i class="share-key share-slop"></i>SLOP</span><span><i class="share-key share-band-key"></i>fascia 40–60%</span></p>`}
      ${b.warning ? '<p class="stats-warning" role="status">⚠ Le pubblicate escono dal rapporto 40–60% tra REAL e SLOP: avviso non bloccante.</p>' : ""}
      ${d.processes?.length ? `<p>Processi SLOP: ${d.processes.map(p => `${escape(p.state)} ${p.n} (${p.attempts} tentativi)`).join(" / ")}</p>` : ""}
      ${b.balance ? `<p class="stats-twins">Catalogo: <strong>${b.balance.real}</strong> REAL e <strong>${b.balance.slop}</strong> SLOP approvate o pubblicate; ${b.balance.pending} SLOP da decidere; ${b.balance.available} REAL madri disponibili.</p>` : ""}
      <ul class="stats-levels">${b.levels.map(l => `<li>${l.available ? "✓" : "✗"} ${escape(l.label)}: ${l.available ? "giocabile" : `servono almeno ${l.photos} REAL e ${l.photos} SLOP pubblicate`}</li>`).join("")}</ul></section>`;
    applyView();
  };
  const refresh = async () => {
    try { data = await load(period); error = ""; } catch (e) { error = e instanceof Error ? e.message : String(e); }
    render();
  };
  root.addEventListener("change", event => {
    const field = event.target as HTMLSelectElement;
    if (field.matches("[data-stats-period]")) { period = field.value; void refresh(); }
    else if (field.matches("[data-stats-kind]")) { kind = field.value; render(); }
    else if (field.matches("[data-stats-status]")) { status = field.value; render(); }
  });
  root.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-stats-view]");
    if (!button) return;
    view = button.dataset.statsView!;
    root.querySelectorAll<HTMLButtonElement>("[data-stats-view]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
    applyView();
  });
  root.addEventListener("click", event => { if ((event.target as HTMLElement).closest("[data-stats-refresh]")) void refresh(); });
  render();
  return { refresh };
}
export type { Stats };

