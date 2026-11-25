/** Dashboard «Statistiche» (spec `statistiche-impostazioni`, section 3): games now and open, games and answers of the
 * period, paid calls, balance of the catalogue with the formats of the published copies. Display only. */
import "./stats.css";
import { escape } from "../shared/html";

type Level = "facile" | "medio" | "difficile" | "esperto";
const LABEL: Record<Level, string> = { facile: "Easy", medio: "Medium", difficile: "Hard", esperto: "Expert" };
const KIND: Record<string, string> = { analysis: "REAL analysis and measurements", prompts: "SLOP proposals and prompts", images: "Images", evaluation: "SLOP evaluation" };
const STATUS: Record<string, string> = { completed: "succeeded", failed: "rejected, not charged", uncertain: "uncertain outcome", pending: "in progress" };
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
const num = (n: number) => n.toLocaleString("en-GB");
const tile = (value: string, label: string, note = "") => `<div class="stat-tile"><strong>${value}</strong><span>${label}</span>${note ? `<small>${note}</small>` : ""}</div>`;

export function mountStats(root: HTMLElement, load: (period: string) => Promise<Stats>) {
  let period = "30", kind = "", status = "", data: Stats | null = null, error = "", view = "all";
  const applyView = () => root.querySelectorAll<HTMLElement>(".stats-block").forEach(block => { block.hidden = view !== "all" && block.getAttribute("aria-labelledby") !== "stats-" + view; });
  const render = () => {
    if (!data) { root.innerHTML = error ? `<p role="alert">${escape(error)}</p>` : '<p class="hint">Loading…</p>'; return; }
    const d = data, a = d.answers, b = d.balance;
    const calls = d.calls.recent.filter(c => (!kind || c.kind === kind) && (!status || c.status === status));
    const totals = (k: string) => d.calls.totals.filter(t => t.kind === k);
    const share = b.real_share_published;
    root.innerHTML = `<nav class="stats-views" aria-label="Statistics views">${[["all","Overview"],["live","Now"],["games","Game"],["calls","AI calls"],["balance","Catalog"]].map(([key,label]) => `<button type="button" data-stats-view="${key}" aria-pressed="${view===key}">${label}</button>`).join("")}</nav><div class="stats-head library-inline"><label>Period<select data-stats-period>${[["7", "Last 7 days"], ["30", "Last 30 days"], ["all", "All time"]]
        .map(([v, l]) => `<option value="${v}"${v === period ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      <button type="button" data-stats-refresh>Refresh</button><small class="hint">Updated at ${escape(new Date(d.generated_at).toLocaleTimeString("en-GB"))}</small></div>
    ${error ? `<p role="alert">${escape(error)}</p>` : ""}
    <section class="stats-block" aria-labelledby="stats-live"><h3 id="stats-live">Now</h3><div class="stat-tiles">
      ${tile(num(d.live.now), "games active now", `a photo shown or an answer in the last ${d.live.window_minutes} minutes`)}
      ${tile(num(d.live.open), "open games", "started and unfinished, within the Settings time limit")}
      ${(Object.keys(LABEL) as Level[]).map(l => tile(num(d.live.by_level[l] || 0), "now / " + LABEL[l])).join("")}</div></section>
    <section class="stats-block" aria-labelledby="stats-games"><h3 id="stats-games">Games in this period</h3>
      <div class="stats-table-wrap"><table class="stats-table"><thead><tr><th scope="col">Level</th><th scope="col">Started</th><th scope="col">Completed</th>
        <th scope="col">Unfinished</th><th scope="col">Expired before starting</th><th scope="col">Average score</th></tr></thead><tbody>
        ${d.games.map(g => `<tr><th scope="row">${LABEL[g.level]}</th><td>${num(g.started)}</td><td>${num(g.completed)}</td><td>${num(g.unfinished)}</td><td>${num(g.invalidated)}</td>
          <td>${g.mean_score === null ? "—" : g.mean_score.toLocaleString("en-GB", { minimumFractionDigits: 1 })}</td></tr>`).join("")}</tbody></table></div>
      <div class="stat-tiles">${tile(num(a.photos), "photos played", `in ${num(a.concluded_games)} completed games`)}
        ${tile(pct(a.real.right, a.real.total), "REAL correctly identified", `${num(a.real.right)} of ${num(a.real.total)}`)}
        ${tile(pct(a.slop.right, a.slop.total), "SLOP correctly identified", `${num(a.slop.right)} of ${num(a.slop.total)}`)}
        ${tile(a.balanced_accuracy === null ? "—" : Math.round(a.balanced_accuracy * 100) + "%", "balanced accuracy")}
        ${tile(num(a.timed_out), "timed-out photos")}
        ${tile(num(d.leaderboard.entries), "leaderboard entries", d.leaderboard.hidden ? `${num(d.leaderboard.hidden)} hidden` : "")}</div></section>
    <section class="stats-block" aria-labelledby="stats-calls"><h3 id="stats-calls">Paid calls</h3>
      <p class="hint">The OpenAI project spending limit applies (platform.openai.com). An uncertain call may have been charged and is never repeated automatically.</p>
      <div class="stat-tiles">${Object.keys(KIND).map(k => { const t = totals(k), n = t.reduce((s, x) => s + x.n, 0), uncertain = t.filter(x => x.status === "uncertain").reduce((s, x) => s + x.n, 0);
        return tile(num(n), KIND[k], `token ${num(t.reduce((s, x) => s + x.input_tokens, 0))} in, ${num(t.reduce((s, x) => s + x.output_tokens, 0))} out${uncertain ? ` / <b class="stats-uncertain">${num(uncertain)} uncertain</b>` : ""}`); }).join("")}</div>
      <div class="library-inline stats-filters"><label>Type<select data-stats-kind><option value="">All</option>${Object.entries(KIND).map(([v, l]) => `<option value="${v}"${v === kind ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <label>Outcome<select data-stats-status><option value="">All</option>${Object.entries(STATUS).map(([v, l]) => `<option value="${v}"${v === status ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <div class="stats-table-wrap"><table class="stats-table stats-calls"><thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Model</th>
        <th scope="col">Outcome</th><th scope="col">Input tokens</th><th scope="col">Output tokens</th></tr></thead><tbody>
        ${calls.map(c => `<tr class="${c.status === "uncertain" ? "is-uncertain" : ""}"><td>${escape(new Date(c.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }))}</td>
          <td>${escape(KIND[c.kind] || c.kind)}</td><td>${escape(c.model)}</td><td>${escape(STATUS[c.status] || c.status)}</td><td>${c.input_tokens ?? "—"}</td><td>${c.output_tokens ?? "—"}</td></tr>`).join("")
          || '<tr><td colspan="6">No calls in this period.</td></tr>'}</tbody></table></div>
      ${d.calls.recent.length === 200 ? '<p class="hint">Showing the latest 200 calls in this period.</p>' : ""}</section>
    <section class="stats-block" aria-labelledby="stats-balance"><h3 id="stats-balance">Catalog balance</h3>
      <div class="stat-tiles">${tile(num(b.real.published), "Published REAL", `${num(b.real.approved)} approvate`)}${tile(num(b.slop.published), "Published SLOP", `${num(b.slop.approved)} approvate`)}
        ${tile(share === null ? "—" : Math.round(share * 100) + "%", "REAL share of published images")}</div>
      ${share === null ? "" : `<div class="share-bar" role="img" aria-label="REAL ${Math.round(share * 100)}%, SLOP ${100 - Math.round(share * 100)}% of published images; recommended range 40–60%">
        <span class="share-real" style="width:${share * 100}%"></span><span class="share-slop" style="width:${(1 - share) * 100}%"></span><i class="share-band" aria-hidden="true"></i></div>
        <p class="share-legend"><span><i class="share-key share-real"></i>REAL</span><span><i class="share-key share-slop"></i>SLOP</span><span><i class="share-key share-band-key"></i>40–60% range</span></p>`}
      ${b.warning ? '<p class="stats-warning" role="status">⚠ Published images fall outside the 40–60% REAL/SLOP range: advisory only.</p>' : ""}
      ${d.processes?.length ? `<p>SLOP processes: ${d.processes.map(p => `${escape(p.state)} ${p.n} (${p.attempts} attempts)`).join(" / ")}</p>` : ""}
      ${b.balance ? `<p class="stats-twins">Catalog: <strong>${b.balance.real}</strong> REAL and <strong>${b.balance.slop}</strong> approved or published SLOP; ${b.balance.pending} SLOP awaiting a decision; ${b.balance.available} REAL references available.</p>` : ""}
      <ul class="stats-levels">${b.levels.map(l => `<li>${l.available ? "✓" : "✗"} ${escape(LABEL[l.id])}: ${l.available ? "playable" : `at least ${l.photos} REAL and ${l.photos} Published SLOP`}</li>`).join("")}</ul></section>`;
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

