/** Statistics, «Distribuzione delle immagini» (spec `database-immagini`, section 5): REAL and SLOP, published and approved stacked,
 * with the spread and a tooltip. The distribution per tag went with the tags (owner decision of 2026-11-20). */
import "./database.css";
import { escape } from "../shared/html";

export interface Distribution { totals: { REAL: { approved: number; published: number }; SLOP: { approved: number; published: number } } }
const signed = (n: number) => (n > 0 ? "+" : "") + n;
const pct = (part: number, whole: number) => whole ? Math.round(part / whole * 100) + "%" : "—";

/** A stacked bar: published from the zero line, approved after it, a 2px gap between. Width in % of the half track. */
function stack(published: number, approved: number, max: number, side: "real" | "slop") {
  const seg = (n: number, state: string) => n ? `<span class="dist-seg dist-${side} dist-${state}" style="width:${(n / max * 100).toFixed(2)}%"></span>` : "";
  // On the SLOP side the bar grows leftwards: published stays next to the zero line.
  return side === "real" ? seg(published, "published") + seg(approved, "approved") : seg(approved, "approved") + seg(published, "published");
}

export function mountDistribution(root: HTMLElement, load: () => Promise<Distribution>) {
  let data: Distribution | null = null, error = "";
  const legend = () => '<p class="dist-legend" aria-label="Legend">' +
    '<span><i class="dist-key dist-real dist-published"></i>Published REAL</span><span><i class="dist-key dist-real dist-approved"></i>Approved REAL</span>' +
    '<span><i class="dist-key dist-slop dist-published"></i>Published SLOP</span><span><i class="dist-key dist-slop dist-approved"></i>Approved SLOP</span></p>';
  const overview = () => {
    if (!data) return "";
    const r = data.totals.REAL, s = data.totals.SLOP, real = r.approved + r.published, slop = s.approved + s.published, all = real + slop;
    const max = Math.max(1, real, slop), spread = real - slop;
    const text = `All images: REAL ${real} (published ${r.published}, approved ${r.approved}), SLOP ${slop} (published ${s.published}, approved ${s.approved}), spread ${signed(spread)}`;
    const published = r.published + s.published;
    return '<section class="dist-overview" aria-label="REAL and SLOP distribution">' +
      `<p class="dist-figures"><span><strong>${real}</strong> REAL <small>${pct(real, all)}</small></span><span><strong>${slop}</strong> SLOP <small>${pct(slop, all)}</small></span>` +
      `<span><strong>${signed(spread)}</strong> spread</span><span><strong>${published}</strong> published, REAL ${pct(r.published, published)}</span></p>` +
      '<div class="dist-axis" aria-hidden="true"><span></span><span class="dist-track"><span>← SLOP</span><span>REAL →</span></span><span>spread</span></div>' +
      `<div class="dist-row dist-total" role="img" aria-label="${escape(text)}" data-tip="${escape(text)}" tabindex="0"><span class="dist-label">All</span>` +
      `<span class="dist-track"><span class="dist-half dist-left">${stack(s.published, s.approved, max, "slop")}</span>` +
      `<span class="dist-half dist-right">${stack(r.published, r.approved, max, "real")}</span></span><span class="dist-value">${signed(spread)}</span></div>` +
      (published && (r.published / published < 0.4 || r.published / published > 0.6)
        ? '<p class="hint">Published images fall outside the 40–60% REAL/SLOP range (advisory only).</p>' : "") + "</section>";
  };
  const render = () => {
    root.innerHTML = '<p class="hint">Approved and published images. REAL on the right, SLOP on the left; solid bars show published images, ' +
      "hatched bars show approved images. Spread is REAL minus SLOP, counting approved and published images: positive values indicate missing SLOP.</p>" +
      (error ? `<p class="slop-closed" role="alert">${escape(error)}</p>` : "") + overview() + legend() + '<div class="dist-tip" role="tooltip" hidden></div>';
  };
  const refresh = async () => {
    try { data = await load(); error = ""; } catch (e) { error = e instanceof Error ? e.message : String(e); }
    render();
  };
  // Tooltip on hover and focus: the four counts and the spread.
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
