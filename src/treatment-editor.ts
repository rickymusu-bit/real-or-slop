/** Owner-controlled treatment of a SLOP's game copy (owner request of 2026-11-16): sliders start on the treatment proposed from the
 * source REAL; every change asks the Worker for a preview (made on Cloudflare, not saved). The browser only shows and chooses. */
import "./treatment-editor.css";
import type { Metrics, Settings } from "../shared/copy-treatment";

const API = "/api/admin/library/";
type Limit = { min: number; max: number; step: number };
interface Proposal {
  id: string; proposed: Settings; current: Settings; off: boolean; manual: boolean; medium: string; color: string;
  limits: Record<"contrast" | "saturation" | "cast" | "blur" | "grain" | "grainSize" | "jpeg" | "long", Limit>;
  sample: { id: string; metrics: Metrics };
}
type Scalar = "contrast" | "saturation" | "blur" | "grain" | "grainSize" | "jpeg" | "long";
const SLIDERS: [Scalar | "cast0" | "cast1" | "cast2", string][] = [
  ["contrast", "Contrasto"], ["saturation", "Saturazione"], ["cast0", "Rosso"], ["cast1", "Verde"], ["cast2", "Blu"],
  ["blur", "Sfocatura (px)"], ["grain", "Grana"], ["grainSize", "Dimensione della grana"], ["jpeg", "Qualità JPEG intermedio"], ["long", "Lato lungo (px)"],
];
const MONOCHROME: [Settings["monochrome"], string][] = [["", "A colori"], ["black-and-white", "Bianco e nero"], ["sepia", "Seppia"]];

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API + path, { credentials: "same-origin", cache: "no-store", ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw Error(data.error || "Richiesta non riuscita");
  return data;
}
const metricText = (m: Metrics) => `lato ${m.long} px, rumore ${m.noise.toFixed(1)}, nitidezza ${m.sharpness.toFixed(1)}, contrasto ${m.contrast}, saturazione ${m.saturation.toFixed(2)}`;
const same = (a: Settings, b: Settings) => JSON.stringify(a) === JSON.stringify(b);
const decimals = (step: number) => step >= 1 ? 0 : String(step).split(".")[1]?.length || 0;

