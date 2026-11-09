export const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
);
/** Only HTTPS links reach the page; anything else becomes "#". */
export function safeUrl(url: string) {
  try {
    return new URL(url).protocol === "https:" ? escape(url) : "#";
  } catch {
    return "#";
  }
}
