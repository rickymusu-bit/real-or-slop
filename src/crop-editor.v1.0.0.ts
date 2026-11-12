/** Frame of the 4:5 game copy, chosen by the owner on the original (docs/copie-di-gioco.v3.0.0.md, section 2).
 * v1.0.0, 2026-11-12T08:00:00Z. A dialog shows the oriented original with a 4:5 frame: drag it (mouse, finger) or move it
 * with the arrow keys, resize it with the slider; outside the frame the picture is dimmed. Returns the frame in pixels of
 * the oriented original, or null if the owner cancels. */
import "./crop-editor.v1.0.0.css";
import { centredCrop, cropError, cropWidth, GAME_COPY, type Crop } from "../shared/game-copy.v2.0.0";
import { originalOf } from "./game-copy.v2.0.0";

export async function chooseCrop(imageId: string, width: number, height: number, current: Crop | null, title = ""): Promise<Crop | null> {
  const url = URL.createObjectURL(await originalOf(imageId));
  const largest = centredCrop(width, height);
  const smallest = Math.min(GAME_COPY.minHeight, largest.height);
  let crop: Crop = current && !cropError(width, height, current) ? { ...current } : { ...largest };
  const dialog = document.createElement("dialog");
  dialog.className = "crop-dialog";
  dialog.setAttribute("aria-label", "Inquadratura della copia di gioco");
  dialog.innerHTML = `<h2>Inquadratura 4:5</h2><p class="hint">${title ? `«${title.replace(/[<>&"]/g, "")}». ` : ""}Trascina il riquadro, oppure usa le frecce;
    il cursore ne cambia la dimensione. Il giocatore vedrà solo ciò che sta dentro il riquadro.</p>
    <div class="crop-stage"><img alt="" draggable="false"><div class="crop-frame" tabindex="0" role="slider" aria-label="Posizione del riquadro, frecce per spostarlo"></div></div>
    <label class="crop-size">Dimensione<input type="range" min="${smallest}" max="${largest.height}" step="1"></label>
    <div class="crop-actions"><button type="button" data-crop="centre">Centra</button><button type="button" data-crop="cancel">Annulla</button>
    <button type="button" class="primary" data-crop="ok">Usa questa inquadratura</button></div>`;
  document.body.append(dialog);
  const img = dialog.querySelector("img")!, frame = dialog.querySelector<HTMLElement>(".crop-frame")!;
  const size = dialog.querySelector<HTMLInputElement>("input[type=range]")!;
  const clamp = (c: Crop): Crop => {
    const h = Math.max(smallest, Math.min(largest.height, Math.round(c.height))), w = cropWidth(h);
    return { height: h, x: Math.max(0, Math.min(width - w, Math.round(c.x))), y: Math.max(0, Math.min(height - h, Math.round(c.y))) };
  };
  const draw = () => {
    crop = clamp(crop);
    frame.style.left = (crop.x / width * 100) + "%"; frame.style.top = (crop.y / height * 100) + "%";
    frame.style.width = (cropWidth(crop.height) / width * 100) + "%"; frame.style.height = (crop.height / height * 100) + "%";
    size.value = String(crop.height);
    frame.setAttribute("aria-valuetext", `x ${crop.x}, y ${crop.y}, altezza ${crop.height} px`);
  };
  const scale = () => img.getBoundingClientRect().width / width || 1;
  let drag: { x: number; y: number; crop: Crop } | null = null;
  frame.addEventListener("pointerdown", event => {
    drag = { x: event.clientX, y: event.clientY, crop: { ...crop } };
    frame.setPointerCapture(event.pointerId); event.preventDefault();
  });
  frame.addEventListener("pointermove", event => {
    if (!drag) return;
    const s = scale();
    crop = { ...drag.crop, x: drag.crop.x + (event.clientX - drag.x) / s, y: drag.crop.y + (event.clientY - drag.y) / s };
    draw();
  });
  frame.addEventListener("pointerup", () => { drag = null; });
  frame.addEventListener("keydown", event => {
    const step = Math.max(1, Math.round(crop.height / 50)) * (event.shiftKey ? 5 : 1);
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault(); crop = { ...crop, x: crop.x + move[0], y: crop.y + move[1] }; draw();
  });
  size.addEventListener("input", () => {
    // Resize around the centre of the frame.
    const h = Number(size.value), cx = crop.x + cropWidth(crop.height) / 2, cy = crop.y + crop.height / 2;
    crop = { height: h, x: cx - cropWidth(h) / 2, y: cy - h / 2 }; draw();
  });
  try {
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(Error("Originale non leggibile")); img.src = url; });
    dialog.showModal();
    // The picture fills the space available, enlarged if small, with its proportions.
    const room = dialog.querySelector<HTMLElement>(".crop-stage")!.parentElement!.clientWidth, fit = Math.min(room / width, window.innerHeight * 0.6 / height);
    img.style.width = Math.floor(width * fit) + "px"; img.style.height = Math.floor(height * fit) + "px";
    draw();
    frame.focus();
    return await new Promise<Crop | null>(resolve => {
      dialog.addEventListener("click", event => {
        const action = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-crop]")?.dataset.crop;
        if (action === "centre") { crop = { ...largest }; draw(); }
        else if (action === "cancel") resolve(null);
        else if (action === "ok") resolve(clamp(crop));
      });
      dialog.addEventListener("cancel", () => resolve(null));
    });
  } finally {
    dialog.close(); dialog.remove(); URL.revokeObjectURL(url);
  }
}
