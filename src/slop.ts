import { editorialPanel, setupEditorial } from "./editorial";
import { slopChoices, slopTextLimits, type SlopPlan, type SlopRecord } from "../shared/slop";
import { api, content, escape } from "./main";
type Field = keyof typeof slopChoices | keyof typeof slopTextLimits;
interface Category { id: string; name: string; parent_id: string | null }
const labels: Record<Field, string> = {
  title: "Titolo privato", category_id: "Categoria", subcategory_id: "Sottocategoria",
  country: "Paese rappresentato", place: "Luogo rappresentato", period: "Anno o periodo rappresentato", country_or_region: "Regione", period_bucket: "Fascia storica",
  subject: "Soggetto", subject_kind: "Tipologia", image_medium: "Medium", composition: "Composizione", cognitive_mechanism: "Meccanismo cognitivo",
  scene_description: "Descrizione della scena", fictional_claim: "Che cosa è sintetico o inventato", single_clue: "Indizio o ipotesi investigabile",
  period_accurate_details: "Dettagli storici/materiali da rispettare", technical_treatment: "Risoluzione, compressione e trattamento comparabili alle REAL",
  ai_model: "Modello usato esternamente", generation_owner: "Autore / proprietario della generazione", generation_source_url: "URL pubblico del servizio o della generazione (HTTPS, senza credenziali)",
  generation_date: "Data della generazione effettiva", generation_version: "Versione o identificativo della generazione esterna",
  prompt: "Prompt integrale effettivamente utilizzato (modificabile)", reveal_explanation: "Proposta di spiegazione post-risposta (modificabile)", evaluation_notes: "Risultati e valutazioni delle iterazioni",
  license_name: "Nome della licenza dichiarata", license_url: "URL della licenza (da verificare in moderazione)",
};
function field(key: Field) {
  if (key === "category_id" || key === "subcategory_id") return `<label>${labels[key]}<select data-plan="${key}"><option value="">Da scegliere</option></select></label>`;
  const choices = (slopChoices as Record<string, readonly string[]>)[key];
  if (choices) return `<label>${labels[key]}<select data-plan="${key}"><option value="">Da scegliere</option>${choices.map((choice) => `<option value="${choice}">${choice.replaceAll("_", " ")}</option>`).join("")}</select></label>`;
  const max = (slopTextLimits as Record<string, number>)[key];
  const isUrl = key.endsWith("_url");
  const control = max > 500 && !isUrl ? `<textarea data-plan="${key}" rows="${key === "prompt" ? 10 : 4}" maxlength="${max}"></textarea>` :
    `<input data-plan="${key}" type="${isUrl ? "url" : key === "generation_date" ? "date" : "text"}" maxlength="${max}" ${key === "title" ? "required" : ""}>`;
  return `<label>${labels[key]}${control}</label>`;
}
function factRow(fact = { fact: "", source_title: "", reference_url: "" }) {
  return `<fieldset class="fact-row"><legend>Fatto di contesto e riferimento</legend><label>Fatto verificabile<textarea data-fact="fact" rows="2" maxlength="500">${escape(fact.fact)}</textarea></label><label>Fonte / istituzione<input data-fact="source_title" maxlength="200" value="${escape(fact.source_title)}"></label><label>URL della scheda di riferimento<input data-fact="reference_url" type="url" maxlength="1000" value="${escape(fact.reference_url)}"></label><button type="button" data-remove-fact>Rimuovi fatto</button></fieldset>`;
}
const fields = [...Object.keys(slopTextLimits), ...Object.keys(slopChoices)] as Field[];
function fingerprint(plan: SlopPlan) {
  return JSON.stringify([fields.map((key) => plan[key]), plan.iteration, plan.owner_declaration,
    plan.documented_facts.map((fact) => [fact.fact, fact.source_title, fact.reference_url])]);
}
export async function showSlopStudio() {
  const page = content();
  page.innerHTML = `<section class="page studio"><nav aria-label="Amministrazione"><a href="/admin">← Coda di revisione</a></nav><div class="eyebrow">STUDIO PRIVATO · ARCHIVIO EDITORIALE</div><h1>Studio SLOP.</h1><p>Tutte le immagini da valutare, compresi gli scarti e i test recenti, sono nella <a href="/admin">coda unica di revisione</a>. Questo archivio conserva lo storico delle fotografie e delle generazioni. Ogni SLOP è affiancata alla fotografia che ha dato origine al prompt.</p><p>La fotografia fornisce un’idea. Il generatore sviluppa una scena autonoma, con libertà di composizione, luce e resa dei dettagli.</p>${editorialPanel()}<details class="manual-studio"><summary>Crea o modifica una scheda manuale</summary><label>Schede recenti<select id="slop-list"><option value="">Nessuna scheda selezionata</option></select></label><div class="studio-actions"><button id="slop-load">Carica scheda</button><button id="slop-new">Nuova scheda</button><button id="slop-copy">Nuova iterazione da questa scheda</button></div><p id="slop-state" role="status"></p><form class="curation" id="slop-form"><div id="slop-editor"><fieldset><legend>Concept e classificazione privata</legend>${(["title", "category_id", "subcategory_id", "country", "place", "period", "country_or_region", "period_bucket", "subject", "subject_kind", "image_medium", "composition", "cognitive_mechanism", "scene_description", "fictional_claim", "single_clue", "period_accurate_details", "technical_treatment"] as Field[]).map(field).join("")}</fieldset><details open><summary>Fatti documentati: distinguere il contesto dalla scena inventata</summary><p>Inserisci solo fatti controllabili e riferimenti reali. Un archivio documenta il contesto, non una fotografia generata. Massimo sei riferimenti.</p><div id="slop-facts">${factRow()}</div><button type="button" id="slop-add-fact">Aggiungi fatto</button></details><fieldset><legend>Generazione esterna e prompt</legend>${(["ai_model", "generation_owner", "generation_source_url", "generation_date", "generation_version"] as Field[]).map(field).join("")}<label>Iterazione<input id="slop-iteration" type="number" min="1" max="1000" value="1"></label><button type="button" id="slop-preview">Costruisci proposte di prompt e spiegazione</button><p>Il pulsante sostituisce i due testi con proposte basate sul concept. Verificale e adattale prima di usarle. Dopo una modifica al concept, ricostruisci o aggiorna anche i testi.</p>${field("prompt")}${field("reveal_explanation")}${field("evaluation_notes")}${field("license_name")}${field("license_url")}<label><input id="slop-owner" type="checkbox"> Dichiaro che il risultato è generato con IA e che posso presentarlo alla revisione</label></fieldset></div><label>Motivazione del salvataggio o invio<textarea id="slop-reason" maxlength="2000" rows="2"></textarea></label><div class="studio-actions"><button type="button" id="slop-save">Salva scheda privata</button><button type="button" id="slop-history">Mostra cronologia</button></div><pre id="slop-events" class="curation-history" hidden></pre><fieldset><legend>Invio manuale alla revisione</legend><p>Salva prima il prompt effettivo, i dati della generazione e le valutazioni. Dopo l’invio la provenienza della scheda resta congelata; per un altro tentativo crea una nuova iterazione.</p><label>File generato esternamente<input id="slop-file" type="file" accept="image/jpeg,image/png,image/webp"></label><label>dHash offline del file caricato (facoltativo)<input id="slop-phash" maxlength="16" placeholder="16 caratteri esadecimali"></label>${[
    ["facts_confirmed", "Ho verificato i fatti e le cronologie nelle fonti indicate"],
    ["rights_confirmed", "Ho controllato i diritti del materiale usato e delle persone rappresentate"],
    ["safety_confirmed", "La scena è innocua: nessuna falsa accusa, evento sensibile o attribuzione archivistica inventata"],
    ["comparability_confirmed", "Ho confrontato risoluzione, composizione, epoca e medium con il catalogo REAL"],
  ].map(([key, label]) => `<label><input type="checkbox" data-slop-check="${key}"> ${label}</label>`).join("")}<button type="button" id="slop-import">Invia alla coda e carica il file</button><button type="button" id="slop-upload">Riprova il caricamento del file</button><p id="slop-linked"></p><img id="slop-image" alt="Anteprima privata del risultato caricato" hidden></fieldset><p id="slop-status" role="status"></p></form></details></section>`;
  setupEditorial(page);
  const form = page.querySelector<HTMLFormElement>("#slop-form")!;
  const status = page.querySelector<HTMLElement>("#slop-status")!;
  let current: SlopRecord | null = null, saved = "", busy = false;
  let allCategories: Category[] = [];
  const get = (key: string) => form.querySelector<HTMLInputElement>(`[data-plan="${key}"]`)!;
  const subcategories = (selected = "") => {
    get("subcategory_id").innerHTML = '<option value="">Da scegliere</option>' + allCategories.filter((category) => category.parent_id === get("category_id").value).map((category) => `<option value="${escape(category.id)}">${escape(category.name)}</option>`).join("");
    get("subcategory_id").value = selected;
  };
  const collect = (): SlopPlan => ({
    ...Object.fromEntries(fields.map((key) => [key, key === "prompt" ? get(key).value : get(key).value.trim()])),
    schema_version: 1, iteration: Number((form.querySelector("#slop-iteration") as HTMLInputElement).value),
    owner_declaration: (form.querySelector("#slop-owner") as HTMLInputElement).checked,
    documented_facts: Array.from(form.querySelectorAll<HTMLElement>(".fact-row")).map((row) => ({
      fact: (row.querySelector('[data-fact="fact"]') as HTMLInputElement).value.trim(),
      source_title: (row.querySelector('[data-fact="source_title"]') as HTMLInputElement).value.trim(),
      reference_url: (row.querySelector('[data-fact="reference_url"]') as HTMLInputElement).value.trim(),
    })).filter((fact) => fact.fact || fact.source_title || fact.reference_url),
  } as SlopPlan);
  const populate = (plan?: SlopPlan, keepFile = false) => {
    for (const key of fields) get(key).value = plan?.[key] || "";
    subcategories(plan?.subcategory_id);
    form.querySelector("#slop-facts")!.innerHTML = plan?.documented_facts.length ? plan.documented_facts.map(factRow).join("") : factRow();
    (form.querySelector("#slop-iteration") as HTMLInputElement).value = String(plan?.iteration || 1);
    (form.querySelector("#slop-owner") as HTMLInputElement).checked = plan?.owner_declaration || false;
    (form.querySelector("#slop-events") as HTMLElement).hidden = true;
    form.querySelectorAll<HTMLInputElement>("[data-slop-check]").forEach((input) => { input.checked = false; });
    if (!keepFile) {
      (form.querySelector("#slop-file") as HTMLInputElement).value = "";
      (form.querySelector("#slop-phash") as HTMLInputElement).value = "";
    }
    saved = fingerprint(collect());
  };
  const state = () => {
    page.querySelector("#slop-state")!.textContent = current ? `Revisione ${current.revision} · ${current.status} · template ${current.template_version}` : "Nuova scheda privata";
    const locked = !!current?.image_id;
    page.querySelector<HTMLElement>(".manual-studio")!.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, select, textarea, button").forEach((element) => { element.disabled = busy || (locked && !!element.closest("#slop-editor")); });
    (form.querySelector("#slop-save") as HTMLButtonElement).disabled = busy || locked;
    (form.querySelector("#slop-import") as HTMLButtonElement).disabled = busy || locked;
    (form.querySelector("#slop-upload") as HTMLButtonElement).disabled = busy || !locked || current?.status !== "in-review";
    const linked = form.querySelector<HTMLElement>("#slop-linked")!;
    linked.innerHTML = current?.image_id ? `Risultato in moderazione: <a href="/admin?status=${encodeURIComponent(current.status)}">Apri la coda ${escape(current.status)}</a>. L’invio non approva né pubblica l’immagine.` : "Nessuna immagine creata o importata.";
    const image = form.querySelector<HTMLImageElement>("#slop-image")!;
    if (!current?.image_id) { image.hidden = true; image.removeAttribute("src"); image.dataset.imageId = ""; }
    else if (image.dataset.imageId !== current.image_id) {
      image.hidden = true; image.dataset.imageId = current.image_id;
      image.src = `/api/admin/assets/${current.image_id}`;
    }
  };
  form.querySelector<HTMLImageElement>("#slop-image")!.addEventListener("error", (event) => { (event.target as HTMLImageElement).hidden = true; });
  form.querySelector<HTMLImageElement>("#slop-image")!.addEventListener("load", (event) => { (event.target as HTMLImageElement).hidden = !current?.image_id; });
  const list = async () => {
    const records = await api<{ id: string; title: string; status: string }[]>("/admin/slop");
    if (!page.isConnected) return;
    page.querySelector("#slop-list")!.innerHTML = '<option value="">Scegli una scheda</option>' + records.map((record) => `<option value="${escape(record.id)}">${escape(record.title)} · ${escape(record.status)}</option>`).join("");
    (page.querySelector("#slop-list") as HTMLSelectElement).value = current?.id || "";
  };
  const load = async (id: string) => {
    const record = await api<SlopRecord>("/admin/slop/" + encodeURIComponent(id));
    if (!page.isConnected) return;
    current = record; populate(record.plan); state();
    (form.querySelector("#slop-reason") as HTMLInputElement).value = "";
    history.replaceState({}, "", "/admin/slop?plan=" + record.id);
  };
  const perform = (selector: string, action: () => Promise<void>) => {
    page.querySelector(selector)!.addEventListener("click", async () => {
      if (busy) return;
      const button = page.querySelector<HTMLButtonElement>(selector)!;
      busy = true; button.disabled = true; state();
      try { await action(); } catch (error) { status.textContent = String(error); }
      finally { busy = false; if (page.isConnected) state(); }
    });
  };
  get("category_id").addEventListener("change", () => subcategories());
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("click", (event) => {
    if (busy || current?.image_id) return;
    const remove = (event.target as HTMLElement).closest("[data-remove-fact]");
    if (remove) remove.closest(".fact-row")!.remove();
  });
  perform("#slop-add-fact", async () => {
    if (form.querySelectorAll(".fact-row").length >= 6) throw Error("Massimo sei fatti documentati");
    form.querySelector("#slop-facts")!.insertAdjacentHTML("beforeend", factRow());
  });
  perform("#slop-load", async () => {
    const id = (page.querySelector("#slop-list") as HTMLSelectElement).value;
    if (!id) throw Error("Scegli una scheda");
    await load(id);
  });
  perform("#slop-new", async () => { current = null; populate(); state(); history.replaceState({}, "", "/admin/slop"); });
  perform("#slop-copy", async () => {
    const plan = collect();
    if (plan.iteration >= 1000) throw Error("Limite iterazioni raggiunto");
    plan.iteration++; plan.generation_date = ""; plan.generation_version = ""; plan.evaluation_notes = ""; plan.owner_declaration = false;
    current = null; populate(plan); state(); history.replaceState({}, "", "/admin/slop");
    status.textContent = "Nuova iterazione: registra una nuova generazione esterna e salva.";
  });
  perform("#slop-preview", async () => {
    const result = await api<{ prompt: string; reveal: string }>("/admin/slop/preview", { method: "POST", body: JSON.stringify({ plan: collect() }) });
    get("prompt").value = result.prompt; get("reveal_explanation").value = result.reveal;
    status.textContent = "Proposte costruite senza generare immagini. Verifica, modifica e salva.";
  });
  perform("#slop-save", async () => {
    const record = await api<SlopRecord>("/admin/slop" + (current ? "/" + current.id : ""), {
      method: current ? "PUT" : "POST", body: JSON.stringify({ plan: collect(), revision: current?.revision,
        reason: (form.querySelector("#slop-reason") as HTMLInputElement).value }),
    });
    if (!page.isConnected) return;
    current = record; populate(record.plan, true); state(); await list();
    history.replaceState({}, "", "/admin/slop?plan=" + record.id);
    status.textContent = "Scheda e testi salvati nella cronologia privata. Nessuna immagine generata.";
  });
  perform("#slop-history", async () => {
    if (!current) throw Error("Salva prima la scheda");
    const record = await api<SlopRecord & { events: unknown[] }>("/admin/slop/" + current.id);
    const events = form.querySelector<HTMLElement>("#slop-events")!;
    events.textContent = JSON.stringify(record.events, null, 2); events.hidden = false;
  });
  const upload = async (imageId: string) => {
    const file = (form.querySelector("#slop-file") as HTMLInputElement).files?.[0];
    if (!file) throw Error("Seleziona il file generato esternamente");
    const phash = (form.querySelector("#slop-phash") as HTMLInputElement).value.trim();
    const response = await fetch("/api/admin/assets/" + imageId, { method: "PUT", body: file, headers: phash ? { "X-Perceptual-Hash": phash } : {} });
    if (!response.ok) throw Error((await response.json() as { error: string }).error);
    form.querySelector<HTMLImageElement>("#slop-image")!.src = `/api/admin/assets/${imageId}?v=${Date.now()}`;
    state(); status.textContent = "File in quarantena. Apri la coda immagini per approvare o rifiutare dopo la revisione.";
  };
  perform("#slop-import", async () => {
    if (!current || fingerprint(collect()) !== saved) throw Error("Salva tutte le modifiche alla scheda prima dell'invio");
    if (!(form.querySelector("#slop-file") as HTMLInputElement).files?.length) throw Error("Seleziona il file generato esternamente");
    const checks = Object.fromEntries(Array.from(form.querySelectorAll<HTMLInputElement>("[data-slop-check]")).map((input) => [input.dataset.slopCheck!, input.checked]));
    const imported = await api<{ id: string }>(`/admin/slop/${current.id}/import`, { method: "POST", body: JSON.stringify({ ...checks, revision: current.revision, reason: (form.querySelector("#slop-reason") as HTMLInputElement).value }) });
    current.image_id = imported.id; current.status = "in-review";
    current = await api<SlopRecord>("/admin/slop/" + current.id);
    await upload(imported.id); await list();
  });
  perform("#slop-upload", async () => { if (!current?.image_id) throw Error("Invia prima la scheda"); await upload(current.image_id); });
  populate(); state();
  try {
    allCategories = await api<Category[]>("/categories");
    get("category_id").innerHTML = '<option value="">Da scegliere</option>' + allCategories.filter((category) => !category.parent_id).map((category) => `<option value="${escape(category.id)}">${escape(category.name)}</option>`).join("");
    await list();
    const selected = new URL(location.href).searchParams.get("plan");
    if (selected) await load(selected);
  } catch (error) { status.textContent = String(error); }
}
