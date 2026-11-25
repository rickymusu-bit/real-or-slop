/** Read-only dataset balance and link to an outstanding legacy batch.
 * The obsolete REAL-proposal wizard is no longer mounted; generation lives in pipeline.ts. */
import "./slop-auto.css";
import { type Gallery } from "./galleries";

interface BalanceState {
  galleries: Gallery[];
  batch: { gallery_id: string; status: string } | null;
  balance: { real: number; slop: number; pending: number; missing: number };
}
let observed: (() => void) | null = null;
/** Refresh the balance after successful library changes on this page. */
function observeLibrary(changed: () => void) {
  if (observed) { observed = changed; return; }
  observed = changed;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (response.ok && method !== "GET" && /\/api\/admin\/library(\/|\?|$)/.test(url)
      && !/\/api\/admin\/library\/slop\//.test(url) && !/\/(copy|metrics)(\?|$)/.test(url)) observed?.();
    return response;
  };
}
export function mountDatasetBalance(root: HTMLElement, indicator: (gallery: Gallery | undefined) => void) {
  let timer = 0;
  const refresh = async () => {
    window.clearTimeout(timer);
    const response = await fetch("/api/admin/library/slop/auto", { credentials: "same-origin" });
    const data = await response.json() as BalanceState & { error?: string };
    if (!response.ok) throw Error(data.error || "Cannot load dataset balance");
    const b = data.balance;
    root.replaceChildren();
    root.hidden = b.real === b.slop;
    if (!root.hidden) {
      const line = document.createElement("p"); line.setAttribute("role", "status");
      const title = document.createElement("strong"); title.textContent = "Unbalanced dataset";
      line.append(title, `: ${b.real} REAL and ${b.slop} approved or published SLOP; ${b.pending} new SLOP awaiting a decision.` +
        (b.missing ? ` Missing ${b.missing} SLOP for balance, including new images.` : ""));
      root.append(line);
    }
    indicator(data.galleries.find(g => g.id === data.batch?.gallery_id));
    if (data.batch && root.isConnected) timer = window.setTimeout(() => { void refresh().catch(() => {}); }, 5000);
  };
  observeLibrary(() => { void refresh().catch(() => {}); });
  return { refresh };
}
