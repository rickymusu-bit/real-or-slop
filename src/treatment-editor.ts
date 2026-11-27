/** Owner-controlled treatment of a SLOP's game copy (owner requests of 2026-11-16): sliders that start on the treatment proposed from
 * the source REAL; the preview is made here, in the browser, with the same steps as the copy (treatment and intermediate JPEG). */
import "./treatment-editor.css";
import { frameLongSide, wholePhotoFrame } from "../shared/game-copy";
import { castFor, gap, measure, SETTING_LIMITS, type Metrics, type Settings } from "../shared/copy-treatment";
import { drawBase, frameCanvas, longOf, originalOf, proposalOf, treatedCanvas, treatmentPlan, type TreatableItem } from "./game-copy";
import { withPhotoProcessing } from "./photo-processing";

type Scalar = "contrast" | "saturation" | "blur" | "grain" | "grainSize" | "jpeg" | "long";
const SLIDERS: [Scalar | "cast0" | "cast1" | "cast2", string][] = [
  ["contrast", "Contrast"], ["saturation", "Saturation"], ["cast0", "Red"], ["cast1", "Green"], ["cast2", "Blue"],
  ["blur", "Blur (px)"], ["grain", "Grain"], ["grainSize", "Grain size"], ["jpeg", "Intermediate JPEG quality"], ["long", "Long edge (px)"],
];
const MONOCHROME: [Settings["monochrome"], string][] = [["", "Color"], ["black-and-white", "Black and white"], ["sepia", "Sepia"]];
const metricText = (m: Metrics) => `long edge ${m.long} px, noise ${m.noise.toFixed(1)}, sharpness ${m.sharpness.toFixed(1)}, contrast ${m.contrast}, saturation ${m.saturation.toFixed(2)}`;
const same = (a: Settings, b: Settings) => JSON.stringify(a) === JSON.stringify(b);
const decimals = (step: number) => step >= 1 ? 0 : String(step).split(".")[1]?.length || 0;
const safe = (text: string) => text.replace(/[<>&"]/g, "");

/** Opens the editor for a SLOP. Resolves with the settings to save (null: the proposal) or undefined if cancelled. */
export async function chooseTreatment(item: TreatableItem, title = ""): Promise<{ settings: Settings | null } | undefined> {
  const { plan, bitmap } = await withPhotoProcessing("Preparing treatment preview…", async () => {
    const plan = await treatmentPlan(item, { off: false });
    if (!plan) throw Error("This process has no photographic measurements: copy without treatment");
    return { plan, bitmap: await createImageBitmap(await originalOf(item.id), { imageOrientation: "from-image" }) };
  });
  const frame = item.copy?.crop || wholePhotoFrame(bitmap.width, bitmap.height), cropLong = frameLongSide(frame);
  // The proposal on the stored crop, at the long side proposed from the source REAL.
  const proposedPlan = { ...plan, settings: null }, proposedLong = longOf(frame, proposedPlan);
  const bases = new Map([[proposedLong, drawBase(bitmap, frame, proposedLong)]]);
  const proposed = proposalOf(bases.get(proposedLong)!.pixels, proposedPlan, proposedLong);
  let settings: Settings = structuredClone(plan.settings || proposed);
  const limits = { ...SETTING_LIMITS, long: { min: Math.min(SETTING_LIMITS.long.min, cropLong), max: Math.min(SETTING_LIMITS.long.max, cropLong), step: 1 } };
  const dialog = document.createElement("dialog");
  dialog.className = "treatment-dialog";
  dialog.setAttribute("aria-label", "Game copy treatment");
  const field = (key: string, label: string) => {
    const limit = key.startsWith("cast") ? limits.cast : limits[key as Scalar];
    return `<label class="treatment-slider" data-row="${key}"><span>${label}</span><input type="range" data-key="${key}" min="${limit.min}" max="${limit.max}" step="${limit.step}"><output data-out="${key}"></output></label>`;
  };
  dialog.innerHTML = `<h2>Photographic treatment</h2><p class="hint">${title ? `«${safe(title)}». ` : ""}Sliders start at the treatment suggested by the saved photographic measurements (${MONOCHROME.find(([v]) => v === plan.monochrome)![1].toLowerCase()}). The preview is calculated on this page and is not saved until you choose “Save treatment”.</p>
    <div class="treatment-views"><figure><canvas data-view="preview" aria-label="Treated copy preview"></canvas><figcaption data-caption="preview">Preview</figcaption></figure>
    <aside class="treatment-target"><h3>Photographic target</h3><p>${metricText(plan.sample.metrics)}</p><p>Measurements saved in the process, independent of the reference photo.</p></aside></div>
    <p class="hint" role="status" data-status></p>
    <div class="treatment-controls"><label class="treatment-slider"><span>Color</span><select data-key="monochrome">${MONOCHROME.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select><output></output></label>
    ${SLIDERS.map(([key, label]) => field(key, label)).join("")}</div>
    <div class="treatment-actions"><button type="button" data-treatment="proposal">Reset to suggestion</button><button type="button" data-treatment="cancel">Cancel</button>
    <button type="button" class="primary" data-treatment="ok">Save treatment</button></div>`;
  document.body.append(dialog);
  const status = dialog.querySelector<HTMLElement>("[data-status]")!, preview = dialog.querySelector<HTMLCanvasElement>('[data-view="preview"]')!;
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
    for (const [k, name] of [["0", "red"], ["1", "green"], ["2", "blue"]]) dialog.querySelector<HTMLElement>(`[data-row="cast${k}"] span`)!.textContent = (mono ? "Tint: " : "Color cast: ") + name;
  };
  let timer = 0, drawn = 0;
  const refresh = async () => {
    const turn = ++drawn;
    status.textContent = "Preparing preview…";
    await new Promise(resolve => requestAnimationFrame(resolve));  // the status is shown before the computation
    const long = Math.min(settings.long, cropLong);
    if (!bases.has(long)) bases.set(long, drawBase(bitmap, frame, long));
    const base = bases.get(long)!, treated = await treatedCanvas(base.pixels, { ...plan, settings });
    if (turn !== drawn) return;  // a newer change is on its way
    const canvas = frameCanvas(treated.canvas, base);
    preview.width = canvas.width; preview.height = canvas.height;
    const context = preview.getContext("2d")!;
    context.drawImage(canvas, 0, 0);
    const metrics = measure(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    caption.textContent = `Preview: ${metricText(metrics)}; difference from REAL ${Math.round(gap(metrics, plan.sample.metrics) * 100)}%`;
    status.textContent = same(settings, proposed) ? "Suggested treatment." : "Treatment changed, not saved yet.";
  };
  const later = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void refresh().catch(error => { status.textContent = String(error instanceof Error ? error.message : error); }), 200); };
  dialog.addEventListener("input", event => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement | HTMLSelectElement>("[data-key]");
    if (!input) return;
    const key = input.dataset.key!;
    if (key === "monochrome") { settings.monochrome = input.value as Settings["monochrome"]; settings.cast = castFor(settings.monochrome, proposed); }
    else if (key.startsWith("cast")) settings.cast[Number(key[4])] = Number(input.value);
    else settings[key as Scalar] = Number(input.value);
    show(); later();
  });
  try {
    dialog.showModal();
    show(); await refresh();
    return await new Promise<{ settings: Settings | null } | undefined>(resolve => {
      dialog.addEventListener("click", event => {
        const action = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-treatment]")?.dataset.treatment;
        if (action === "proposal") { settings = structuredClone(proposed); show(); later(); }
        else if (action === "cancel") resolve(undefined);
        else if (action === "ok") resolve({ settings: same(settings, proposed) ? null : settings });
      });
      dialog.addEventListener("cancel", () => resolve(undefined));
    });
  } finally {
    window.clearTimeout(timer); bitmap.close();
    dialog.close(); dialog.remove();
  }
}