/** Opens the editor for SLOP `imageId`. Resolves with the settings to save (null: the proposal) or undefined if cancelled. */
export async function chooseTreatment(imageId: string, title = ""): Promise<{ settings: Settings | null } | undefined> {
  if (!/^[\w-]{1,64}$/.test(imageId)) throw Error("Immagine non valida");
  const proposal = await call<Proposal>(encodeURIComponent(imageId) + "/treatment");
  let settings: Settings = structuredClone(proposal.current);
  const dialog = document.createElement("dialog");
  dialog.className = "treatment-dialog";
  dialog.setAttribute("aria-label", "Trattamento della copia di gioco");
  const safe = (text: string) => text.replace(/[<>&"]/g, "");
  const field = (key: string, label: string) => {
    const limit = key.startsWith("cast") ? proposal.limits.cast : proposal.limits[key as Scalar];
    return `<label class="treatment-slider" data-row="${key}"><span>${label}</span><input type="range" data-key="${key}" min="${limit.min}" max="${limit.max}" step="${limit.step}"><output data-out="${key}"></output></label>`;
  };
  dialog.innerHTML = `<h2>Trattamento</h2><p class="hint">${title ? `«${safe(title)}». ` : ""}I cursori partono dal trattamento proposto in base alla REAL di riferimento (${safe(proposal.medium || "supporto non indicato")}, ${safe(proposal.color || "colore non indicato")}). Ogni modifica chiede al server un'anteprima, che non viene salvata.</p>
    <div class="treatment-views"><figure><img data-view="preview" alt="Anteprima della copia trattata"><figcaption data-caption="preview">Anteprima</figcaption></figure>
    <figure><img data-view="sample" alt="Copia di gioco della REAL di riferimento" src="${API}${encodeURIComponent(proposal.sample.id)}/file"><figcaption>REAL di riferimento: ${metricText(proposal.sample.metrics)}</figcaption></figure></div>
    <p class="hint" role="status" data-status></p>
    <div class="treatment-controls"><label class="treatment-slider"><span>Colore</span><select data-key="monochrome">${MONOCHROME.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select><output></output></label>
    ${SLIDERS.map(([key, label]) => field(key, label)).join("")}</div>
    <div class="treatment-actions"><button type="button" data-treatment="proposal">Torna alla proposta</button><button type="button" data-treatment="cancel">Annulla</button>
    <button type="button" class="primary" data-treatment="ok">Salva il trattamento</button></div>`;
  document.body.append(dialog);
  const status = dialog.querySelector<HTMLElement>("[data-status]")!, preview = dialog.querySelector<HTMLImageElement>('[data-view="preview"]')!;
  const caption = dialog.querySelector<HTMLElement>('[data-caption="preview"]')!;
  const inputs = [...dialog.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-key]")];
  const show = () => {
    const mono = settings.monochrome !== "";
    for (const input of inputs) {
      const key = input.dataset.key!;
      const value = key === "monochrome" ? settings.monochrome : key.startsWith("cast") ? settings.cast[Number(key[4])] : settings[key as Scalar];
      input.value = String(value);
      const out = dialog.querySelector<HTMLOutputElement>(`[data-out="${key}"]`);
      if (out && input instanceof HTMLInputElement) out.value = Number(value).toFixed(decimals(Number(input.step))).replace(/^-(0(?:\.0+)?)$/, "$1");
    }
    // In a monochrome copy the three colour sliders are its tint and saturation has no effect.
    dialog.querySelector<HTMLElement>('[data-row="saturation"]')!.hidden = mono;
    for (const [k, name] of [["0", "Rosso"], ["1", "Verde"], ["2", "Blu"]]) dialog.querySelector<HTMLElement>(`[data-row="cast${k}"] span`)!.textContent = (mono ? "Tinta: " : "Dominante: ") + name.toLowerCase();
  };
  let url = "", controller: AbortController | null = null, timer = 0;
  const refresh = async () => {
    controller?.abort(); controller = new AbortController();
    status.textContent = "Il server prepara l'anteprima…";
    try {
      const response = await fetch(API + encodeURIComponent(imageId) + "/treatment/preview", { method: "POST", credentials: "same-origin", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings }) });
      if (!response.ok) throw Error(((await response.json().catch(() => ({}))) as { error?: string }).error || "Anteprima non disponibile");
      const blob = await response.blob(), metrics = JSON.parse(response.headers.get("X-Copy-Metrics") || "null") as Metrics | null;
      const gap = Number(response.headers.get("X-Copy-Gap"));
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob); preview.src = url;
      caption.textContent = "Anteprima" + (metrics ? `: ${metricText(metrics)}` : "") + (Number.isFinite(gap) && response.headers.get("X-Copy-Gap") ? `; scarto dalla REAL ${Math.round(gap * 100)}%` : "");
      status.textContent = same(settings, proposal.proposed) ? "Trattamento proposto." : "Trattamento modificato, non ancora salvato.";
    } catch (error) {
      if ((error as Error).name !== "AbortError") status.textContent = String(error instanceof Error ? error.message : error);
    }
  };
  const later = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void refresh(), 450); };
  dialog.addEventListener("input", event => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement | HTMLSelectElement>("[data-key]");
    if (!input) return;
    const key = input.dataset.key!;
    if (key === "monochrome") settings.monochrome = input.value as Settings["monochrome"];
    else if (key.startsWith("cast")) settings.cast[Number(key[4])] = Number(input.value);
    else settings[key as Scalar] = Number(input.value);
    show(); later();
  });
  try {
    dialog.showModal();
    show(); void refresh();
    return await new Promise<{ settings: Settings | null } | undefined>(resolve => {
      dialog.addEventListener("click", event => {
        const action = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-treatment]")?.dataset.treatment;
        if (action === "proposal") { settings = structuredClone(proposal.proposed); show(); later(); }
        else if (action === "cancel") resolve(undefined);
        else if (action === "ok") resolve({ settings: same(settings, proposal.proposed) ? null : settings });
      });
      dialog.addEventListener("cancel", () => resolve(undefined));
    });
  } finally {
    window.clearTimeout(timer); (controller as AbortController | null)?.abort();
    dialog.close(); dialog.remove(); if (url) URL.revokeObjectURL(url);
  }
}
