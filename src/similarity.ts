import { api, content, escape } from "./main";
import { similarityVersion } from "../shared/similarity";
interface Asset { id: string; sha256: string; origin: string; title: string; categories: string[]; image: string; indexed: boolean; cached: boolean }
interface Pair { id: string; revision: number; decision: string; a_sha256: string; b_sha256: string; reason: string; cosine: number; distance: number; left: Asset; right: Asset }
interface Summary { real: number; slop: number; total: number; pending: number; pairs: number; uncategorized: number }
const endpoint = "/admin/similarity";
const labels: Record<string, string> = { exact: "File identici", perceptual: "Fotogrammi quasi identici", visual: "Possibile stessa scena", manual: "Confronto segnalato da te", pending: "Da verificare", different: "Tieni entrambe", same_scene: "Stessa scena", prefer_a: "Preferisci la prima", prefer_b: "Preferisci la seconda" };
export async function showSimilarity() {
  content().innerHTML = `<section class="page visual-review"><div class="eyebrow">VARIETÀ DEL CATALOGO</div><h1>Somiglianze.</h1><p><a href="/admin">Torna alla revisione</a></p><p>Cerca duplicati e scene troppo simili in due gruppi separati: REAL con REAL e SLOP con SLOP. Due immagini dello stesso tema possono essere diverse: le segnalazioni richiedono il tuo giudizio.</p><p id="similarity-summary" aria-live="polite">Caricamento…</p><div class="editorial-toolbar"><button id="similarity-scan">Analizza REAL e SLOP separatamente</button><button id="similarity-stop" hidden>Interrompi</button><label>Gruppo<select id="similarity-origin"><option value="all">REAL e SLOP, separati</option><option value="REAL">Solo REAL con REAL</option><option value="AI">Solo SLOP con SLOP</option></select></label><label>Categoria tematica<select id="similarity-category"><option value="">Tutte, comprese le non classificate</option></select></label><label>Decisione<select id="similarity-state"><option value="pending">Da verificare</option><option value="all">Tutte</option><option value="different">Tieni entrambe</option><option value="same_scene">Stessa scena</option><option value="prefer_a">Preferisci la prima</option><option value="prefer_b">Preferisci la seconda</option></select></label></div><p id="similarity-progress" role="status"></p><p id="similarity-error" role="alert"></p><details id="similarity-manual"><summary>Segnala una coppia sfuggita al controllo</summary><button id="similarity-load-assets">Scegli le immagini</button><div id="similarity-manual-fields" hidden><label>Prima immagine<select id="similarity-manual-a"></select></label><label>Seconda immagine<select id="similarity-manual-b"></select></label><button id="similarity-add-pair">Confronta questa coppia</button></div></details><div id="similarity-pairs"></div><nav class="inbox-pagination" aria-label="Pagine delle somiglianze"><button id="similarity-prev">Precedenti</button><span id="similarity-count"></span><button id="similarity-next">Successive</button></nav><details><summary>Come funziona l’analisi</summary><p>Il modello DINOv2 viene scaricato al primo utilizzo. Le immagini sono elaborate sul tuo dispositivo e le impronte restano nell’archivio privato. Il punteggio misura somiglianza, non la probabilità di un duplicato. Ogni REAL viene confrontata soltanto con le altre REAL, ogni SLOP soltanto con le altre SLOP. Il filtro tematico comprende anche le immagini non classificate quando scegli tutte le categorie.</p><p>Le coppie confermate come stessa scena vengono raggruppate per le nuove partite. “Preferisci” sceglie il rappresentante senza eliminare file o cambiare approvazioni. Puoi rivedere ogni decisione e consultarne lo storico. I gruppi di scene rimangono separati fra REAL e SLOP.</p><p>Una scansione completa abilita il controllo delle nuove immagini quando apri questa pagina. Le scansioni interrotte riprendono dalle impronte salvate.</p></details></section>`;
  const page = content().firstElementChild as HTMLElement;
  const summary = page.querySelector<HTMLElement>("#similarity-summary")!, progress = page.querySelector<HTMLElement>("#similarity-progress")!, error = page.querySelector<HTMLElement>("#similarity-error")!;
  const origin = page.querySelector<HTMLSelectElement>("#similarity-origin")!;
  const category = page.querySelector<HTMLSelectElement>("#similarity-category")!, state = page.querySelector<HTMLSelectElement>("#similarity-state")!;
  const scanButton = page.querySelector<HTMLButtonElement>("#similarity-scan")!, stopButton = page.querySelector<HTMLButtonElement>("#similarity-stop")!;
  let pairs: Pair[] = [], offset = 0, total = 0, scanning = false, stopped = false, loading = 0;
  const categories = await api<{ id: string; name: string }[]>("/categories");
  category.innerHTML += categories.map(c => `<option value="${escape(c.id)}">${escape(c.name)}</option>`).join("");
  const refreshSummary = async () => {
    const data = await api<Summary>(endpoint);
    if (page.isConnected) summary.textContent = `${data.real || 0} REAL · ${data.slop || 0} SLOP · ${data.pending || 0} da analizzare · ${data.pairs} coppie da verificare · ${data.uncategorized} senza categoria`;
    return data;
  };
  const load = async () => {
    const request = ++loading;
    const data = await api<{ pairs: Pair[]; total: number }>(`${endpoint}/pairs?decision=${state.value}&origin=${origin.value}&category=${encodeURIComponent(category.value)}&offset=${offset}`);
    if (!page.isConnected || request !== loading) return;
    pairs = data.pairs; total = data.total;
    if (offset && !pairs.length) { offset = Math.max(0, offset - 20); return load(); }
    const figure = (a: Asset, side: string) => `<figure><figcaption>${side} · ${escape(a.origin === "AI" ? "SLOP" : "REAL")} · ${escape(a.title)}</figcaption><a href="${escape(a.image)}" target="_blank" rel="noopener noreferrer" aria-label="Ingrandisci ${escape(a.title)}"><img loading="lazy" class="review-image" src="${escape(a.image)}" alt="${escape(a.title)}"></a><p>${a.categories.length ? a.categories.map(id => escape(categories.find(c => c.id === id)?.name || id)).join(", ") : "Senza categoria"}</p></figure>`;
    page.querySelector<HTMLElement>("#similarity-pairs")!.innerHTML = pairs.length ? pairs.map(p => `<article class="visual-review-card similarity-card" data-pair="${escape(p.id)}"><h2>${p.left.origin === "REAL" ? "REAL con REAL" : "SLOP con SLOP"} · ${escape(labels[p.reason])}</h2><p>${escape(labels[p.decision])}${p.reason === 'manual' ? '' : p.reason === 'visual' ? ` · indice visivo ${p.cosine.toFixed(3)}` : ` · differenza percettiva ${p.distance}/64`}</p><div class="inbox-comparison has-partner">${figure(p.left, "Prima")}${figure(p.right, "Seconda")}</div><div class="review-actions"><button data-similarity-decision="different">Tieni entrambe</button><button data-similarity-decision="same_scene">Raggruppa: stessa scena</button><button data-similarity-decision="prefer_a">Preferisci la prima</button><button data-similarity-decision="prefer_b">Preferisci la seconda</button>${p.decision !== 'pending' ? '<button data-similarity-decision="pending">Rimetti da verificare</button>' : ''}</div><label>Motivo (facoltativo)<textarea class="similarity-note" rows="2" maxlength="2000"></textarea></label><details><summary>Categorie e storico</summary><p>Le categorie aggiunte qui servono alla revisione delle somiglianze.</p>${[p.left, p.right].map((a, i) => `<label>Categoria per ${i ? 'la seconda' : 'la prima'}<select data-asset-category="${escape(a.id)}"><option value="">Seleziona…</option>${categories.map(c => `<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('')}</select></label><button data-save-category="${escape(a.id)}">Aggiungi categoria</button>`).join('')}<button data-similarity-history>Mostra storico</button><div class="similarity-history"></div></details><p class="similarity-card-message" role="status"></p></article>`).join("") : "<p>Nessuna coppia in questo filtro. Analizza il catalogo per aggiornare le segnalazioni.</p>";
    page.querySelector<HTMLElement>("#similarity-count")!.textContent = total ? `${offset + 1}–${Math.min(offset + 20, total)} di ${total}` : "0 coppie";
    page.querySelector<HTMLButtonElement>("#similarity-prev")!.disabled = offset === 0;
    page.querySelector<HTMLButtonElement>("#similarity-next")!.disabled = offset + 20 >= total;
  };
  const scan = async () => {
    if (scanning) return;
    scanning = true; stopped = false; scanButton.disabled = true; stopButton.hidden = false; error.textContent = "";
    let done = 0, failures = 0, after = "";
    try {
      // Lazy import keeps inference and WASM out of the public game's entry chunk.
      let extract: typeof import("../shared/similarity-extraction").extractSimilarity | undefined;
      do {
        const batch = await api<{ assets: Asset[]; next: string | null }>(`${endpoint}/assets?after=${encodeURIComponent(after)}`);
        for (const a of batch.assets) {
          if (stopped || !page.isConnected) break;
          if (a.indexed) continue;
          progress.textContent = `Analisi ${done + 1}: ${a.title}${!extract && !a.cached ? ' · preparazione del modello…' : ''}`;
          try {
            let feature = {};
            if (!a.cached) {
              extract ||= (await import("../shared/similarity-extraction")).extractSimilarity;
              const response = await fetch(a.image);
              if (!response.ok) throw Error("Immagine non disponibile");
              feature = await extract(await response.blob());
              if ((feature as { sha256: string }).sha256 !== a.sha256) throw Error("Il file è cambiato");
            }
            if (stopped || !page.isConnected) break;
            await api(`${endpoint}/assets/${a.id}/features`, { method: "POST", body: JSON.stringify({ ...feature, sha256: a.sha256, model: similarityVersion }) });
            done++;
          } catch (e) { failures++; error.textContent = `${failures} immagini non analizzate. Ultimo errore: ${String(e)}. Riprova per completare la scansione.`; }
        }
        after = batch.next || "";
      } while (after && !stopped && page.isConnected);
      if (!failures && !stopped && page.isConnected) window.localStorage.setItem("ros-similarity-auto", "1");
      progress.textContent = `${stopped ? 'Analisi interrotta' : 'Analisi terminata'}: ${done} immagini controllate${failures ? `, ${failures} da riprovare` : ''}.`;
      await refreshSummary(); await load();
    } catch (e) { error.textContent = String(e); }
    finally { scanning = false; scanButton.disabled = false; stopButton.hidden = true; }
  };
  page.querySelector<HTMLButtonElement>("#similarity-load-assets")!.onclick = async () => {
    const button = page.querySelector<HTMLButtonElement>("#similarity-load-assets")!;
    button.disabled = true;
    try {
      let after = ""; const assets: Asset[] = [];
      do { const data = await api<{ assets: Asset[]; next: string | null }>(`${endpoint}/assets?after=${encodeURIComponent(after)}`); assets.push(...data.assets); after = data.next || ""; } while (after && page.isConnected);
      const first = page.querySelector<HTMLSelectElement>("#similarity-manual-a")!, second = page.querySelector<HTMLSelectElement>("#similarity-manual-b")!;
      const option = (a: Asset) => `<option value="${escape(a.id)}">${a.origin === "REAL" ? "REAL" : "SLOP"} · ${escape(a.title)} · ${escape(a.id)}</option>`;
      first.innerHTML = assets.filter(a => origin.value === "all" || a.origin === origin.value).map(option).join("");
      const updateSecond = () => { const a = assets.find(a => a.id === first.value); second.innerHTML = assets.filter(b => a && b.origin === a.origin && b.id !== a.id).map(option).join(""); };
      first.onchange = updateSecond; updateSecond();
      page.querySelector<HTMLElement>("#similarity-manual-fields")!.hidden = false;
    } catch (e) { error.textContent = String(e); }
    finally { button.disabled = false; }
  };
  page.querySelector<HTMLButtonElement>("#similarity-add-pair")!.onclick = async () => {
    try {
      const a = page.querySelector<HTMLSelectElement>("#similarity-manual-a")!.value, b = page.querySelector<HTMLSelectElement>("#similarity-manual-b")!.value;
      await api(`${endpoint}/pairs`, { method: "POST", body: JSON.stringify({ a, b }) });
      state.value = "all"; category.value = ""; offset = 0; await refreshSummary(); await load();
    } catch (e) { error.textContent = String(e); }
  };
  scanButton.onclick = () => void scan();
  stopButton.onclick = () => { stopped = true; progress.textContent = "Interruzione al termine dell’elaborazione corrente…"; };
  for (const input of [origin, category, state]) input.onchange = () => { offset = 0; void load().catch(e => { error.textContent = String(e); }); };
  page.addEventListener("click", async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button) return;
    if (["similarity-prev", "similarity-next"].includes(button.id)) { offset = Math.max(0, offset + (button.id.endsWith("prev") ? -20 : 20)); await load().catch(e => { error.textContent = String(e); }); return; }
    const card = button.closest<HTMLElement>("[data-pair]");
    const pair = pairs.find(p => p.id === card?.dataset.pair);
    if (!card || !pair) return;
    const buttons = card.querySelectorAll<HTMLButtonElement>("button"); buttons.forEach(b => { b.disabled = true; });
    const message = card.querySelector<HTMLElement>(".similarity-card-message")!;
    try {
      if (button.dataset.similarityDecision) {
        const images = [...card.querySelectorAll<HTMLImageElement>("img")];
        if (images.some(image => !image.complete || !image.naturalWidth)) throw Error("Attendi il caricamento di entrambe le immagini prima di decidere.");
        await api(`${endpoint}/pairs/${pair.id}/decision`, { method: "POST", body: JSON.stringify({ decision: button.dataset.similarityDecision, revision: pair.revision, a_sha256: pair.a_sha256, b_sha256: pair.b_sha256, note: card.querySelector<HTMLTextAreaElement>("textarea")!.value }) });
        await refreshSummary(); await load();
      } else if (button.hasAttribute("data-similarity-history")) {
        const data = await api<{ events: { decision: string; note: string; created_at: string }[] }>(`${endpoint}/pairs/${pair.id}/history`);
        card.querySelector<HTMLElement>(".similarity-history")!.innerHTML = data.events.map(e => `<p>${escape(labels[e.decision])} · ${escape(e.created_at)}<br>${escape(e.note)}</p>`).join("") || "<p>Nessuna decisione precedente.</p>";
      } else if (button.dataset.saveCategory) {
        const a = [pair.left, pair.right].find(a => a.id === button.dataset.saveCategory)!;
        const selected = [...card.querySelectorAll<HTMLSelectElement>("[data-asset-category]")].find(s => s.dataset.assetCategory === a.id)!.value;
        if (!selected) throw Error("Seleziona una categoria.");
        await api(`${endpoint}/assets/${a.id}/categories`, { method: "POST", body: JSON.stringify({ sha256: a.sha256, categories: [...new Set([...a.categories, selected])] }) });
        await refreshSummary(); await load();
      }
    } catch (e) { message.textContent = String(e); }
    finally { buttons.forEach(b => { b.disabled = false; }); }
  });
  try { const data = await refreshSummary(); await load(); if (data.pending && window.localStorage.getItem("ros-similarity-auto") === "1") void scan(); }
  catch (e) { error.textContent = String(e); }
}
