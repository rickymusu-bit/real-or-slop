import { api, content, escape } from "./main";
import { safeUrl } from "./admin";
interface Card { id: string; token: string; image: string; details: { title?: string; type?: string; author?: string; source_url?: string; license_url?: string; explanation?: string } }
interface Queue { images: Card[]; ready: number; preparing: number; processing?: number }
export async function showVisualReview() {
  content().innerHTML = `<section class="page visual-review"><div class="eyebrow">REVISIONE PRIVATA</div><h1>Il tuo sguardo decide.</h1><div id="visual-queue" aria-live="polite">Prepariamo le immagini…</div><p id="review-message" role="status"></p><details class="review-management"><summary>Gestione avanzata</summary><p><a href="/admin?advanced=1">Schede, archivio e pubblicazione</a> · <a href="/admin/slop">Studio SLOP</a></p></details></section>`;
  const page = content().querySelector<HTMLElement>(".visual-review")!;
  const queue = page.querySelector<HTMLElement>("#visual-queue")!;
  const message = page.querySelector<HTMLElement>("#review-message")!;
  let items: Card[] = [], remaining = 0, processing = 0, busy = false;
  const render = () => {
    const image = items[0];
    if (!image) { queue.innerHTML = `<p>${processing ? 'Le immagini sono in elaborazione. Puoi tornare più tardi.' : 'Non ci sono altre immagini pronte da valutare.'}</p><button id="refresh-review">Aggiorna</button>`; return; }
    queue.innerHTML = `<article class="visual-review-card"><p class="status">${remaining} immagini da vedere · ${image.details.type === "REAL" ? "REAL" : "SLOP"}</p><img class="review-image" src="${escape(image.image)}" alt="Immagine candidata da valutare"><div class="review-actions"><button data-visual-decision="approved" class="primary" disabled>Approva</button><button data-visual-decision="rejected" class="secondary" disabled>Rifiuta</button></div><details><summary>Dettagli dell’immagine</summary><h2>${escape(image.details.title)}</h2><p>${escape(image.details.explanation)}</p><p>${escape(image.details.author)} · <a href="${safeUrl(image.details.source_url || '')}" target="_blank" rel="noopener noreferrer">Fonte</a> · <a href="${safeUrl(image.details.license_url || '')}" target="_blank" rel="noopener noreferrer">Licenza</a></p></details></article>`;
    const preview = queue.querySelector<HTMLImageElement>("img")!;
    const loaded = () => { if (preview.isConnected && !busy) queue.querySelectorAll<HTMLButtonElement>("[data-visual-decision]").forEach(button => { button.disabled = false; }); };
    preview.addEventListener("load", loaded);
    if (preview.complete && preview.naturalWidth) loaded();
    preview.addEventListener("error", () => {
      queue.querySelectorAll<HTMLButtonElement>("[data-visual-decision]").forEach(button => { button.disabled = true; });
      message.textContent = "Anteprima non disponibile. Aggiorna la coda per riprovare.";
      queue.insertAdjacentHTML("beforeend", '<button id="refresh-review">Aggiorna</button>');
    });
  };
  const load = async () => {
    const data = await api<Queue>("/admin/review-queue");
    if (!page.isConnected) return;
    items = data.images; remaining = data.ready; processing = data.processing || 0;
    render();
  };
  page.addEventListener("click", async event => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-visual-decision],#refresh-review");
    if (!target || busy) return;
    busy = true;
    queue.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.disabled = true; });
    try {
      const image = items[0];
      if (target.dataset.visualDecision && image) {
        await api(`/admin/visual-review/${encodeURIComponent(image.id)}`, { method: "POST", body: JSON.stringify({ decision: target.dataset.visualDecision, token: image.token }) });
        message.textContent = target.dataset.visualDecision === "approved" ? "Approvata." : "Rifiutata.";
        await load();
      } else await load();
    } catch (error) {
      message.textContent = String(error);
      await load().catch(() => { /* Preserve the original error and allow retry. */ });
    } finally {
      busy = false;
      queue.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.disabled = !!button.dataset.visualDecision && !queue.querySelector<HTMLImageElement>("img")?.naturalWidth; });
    }
  });
  await load().catch(error => { if (page.isConnected) { message.textContent = String(error); queue.innerHTML = '<button id="refresh-review">Riprova</button>'; } });
}
