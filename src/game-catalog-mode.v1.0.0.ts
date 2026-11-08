import { api, content } from "./main";
interface ModeState {
  mode: "demo" | "production";
  revision: number;
  updatedAt: string;
  published: { REAL: number; AI: number };
  canActivateProduction: boolean;
}
export async function mountGameCatalogMode() {
  const section = document.createElement("section");
  section.className = "page narrow game-catalog-mode";
  section.innerHTML = `<div class="eyebrow">PARTITE</div><h2>Catalogo delle partite</h2>
    <p>Questa scelta riguarda soltanto le nuove partite. Quelle già iniziate conservano le immagini assegnate.</p>
    <form id="game-catalog-form"><fieldset><legend>Modalità attiva</legend>
      <label><input type="radio" name="catalog-mode" value="demo"> <span><strong>Demo</strong><small> Illustrazioni dimostrative con etichette simulate</small></span></label>
      <label><input type="radio" name="catalog-mode" value="production"> <span><strong>Produzione</strong><small> Immagini REAL e SLOP pubblicate</small></span></label>
    </fieldset><p id="game-catalog-counts"></p><button type="submit" class="primary" disabled>Salva modalità</button>
    <button type="button" id="game-catalog-refresh">Aggiorna disponibilità</button>
    <p id="game-catalog-message" role="status" aria-live="polite">Caricamento…</p></form>`;
  content().prepend(section);
  const form = section.querySelector<HTMLFormElement>("#game-catalog-form")!;
  const message = section.querySelector<HTMLElement>("#game-catalog-message")!;
  const counts = section.querySelector<HTMLElement>("#game-catalog-counts")!;
  const save = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
  const radios = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="catalog-mode"]'));
  let snapshot: ModeState | null = null, busy = false;
  function selection() { return radios.find(r => r.checked)?.value || "demo"; }
  function sync() {
    const selected = selection();
    save.disabled = busy || !snapshot || selected === snapshot.mode ||
      (selected === "production" && !snapshot.canActivateProduction);
    radios.forEach(r => { r.disabled = busy; });
  }
  async function load() {
    busy = true; sync();
    try {
      snapshot = await api<ModeState>("/admin/game-catalog-mode");
      radios.forEach(r => { r.checked = r.value === snapshot?.mode; });
      counts.textContent = `Pubblicate: ${snapshot.published.REAL} REAL e ${snapshot.published.AI} SLOP. ${snapshot.canActivateProduction ? "Produzione attivabile." : "Per attivare la produzione servono almeno una REAL e una SLOP pubblicate e lo storage R2."}`;
      message.textContent = snapshot.mode === "demo" ? "Modalità attiva: Demo." : "Modalità attiva: Produzione.";
    } catch (error) {
      message.textContent = "Impossibile leggere la modalità: " + String(error);
    } finally { busy = false; sync(); }
  }
  form.addEventListener("change", sync);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!snapshot || busy) return;
    const mode = selection();
    if (mode === snapshot.mode || (mode === "production" && !snapshot.canActivateProduction)) return;
    const label = mode === "demo" ? "Demo" : "Produzione";
    if (!window.confirm(`Attivare ${label} per le nuove partite? Le partite già iniziate restano invariate.`)) return;
    busy = true; sync(); message.textContent = "Salvataggio in corso…";
    try {
      snapshot = await api<ModeState>("/admin/game-catalog-mode", {
        method:"POST",body:JSON.stringify({mode,revision:snapshot.revision,confirm:true}),
      });
      message.textContent = `Modalità salvata: ${label}. Le nuove partite usano il catalogo selezionato.`;
    } catch (error) {
      message.textContent = "Modifica non applicata: " + String(error);
      await load();
      return;
    } finally { busy = false; sync(); }
  });
  section.querySelector<HTMLButtonElement>("#game-catalog-refresh")!.addEventListener("click", () => void load());
  await load();
}
